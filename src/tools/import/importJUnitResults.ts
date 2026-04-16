import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const importJUnitResultsTool = {
  name: 'import_junit_results',
  description: 'Import JUnit XML test results to Xray. Automatically creates test execution and updates test statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      junit_xml: {
        type: 'string',
        description: 'JUnit XML results as a string',
      },
      project_key: {
        type: 'string',
        description: 'Jira project key (e.g., PAD). Required if not using test_execution_key.',
      },
    },
    required: ['junit_xml'],
  },
};

export async function importJUnitResults(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const junitXml = args.junit_xml;
    console.error('Importing JUnit results to Xray Cloud...');

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

    const response = await xrayService.importJUnitResults(junitXml, args.project_key);

    let output = '**JUnit Results Imported Successfully**\n\n';
    
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
    console.error('Error importing JUnit results:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error importing JUnit results: ${
            error.response?.data?.error || error.message || 'Unknown error'
          }`,
        },
      ],
      isError: true,
    };
  }
}

