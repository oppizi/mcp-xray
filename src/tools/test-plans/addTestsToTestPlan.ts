import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const addTestsToTestPlanTool = {
  name: 'add_tests_to_test_plan',
  description: 'Add tests to an existing test plan via Xray Cloud GraphQL API',
  inputSchema: {
    type: 'object',
    properties: {
      test_plan_key: {
        type: 'string',
        description: 'Test Plan issue key (e.g., PAD-789)',
      },
      test_keys: {
        type: 'string',
        description: 'Comma-separated test keys to add (e.g., "PAD-101,PAD-102")',
      },
    },
    required: ['test_plan_key', 'test_keys'],
  },
};

export async function addTestsToTestPlan(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const testPlanKey = args.test_plan_key;
    const testKeys = args.test_keys
      .split(',')
      .map((t: string) => t.trim());

    console.error(`Adding tests to test plan: ${testPlanKey}`);

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

    // Resolve all keys to numeric IDs
    const planId = await xrayService.resolveIssueId(axiosInstance, testPlanKey);
    const testIds = await Promise.all(
      testKeys.map((key: string) => xrayService.resolveIssueId(axiosInstance, key))
    );

    await xrayService.addTestsToTestPlan(planId, testIds);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully added tests to test plan ${testPlanKey}

**Tests Added:** ${testKeys.join(', ')}

View at: ${config.JIRA_BASE_URL}/browse/${testPlanKey}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error adding tests to test plan:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error adding tests to test plan: ${
            error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.response?.data?.errorMessages?.[0] ||
                error.message ||
                'Unknown error'
          }`,
        },
      ],
      isError: true,
    };
  }
}
