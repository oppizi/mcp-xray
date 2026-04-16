import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const addTestsToFolderTool = {
  name: 'add_tests_to_folder',
  description:
    'Add test cases to a specific folder in the Xray Test Repository. Accepts issue keys (e.g., PAD-123) or numeric issue IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      folder_path: {
        type: 'string',
        description:
          'Target folder path (e.g., "/Self-Serve TCs/SFTP/"). Use get_folder_tree to discover valid paths.',
      },
      test_issue_ids: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Array of test issue keys (e.g., ["PAD-30001", "PAD-30002"]) or numeric IDs. Keys are automatically resolved to IDs.',
      },
      project_id: {
        type: 'string',
        description: 'Jira project numeric ID (default: "10001")',
        default: '10001',
      },
    },
    required: ['folder_path', 'test_issue_ids'],
  },
};

export async function addTestsToFolder(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const folderPath = args.folder_path;
    const testIssueIds: string[] = args.test_issue_ids;
    const projectId = args.project_id || '10001';

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
      `Adding ${testIssueIds.length} tests to folder "${folderPath}"`
    );

    // Resolve issue keys to numeric IDs if needed
    const resolvedIds: string[] = [];
    const resolveErrors: string[] = [];

    for (const id of testIssueIds) {
      if (/^\d+$/.test(id)) {
        resolvedIds.push(id);
      } else {
        try {
          const numericId = await xrayService.resolveIssueId(axiosInstance, id);
          resolvedIds.push(numericId);
        } catch (e: any) {
          resolveErrors.push(`${id}: ${e.message}`);
        }
      }
    }

    if (resolvedIds.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Could not resolve any issue IDs.\n${resolveErrors.join('\n')}`,
          },
        ],
        isError: true,
      };
    }

    const result = await xrayService.addTestsToFolder(
      projectId,
      folderPath,
      resolvedIds
    );

    let output = `Successfully added ${resolvedIds.length} test(s) to folder "${folderPath}"`;
    if (result?.warnings) {
      output += `\n\nWarnings: ${JSON.stringify(result.warnings)}`;
    }
    if (resolveErrors.length > 0) {
      output += `\n\nFailed to resolve:\n${resolveErrors.join('\n')}`;
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (error: any) {
    console.error('Error adding tests to folder:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error adding tests to folder: ${
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
