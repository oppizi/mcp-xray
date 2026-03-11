import { AxiosInstance } from 'axios';
import { Config, XRAY_CREDENTIALS_SETUP_GUIDE } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const updateGherkinTool = {
  name: 'update_gherkin',
  description:
    'Update the Gherkin (Cucumber/BDD) definition on an Xray test case. The test must be of type Cucumber. Replaces the entire gherkin definition. Requires Xray Cloud API credentials.',
  inputSchema: {
    type: 'object',
    properties: {
      test_key: {
        type: 'string',
        description: 'Jira issue key of the test (e.g., PAD-29471)',
      },
      gherkin: {
        type: 'string',
        description:
          'Full Gherkin feature/scenario definition (e.g., "Given I am on the login page\\nWhen I enter valid credentials\\nThen I should see the dashboard")',
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
    const testKey = args.test_key;
    const gherkin = args.gherkin;

    console.error(`Updating gherkin definition for: ${testKey}`);

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

    await xrayService.updateGherkin(issueId, gherkin);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully updated gherkin definition for ${testKey}

**Gherkin:**
\`\`\`gherkin
${gherkin}
\`\`\``,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error updating gherkin:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error updating gherkin: ${
            error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}
