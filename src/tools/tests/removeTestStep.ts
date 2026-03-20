import { AxiosInstance } from 'axios';
import { Config, XRAY_CREDENTIALS_SETUP_GUIDE } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const removeTestStepTool = {
  name: 'remove_test_step',
  description:
    'Remove a test step from an Xray test case. Use get_test_with_steps first to retrieve step IDs. This action cannot be undone. Requires Xray Cloud API credentials.',
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
          'UUID of the step to remove (from get_test_with_steps response)',
      },
    },
    required: ['test_key', 'step_id'],
  },
};

export async function removeTestStep(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const testKey = args.test_key;
    const stepId = args.step_id;

    console.error(`Removing test step ${stepId} from: ${testKey}`);

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

    // Xray GraphQL removeTestStep only needs stepId (no issueId)
    await xrayService.removeTestStep(stepId);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully removed test step from ${testKey}

**Removed Step ID:** ${stepId}`,
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
            error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}
