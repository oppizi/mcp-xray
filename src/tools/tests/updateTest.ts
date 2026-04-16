import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';

export const updateTestTool = {
  name: 'update_test',
  description: 'Update an existing test',
  inputSchema: {
    type: 'object',
    properties: {
      test_key: {
        type: 'string',
        description: 'Test issue key (e.g., PROJ-123)',
      },
      summary: {
        type: 'string',
        description: 'New test summary (optional)',
      },
      description: {
        type: 'string',
        description: 'New test description (optional)',
      },
      labels: {
        type: 'string',
        description: 'Comma-separated labels to set (optional)',
      },
      priority: {
        type: 'string',
        description: 'Priority name (e.g., High, Medium, Low) (optional)',
      },
    },
    required: ['test_key'],
  },
};

export async function updateTest(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const testKey = args.test_key;
    const summary = args.summary;
    const description = args.description;
    const labels = args.labels
      ? args.labels.split(',').map((l: string) => l.trim())
      : null;
    const priority = args.priority;

    console.error(`Updating test: ${testKey}`);

    // Build the update payload
    const updateData: any = {
      fields: {},
    };

    if (summary) {
      updateData.fields.summary = summary;
    }

    if (description) {
      updateData.fields.description = {
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
      };
    }

    if (labels) {
      updateData.fields.labels = labels;
    }

    if (priority) {
      updateData.fields.priority = { name: priority };
    }

    // Update the test issue
    await axiosInstance.put(`/rest/api/3/issue/${testKey}`, updateData);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully updated test: ${testKey}

${summary ? `**Summary:** ${summary}` : ''}
${labels ? `**Labels:** ${labels.join(', ')}` : ''}
${priority ? `**Priority:** ${priority}` : ''}

View at: ${config.JIRA_BASE_URL}/browse/${testKey}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error updating test:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error updating test: ${
            error.response?.data?.errorMessages?.[0] ||
            (error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error')
          }`,
        },
      ],
      isError: true,
    };
  }
}

