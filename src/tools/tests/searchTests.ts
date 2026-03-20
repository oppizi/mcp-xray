import { AxiosInstance } from 'axios';
import { Config, XRAY_CREDENTIALS_SETUP_GUIDE } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const searchTestsTool = {
  name: 'search_tests',
  description:
    'Search for Xray test cases using the Xray Cloud GraphQL API. This bypasses Jira JQL permission restrictions that prevent listing Xray test types via the standard Jira REST API. Returns test details including test type, steps, and gherkin definitions. Use this instead of list_tests when JQL returns 0 results for test issues. Requires Xray Cloud API credentials.',
  inputSchema: {
    type: 'object',
    properties: {
      jql: {
        type: 'string',
        description:
          'JQL query to filter tests (e.g., "project = PAD AND labels = regression")',
      },
      project_key: {
        type: 'string',
        description:
          'Shorthand for project filter — equivalent to jql "project = {key}". Ignored if jql is provided.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 50,
        minimum: 1,
        maximum: 100,
      },
    },
  },
};

export async function searchTests(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const xrayService = XrayCloudService.getInstance(config);

    if (!xrayService.isConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: XRAY_CREDENTIALS_SETUP_GUIDE,
          },
        ],
      };
    }

    // Build JQL from args
    let jql = args.jql;
    if (!jql && args.project_key) {
      jql = `project = ${args.project_key}`;
    }
    if (!jql) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Either jql or project_key must be provided.',
          },
        ],
      };
    }

    const limit = args.limit || 50;

    console.error(`Searching tests with JQL: ${jql} (limit: ${limit})`);

    const result = await xrayService.searchTests(jql, limit);

    if (!result || result.total === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No tests found matching: ${jql}`,
          },
        ],
      };
    }

    let output = `**Found ${result.total} test(s)** (showing ${result.results.length})\n\n`;

    result.results.forEach((test: any, index: number) => {
      output += `### ${index + 1}. Issue ID: ${test.issueId}\n`;
      output += `- **Type:** ${test.testType?.name || 'Unknown'} (${test.testType?.kind || 'Unknown'})\n`;

      if (test.steps && test.steps.length > 0) {
        output += `- **Steps:** ${test.steps.length}\n`;
        test.steps.forEach((step: any, stepIdx: number) => {
          output += `  - Step ${stepIdx + 1}: ${step.action || 'No action'}\n`;
        });
      } else {
        output += `- **Steps:** None\n`;
      }

      if (test.gherkin) {
        output += `- **Gherkin:** Yes\n`;
      }

      output += '\n';
    });

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
            error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}
