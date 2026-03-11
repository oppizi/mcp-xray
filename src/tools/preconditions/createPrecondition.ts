import { AxiosInstance } from 'axios';
import { Config, JiraIssue } from '../../types.js';

export const createPreconditionTool = {
  name: 'create_precondition',
  description:
    'Create a new Xray Precondition issue in Jira. Preconditions define setup requirements that must be met before a test can run (e.g., "User must be logged in", "Database seeded with test data"). Preconditions can be linked to multiple tests.',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'Jira project key (e.g., PAD)',
      },
      summary: {
        type: 'string',
        description: 'Precondition name/summary',
      },
      description: {
        type: 'string',
        description: 'Detailed precondition description',
      },
      precondition_type: {
        type: 'string',
        description: 'Precondition type: Manual or Cucumber (default: Manual)',
        enum: ['Manual', 'Cucumber'],
        default: 'Manual',
      },
      labels: {
        type: 'string',
        description: 'Comma-separated labels to apply',
      },
    },
    required: ['project_key', 'summary'],
  },
};

export async function createPrecondition(
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

    console.error(`Creating precondition in project: ${projectKey}`);

    // Get issue type ID for Pre-Condition
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
    const preconditionType = project.issuetypes.find(
      (type: any) =>
        type.name === 'Pre-Condition' || type.name === 'Precondition'
    );

    if (!preconditionType) {
      throw new Error(
        `Pre-Condition issue type not found in project ${projectKey}. Make sure Xray is installed.`
      );
    }

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
          id: preconditionType.id,
        },
      },
    };

    if (labels.length > 0) {
      issueData.fields.labels = labels;
    }

    const response = await axiosInstance.post<JiraIssue>(
      '/rest/api/3/issue',
      issueData
    );

    const preconditionKey = response.data.key;

    return {
      content: [
        {
          type: 'text',
          text: `Successfully created precondition: ${preconditionKey}

**Summary:** ${summary}
**Project:** ${projectKey}
${labels.length > 0 ? `**Labels:** ${labels.join(', ')}` : ''}

View at: ${config.JIRA_BASE_URL}/browse/${preconditionKey}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error creating precondition:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error creating precondition: ${
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
