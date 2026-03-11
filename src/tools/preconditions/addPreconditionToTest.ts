import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import {
  linkItemsViaRaven,
  parseCommaSeparated,
  formatJiraError,
} from '../../utils/jiraHelpers.js';

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
    const testKeys = parseCommaSeparated(args.test_keys);

    console.error(
      `Linking precondition ${args.precondition_key} to tests: ${testKeys.join(', ')}`
    );

    await linkItemsViaRaven(axiosInstance, 'precondition', args.precondition_key, testKeys);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully linked precondition ${args.precondition_key} to tests

**Precondition:** ${args.precondition_key}
**Tests Linked:** ${testKeys.join(', ')}

View at: ${config.JIRA_BASE_URL}/browse/${args.precondition_key}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error linking precondition to tests:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error linking precondition to tests: ${formatJiraError(error)}`,
        },
      ],
    };
  }
}
