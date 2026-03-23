import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const addPreconditionToTestsTool = {
  name: 'add_precondition_to_tests',
  description:
    'Link a single precondition to multiple test cases at once. More efficient than calling add_precondition_to_test repeatedly.',
  inputSchema: {
    type: 'object',
    properties: {
      precondition_key: {
        type: 'string',
        description: 'Precondition issue key (e.g., PAD-29700)',
      },
      test_keys: {
        type: 'string',
        description:
          'Comma-separated test issue keys (e.g., "PAD-29661,PAD-29662,PAD-29663")',
      },
    },
    required: ['precondition_key', 'test_keys'],
  },
};

export async function addPreconditionToTests(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const { precondition_key, test_keys } = args;

    const testKeyList = test_keys.split(',').map((k: string) => k.trim());

    console.error(
      `Linking precondition ${precondition_key} to ${testKeyList.length} tests`
    );

    const xrayService = XrayCloudService.getInstance(config);

    if (!xrayService.isConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Xray Cloud API credentials not configured. This tool requires XRAY_CLIENT_ID and XRAY_CLIENT_SECRET.',
          },
        ],
      };
    }

    // Resolve precondition ID once
    const preconditionId = await xrayService.resolveIssueId(
      axiosInstance,
      precondition_key
    );

    // Resolve all test IDs
    const testIdMap: Array<{ key: string; id: string }> = [];
    for (const key of testKeyList) {
      try {
        const id = await xrayService.resolveIssueId(axiosInstance, key);
        testIdMap.push({ key, id });
      } catch (e: any) {
        testIdMap.push({ key, id: '' });
      }
    }

    // Link precondition to each test
    const results = await xrayService.addPreconditionToTests(
      preconditionId,
      testIdMap.filter((t) => t.id).map((t) => t.id)
    );

    // Build result summary
    const succeeded = results.filter((r: any) => r.success).length;
    const failed = results.filter((r: any) => !r.success).length;
    const notFound = testIdMap.filter((t) => !t.id).map((t) => t.key);

    let output = `**Linked ${precondition_key} to ${succeeded} test(s)**\n\n`;
    if (failed > 0) {
      output += `Failed: ${failed} test(s)\n`;
    }
    if (notFound.length > 0) {
      output += `Not found: ${notFound.join(', ')}\n`;
    }
    output += `\nView precondition: ${config.JIRA_BASE_URL}/browse/${precondition_key}`;

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error batch linking precondition:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error batch linking precondition: ${
            error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}
