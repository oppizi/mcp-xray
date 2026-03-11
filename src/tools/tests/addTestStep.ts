import { AxiosInstance } from 'axios';
import { Config, XRAY_CREDENTIALS_SETUP_GUIDE } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const addTestStepTool = {
  name: 'add_test_step',
  description:
    'Add a manual test step to an existing Xray test case. Each step has an action (what to do), optional test data (inputs/preconditions), and optional expected result. Steps are appended to the end of the existing steps list. Requires Xray Cloud API credentials.',
  inputSchema: {
    type: 'object',
    properties: {
      test_key: {
        type: 'string',
        description: 'Jira issue key of the test (e.g., PAD-29471)',
      },
      action: {
        type: 'string',
        description:
          'The action to perform in this step (e.g., "Click the Login button")',
      },
      data: {
        type: 'string',
        description:
          'Test data or preconditions for this step (e.g., "User is on the login page")',
      },
      result: {
        type: 'string',
        description:
          'Expected result after performing the action (e.g., "User is redirected to the dashboard")',
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
    const testKey = args.test_key;
    const action = args.action;
    const data = args.data;
    const result = args.result;

    console.error(`Adding test step to: ${testKey}`);

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

    // Resolve Jira key to Xray internal ID
    const issueId = await xrayService.resolveXrayId(testKey);

    const step = await xrayService.addTestStep(issueId, {
      action,
      data,
      result,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Successfully added test step to ${testKey}

**Step ID:** ${step.id}
**Action:** ${step.action}
${step.data ? `**Data:** ${step.data}` : ''}
${step.result ? `**Expected Result:** ${step.result}` : ''}`,
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
            error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}
