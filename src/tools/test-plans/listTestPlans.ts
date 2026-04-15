import { AxiosInstance } from 'axios';
import { Config, JiraSearchResponse, JiraIssue } from '../../types.js';

export const listTestPlansTool = {
  name: 'list_test_plans',
  description: 'List all test plans in a Jira project',
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

export async function listTestPlans(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const projectKey = args.project_key;
    const maxResults = Math.min(args?.max_results ?? 50, 100);

    console.error(`Fetching test plans for project: ${projectKey}`);

    // Build JQL query for Test Plan issue type
    const jql = `project = ${projectKey} AND issuetype = "Test Plan" ORDER BY created DESC`;

    const response = await axiosInstance.post<JiraSearchResponse>(
      '/rest/api/3/search/jql',
      {
        jql,
        maxResults,
        fields: ['summary', 'description', 'status', 'created', 'updated', 'assignee', 'reporter'],
      }
    );

    const testPlans = response.data.issues;

    if (testPlans.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No test plans found in project "${projectKey}"`,
          },
        ],
      };
    }

    const summary = `Found ${testPlans.length} test plan(s) in project "${projectKey}"`;

    const planList = testPlans
      .map((plan: JiraIssue) => {
        const fields = plan.fields;
        return `**${plan.key}: ${fields.summary}**
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
          text: `${summary}\n\n${planList}`,
        },
      ],
    };
  } catch (error) {
    console.error('Error fetching test plans:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching test plans: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        },
      ],
      isError: true,
    };
  }
}

