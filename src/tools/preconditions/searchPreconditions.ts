import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const searchPreconditionsTool = {
  name: 'search_preconditions',
  description:
    'Search for preconditions in Xray using JQL or friendly filters. Returns precondition details including type, definition, labels, and status. Use this to find existing preconditions before creating new ones (deduplication) or to browse preconditions by area/feature.',
  inputSchema: {
    type: 'object',
    properties: {
      jql: {
        type: 'string',
        description:
          'Full JQL query (e.g., "project = PAD AND labels = login"). If provided, other filters are ignored.',
      },
      project_key: {
        type: 'string',
        description:
          'Jira project key (e.g., PAD). Used when building JQL from filters.',
      },
      keyword: {
        type: 'string',
        description:
          'Search keyword to match in precondition summary (e.g., "login", "SFTP"). Uses JQL text search.',
      },
      labels: {
        type: 'string',
        description:
          'Comma-separated labels to filter by (e.g., "SFTP_test-case,vlad_qa")',
      },
      status: {
        type: 'string',
        description:
          'Status filter (e.g., "To Do", "Done", "In Review", "Archived")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 50, max: 100)',
      },
    },
    required: [],
  },
};

export async function searchPreconditions(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const {
      jql: rawJql,
      project_key,
      keyword,
      labels,
      status,
      limit = 50,
    } = args;

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

    // Build JQL from filters if no raw JQL provided
    let jql = rawJql;
    if (!jql) {
      const clauses: string[] = [];
      if (project_key) clauses.push(`project = ${project_key}`);
      clauses.push('issuetype = Precondition');
      if (keyword) clauses.push(`summary ~ "${keyword}"`);
      if (labels) {
        const labelList = labels.split(',').map((l: string) => l.trim());
        for (const label of labelList) {
          clauses.push(`labels = "${label}"`);
        }
      }
      if (status) clauses.push(`status = "${status}"`);
      jql = clauses.join(' AND ') + ' ORDER BY created DESC';
    }

    console.error(`Searching preconditions with JQL: ${jql}`);

    const data = await xrayService.searchPreconditions(
      jql,
      Math.min(limit, 100)
    );

    if (!data || !data.results || data.results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No preconditions found matching: ${jql}`,
          },
        ],
      };
    }

    let output = `**Found ${data.total} precondition(s)** (showing ${data.results.length})\n\n`;

    for (const pc of data.results) {
      const key = pc.jira?.key || `ID:${pc.issueId}`;
      const summary = pc.jira?.summary || 'No summary';
      const pcStatus = pc.jira?.status?.name || 'Unknown';
      const pcLabels =
        pc.jira?.labels?.join(', ') || 'None';
      const pcType = pc.preconditionType?.name || 'Unknown';
      const created = pc.jira?.created?.substring(0, 10) || '';
      const definition = pc.definition || '';

      output += `**${key}: ${summary}**\n`;
      output += `- Type: ${pcType} | Status: ${pcStatus} | Labels: ${pcLabels} | Created: ${created}\n`;
      if (definition) {
        // Truncate long definitions for list view
        const truncated =
          definition.length > 200
            ? definition.substring(0, 200) + '...'
            : definition;
        output += `- Definition: ${truncated}\n`;
      }
      output += '\n';
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
    console.error('Error searching preconditions:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error searching preconditions: ${
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
