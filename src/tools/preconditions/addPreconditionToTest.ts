import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';

export const addPreconditionToTestTool = {
  name: 'add_precondition_to_test',
  description:
    'Link an Xray Precondition to a test case. The precondition will appear as a prerequisite when viewing or executing the test.',
  inputSchema: {
    type: 'object',
    properties: {
      precondition_key: {
        type: 'string',
        description:
          'Jira issue key of the Precondition (e.g., PAD-500)',
      },
      test_keys: {
        type: 'string',
        description:
          'Comma-separated test keys to link the precondition to (e.g., "PAD-100,PAD-101")',
      },
    },
    required: ['precondition_key', 'test_keys'],
  },
};

export async function addPreconditionToTest(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const preconditionKey = args.precondition_key;
    const testKeys = args.test_keys
      .split(',')
      .map((t: string) => t.trim());

    console.error(
      `Linking precondition ${preconditionKey} to tests: ${testKeys.join(', ')}`
    );

    await axiosInstance.post(
      `/rest/raven/1.0/api/precondition/${preconditionKey}/test`,
      {
        add: testKeys,
      }
    );

    return {
      content: [
        {
          type: 'text',
          text: `Successfully linked precondition ${preconditionKey} to tests

**Precondition:** ${preconditionKey}
**Tests Linked:** ${testKeys.join(', ')}

View at: ${config.JIRA_BASE_URL}/browse/${preconditionKey}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error linking precondition to tests:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error linking precondition to tests: ${
            error.response?.data?.errorMessages?.[0] ||
            error.response?.data?.error ||
            error.message ||
            'Unknown error'
          }`,
        },
      ],
    };
  }
}
