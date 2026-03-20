import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const addPreconditionToTestTool = {
  name: 'add_precondition_to_test',
  description:
    'Link a precondition to a test case via the Xray Cloud GraphQL API. The precondition must already exist as a Jira issue.',
  inputSchema: {
    type: 'object',
    properties: {
      test_key: {
        type: 'string',
        description: 'Test issue key (e.g., PAD-29661)',
      },
      precondition_key: {
        type: 'string',
        description: 'Precondition issue key (e.g., PAD-29700)',
      },
    },
    required: ['test_key', 'precondition_key'],
  },
};

export async function addPreconditionToTest(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const { test_key, precondition_key } = args;

    console.error(
      `Linking precondition ${precondition_key} to test ${test_key}`
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

    // Resolve keys to numeric IDs (GraphQL mutations require numeric IDs)
    const [testId, preconditionId] = await Promise.all([
      xrayService.resolveIssueId(axiosInstance, test_key),
      xrayService.resolveIssueId(axiosInstance, precondition_key),
    ]);

    await xrayService.addPreconditionToTest(preconditionId, testId);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully linked precondition ${precondition_key} to test ${test_key}

View test: ${config.JIRA_BASE_URL}/browse/${test_key}
View precondition: ${config.JIRA_BASE_URL}/browse/${precondition_key}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error linking precondition:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error linking precondition: ${
            error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}
