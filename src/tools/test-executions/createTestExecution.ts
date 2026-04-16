import { AxiosInstance } from 'axios';
import { Config, JiraIssue } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const createTestExecutionTool = {
  name: 'create_test_execution',
  description: 'Create a new test execution in Jira with Xray',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'Jira project key (e.g., PROJ)',
      },
      summary: {
        type: 'string',
        description: 'Test execution summary/title',
      },
      description: {
        type: 'string',
        description: 'Test execution description (optional)',
      },
      test_plan_key: {
        type: 'string',
        description: 'Test plan key to associate with (optional)',
      },
      test_environments: {
        type: 'string',
        description: 'Comma-separated test environments (optional)',
      },
      tests: {
        type: 'string',
        description: 'Comma-separated test keys to add to execution (optional)',
      },
    },
    required: ['project_key', 'summary'],
  },
};

export async function createTestExecution(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const projectKey = args.project_key;
    const summary = args.summary;
    const description = args.description || '';
    const testPlanKey = args.test_plan_key;
    const testEnvironments = args.test_environments
      ? args.test_environments.split(',').map((e: string) => e.trim())
      : [];
    const tests = args.tests
      ? args.tests.split(',').map((t: string) => t.trim())
      : [];

    console.error(`Creating test execution in project: ${projectKey}`);

    // Get issue type ID for Test Execution
    const issueTypesResponse = await axiosInstance.get(
      `/rest/api/3/issue/createmeta`,
      {
        params: {
          projectKeys: projectKey,
          expand: 'projects.issuetypes.fields',
        },
      }
    );

    const project = issueTypesResponse.data.projects[0];
    const testExecIssueType = project.issuetypes.find(
      (type: any) => type.name === 'Test Execution' || type.name === 'Xray Test Execution'
    );

    if (!testExecIssueType) {
      throw new Error(
        `Test Execution issue type not found in project ${projectKey}. Make sure Xray is installed.`
      );
    }

    // Build the issue creation payload
    const issueData: any = {
      fields: {
        project: {
          key: projectKey,
        },
        summary: summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: description,
                },
              ],
            },
          ],
        },
        issuetype: {
          id: testExecIssueType.id,
        },
      },
    };

    // Create the test execution issue
    const response = await axiosInstance.post<JiraIssue>(
      '/rest/api/3/issue',
      issueData
    );

    const testExecKey = response.data.key;

    // Use Xray Cloud GraphQL for associations (raven REST endpoints don't exist on Cloud)
    const xrayService = XrayCloudService.getInstance(config);
    const xrayConfigured = xrayService.isConfigured();

    // Associate with test plan if provided
    if (testPlanKey && xrayConfigured) {
      try {
        const planId = await xrayService.resolveIssueId(axiosInstance, testPlanKey);
        const execId = await xrayService.resolveIssueId(axiosInstance, testExecKey);
        await xrayService.addTestExecutionToTestPlan(planId, [execId]);
      } catch (planError) {
        console.error('Could not associate with test plan:', planError);
      }
    }

    // Add tests to execution if provided
    if (tests.length > 0 && xrayConfigured) {
      try {
        const execId = await xrayService.resolveIssueId(axiosInstance, testExecKey);
        const testIds = await Promise.all(
          tests.map((key: string) => xrayService.resolveIssueId(axiosInstance, key))
        );
        await xrayService.addTestsToTestExecution(execId, testIds);
      } catch (testError) {
        console.error('Could not add tests to execution:', testError);
      }
    }

    // Set test environments if provided
    if (testEnvironments.length > 0 && xrayConfigured) {
      try {
        const execId = await xrayService.resolveIssueId(axiosInstance, testExecKey);
        await xrayService.addTestEnvironments(execId, testEnvironments);
      } catch (envError) {
        console.error('Could not set test environments:', envError);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Successfully created test execution: ${testExecKey}
          
**Summary:** ${summary}
**Project:** ${projectKey}
${testPlanKey ? `**Test Plan:** ${testPlanKey}` : ''}
${tests.length > 0 ? `**Tests Added:** ${tests.join(', ')}` : ''}
${testEnvironments.length > 0 ? `**Environments:** ${testEnvironments.join(', ')}` : ''}

View at: ${config.JIRA_BASE_URL}/browse/${testExecKey}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error creating test execution:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error creating test execution: ${
            error.response?.data?.errorMessages?.[0] ||
            (error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error')
          }`,
        },
      ],
      isError: true,
    };
  }
}

