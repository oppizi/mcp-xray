import { AxiosInstance } from 'axios';
import { Config, JiraIssue, XrayTestStep } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

/**
 * Process Xray attachment references and convert them to readable format
 * Format: !xray-attachment://UUID|properties!
 */
function processXrayAttachments(text: string): string {
  if (!text) return text;
  
  // Regex to match Xray attachment references
  const attachmentRegex = /!xray-attachment:\/\/([a-f0-9-]+)(?:\|([^!]+))?!/g;
  
  return text.replace(attachmentRegex, (match, uuid, properties) => {
    const props = properties ? ` (${properties})` : '';
    return `📎 **[Attachment: ${uuid}]**${props}\n   Link: https://xray.cloud.getxray.app/api/v2/attachment/${uuid}`;
  });
}

export const getTestWithStepsTool = {
  name: 'get_test_with_steps',
  description: 'Get detailed test information with test steps using the reliable GraphQL getTests query. This tool always fetches test steps if they exist.',
  inputSchema: {
    type: 'object',
    properties: {
      test_key: {
        type: 'string',
        description: 'Test issue key (e.g., EXM-123)',
      },
    },
    required: ['test_key'],
  },
};

export async function getTestWithSteps(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const testKey = args.test_key;

    console.error(`Fetching test details with steps for: ${testKey}`);

    // Get the test issue from Jira
    const response = await axiosInstance.get<JiraIssue>(
      `/rest/api/3/issue/${testKey}`,
      {
        params: {
          fields: 'summary,description,status,priority,labels,components,created,updated,assignee,reporter,issuetype,customfield_*',
        },
      }
    );

    const test = response.data;
    const fields = test.fields;

    // Get test steps from Xray Cloud API using getTests (plural) query
    let testSteps: XrayTestStep[] = [];
    let testType = 'Unknown';
    
    try {
      const xrayService = XrayCloudService.getInstance(config);
      
      if (!xrayService.isConfigured()) {
        return {
          content: [
            {
              type: 'text',
              text: `Xray Cloud API credentials not configured — cannot retrieve test steps.\n\n` +
                `To set up Xray Cloud API access:\n` +
                `1. Ask Natalia (QA Lead) for Xray Cloud API credentials (Client ID + Secret)\n` +
                `2. Add them to your .mcp.env file:\n` +
                `   XRAY_CLIENT_ID='your_client_id'\n` +
                `   XRAY_CLIENT_SECRET='your_client_secret'\n` +
                `3. Restart Claude Code to pick up the new credentials\n\n` +
                `In the meantime, you can use get_test to see test details without steps.`,
            },
          ],
        };
      }

      console.error('Fetching test steps from Xray Cloud API using getTests query...');
      const xrayTestData = await xrayService.getTestWithSteps(testKey);
      
      if (!xrayTestData) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Test ${testKey} not found in Xray Cloud API.`,
            },
          ],
        };
      }

      testType = xrayTestData.testType?.name || 'Unknown';

      // Extract steps from Xray Cloud response
      if (xrayTestData.steps && xrayTestData.steps.length > 0) {
        testSteps = xrayTestData.steps.map((step: any, index: number) => ({
          id: step.id,
          index: index + 1,
          step: step.action || '',
          data: step.data || '',
          result: step.result || '',
        }));
      }
    } catch (stepError: any) {
      console.error('Could not fetch test steps from Xray Cloud:', stepError.message);
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching test steps: ${stepError.message}`,
          },
        ],
      };
    }

    // Build test details output
    let testDetails = `**Test: ${test.key}**

**Summary:** ${fields.summary}

**Test Type:** ${testType}

**Description:**
${fields.description?.content?.[0]?.content?.[0]?.text || fields.description || 'No description'}

**Details:**
- Status: ${fields.status.name}
- Priority: ${fields.priority?.name || 'Not set'}
- Assignee: ${fields.assignee?.displayName || 'Unassigned'}
- Reporter: ${fields.reporter?.displayName || 'Unknown'}
- Labels: ${fields.labels?.join(', ') || 'None'}
- Components: ${fields.components?.map((c) => c.name).join(', ') || 'None'}
- Created: ${new Date(fields.created).toLocaleString()}
- Updated: ${new Date(fields.updated).toLocaleString()}`;

    // Add test steps
    if (testSteps.length > 0) {
      testDetails += '\n\n**Test Steps:**\n';
      testSteps.forEach((step, index) => {
        // Process attachments in each field
        const action = processXrayAttachments(step.step);
        const data = step.data ? processXrayAttachments(step.data) : 'N/A';
        const result = step.result ? processXrayAttachments(step.result) : 'N/A';
        
        testDetails += `
**Step ${index + 1}:**
- **Action:** ${action}
- **Data:** ${data}
- **Expected Result:** ${result}
`;
      });
    } else {
      testDetails += '\n\n**Test Steps:** No steps defined for this test.';
    }

    return {
      content: [
        {
          type: 'text',
          text: testDetails,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error fetching test details:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching test details: ${
            error.response?.data?.errorMessages?.[0] ||
            error.message ||
            'Unknown error'
          }`,
        },
      ],
    };
  }
}

