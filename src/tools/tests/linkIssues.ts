import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';

export const linkIssuesTool = {
  name: 'link_issues',
  description:
    'Create an issue link between Jira issues (e.g., link test cases to source tickets). Supports bulk linking from multiple issues to one target. Also available via mcp-atlassian: jira_create_issue_link.',
  inputSchema: {
    type: 'object',
    properties: {
      from_key: {
        type: 'string',
        description:
          'Source issue key (e.g., PAD-30001). Gets the OUTWARD label — for "Test" links, from_key shows "is tested by".',
      },
      from_keys: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Array of source issue keys for bulk linking (e.g., ["PAD-30001", "PAD-30002"])',
      },
      to_key: {
        type: 'string',
        description:
          'Target issue key (e.g., PAD-12345). Gets the INWARD label — for "Test" links, to_key shows "tests".',
      },
      link_type: {
        type: 'string',
        description:
          'Link type name. Common types: "Test" (from_key "is tested by" to_key — to link TCs to an epic, use from_key=epic, to_key=TC), "Relates", "Duplicate", "Blocks".',
      },
    },
    required: ['to_key', 'link_type'],
  },
};

export async function linkIssues(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const toKey = args.to_key;
    const linkType = args.link_type;
    const fromKeys: string[] = args.from_keys || (args.from_key ? [args.from_key] : []);

    if (fromKeys.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Provide either from_key or from_keys.',
          },
        ],
      };
    }

    let success = 0;
    const errors: string[] = [];

    for (const fromKey of fromKeys) {
      try {
        await axiosInstance.post('/rest/api/3/issueLink', {
          type: { name: linkType },
          outwardIssue: { key: fromKey },
          inwardIssue: { key: toKey },
        });
        success++;
      } catch (e: any) {
        errors.push(
          `${fromKey} → ${toKey}: ${e.response?.data?.errorMessages?.[0] || e.message}`
        );
      }
    }

    let output = `Linked ${success}/${fromKeys.length} issue(s) to ${toKey} (type: "${linkType}")`;
    if (errors.length > 0) {
      output += `\n\nFailed:\n${errors.join('\n')}`;
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (error: any) {
    console.error('Error linking issues:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error linking issues: ${
            error.response?.data?.errorMessages?.[0] ||
            error.message ||
            'Unknown error'
          }`,
        },
      ],
    };
  }
}
