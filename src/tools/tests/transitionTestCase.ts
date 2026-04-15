import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';

export const transitionTestCaseTool = {
  name: 'transition_test_case',
  description:
    'Transition a test case (or any Jira issue) to a new status by name. Supports bulk transitions. Also available via mcp-atlassian: jira_transition_issue.',
  inputSchema: {
    type: 'object',
    properties: {
      issue_key: {
        type: 'string',
        description: 'Single issue key to transition (e.g., PAD-30001)',
      },
      issue_keys: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Array of issue keys for bulk transition (e.g., ["PAD-30001", "PAD-30002"])',
      },
      status_name: {
        type: 'string',
        description:
          'Target status name (e.g., "In Progress", "Done", "QA In Progress"). Case-insensitive match.',
      },
    },
    required: ['status_name'],
  },
};

export async function transitionTestCase(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const statusName = args.status_name;
    const keys: string[] = args.issue_keys || (args.issue_key ? [args.issue_key] : []);

    if (keys.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Provide either issue_key or issue_keys.',
          },
        ],
        isError: true,
      };
    }

    // Get available transitions from the first key
    console.error(`Fetching transitions for ${keys[0]}`);
    const transResponse = await axiosInstance.get(
      `/rest/api/3/issue/${keys[0]}/transitions`
    );
    const transitions = transResponse.data.transitions || [];

    const match = transitions.find(
      (t: any) => t.name.toLowerCase() === statusName.toLowerCase()
    );

    if (!match) {
      const available = transitions.map((t: any) => t.name).join(', ');
      return {
        content: [
          {
            type: 'text',
            text: `Error: No transition found for status "${statusName}".\nAvailable transitions: ${available || 'None'}`,
          },
        ],
        isError: true,
      };
    }

    // Apply transition to each issue
    let success = 0;
    const errors: string[] = [];

    for (const key of keys) {
      try {
        await axiosInstance.post(`/rest/api/3/issue/${key}/transitions`, {
          transition: { id: match.id },
        });
        success++;
      } catch (e: any) {
        errors.push(
          `${key}: ${e.response?.data?.errorMessages?.[0] || e.message}`
        );
      }
    }

    let output = `Transitioned ${success}/${keys.length} issue(s) to "${match.name}"`;
    if (errors.length > 0) {
      output += `\n\nFailed:\n${errors.join('\n')}`;
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (error: any) {
    console.error('Error transitioning test case:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error transitioning test case: ${
            error.response?.data?.errorMessages?.[0] ||
            error.message ||
            'Unknown error'
          }`,
        },
      ],
      isError: true,
    };
  }
}
