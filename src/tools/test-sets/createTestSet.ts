import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const createTestSetTool = {
  name: 'create_test_set',
  description:
    'Create a new Test Set in Jira. Optionally add tests to it immediately.',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'Jira project key (e.g., PAD)',
      },
      summary: {
        type: 'string',
        description: 'Test set title/summary',
      },
      description: {
        type: 'string',
        description: 'Test set description (optional)',
      },
      tests: {
        type: 'string',
        description:
          'Comma-separated test issue keys to add (optional, e.g., "PAD-101,PAD-102")',
      },
      labels: {
        type: 'string',
        description: 'Comma-separated labels (optional)',
      },
    },
    required: ['project_key', 'summary'],
  },
};

export async function createTestSet(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const { project_key, summary, description = '', tests, labels } = args;

    console.error(`Creating test set in project: ${project_key}`);

    // Get issue type ID for Test Set
    const issueTypesResponse = await axiosInstance.get(
      `/rest/api/3/issue/createmeta`,
      {
        params: {
          projectKeys: project_key,
          expand: 'projects.issuetypes.fields',
        },
      }
    );

    const project = issueTypesResponse.data.projects[0];
    const testSetType = project.issuetypes.find(
      (type: any) => type.name === 'Test Set'
    );

    if (!testSetType) {
      throw new Error(
        `Test Set issue type not found in project ${project_key}. Make sure Xray is installed.`
      );
    }

    const issueData: any = {
      fields: {
        project: { key: project_key },
        summary,
        issuetype: { id: testSetType.id },
      },
    };

    if (description) {
      issueData.fields.description = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: description }],
          },
        ],
      };
    }

    if (labels) {
      issueData.fields.labels = labels
        .split(',')
        .map((l: string) => l.trim());
    }

    const response = await axiosInstance.post('/rest/api/3/issue', issueData);
    const key = response.data.key;

    // Add tests via Xray Cloud GraphQL
    let addedTests: string[] = [];
    if (tests) {
      const testKeys = tests.split(',').map((t: string) => t.trim());
      try {
        const xrayService = XrayCloudService.getInstance(config);
        if (xrayService.isConfigured()) {
          const setId = await xrayService.resolveIssueId(axiosInstance, key);
          const testIds = await Promise.all(
            testKeys.map((tk: string) => xrayService.resolveIssueId(axiosInstance, tk))
          );
          await xrayService.addTestsToTestSet(setId, testIds);
          addedTests = testKeys;
        } else {
          console.error('Xray Cloud API not configured — tests not added to set.');
        }
      } catch (addError: any) {
        console.error('Could not add tests to set:', addError.message);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Successfully created test set: ${key}

**Summary:** ${summary}
**Project:** ${project_key}
${labels ? `**Labels:** ${labels}` : ''}
${addedTests.length > 0 ? `**Tests Added:** ${addedTests.join(', ')}` : ''}

View at: ${config.JIRA_BASE_URL}/browse/${key}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error creating test set:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error creating test set: ${
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
