import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const updatePreconditionFolderTool = {
  name: 'update_precondition_folder',
  description:
    'Move a precondition to a specific folder in the Xray Precondition Repository. Accepts an issue key (e.g., PAD-29700) which is resolved to a numeric ID.',
  inputSchema: {
    type: 'object',
    properties: {
      precondition_key: {
        type: 'string',
        description: 'Precondition issue key (e.g., PAD-29700)',
      },
      folder_path: {
        type: 'string',
        description:
          'Target folder path in the Precondition Repository. Use get_folder_tree with repository_type="precondition" to discover valid paths.',
      },
    },
    required: ['precondition_key', 'folder_path'],
  },
};

export async function updatePreconditionFolder(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const preconditionKey = args.precondition_key;
    const folderPath = args.folder_path;

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
      `Moving precondition ${preconditionKey} to folder "${folderPath}"`
    );

    // Resolve key to numeric ID
    const issueId = await xrayService.resolveIssueId(
      axiosInstance,
      preconditionKey
    );

    const result = await xrayService.updatePreconditionFolder(
      issueId,
      folderPath
    );

    return {
      content: [
        {
          type: 'text',
          text: `Successfully moved precondition ${preconditionKey} to folder "${folderPath}"${result?.folder?.path ? `\nConfirmed path: ${result.folder.path}` : ''}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error updating precondition folder:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error updating precondition folder: ${
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
