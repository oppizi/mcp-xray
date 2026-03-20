import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const addTestStepTool = {
  name: 'add_test_step',
  description:
    'Add a test step to an existing manual test case via the Xray Cloud GraphQL API. Requires Xray Cloud credentials.',
  inputSchema: {
    type: 'object',
    properties: {
      test_key: {
        type: 'string',
        description: 'Test issue key (e.g., PAD-29661)',
      },
      action: {
        type: 'string',
        description: 'The action/step description (what the tester does)',
      },
      data: {
        type: 'string',
        description: 'Test data for this step (optional)',
      },
      result: {
        type: 'string',
        description: 'Expected result after performing the action',
      },
    },
    required: ['test_key', 'action'],
  },
};

export async function addTestStep(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const { test_key, action, data, result } = args;

    console.error(`Adding test step to: ${test_key}`);

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

    // Resolve issue key to numeric ID (GraphQL mutations require numeric IDs)
    const issueId = await xrayService.resolveIssueId(axiosInstance, test_key);

    const stepData: any = { action };
    if (data) stepData.data = data;
    if (result) stepData.result = result;

    const response = await xrayService.addTestStep(issueId, stepData);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully added test step to ${test_key}

**Action:** ${action}
${data ? `**Data:** ${data}` : ''}
${result ? `**Expected Result:** ${result}` : ''}

View at: ${config.JIRA_BASE_URL}/browse/${test_key}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error adding test step:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error adding test step: ${
            error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}
