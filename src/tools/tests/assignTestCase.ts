import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';

export const assignTestCaseTool = {
  name: 'assign_test_case',
  description:
    'Assign a test case (or any Jira issue) to a user by email address. Supports bulk assignment. Also available via mcp-atlassian: jira_update_issue with assignee field.',
  inputSchema: {
    type: 'object',
    properties: {
      issue_key: {
        type: 'string',
        description: 'Single issue key to assign (e.g., PAD-30001)',
      },
      issue_keys: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Array of issue keys for bulk assignment (e.g., ["PAD-30001", "PAD-30002"])',
      },
      assignee_email: {
        type: 'string',
        description: 'Email address of the assignee (e.g., alex@oppizi.com)',
      },
    },
    required: ['assignee_email'],
  },
};

export async function assignTestCase(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const email = args.assignee_email;
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

    // Resolve email to accountId
    console.error(`Resolving account for ${email}`);
    const userResponse = await axiosInstance.get('/rest/api/3/user/search', {
      params: { query: email },
    });

    const users = userResponse.data;
    if (!users || users.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: No user found for email "${email}". Check the email address.`,
          },
        ],
        isError: true,
      };
    }

    const accountId = users[0].accountId;
    const displayName = users[0].displayName || email;

    // Assign each issue
    let success = 0;
    const errors: string[] = [];

    for (const key of keys) {
      try {
        await axiosInstance.put(`/rest/api/3/issue/${key}`, {
          fields: {
            assignee: { accountId },
          },
        });
        success++;
      } catch (e: any) {
        errors.push(
          `${key}: ${e.response?.data?.errorMessages?.[0] || e.message}`
        );
      }
    }

    let output = `Assigned ${success}/${keys.length} issue(s) to ${displayName} (${email})`;
    if (errors.length > 0) {
      output += `\n\nFailed:\n${errors.join('\n')}`;
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (error: any) {
    console.error('Error assigning test case:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error assigning test case: ${
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
