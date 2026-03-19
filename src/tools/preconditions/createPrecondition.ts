import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';

export const createPreconditionTool = {
  name: 'create_precondition',
  description:
    'Create a new Precondition issue in Jira (Xray issue type). Preconditions define setup steps shared across multiple test cases.',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'Jira project key (e.g., PAD)',
      },
      summary: {
        type: 'string',
        description: 'Precondition title/summary',
      },
      description: {
        type: 'string',
        description: 'Precondition description (optional)',
      },
      precondition_type: {
        type: 'string',
        description:
          'Precondition type: Manual or Cucumber (default: Manual)',
        enum: ['Manual', 'Cucumber'],
      },
      definition: {
        type: 'string',
        description:
          'Precondition definition/steps text. For Manual type, plain text steps. For Cucumber, Given/When/Then syntax.',
      },
      labels: {
        type: 'string',
        description: 'Comma-separated labels (optional)',
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
    const {
      project_key,
      summary,
      description = '',
      labels,
    } = args;

    console.error(`Creating precondition in project: ${project_key}`);

    // Get issue type ID for Precondition
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
    const preconditionType = project.issuetypes.find(
      (type: any) => type.name === 'Precondition'
    );

    if (!preconditionType) {
      throw new Error(
        `Precondition issue type not found in project ${project_key}. Make sure Xray is installed.`
      );
    }

    const issueData: any = {
      fields: {
        project: { key: project_key },
        summary,
        issuetype: { id: preconditionType.id },
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

    return {
      content: [
        {
          type: 'text',
          text: `Successfully created precondition: ${key}

**Summary:** ${summary}
**Project:** ${project_key}
${labels ? `**Labels:** ${labels}` : ''}

View at: ${config.JIRA_BASE_URL}/browse/${key}`,
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
