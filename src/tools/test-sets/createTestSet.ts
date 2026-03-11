import { AxiosInstance } from 'axios';
import { Config, JiraIssue } from '../../types.js';

export const createTestSetTool = {
  name: 'create_test_set',
  description:
    'Create a new Xray Test Set issue in Jira. A test set is a flat collection of tests, useful for organizing related test cases (e.g., all login tests, all regression tests for a feature). Optionally adds tests to the set after creation.',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'Jira project key (e.g., PAD)',
      },
      summary: {
        type: 'string',
        description: 'Test set name/summary',
      },
      description: {
        type: 'string',
        description: 'Test set description',
      },
      labels: {
        type: 'string',
        description: 'Comma-separated labels to apply',
      },
      tests: {
        type: 'string',
        description:
          'Comma-separated test keys to add to the set after creation (e.g., "PAD-100,PAD-101")',
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
    const projectKey = args.project_key;
    const summary = args.summary;
    const description = args.description || '';
    const labels = args.labels
      ? args.labels.split(',').map((l: string) => l.trim())
      : [];
    const testKeys = args.tests
      ? args.tests.split(',').map((t: string) => t.trim())
      : [];

    console.error(`Creating test set in project: ${projectKey}`);

    // Get issue type ID for Test Set
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
    const testSetIssueType = project.issuetypes.find(
      (type: any) => type.name === 'Test Set'
    );

    if (!testSetIssueType) {
      throw new Error(
        `Test Set issue type not found in project ${projectKey}. Make sure Xray is installed.`
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
          id: testSetIssueType.id,
        },
      },
    };

    if (labels.length > 0) {
      issueData.fields.labels = labels;
    }

    // Create the test set issue
    const response = await axiosInstance.post<JiraIssue>(
      '/rest/api/3/issue',
      issueData
    );

    const testSetKey = response.data.key;

    // Add tests to the set if provided
    let addedTests = '';
    if (testKeys.length > 0) {
      try {
        await axiosInstance.post(
          `/rest/raven/1.0/api/testset/${testSetKey}/test`,
          {
            add: testKeys,
          }
        );
        addedTests = `\n**Tests Added:** ${testKeys.join(', ')}`;
      } catch (addError: any) {
        console.error('Could not add tests to test set:', addError.message);
        addedTests = `\n**Warning:** Failed to add tests: ${addError.message}`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Successfully created test set: ${testSetKey}

**Summary:** ${summary}
**Project:** ${projectKey}
${labels.length > 0 ? `**Labels:** ${labels.join(', ')}` : ''}${addedTests}

View at: ${config.JIRA_BASE_URL}/browse/${testSetKey}`,
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
