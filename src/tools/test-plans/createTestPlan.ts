import { AxiosInstance } from 'axios';
import { Config, JiraIssue } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const createTestPlanTool = {
  name: 'create_test_plan',
  description: 'Create a new test plan in Jira with Xray',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'Jira project key (e.g., PROJ)',
      },
      summary: {
        type: 'string',
        description: 'Test plan summary/title',
      },
      description: {
        type: 'string',
        description: 'Test plan description (optional)',
      },
      tests: {
        type: 'string',
        description: 'Comma-separated test keys to add to plan (optional)',
      },
    },
    required: ['project_key', 'summary'],
  },
};

export async function createTestPlan(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const projectKey = args.project_key;
    const summary = args.summary;
    const description = args.description || '';
    const tests = args.tests
      ? args.tests.split(',').map((t: string) => t.trim())
      : [];

    console.error(`Creating test plan in project: ${projectKey}`);

    // Get issue type ID for Test Plan
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
    const testPlanIssueType = project.issuetypes.find(
      (type: any) => type.name === 'Test Plan'
    );

    if (!testPlanIssueType) {
      throw new Error(
        `Test Plan issue type not found in project ${projectKey}. Make sure Xray is installed.`
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
          id: testPlanIssueType.id,
        },
      },
    };

    // Create the test plan issue
    const response = await axiosInstance.post<JiraIssue>(
      '/rest/api/3/issue',
      issueData
    );

    const testPlanKey = response.data.key;

    // Add tests to plan via Xray Cloud GraphQL
    if (tests.length > 0) {
      try {
        const xrayService = XrayCloudService.getInstance(config);
        if (xrayService.isConfigured()) {
          const planId = await xrayService.resolveIssueId(axiosInstance, testPlanKey);
          const testIds = await Promise.all(
            tests.map((key: string) => xrayService.resolveIssueId(axiosInstance, key))
          );
          await xrayService.addTestsToTestPlan(planId, testIds);
        } else {
          console.error('Xray Cloud API not configured — tests not added to plan.');
        }
      } catch (testError) {
        console.error('Could not add tests to plan:', testError);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Successfully created test plan: ${testPlanKey}
          
**Summary:** ${summary}
**Project:** ${projectKey}
${tests.length > 0 ? `**Tests Added:** ${tests.join(', ')}` : ''}

View at: ${config.JIRA_BASE_URL}/browse/${testPlanKey}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error creating test plan:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error creating test plan: ${
            error.response?.data?.errorMessages?.[0] ||
            (error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error')
          }`,
        },
      ],
    };
  }
}

