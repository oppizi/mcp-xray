import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const getTestPreconditionsTool = {
  name: 'get_test_preconditions',
  description:
    'Get all preconditions linked to a specific test case. Use this to check what setup is required for a test, or to verify if a precondition is already linked before adding it.',
  inputSchema: {
    type: 'object',
    properties: {
      test_key: {
        type: 'string',
        description: 'Test issue key (e.g., PAD-29661)',
      },
    },
    required: ['test_key'],
  },
};

export async function getTestPreconditions(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const { test_key } = args;

    console.error(`Fetching preconditions for test: ${test_key}`);

    const xrayService = XrayCloudService.getInstance(config);

    if (!xrayService.isConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Xray Cloud API credentials not configured. This tool requires XRAY_CLIENT_ID and XRAY_CLIENT_SECRET.',
          },
        ],
      };
    }

    const data = await xrayService.getTestPreconditions(test_key);

    if (!data || !data.results || data.results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No preconditions linked to test ${test_key}`,
          },
        ],
      };
    }

    let output = `**Preconditions for ${test_key}** (${data.total} total)\n\n`;

    for (const pc of data.results) {
      const key = pc.jira?.key || `ID:${pc.issueId}`;
      const summary = pc.jira?.summary || 'No summary';
      const pcStatus = pc.jira?.status?.name || 'Unknown';
      const pcLabels = pc.jira?.labels?.join(', ') || 'None';
      const pcType = pc.preconditionType?.name || 'Unknown';
      const definition = pc.definition || '';

      output += `**${key}: ${summary}**\n`;
      output += `- Type: ${pcType} | Status: ${pcStatus} | Labels: ${pcLabels}\n`;
      if (definition) {
        const truncated =
          definition.length > 300
            ? definition.substring(0, 300) + '...'
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
    console.error('Error fetching test preconditions:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching preconditions for test: ${
            error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}
