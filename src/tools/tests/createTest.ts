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
    },
    required: ['project_key', 'summary'],
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

    // Set test type using Xray Cloud GraphQL if not Manual (Manual is default)
    if (testType !== 'Manual') {
      try {
        const xrayService = XrayCloudService.getInstance(config);
        if (xrayService.isConfigured()) {
          const issueId = await xrayService.resolveIssueId(axiosInstance, testKey);
          await xrayService.updateTestType(issueId, testType);
        } else {
          console.error('Xray Cloud API not configured — test type not set.');
        }
      } catch (typeError) {
        console.error('Could not set test type:', typeError);
      }
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

