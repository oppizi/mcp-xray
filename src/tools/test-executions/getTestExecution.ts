import { AxiosInstance } from 'axios';
import { Config, JiraIssue, XrayTestRun } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';
import { parseJira } from '../helpers/jira.js';

export const getTestExecutionTool = {
  name: 'get_test_execution',
  description: 'Get detailed information about a test execution including test run results',
  inputSchema: {
    type: 'object',
    properties: {
      test_execution_key: {
        type: 'string',
        description: 'Test Execution issue key (e.g., PROJ-456)',
      },
    },
    required: ['test_execution_key'],
  },
};

export async function getTestExecution(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const testExecutionKey = args.test_execution_key;

    console.error(`Fetching test execution details for: ${testExecutionKey}`);

    // Get the test execution issue
    const response = await axiosInstance.get<JiraIssue>(
      `/rest/api/3/issue/${testExecutionKey}`,
      {
        params: {
          fields: 'summary,description,status,created,updated,assignee,reporter',
        },
      }
    );

    const execution = response.data;
    const fields = execution.fields;

    // Try to get test runs from Xray Cloud GraphQL API
    let testRuns: any[] = [];
    try {
      const xrayService = XrayCloudService.getInstance(config);
      if (xrayService.isConfigured()) {
        const execData = await xrayService.getTestExecutionDetails(testExecutionKey);
        if (execData?.testRuns?.results) {
          testRuns = execData.testRuns.results.map((run: any) => {
            // Xray returns `jira` as a JSON string — must parse before accessing.
            const testJira = parseJira(run.test?.jira);
            return {
              testKey: testJira.key || run.test?.issueId || 'Unknown',
              status: run.status?.name || 'Unknown',
              executedBy: run.executedById || null,
              comment: run.comment || null,
              defects: run.defects || [],
            };
          });
        }
      }
    } catch (runError) {
      console.error('Could not fetch test runs:', runError);
      // Continue without runs
    }

    // Build execution details output
    let executionDetails = `**Test Execution: ${execution.key}**

**Summary:** ${fields.summary}

**Description:**
${fields.description?.content?.[0]?.content?.[0]?.text || fields.description || 'No description'}

**Details:**
- Status: ${fields.status.name}
- Assignee: ${fields.assignee?.displayName || 'Unassigned'}
- Reporter: ${fields.reporter?.displayName || 'Unknown'}
- Created: ${new Date(fields.created).toLocaleString()}
- Updated: ${new Date(fields.updated).toLocaleString()}`;

    // Add test runs if available
    if (testRuns.length > 0) {
      executionDetails += '\n\n**Test Runs:**\n';
      testRuns.forEach((run) => {
        executionDetails += `
- **Test:** ${run.testKey}
  - **Status:** ${run.status}
  - **Executed By:** ${run.executedBy || 'Not specified'}
  ${run.comment ? `- **Comment:** ${run.comment}` : ''}
  ${run.defects && run.defects.length > 0 ? `- **Defects:** ${run.defects.join(', ')}` : ''}`;
      });
    } else {
      executionDetails += '\n\n**Test Runs:** No test runs found';
    }

    return {
      content: [
        {
          type: 'text',
          text: executionDetails,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error fetching test execution details:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching test execution details: ${
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

