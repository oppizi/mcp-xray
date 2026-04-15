import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const getTestsInFolderTool = {
  name: 'get_tests_in_folder',
  description:
    'Get all test cases within a specific Xray folder path, including subfolders. Returns test details with optional steps and preconditions.',
  inputSchema: {
    type: 'object',
    properties: {
      folder_path: {
        type: 'string',
        description:
          'Xray folder path (e.g., "/Self-Serve TCs/SFTP/"). Use get_folder_tree to discover valid paths.',
      },
      project_id: {
        type: 'string',
        description: 'Jira project numeric ID (default: "10001")',
        default: '10001',
      },
      include_steps: {
        type: 'boolean',
        description: 'Include test steps in the output (default: false)',
        default: false,
      },
      include_preconditions: {
        type: 'boolean',
        description: 'Include linked preconditions (default: true)',
        default: true,
      },
      jql_filter: {
        type: 'string',
        description:
          'Additional JQL filter to apply within the folder (optional)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of tests to return (default: 50)',
        default: 50,
      },
    },
    required: ['folder_path'],
  },
};

export async function getTestsInFolder(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const folderPath = args.folder_path;
    const projectId = args.project_id || '10001';
    const includeSteps = args.include_steps || false;
    const limit = args.limit || 50;
    const jqlFilter = args.jql_filter;

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
      `Fetching tests in folder "${folderPath}" for project ${projectId}`
    );

    const data = await xrayService.getTestsInFolder(projectId, folderPath, {
      jql: jqlFilter,
      limit,
      includeSteps,
    });

    if (!data || !data.results || data.results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No tests found in folder "${folderPath}" (project ${projectId}).`,
          },
        ],
      };
    }

    let output = `**Tests in folder: ${folderPath}**\n`;
    output += `Total: ${data.total} | Showing: ${data.results.length}\n\n`;

    for (const test of data.results) {
      const jira =
        typeof test.jira === 'string' ? JSON.parse(test.jira) : test.jira;
      const key = jira?.key || test.issueId;
      const summary = jira?.summary || 'No summary';
      const status = jira?.status?.name || jira?.status || 'Unknown';
      const priority = jira?.priority?.name || jira?.priority || 'Not set';
      const labels = jira?.labels?.join(', ') || 'None';
      const assignee =
        jira?.assignee?.displayName || jira?.assignee || 'Unassigned';

      output += `### ${key}: ${summary}\n`;
      output += `- Status: ${status} | Priority: ${priority} | Assignee: ${assignee}\n`;
      output += `- Labels: ${labels}\n`;
      output += `- Type: ${test.testType?.name || 'Manual'}\n`;

      // Preconditions
      if (test.preconditions?.results?.length > 0) {
        output += '- Preconditions: ';
        output += test.preconditions.results
          .map((pc: any) => {
            const pcJira =
              typeof pc.jira === 'string' ? JSON.parse(pc.jira) : pc.jira;
            return `${pcJira?.key || pc.issueId} (${pcJira?.summary || ''})`;
          })
          .join(', ');
        output += '\n';
      }

      // Steps
      if (includeSteps && test.steps?.length > 0) {
        output += '- Steps:\n';
        test.steps.forEach((step: any, i: number) => {
          output += `  ${i + 1}. Action: ${step.action || 'N/A'}\n`;
          if (step.data) output += `     Data: ${step.data}\n`;
          if (step.result) output += `     Expected: ${step.result}\n`;
        });
      }

      output += '\n';
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (error: any) {
    console.error('Error fetching tests in folder:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching tests in folder: ${
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
