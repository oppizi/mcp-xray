import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const moveTestToFolderTool = {
  name: 'move_test_to_folder',
  description:
    'Move a test case to a different folder in the Xray Test Repository. Accepts an issue key (e.g., PAD-30001) which is resolved to a numeric ID.',
  inputSchema: {
    type: 'object',
    properties: {
      test_key: {
        type: 'string',
        description: 'Test issue key (e.g., PAD-30001)',
      },
      destination_folder_path: {
        type: 'string',
        description:
          'Destination folder path. Use get_folder_tree to discover valid paths.',
      },
    },
    required: ['test_key', 'destination_folder_path'],
  },
};

export async function moveTestToFolder(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const testKey = args.test_key;
    const destinationPath = args.destination_folder_path;

    const xrayService = XrayCloudService.getInstance(config);

    if (!xrayService.isConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Xray Cloud API credentials not configured. Set XRAY_CLIENT_ID and XRAY_CLIENT_SECRET.',
          },
        ],
        isError: true,
      };
    }

    console.error(
      `Moving test ${testKey} to folder "${destinationPath}"`
    );

    const issueId = await xrayService.resolveIssueId(axiosInstance, testKey);
    const result = await xrayService.moveTestToFolder(issueId, destinationPath);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully moved test ${testKey} to folder "${destinationPath}"${result?.folder?.path ? `\nConfirmed path: ${result.folder.path}` : ''}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error moving test to folder:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error moving test to folder: ${
            error.response?.data?.errorMessages?.[0] ||
            error.message ||
            'Unknown error'
          }`,
        },
      ],
      isError: true,
    };
  }
}
