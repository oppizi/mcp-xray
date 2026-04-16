import { AxiosInstance } from 'axios';
import { Config, JiraIssue } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const getTestSetTool = {
  name: 'get_test_set',
  description: 'Get detailed information about a test set including associated tests',
  inputSchema: {
    type: 'object',
    properties: {
      test_set_key: {
        type: 'string',
        description: 'Test Set issue key (e.g., PROJ-999)',
      },
    },
    required: ['test_set_key'],
  },
};

export async function getTestSet(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const testSetKey = args.test_set_key;

    console.error(`Fetching test set details for: ${testSetKey}`);

    // Get the test set issue
    const response = await axiosInstance.get<JiraIssue>(
      `/rest/api/3/issue/${testSetKey}`,
      {
        params: {
          fields: 'summary,description,status,created,updated,assignee,reporter',
        },
      }
    );

    const testSet = response.data;
    const fields = testSet.fields;

    // Try to get associated tests from Xray Cloud GraphQL API
    let associatedTests: string[] = [];
    try {
      const xrayService = XrayCloudService.getInstance(config);
      if (xrayService.isConfigured()) {
        associatedTests = await xrayService.getTestSetTests(testSetKey);
      }
    } catch (testError) {
      console.error('Could not fetch associated tests:', testError);
      // Continue without tests
    }

    // Build test set details output
    let setDetails = `**Test Set: ${testSet.key}**

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
      setDetails += `\n\n**Associated Tests (${associatedTests.length}):**\n`;
      setDetails += associatedTests.map((key) => `- ${key}`).join('\n');
    } else {
      setDetails += '\n\n**Associated Tests:** None';
    }

    return {
      content: [
        {
          type: 'text',
          text: setDetails,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error fetching test set details:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching test set details: ${
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

