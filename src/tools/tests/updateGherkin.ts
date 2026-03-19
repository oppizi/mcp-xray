import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const updateGherkinTool = {
  name: 'update_gherkin',
  description:
    'Update the Gherkin/BDD definition of a Cucumber-type test case. The test must already be of type Cucumber.',
  inputSchema: {
    type: 'object',
    properties: {
      test_key: {
        type: 'string',
        description: 'Test issue key (e.g., PAD-29661)',
      },
      gherkin: {
        type: 'string',
        description:
          'Gherkin definition (Feature/Scenario/Given/When/Then syntax)',
      },
    },
    required: ['test_key', 'gherkin'],
  },
};

export async function updateGherkin(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const { test_key, gherkin } = args;

    console.error(`Updating Gherkin definition for: ${test_key}`);

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

    // Resolve key to numeric ID
    const issueId = await xrayService.resolveIssueId(axiosInstance, test_key);

    await xrayService.updateGherkinDefinition(issueId, gherkin);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully updated Gherkin definition for ${test_key}

**Definition:**
\`\`\`gherkin
${gherkin}
\`\`\`

View at: ${config.JIRA_BASE_URL}/browse/${test_key}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error updating Gherkin definition:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error updating Gherkin definition: ${
            error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}
