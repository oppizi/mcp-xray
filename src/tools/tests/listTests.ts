import { AxiosInstance } from 'axios';
import { Config, JiraSearchResponse, JiraIssue } from '../../types.js';

export const listTestsTool = {
  name: 'list_tests',
  description: 'List all tests in a Jira project using JQL query',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'Jira project key (e.g., PROJ)',
      },
      labels: {
        type: 'string',
        description:
          'Comma-separated labels to filter tests (optional)',
      },
      component: {
        type: 'string',
        description: 'Component name to filter tests (optional)',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of tests to return (default: 50, max: 100)',
        default: 50,
        minimum: 1,
        maximum: 100,
      },
    },
    required: ['project_key'],
  },
};

export async function listTests(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const projectKey = args.project_key;
    const labels = args.labels;
    const component = args.component;
    const maxResults = Math.min(args?.max_results ?? 50, 100);

    console.error(`Fetching tests for project: ${projectKey}`);

    // Build JQL query for Test issue type
    let jql = `project = ${projectKey} AND issuetype = "Test"`;

    if (labels) {
      const labelList = labels.split(',').map((l: string) => l.trim());
      const labelConditions = labelList
        .map((label: string) => `labels = "${label}"`)
        .join(' OR ');
      jql += ` AND (${labelConditions})`;
    }

    if (component) {
      jql += ` AND component = "${component}"`;
    }

    jql += ' ORDER BY created DESC';

    const response = await axiosInstance.post<JiraSearchResponse>(
      '/rest/api/3/search/jql',
      {
        jql,
        maxResults,
        fields: ['summary', 'description', 'status', 'priority', 'labels', 'components', 'created', 'updated', 'assignee', 'reporter', 'issuetype'],
      }
    );

    const tests = response.data.issues;

    if (tests.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No tests found in project "${projectKey}"${
              labels ? ` with labels: ${labels}` : ''
            }${component ? ` in component: ${component}` : ''}`,
          },
        ],
      };
    }

    const summary = `Found ${tests.length} test(s) in project "${projectKey}"`;

    const testList = tests
      .map((test: JiraIssue) => {
        const fields = test.fields;
        return `**${test.key}: ${fields.summary}**
- Status: ${fields.status.name}
- Priority: ${fields.priority?.name || 'Not set'}
- Assignee: ${fields.assignee?.displayName || 'Unassigned'}
- Labels: ${fields.labels?.join(', ') || 'None'}
- Components: ${
          fields.components?.map((c) => c.name).join(', ') || 'None'
        }
- Created: ${new Date(fields.created).toLocaleDateString()}
- Updated: ${new Date(fields.updated).toLocaleDateString()}`;
      })
      .join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `${summary}\n\n${testList}`,
        },
      ],
    };
  } catch (error) {
    console.error('Error fetching tests:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching tests: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        },
      ],
      isError: true,
    };
  }
}

