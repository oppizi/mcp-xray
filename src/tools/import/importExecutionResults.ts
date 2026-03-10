import { AxiosInstance } from 'axios';
import { Config, XRAY_CREDENTIALS_SETUP_GUIDE } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const importExecutionResultsTool = {
  name: 'import_execution_results',
  description: 'Import test execution results in Xray JSON format. Creates test executions and test runs with results.',
  inputSchema: {
    type: 'object',
    properties: {
      results_json: {
        type: 'string',
        description: 'Xray JSON format execution results as a JSON string. Example: {"testExecutionKey": "EXM-789", "tests": [{"testKey": "EXM-1", "status": "PASS"}]}',
      },
    },
    required: ['results_json'],
  },
};

export async function importExecutionResults(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const resultsJson = args.results_json;
    console.error('Importing execution results to Xray Cloud...');

    const xrayService = XrayCloudService.getInstance(config);
    
    if (!xrayService.isConfigured()) {
      throw new Error(
        XRAY_CREDENTIALS_SETUP_GUIDE
      );
    }

    // Parse JSON if it's a string
    const results = typeof resultsJson === 'string' ? JSON.parse(resultsJson) : resultsJson;

    const response = await xrayService.importExecutionResults(results);

    let output = '**Execution Results Imported Successfully**\n\n';
    
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
    console.error('Error importing execution results:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error importing execution results: ${
            error.response?.data?.error || error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}

