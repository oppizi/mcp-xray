import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const removePreconditionFromTestTool = {
  name: 'remove_precondition_from_test',
  description:
    'Unlink a precondition from a test case. The precondition is not deleted, only the association is removed.',
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

export async function removePreconditionFromTest(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const { test_key, precondition_key } = args;

    console.error(
      `Unlinking precondition ${precondition_key} from test ${test_key}`
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
        isError: true,
      };
    }

    const [testId, preconditionId] = await Promise.all([
      xrayService.resolveIssueId(axiosInstance, test_key),
      xrayService.resolveIssueId(axiosInstance, precondition_key),
    ]);

    await xrayService.removePreconditionFromTest(preconditionId, testId);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully unlinked precondition ${precondition_key} from test ${test_key}\n\nView test: ${config.JIRA_BASE_URL}/browse/${test_key}\nView precondition: ${config.JIRA_BASE_URL}/browse/${precondition_key}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error unlinking precondition:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error unlinking precondition: ${
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
