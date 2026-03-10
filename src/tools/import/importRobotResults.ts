import { AxiosInstance } from 'axios';
import { Config, XRAY_CREDENTIALS_SETUP_GUIDE } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const importRobotResultsTool = {
  name: 'import_robot_results',
  description: 'Import Robot Framework XML test results to Xray. Automatically creates test execution and updates test statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      robot_xml: {
        type: 'string',
        description: 'Robot Framework XML results (output.xml) as a string',
      },
    },
    required: ['robot_xml'],
  },
};

export async function importRobotResults(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const robotXml = args.robot_xml;
    console.error('Importing Robot Framework results to Xray Cloud...');

    const xrayService = XrayCloudService.getInstance(config);
    
    if (!xrayService.isConfigured()) {
      throw new Error(
        XRAY_CREDENTIALS_SETUP_GUIDE
      );
    }

    const response = await xrayService.importRobotResults(robotXml);

    let output = '**Robot Framework Results Imported Successfully**\n\n';
    
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
    console.error('Error importing Robot Framework results:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error importing Robot Framework results: ${
            error.response?.data?.error || error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}

