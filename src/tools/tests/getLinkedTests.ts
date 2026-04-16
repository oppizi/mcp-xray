import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const getLinkedTestsTool = {
  name: 'get_linked_tests',
  description:
    'Get all test cases linked to a Jira ticket (task, story, epic, etc.). Finds tests via issue links of type "Test". Optionally enriches with Xray test steps.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_key: {
        type: 'string',
        description:
          'Jira issue key to find linked tests for (e.g., PAD-12345)',
      },
      include_steps: {
        type: 'boolean',
        description:
          'Include test steps from Xray for each linked test (default: false)',
        default: false,
      },
      include_all_links: {
        type: 'boolean',
        description:
          'Show all link types, not just "Test" links (default: false)',
        default: false,
      },
    },
    required: ['ticket_key'],
  },
};

export async function getLinkedTests(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const ticketKey = args.ticket_key;
    const includeSteps = args.include_steps || false;
    const includeAllLinks = args.include_all_links || false;

    console.error(`Fetching linked tests for ${ticketKey}`);

    // Fetch issue with links
    const response = await axiosInstance.get(
      `/rest/api/3/issue/${ticketKey}`,
      {
        params: {
          fields: 'summary,issuelinks',
        },
      }
    );

    const issue = response.data;
    const links = issue.fields?.issuelinks || [];

    if (links.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No issue links found for ${ticketKey}.`,
          },
        ],
      };
    }

    // Categorize links
    const testLinks: any[] = [];
    const otherLinks: any[] = [];

    for (const link of links) {
      const typeName = link.type?.name || '';
      const isTestLink = typeName.toLowerCase().includes('test');

      const linkedIssue = link.outwardIssue || link.inwardIssue;
      const direction = link.outwardIssue ? 'outward' : 'inward';
      const relationLabel =
        direction === 'outward' ? link.type?.outward : link.type?.inward;

      const entry = {
        key: linkedIssue?.key,
        summary: linkedIssue?.fields?.summary || '',
        status: linkedIssue?.fields?.status?.name || '',
        issueType: linkedIssue?.fields?.issuetype?.name || '',
        relation: relationLabel || typeName,
        linkType: typeName,
      };

      if (isTestLink) {
        testLinks.push(entry);
      } else {
        otherLinks.push(entry);
      }
    }

    let output = `**Issue Links for ${ticketKey}** (${issue.fields?.summary || ''})\n\n`;

    // Test links
    if (testLinks.length > 0) {
      output += `### Test Links (${testLinks.length})\n\n`;

      for (const link of testLinks) {
        output += `- **${link.key}**: ${link.summary}\n`;
        output += `  Status: ${link.status} | Type: ${link.issueType} | Relation: ${link.relation}\n`;

        // Enrich with Xray steps if requested
        if (includeSteps && link.key) {
          try {
            const xrayService = XrayCloudService.getInstance(config);
            if (xrayService.isConfigured()) {
              const testData = await xrayService.getTest(link.key);
              if (testData?.steps?.length > 0) {
                output += '  Steps:\n';
                testData.steps.forEach((step: any, i: number) => {
                  output += `    ${i + 1}. ${step.action || 'N/A'}`;
                  if (step.result) output += ` → ${step.result}`;
                  output += '\n';
                });
              }
            }
          } catch {
            // Skip step enrichment on error
          }
        }
        output += '\n';
      }
    } else {
      output += 'No test links found.\n\n';
    }

    // Other links
    if (includeAllLinks && otherLinks.length > 0) {
      output += `### Other Links (${otherLinks.length})\n\n`;
      for (const link of otherLinks) {
        output += `- **${link.key}**: ${link.summary} (${link.relation})\n`;
        output += `  Status: ${link.status} | Type: ${link.issueType}\n\n`;
      }
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (error: any) {
    console.error('Error fetching linked tests:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching linked tests: ${
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
