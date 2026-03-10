import { AxiosInstance } from 'axios';
import { Config, XRAY_CREDENTIALS_SETUP_GUIDE } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const importFeatureFileTool = {
  name: 'import_feature_file',
  description: 'Import Cucumber .feature file to Xray. Creates or updates BDD tests from Gherkin scenarios.',
  inputSchema: {
    type: 'object',
    properties: {
      feature_content: {
        type: 'string',
        description: 'Content of the .feature file (Gherkin syntax)',
      },
    },
    required: ['feature_content'],
  },
};

export async function importFeatureFile(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const featureContent = args.feature_content;
    console.error('Importing feature file to Xray Cloud...');

    const xrayService = XrayCloudService.getInstance(config);
    
    if (!xrayService.isConfigured()) {
      throw new Error(
        XRAY_CREDENTIALS_SETUP_GUIDE
      );
    }

    const response = await xrayService.importFeatureFile(featureContent);

    let output = '**Feature File Imported Successfully**\n\n';
    
    if (response.updatedOrCreatedTests) {
      output += `**Tests Created/Updated:** ${response.updatedOrCreatedTests.length}\n`;
      response.updatedOrCreatedTests.forEach((test: any) => {
        output += `- ${test.key || test.id}\n`;
      });
    }

    if (response.updatedOrCreatedPreconditions) {
      output += `\n**Preconditions Created/Updated:** ${response.updatedOrCreatedPreconditions.length}\n`;
      response.updatedOrCreatedPreconditions.forEach((precond: any) => {
        output += `- ${precond.key || precond.id}\n`;
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
    console.error('Error importing feature file:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error importing feature file: ${
            error.response?.data?.error || error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}

