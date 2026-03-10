import { AxiosInstance } from 'axios';
import { Config, XRAY_CREDENTIALS_SETUP_GUIDE } from '../../types.js';
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
    },
    required: ['junit_xml'],
  },
};

export async function importJUnitResults(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const junitXml = args.junit_xml;
    console.error('Importing JUnit results to Xray Cloud...');

    const xrayService = XrayCloudService.getInstance(config);
    
    if (!xrayService.isConfigured()) {
      throw new Error(
        XRAY_CREDENTIALS_SETUP_GUIDE
      );
    }

    const response = await xrayService.importJUnitResults(junitXml);

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
    };
  }
}

