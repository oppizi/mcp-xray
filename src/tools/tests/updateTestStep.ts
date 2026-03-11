import { AxiosInstance } from 'axios';
import { Config, XRAY_CREDENTIALS_SETUP_GUIDE } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const updateTestStepTool = {
  name: 'update_test_step',
  description:
    'Update an existing test step in an Xray test case. Use get_test_with_steps first to retrieve step IDs. Only provided fields will be updated. Requires Xray Cloud API credentials.',
  inputSchema: {
    type: 'object',
    properties: {
      test_key: {
        type: 'string',
        description: 'Jira issue key of the test (e.g., PAD-29471)',
      },
      step_id: {
        type: 'string',
        description:
          'UUID of the step to update (from get_test_with_steps response)',
      },
      action: {
        type: 'string',
        description: 'Updated action text for the step',
      },
      data: {
        type: 'string',
        description: 'Updated test data or preconditions',
      },
      result: {
        type: 'string',
        description: 'Updated expected result',
      },
    },
    required: ['test_key', 'step_id'],
  },
};

export async function updateTestStep(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const testKey = args.test_key;
    const stepId = args.step_id;

    console.error(`Updating test step ${stepId} on: ${testKey}`);

    const xrayService = XrayCloudService.getInstance(config);

    if (!xrayService.isConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: XRAY_CREDENTIALS_SETUP_GUIDE,
          },
        ],
      };
    }

    const stepUpdate: { action?: string; data?: string; result?: string } = {};
    if (args.action !== undefined) stepUpdate.action = args.action;
    if (args.data !== undefined) stepUpdate.data = args.data;
    if (args.result !== undefined) stepUpdate.result = args.result;

    // Xray GraphQL updateTestStep only needs stepId (no issueId)
    const step = await xrayService.updateTestStep(stepId, stepUpdate);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully updated test step on ${testKey}

**Step ID:** ${step.id}
**Action:** ${step.action}
${step.data ? `**Data:** ${step.data}` : ''}
${step.result ? `**Expected Result:** ${step.result}` : ''}`,
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
            error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}
