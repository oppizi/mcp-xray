import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';

export const addTestsToTestSetTool = {
  name: 'add_tests_to_test_set',
  description:
    'Add test cases to an existing Xray Test Set. Tests are linked to the set without being removed from other sets or plans.',
  inputSchema: {
    type: 'object',
    properties: {
      test_set_key: {
        type: 'string',
        description: 'Jira issue key of the Test Set (e.g., PAD-500)',
      },
      test_keys: {
        type: 'string',
        description:
          'Comma-separated test keys to add (e.g., "PAD-100,PAD-101,PAD-102")',
      },
    },
    required: ['test_set_key', 'test_keys'],
  },
};

export async function addTestsToTestSet(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const testSetKey = args.test_set_key;
    const testKeys = args.test_keys
      .split(',')
      .map((t: string) => t.trim());

    console.error(`Adding tests to test set: ${testSetKey}`);

    await axiosInstance.post(
      `/rest/raven/1.0/api/testset/${testSetKey}/test`,
      {
        add: testKeys,
      }
    );

    return {
      content: [
        {
          type: 'text',
          text: `Successfully added tests to test set ${testSetKey}

**Tests Added:** ${testKeys.join(', ')}

View at: ${config.JIRA_BASE_URL}/browse/${testSetKey}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error adding tests to test set:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error adding tests to test set: ${
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
