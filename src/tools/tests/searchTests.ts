import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const searchTestsTool = {
  name: 'search_tests',
  description:
    'Search for tests using Xray Cloud GraphQL API with JQL filtering. Returns test details including type and steps. More powerful than list_tests for Xray-specific queries.',
  inputSchema: {
    type: 'object',
    properties: {
      jql: {
        type: 'string',
        description:
          'JQL query to filter tests (e.g., "project = PAD AND labels = smoke-test")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 50, max: 100)',
      },
      include_steps: {
        type: 'boolean',
        description:
          'Whether to include test steps in results (default: false, slower when true)',
      },
    },
    required: ['jql'],
  },
};

export async function searchTests(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const { jql, limit = 50, include_steps = false } = args;

    console.error(`Searching tests with JQL: ${jql}`);

    const xrayService = XrayCloudService.getInstance(config);

    if (!xrayService.isConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Xray Cloud API credentials not configured. This tool requires XRAY_CLIENT_ID and XRAY_CLIENT_SECRET in .mcp.env.',
          },
        ],
        isError: true,
      };
    }

    const results = await xrayService.searchTests(
      jql,
      Math.min(limit, 100),
      include_steps
    );

    if (!results || results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No tests found matching JQL: ${jql}`,
          },
        ],
      };
    }

    let output = `**Found ${results.length} test(s)**\n\n`;

    for (const test of results) {
      output += `**${test.issueId}** — ${test.testType?.name || 'Unknown'} test\n`;

      if (include_steps && test.steps && test.steps.length > 0) {
        output += `  Steps (${test.steps.length}):\n`;
        test.steps.forEach((step: any, i: number) => {
          output += `    ${i + 1}. ${step.action || 'No action'}\n`;
          if (step.result) output += `       Expected: ${step.result}\n`;
        });
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
    console.error('Error searching tests:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error searching tests: ${
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
