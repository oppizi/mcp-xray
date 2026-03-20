import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const addTestsToTestSetTool = {
  name: 'add_tests_to_test_set',
  description: 'Add tests to an existing test set via Xray Cloud GraphQL API',
  inputSchema: {
    type: 'object',
    properties: {
      test_set_key: {
        type: 'string',
        description: 'Test Set issue key (e.g., PAD-500)',
      },
      test_keys: {
        type: 'string',
        description:
          'Comma-separated test issue keys to add (e.g., "PAD-101,PAD-102")',
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
    const { test_set_key, test_keys } = args;
    const testKeyList = test_keys.split(',').map((t: string) => t.trim());

    console.error(
      `Adding ${testKeyList.length} test(s) to test set: ${test_set_key}`
    );

    const xrayService = XrayCloudService.getInstance(config);

    if (!xrayService.isConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Xray Cloud API credentials not configured. This tool requires XRAY_CLIENT_ID and XRAY_CLIENT_SECRET in .mcp.env.',
          },
        ],
      };
    }

    // Resolve all keys to numeric IDs
    const setId = await xrayService.resolveIssueId(axiosInstance, test_set_key);
    const testIds = await Promise.all(
      testKeyList.map((key: string) => xrayService.resolveIssueId(axiosInstance, key))
    );

    await xrayService.addTestsToTestSet(setId, testIds);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully added ${testKeyList.length} test(s) to ${test_set_key}

**Tests Added:** ${testKeyList.join(', ')}

View at: ${config.JIRA_BASE_URL}/browse/${test_set_key}`,
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
            error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}
