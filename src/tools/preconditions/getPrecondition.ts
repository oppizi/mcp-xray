import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const getPreconditionTool = {
  name: 'get_precondition',
  description:
    'Get full details of a precondition by its Jira key, including definition/steps, type, metadata, and all linked tests. Use this to inspect what a precondition actually does before reusing or modifying it.',
  inputSchema: {
    type: 'object',
    properties: {
      precondition_key: {
        type: 'string',
        description: 'Precondition issue key (e.g., PAD-29700)',
      },
    },
    required: ['precondition_key'],
  },
};

export async function getPrecondition(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const { precondition_key } = args;

    console.error(`Fetching precondition: ${precondition_key}`);

    const xrayService = XrayCloudService.getInstance(config);

    if (!xrayService.isConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Xray Cloud API credentials not configured. This tool requires XRAY_CLIENT_ID and XRAY_CLIENT_SECRET.',
          },
        ],
        isError: true,
      };
    }

    const pc = await xrayService.getPrecondition(precondition_key);

    if (!pc) {
      return {
        content: [
          {
            type: 'text',
            text: `Precondition not found: ${precondition_key}`,
          },
        ],
      };
    }

    const summary = pc.jira?.summary || 'No summary';
    const description = pc.jira?.description?.content?.[0]?.content?.[0]?.text || pc.jira?.description || 'No description';
    const status = pc.jira?.status?.name || 'Unknown';
    const priority = pc.jira?.priority?.name || 'Not set';
    const assignee = pc.jira?.assignee?.displayName || 'Unassigned';
    const reporter = pc.jira?.reporter?.displayName || 'Unknown';
    const labels = pc.jira?.labels?.join(', ') || 'None';
    const created = pc.jira?.created?.substring(0, 10) || '';
    const updated = pc.jira?.updated?.substring(0, 10) || '';
    const pcType = pc.preconditionType?.name || 'Unknown';
    const definition = pc.definition || 'No definition set';

    let output = `**Precondition: ${precondition_key}**\n\n`;
    output += `**Summary:** ${summary}\n\n`;
    output += `**Definition:**\n${definition}\n\n`;
    output += `**Details:**\n`;
    output += `- Type: ${pcType}\n`;
    output += `- Status: ${status}\n`;
    output += `- Priority: ${priority}\n`;
    output += `- Assignee: ${assignee}\n`;
    output += `- Reporter: ${reporter}\n`;
    output += `- Labels: ${labels}\n`;
    output += `- Created: ${created}\n`;
    output += `- Updated: ${updated}\n`;

    // Show linked tests
    const tests = pc.tests;
    if (tests && tests.results && tests.results.length > 0) {
      output += `\n**Linked Tests (${tests.total}):**\n`;
      for (const test of tests.results) {
        const testKey = test.jira?.key || `ID:${test.issueId}`;
        const testSummary = test.jira?.summary || 'No summary';
        const testStatus = test.jira?.status?.name || 'Unknown';
        const testType = test.testType?.name || 'Unknown';
        output += `- **${testKey}**: ${testSummary} (${testType}, ${testStatus})\n`;
      }
    } else {
      output += '\n**Linked Tests:** None\n';
    }

    output += `\nView at: ${config.JIRA_BASE_URL}/browse/${precondition_key}`;

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error fetching precondition:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching precondition: ${
            error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error'
          }`,
        },
      ],
      isError: true,
    };
  }
}
