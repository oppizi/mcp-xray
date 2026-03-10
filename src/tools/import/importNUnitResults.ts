import { AxiosInstance } from 'axios';
import { Config, XRAY_CREDENTIALS_SETUP_GUIDE } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const importNUnitResultsTool = {
  name: 'import_nunit_results',
  description: 'Import NUnit XML test results to Xray. Automatically creates test execution and updates test statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      nunit_xml: {
        type: 'string',
        description: 'NUnit XML results as a string',
      },
    },
    required: ['nunit_xml'],
  },
};

export async function importNUnitResults(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const nunitXml = args.nunit_xml;
    console.error('Importing NUnit results to Xray Cloud...');

    const xrayService = XrayCloudService.getInstance(config);
    
    if (!xrayService.isConfigured()) {
      throw new Error(
        XRAY_CREDENTIALS_SETUP_GUIDE
      );
    }

    const response = await xrayService.importNUnitResults(nunitXml);

    let output = '**NUnit Results Imported Successfully**\n\n';
    
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
    console.error('Error importing NUnit results:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error importing NUnit results: ${
            error.response?.data?.error || error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}

