import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const importCucumberResultsTool = {
  name: 'import_cucumber_results',
  description: 'Import Cucumber JSON test results to Xray. Automatically creates test execution and updates test statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      cucumber_json: {
        type: 'string',
        description: 'Cucumber JSON results as a string or JSON array',
      },
    },
    required: ['cucumber_json'],
  },
};

export async function importCucumberResults(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const cucumberJson = args.cucumber_json;
    console.error('Importing Cucumber results to Xray Cloud...');

    const xrayService = XrayCloudService.getInstance(config);
    
    if (!xrayService.isConfigured()) {
      throw new Error(
        'Xray Cloud API credentials not configured.\n\n' +
        'To set up Xray Cloud API access:\n' +
        '1. Ask Natalia (QA Lead) for Xray Cloud API credentials (Client ID + Secret)\n' +
        '2. Add them to your .mcp.env file:\n' +
        '   XRAY_CLIENT_ID=\'your_client_id\'\n' +
        '   XRAY_CLIENT_SECRET=\'your_client_secret\'\n' +
        '3. Restart Claude Code to pick up the new credentials'
      );
    }

    // Parse JSON if it's a string
    const results = typeof cucumberJson === 'string' ? JSON.parse(cucumberJson) : cucumberJson;

    const response = await xrayService.importCucumberResults(results);

    let output = '**Cucumber Results Imported Successfully**\n\n';
    
    if (response.testExecIssue) {
      output += `**Test Execution:** ${response.testExecIssue.key}\n`;
      output += `**Test Execution ID:** ${response.testExecIssue.id}\n`;
      output += `**URL:** ${response.testExecIssue.self}\n\n`;
    }

    if (response.testIssues && response.testIssues.success) {
      output += `**Tests Created/Updated:** ${response.testIssues.success.length}\n`;
      response.testIssues.success.forEach((test: any) => {
        output += `- ${test.key} (ID: ${test.id})\n`;
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error importing Cucumber results:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error importing Cucumber results: ${
            error.response?.data?.error || error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}

