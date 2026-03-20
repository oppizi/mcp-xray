import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const addMultipleTestStepsTool = {
  name: 'add_multiple_test_steps',
  description:
    'Add multiple test steps to an existing manual test in one call. Each step is appended (does not replace existing steps). Use add_test_step for single steps.',
  inputSchema: {
    type: 'object',
    properties: {
      test_key: {
        type: 'string',
        description: 'Test issue key (e.g., PAD-123)',
      },
      steps: {
        type: 'string',
        description:
          'JSON array of steps. Each step has: action (required), data (optional), result (optional). Example: [{"action":"Navigate to page","data":"URL: http://example.com","result":"Page loads successfully"}]',
      },
    },
    required: ['test_key', 'steps'],
  },
};

export async function addMultipleTestSteps(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const testKey = args.test_key;
    const stepsJson = args.steps;

    // Parse steps
    let steps: Array<{ action: string; data?: string; result?: string }>;
    try {
      steps = JSON.parse(stepsJson);
      if (!Array.isArray(steps)) {
        throw new Error('Steps must be a JSON array');
      }
    } catch (parseError: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error parsing steps JSON: ${parseError.message}\n\nExpected format: [{"action":"step action","data":"test data","result":"expected result"}]`,
          },
        ],
      };
    }

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

    console.error(`Adding ${steps.length} steps to test ${testKey}...`);

    // Resolve key to numeric ID
    const issueId = await xrayService.resolveIssueId(axiosInstance, testKey);

    // Add each step sequentially
    const addedSteps: any[] = [];
    for (const step of steps) {
      const result = await xrayService.addTestStep(issueId, {
        action: step.action,
        data: step.data,
        result: step.result,
      });
      addedSteps.push(result);
    }

    let output = `Successfully added ${addedSteps.length} step(s) to test **${testKey}**\n\n`;

    addedSteps.forEach((step: any, index: number) => {
      output += `**Step ${index + 1}:**\n`;
      output += `- **Action:** ${step?.action || 'N/A'}\n`;
      output += `- **Data:** ${step?.data || 'N/A'}\n`;
      output += `- **Expected Result:** ${step?.result || 'N/A'}\n\n`;
    });

    output += `View at: ${config.JIRA_BASE_URL}/browse/${testKey}`;

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error adding test steps:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error adding test steps: ${
            error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}
