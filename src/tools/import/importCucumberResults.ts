import { AxiosInstance } from 'axios';
import { Config, XRAY_CREDENTIALS_SETUP_GUIDE } from '../../types.js';
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
        XRAY_CREDENTIALS_SETUP_GUIDE
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

