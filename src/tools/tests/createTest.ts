import { AxiosInstance } from 'axios';
import { Config, JiraIssue } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const createTestTool = {
  name: 'create_test',
  description: 'Create a new test in Jira with Xray',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'Jira project key (e.g., PROJ)',
      },
      summary: {
        type: 'string',
        description: 'Test summary/title',
      },
      description: {
        type: 'string',
        description: 'Test description (optional)',
      },
      test_type: {
        type: 'string',
        description: 'Test type: Manual, Cucumber, or Generic (default: Manual)',
        enum: ['Manual', 'Cucumber', 'Generic'],
        default: 'Manual',
      },
      labels: {
        type: 'string',
        description: 'Comma-separated labels (optional)',
      },
      priority: {
        type: 'string',
        description: 'Priority name (e.g., High, Medium, Low)',
      },
      folder_path: {
        type: 'string',
        description:
          'Xray folder path to place the test in (e.g., "/Self-Serve TCs/SFTP/"). Use get_folder_tree to discover valid paths. Required for organized test management.',
      },
    },
    required: ['project_key', 'summary', 'folder_path'],
  },
};

export async function createTest(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const projectKey = args.project_key;
    const summary = args.summary;
    const description = args.description || '';
    const testType = args.test_type || 'Manual';
    const labels = args.labels
      ? args.labels.split(',').map((l: string) => l.trim())
      : [];
    const priority = args.priority;

    console.error(`Creating test in project: ${projectKey}`);

    // Get project info to find Test issue type ID
    const projectResponse = await axiosInstance.get(
      `/rest/api/3/project/${projectKey}`
    );
    const projectId = projectResponse.data.id;

    // Get issue type ID for Test
    const issueTypesResponse = await axiosInstance.get(
      `/rest/api/3/issue/createmeta`,
      {
        params: {
          projectKeys: projectKey,
          expand: 'projects.issuetypes.fields',
        },
      }
    );

    const project = issueTypesResponse.data.projects[0];
    const testIssueType = project.issuetypes.find(
      (type: any) => type.name === 'Test'
    );

    if (!testIssueType) {
      throw new Error(
        `Test issue type not found in project ${projectKey}. Make sure Xray is installed.`
      );
    }

    // Build the issue creation payload
    const issueData: any = {
      fields: {
        project: {
          key: projectKey,
        },
        summary: summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: description,
                },
              ],
            },
          ],
        },
        issuetype: {
          id: testIssueType.id,
        },
      },
    };

    // Add labels if provided
    if (labels.length > 0) {
      issueData.fields.labels = labels;
    }

    // Add priority if provided
    if (priority) {
      issueData.fields.priority = { name: priority };
    }

    // Create the test issue
    const response = await axiosInstance.post<JiraIssue>(
      '/rest/api/3/issue',
      issueData
    );

    const testKey = response.data.key;

    // Set test type and folder using Xray Cloud GraphQL
    const xrayService = XrayCloudService.getInstance(config);
    let folderResult = '';

    if (xrayService.isConfigured()) {
      const issueId = await xrayService.resolveIssueId(axiosInstance, testKey);

      // Set test type if not Manual (Manual is default)
      if (testType !== 'Manual') {
        try {
          await xrayService.updateTestType(issueId, testType);
        } catch (typeError) {
          console.error('Could not set test type:', typeError);
        }
      }

      // Place test in folder
      if (args.folder_path) {
        try {
          await xrayService.addTestsToFolder('10001', args.folder_path, [issueId]);
          folderResult = args.folder_path;
        } catch (folderError: any) {
          console.error('Could not place test in folder:', folderError.message);
          folderResult = `FAILED: ${folderError.message}`;
        }
      }
    } else {
      console.error('Xray Cloud API not configured — test type and folder not set.');
    }

    return {
      content: [
        {
          type: 'text',
          text: `Successfully created test: ${testKey}

**Summary:** ${summary}
**Type:** ${testType}
**Project:** ${projectKey}
${labels.length > 0 ? `**Labels:** ${labels.join(', ')}` : ''}
${priority ? `**Priority:** ${priority}` : ''}
${folderResult ? `**Folder:** ${folderResult}` : ''}

View at: ${config.JIRA_BASE_URL}/browse/${testKey}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error creating test:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error creating test: ${
            error.response?.data?.errorMessages?.[0] ||
            (error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error')
          }`,
        },
      ],
    };
  }
}

