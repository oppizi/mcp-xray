import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const removeTestStepTool = {
  name: 'remove_test_step',
  description:
    'Remove a test step from a manual test case. Use get_test_with_steps first to find the step ID.',
  inputSchema: {
    type: 'object',
    properties: {
      test_key: {
        type: 'string',
        description: 'Test issue key (e.g., PAD-29661)',
      },
      step_id: {
        type: 'string',
        description: 'The step ID to remove (get from get_test_with_steps)',
      },
    },
    required: ['test_key', 'step_id'],
  },
};

export async function removeTestStep(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const { test_key, step_id } = args;

    console.error(`Removing test step ${step_id} from: ${test_key}`);

    const xrayService = XrayCloudService.getInstance(config);

    if (!xrayService.isConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Xray Cloud API credentials not configured. This tool requires XRAY_CLIENT_ID and XRAY_CLIENT_SECRET in .mcp.env.',
          },
        ],
        isError: true,
      };
    }

    await xrayService.removeTestStep(test_key, step_id);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully removed step ${step_id} from ${test_key}

View at: ${config.JIRA_BASE_URL}/browse/${test_key}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error removing test step:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error removing test step: ${
            error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error'
          }`,
        },
      ],
      isError: true,
    };
  }
}
