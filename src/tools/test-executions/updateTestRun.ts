import { AxiosInstance } from 'axios';
import { Config, TestStatus } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const updateTestRunTool = {
  name: 'update_test_run',
  description: 'Update the result of a test run within a test execution',
  inputSchema: {
    type: 'object',
    properties: {
      test_execution_key: {
        type: 'string',
        description: 'Test Execution issue key (e.g., PROJ-456)',
      },
      test_key: {
        type: 'string',
        description: 'Test issue key (e.g., PROJ-123)',
      },
      status: {
        type: 'string',
        description: 'Test run status',
        enum: ['PASSED', 'FAILED', 'TO DO', 'EXECUTING', 'KNOWN_ISSUE', 'BLOCKED', 'SKIPPED'],
      },
      comment: {
        type: 'string',
        description: 'Comment about the test run (optional)',
      },
      defects: {
        type: 'string',
        description: 'Comma-separated defect keys (optional)',
      },
    },
    required: ['test_execution_key', 'test_key', 'status'],
  },
};

export async function updateTestRun(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const testExecutionKey = args.test_execution_key;
    const testKey = args.test_key;
    const status: TestStatus = args.status;
    const comment = args.comment;
    const defects = args.defects
      ? args.defects.split(',').map((d: string) => d.trim())
      : [];

    console.error(
      `Updating test run for ${testKey} in execution ${testExecutionKey}`
    );

    // Use Xray Cloud GraphQL API to update the test run
    const xrayService = XrayCloudService.getInstance(config);

    if (!xrayService.isConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Xray Cloud API credentials not configured. This tool requires XRAY_CLIENT_ID and XRAY_CLIENT_SECRET in .mcp.env.',
          },
        ],
        isError: true,
      };
    }

    // Get the test run ID first (pass axiosInstance to resolve keys to numeric IDs)
    const testRunId = await xrayService.getTestRunId(testExecutionKey, testKey, axiosInstance);
    if (!testRunId) {
      return {
        content: [
          {
            type: 'text',
            text: `No test run found for test ${testKey} in execution ${testExecutionKey}. Make sure the test is part of this execution.`,
          },
        ],
      };
    }

    // Update status
    await xrayService.updateTestRunStatus(testRunId, status);

    // Update comment if provided
    if (comment) {
      await xrayService.updateTestRunComment(testRunId, comment);
    }

    // Add defects if provided
    if (defects.length > 0) {
      await xrayService.addDefectsToTestRun(testRunId, defects);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Successfully updated test run

**Test:** ${testKey}
**Test Execution:** ${testExecutionKey}
**Status:** ${status}
${comment ? `**Comment:** ${comment}` : ''}
${defects.length > 0 ? `**Defects:** ${defects.join(', ')}` : ''}

View at: ${config.JIRA_BASE_URL}/browse/${testExecutionKey}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error updating test run:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error updating test run: ${
            error.response?.data?.errorMessages?.[0] ||
            error.response?.data?.error ||
            error.message ||
            'Unknown error'
          }`,
        },
      ],
      isError: true,
    };
  }
}

