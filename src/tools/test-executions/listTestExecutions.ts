import { AxiosInstance } from 'axios';
import { Config, JiraSearchResponse, JiraIssue } from '../../types.js';

export const listTestExecutionsTool = {
  name: 'list_test_executions',
  description: 'List test executions in a Jira project',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'Jira project key (e.g., PROJ)',
      },
      test_plan_key: {
        type: 'string',
        description: 'Filter by test plan key (optional)',
      },
      test_key: {
        type: 'string',
        description: 'Filter by test key (optional)',
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

export async function listTestExecutions(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const projectKey = args.project_key;
    const testPlanKey = args.test_plan_key;
    const testKey = args.test_key;
    const maxResults = Math.min(args?.max_results ?? 50, 100);

    console.error(`Fetching test executions for project: ${projectKey}`);

    // Build JQL query for Test Execution issue type
    let jql = `project = ${projectKey} AND issuetype = "Test Execution"`;

    if (testPlanKey) {
      jql += ` AND issue in testPlanTests("${testPlanKey}")`;
    }

    if (testKey) {
      jql += ` AND issue in testExecTests("${testKey}")`;
    }

    jql += ' ORDER BY created DESC';

    const response = await axiosInstance.post<JiraSearchResponse>(
      '/rest/api/3/search/jql',
      {
        jql,
        maxResults,
        fields: ['summary', 'description', 'status', 'created', 'updated', 'assignee', 'reporter'],
      }
    );

    const executions = response.data.issues;

    if (executions.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No test executions found in project "${projectKey}"${
              testPlanKey ? ` for test plan: ${testPlanKey}` : ''
            }${testKey ? ` for test: ${testKey}` : ''}`,
          },
        ],
      };
    }

    const summary = `Found ${executions.length} test execution(s) in project "${projectKey}"`;

    const executionList = executions
      .map((execution: JiraIssue) => {
        const fields = execution.fields;
        return `**${execution.key}: ${fields.summary}**
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
          text: `${summary}\n\n${executionList}`,
        },
      ],
    };
  } catch (error) {
    console.error('Error fetching test executions:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching test executions: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        },
      ],
      isError: true,
    };
  }
}

