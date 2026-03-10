import { AxiosInstance } from 'axios';
import { Config, XRAY_CREDENTIALS_SETUP_GUIDE } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const exportCucumberFeaturesTool = {
  name: 'export_cucumber_features',
  description: 'Export Cucumber feature files from Xray. Can export all features or specific test keys.',
  inputSchema: {
    type: 'object',
    properties: {
      test_keys: {
        type: 'string',
        description: 'Optional: Comma-separated list of test keys to export (e.g., "EXM-1,EXM-2"). If not provided, exports all features from the project.',
      },
    },
  },
};

export async function exportCucumberFeatures(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const testKeysStr = args.test_keys;
    console.error('Exporting Cucumber features from Xray Cloud...');

    const xrayService = XrayCloudService.getInstance(config);
    
    if (!xrayService.isConfigured()) {
      throw new Error(
        XRAY_CREDENTIALS_SETUP_GUIDE
      );
    }

    const testKeys = testKeysStr ? testKeysStr.split(',').map((k: string) => k.trim()) : undefined;

    const features = await xrayService.exportCucumberFeatures(testKeys);

    let output = '**Cucumber Features Exported Successfully**\n\n';
    output += '```gherkin\n';
    output += features;
    output += '\n```';

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error exporting Cucumber features:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error exporting Cucumber features: ${
            error.response?.data?.error || error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}

