import { AxiosInstance } from 'axios';
import { Config, JiraIssue } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const getTestPlanTool = {
  name: 'get_test_plan',
  description: 'Get detailed information about a test plan including associated tests',
  inputSchema: {
    type: 'object',
    properties: {
      test_plan_key: {
        type: 'string',
        description: 'Test Plan issue key (e.g., PROJ-789)',
      },
    },
    required: ['test_plan_key'],
  },
};

export async function getTestPlan(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const testPlanKey = args.test_plan_key;

    console.error(`Fetching test plan details for: ${testPlanKey}`);

    // Get the test plan issue
    const response = await axiosInstance.get<JiraIssue>(
      `/rest/api/3/issue/${testPlanKey}`,
      {
        params: {
          fields: 'summary,description,status,created,updated,assignee,reporter',
        },
      }
    );

    const testPlan = response.data;
    const fields = testPlan.fields;

    // Try to get associated tests from Xray Cloud GraphQL API
    let associatedTests: string[] = [];
    try {
      const xrayService = XrayCloudService.getInstance(config);
      if (xrayService.isConfigured()) {
        associatedTests = await xrayService.getTestPlanTests(testPlanKey);
      }
    } catch (testError) {
      console.error('Could not fetch associated tests:', testError);
      // Continue without tests
    }

    // Build test plan details output
    let planDetails = `**Test Plan: ${testPlan.key}**

**Summary:** ${fields.summary}

**Description:**
${fields.description?.content?.[0]?.content?.[0]?.text || fields.description || 'No description'}

**Details:**
- Status: ${fields.status.name}
- Assignee: ${fields.assignee?.displayName || 'Unassigned'}
- Reporter: ${fields.reporter?.displayName || 'Unknown'}
- Created: ${new Date(fields.created).toLocaleString()}
- Updated: ${new Date(fields.updated).toLocaleString()}`;

    // Add associated tests if available
    if (associatedTests.length > 0) {
      planDetails += `\n\n**Associated Tests (${associatedTests.length}):**\n`;
      planDetails += associatedTests.map((key) => `- ${key}`).join('\n');
    } else {
      planDetails += '\n\n**Associated Tests:** None';
    }

    return {
      content: [
        {
          type: 'text',
          text: planDetails,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error fetching test plan details:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching test plan details: ${
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

