import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const getFolderTreeTool = {
  name: 'get_folder_tree',
  description:
    'Get the Xray folder tree structure for a project. Returns the hierarchy of folders in the Test Repository or Precondition Repository. Use this to discover valid folder paths before creating tests or moving them.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Jira project numeric ID (default: "10001")',
        default: '10001',
      },
      path: {
        type: 'string',
        description: 'Starting path to fetch from (default: "/" for root)',
        default: '/',
      },
      search: {
        type: 'string',
        description:
          'Optional keyword to filter folders by name (case-insensitive)',
      },
      max_depth: {
        type: 'number',
        description: 'Maximum depth of folders to return (optional)',
      },
      repository_type: {
        type: 'string',
        description:
          'Which repository to query: "test" (default) or "precondition"',
        enum: ['test', 'precondition'],
        default: 'test',
      },
    },
    required: [],
  },
};

function formatTree(
  folder: any,
  indent: number = 0,
  search?: string,
  maxDepth?: number,
  currentDepth: number = 0
): string {
  if (maxDepth !== undefined && currentDepth > maxDepth) return '';

  const prefix = '  '.repeat(indent);
  const name = folder.name || '(root)';
  const path = folder.path || '/';
  // Match the Xray schema field names: testsCount / issuesCount.
  // Prefer testsCount; fall back to issuesCount for broader visibility.
  const testsCount = folder.testsCount ?? folder.testCount; // testCount kept as fallback for back-compat
  const issuesCount = folder.issuesCount;
  const countParts: string[] = [];
  if (testsCount != null) countParts.push(`${testsCount} tests`);
  if (issuesCount != null && issuesCount !== testsCount) countParts.push(`${issuesCount} issues`);
  const count = countParts.length ? ` (${countParts.join(', ')})` : '';

  // If search filter, skip folders that don't match and have no matching children
  const nameMatches =
    !search || name.toLowerCase().includes(search.toLowerCase());

  let childrenOutput = '';
  const children = Array.isArray(folder.folders) ? folder.folders : [];
  for (const child of children) {
    childrenOutput += formatTree(
      child,
      indent + 1,
      search,
      maxDepth,
      currentDepth + 1
    );
  }

  if (search && !nameMatches && !childrenOutput) return '';

  let line = `${prefix}📁 ${name}${count}\n`;
  line += `${prefix}   path: ${path}\n`;
  return line + childrenOutput;
}

export async function getFolderTree(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const projectId = args.project_id || '10001';
    const path = args.path || '/';
    const search = args.search;
    const maxDepth = args.max_depth;
    const repositoryType = args.repository_type || 'test';

    const xrayService = XrayCloudService.getInstance(config);

    if (!xrayService.isConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Xray Cloud API credentials not configured. Set XRAY_CLIENT_ID and XRAY_CLIENT_SECRET.',
          },
        ],
      };
    }

    console.error(
      `Fetching ${repositoryType} folder tree for project ${projectId} at path ${path}`
    );

    const data = await xrayService.getFolderTree(
      projectId,
      path,
      repositoryType as 'test' | 'precondition'
    );

    if (!data) {
      return {
        content: [
          {
            type: 'text',
            text: `No folder found at path "${path}" in project ${projectId}.`,
          },
        ],
      };
    }

    const tree = formatTree(data, 0, search, maxDepth);

    return {
      content: [
        {
          type: 'text',
          text: `**${repositoryType === 'precondition' ? 'Precondition' : 'Test'} Repository — Project ${projectId}**\n\n${tree || 'No matching folders found.'}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error fetching folder tree:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching folder tree: ${
            error.response?.data?.errorMessages?.[0] ||
            error.message ||
            'Unknown error'
          }`,
        },
      ],
    };
  }
}
