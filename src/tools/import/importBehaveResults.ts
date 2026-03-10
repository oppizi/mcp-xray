import { AxiosInstance } from 'axios';
import { Config, XRAY_CREDENTIALS_SETUP_GUIDE } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const importBehaveResultsTool = {
  name: 'import_behave_results',
  description: 'Import Behave JSON test results to Xray. Automatically creates test execution and updates test statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      behave_json: {
        type: 'string',
        description: 'Behave JSON results as a string or JSON array',
      },
    },
    required: ['behave_json'],
  },
};

export async function importBehaveResults(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const behaveJson = args.behave_json;
    console.error('Importing Behave results to Xray Cloud...');

    const xrayService = XrayCloudService.getInstance(config);
    
    if (!xrayService.isConfigured()) {
      throw new Error(
        XRAY_CREDENTIALS_SETUP_GUIDE
      );
    }

    // Parse JSON if it's a string
    const results = typeof behaveJson === 'string' ? JSON.parse(behaveJson) : behaveJson;

    const response = await xrayService.importBehaveResults(results);

    let output = '**Behave Results Imported Successfully**\n\n';
    
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
    console.error('Error importing Behave results:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error importing Behave results: ${
            error.response?.data?.error || error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}

