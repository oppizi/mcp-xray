import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const updateTestStepTool = {
  name: 'update_test_step',
  description:
    'Update an existing test step on a manual test case. Use get_test_with_steps first to find the step ID.',
  inputSchema: {
    type: 'object',
    properties: {
      test_key: {
        type: 'string',
        description: 'Test issue key (e.g., PAD-29661)',
      },
      step_id: {
        type: 'string',
        description: 'The step ID to update (get from get_test_with_steps)',
      },
      action: {
        type: 'string',
        description: 'Updated action/step description (optional)',
      },
      data: {
        type: 'string',
        description: 'Updated test data (optional)',
      },
      result: {
        type: 'string',
        description: 'Updated expected result (optional)',
      },
    },
    required: ['test_key', 'step_id'],
  },
};

export async function updateTestStep(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const { test_key, step_id, action, data, result } = args;

    if (!action && !data && !result) {
      return {
        content: [
          {
            type: 'text',
            text: 'At least one of action, data, or result must be provided to update.',
          },
        ],
        isError: true,
      };
    }

    console.error(`Updating test step ${step_id} on: ${test_key}`);

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

    const stepData: any = {};
    if (action !== undefined) stepData.action = action;
    if (data !== undefined) stepData.data = data;
    if (result !== undefined) stepData.result = result;

    await xrayService.updateTestStep(test_key, step_id, stepData);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully updated step ${step_id} on ${test_key}

${action ? `**Action:** ${action}` : ''}
${data ? `**Data:** ${data}` : ''}
${result ? `**Expected Result:** ${result}` : ''}

View at: ${config.JIRA_BASE_URL}/browse/${test_key}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error updating test step:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error updating test step: ${
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
