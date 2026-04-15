import { AxiosInstance } from 'axios';
import { Config, JiraSearchResponse, JiraIssue } from '../../types.js';

export const listTestSetsTool = {
  name: 'list_test_sets',
  description: 'List all test sets in a Jira project',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'Jira project key (e.g., PROJ)',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results (default: 50, max: 100)',
        default: 50,
        minimum: 1,
        maximum: 100,
      },
    },
    required: ['project_key'],
  },
};

export async function listTestSets(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const projectKey = args.project_key;
    const maxResults = Math.min(args?.max_results ?? 50, 100);

    console.error(`Fetching test sets for project: ${projectKey}`);

    // Build JQL query for Test Set issue type
    const jql = `project = ${projectKey} AND issuetype = "Test Set" ORDER BY created DESC`;

    const response = await axiosInstance.post<JiraSearchResponse>(
      '/rest/api/3/search/jql',
      {
        jql,
        maxResults,
        fields: ['summary', 'description', 'status', 'created', 'updated', 'assignee', 'reporter'],
      }
    );

    const testSets = response.data.issues;

    if (testSets.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No test sets found in project "${projectKey}"`,
          },
        ],
      };
    }

    const summary = `Found ${testSets.length} test set(s) in project "${projectKey}"`;

    const setList = testSets
      .map((set: JiraIssue) => {
        const fields = set.fields;
        return `**${set.key}: ${fields.summary}**
- Status: ${fields.status.name}
- Assignee: ${fields.assignee?.displayName || 'Unassigned'}
- Created: ${new Date(fields.created).toLocaleDateString()}
- Updated: ${new Date(fields.updated).toLocaleDateString()}`;
      })
      .join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `${summary}\n\n${setList}`,
        },
      ],
    };
  } catch (error) {
    console.error('Error fetching test sets:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching test sets: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        },
      ],
      isError: true,
    };
  }
}

