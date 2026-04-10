import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const reorderTestStepsTool = {
  name: 'reorder_test_steps',
  description:
    'Reorder test steps on a manual test case. Provide step IDs in the desired order. Use get_test_with_steps to see current steps and IDs. All existing step IDs must be included. Test run history is NOT affected — only the definition template changes.',
  inputSchema: {
    type: 'object',
    properties: {
      test_key: {
        type: 'string',
        description: 'Test issue key (e.g., PAD-29661)',
      },
      step_ids: {
        type: 'array',
        items: { type: 'string' },
        description:
          'All step IDs in desired order. Must include every existing step ID. Get IDs from get_test_with_steps.',
      },
    },
    required: ['test_key', 'step_ids'],
  },
};

export async function reorderTestSteps(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const { test_key, step_ids } = args;

    if (!step_ids || !Array.isArray(step_ids) || step_ids.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: step_ids must be a non-empty array of step ID strings.',
          },
        ],
      };
    }

    const xrayService = XrayCloudService.getInstance(config);

    if (!xrayService.isConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Xray Cloud API credentials not configured. This tool requires XRAY_CLIENT_ID and XRAY_CLIENT_SECRET in .mcp.env.',
          },
        ],
      };
    }

    console.error(`Reordering test steps for: ${test_key}`);

    // Step 1: Fetch current steps with full content
    const xrayTestData = await xrayService.getTestWithSteps(test_key);
    if (!xrayTestData) {
      return {
        content: [
          { type: 'text', text: `Error: Test ${test_key} not found in Xray.` },
        ],
      };
    }

    const currentSteps: Array<{
      id: string;
      action: string;
      data: string;
      result: string;
    }> = (xrayTestData.steps || []).map((s: any) => ({
      id: s.id,
      action: s.action || '',
      data: s.data || '',
      result: s.result || '',
    }));

    if (currentSteps.length === 0) {
      return {
        content: [
          { type: 'text', text: `${test_key} has no steps to reorder.` },
        ],
      };
    }

    // Step 2: Validate step_ids match current steps exactly
    const currentIds = new Set(currentSteps.map((s) => s.id));
    const requestedIds = new Set(step_ids);

    const missing = step_ids.filter((id: string) => !currentIds.has(id));
    if (missing.length > 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: These step IDs don't exist on ${test_key}: ${missing.join(', ')}\n\nCurrent step IDs: ${currentSteps.map((s) => s.id).join(', ')}`,
          },
        ],
      };
    }

    const extra = currentSteps.filter((s) => !requestedIds.has(s.id));
    if (extra.length > 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: All existing step IDs must be included. Missing from your list: ${extra.map((s) => `${s.id} ("${s.action}")`).join(', ')}`,
          },
        ],
      };
    }

    if (step_ids.length !== currentSteps.length) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: step_ids count (${step_ids.length}) doesn't match current step count (${currentSteps.length}).`,
          },
        ],
      };
    }

    // Step 3: Build new order from step_ids, looking up content by ID
    const stepMap = new Map(currentSteps.map((s) => [s.id, s]));
    const newOrder = step_ids.map((id: string) => stepMap.get(id)!);

    // Step 4: Log backup to stderr (safety net)
    console.error(
      `BACKUP — ${test_key} steps before reorder:\n${JSON.stringify(currentSteps, null, 2)}`
    );

    // Step 5: Resolve issue ID and remove all steps
    const issueId = await xrayService.resolveIssueId(axiosInstance, test_key);
    await xrayService.removeAllTestSteps(issueId);
    console.error(`Removed all steps from ${test_key} (issueId: ${issueId})`);

    // Step 6: Re-add steps in new order, tracking progress
    const addedSteps: Array<{ id: string; action: string }> = [];
    const failedFrom: number | null = null;

    for (let i = 0; i < newOrder.length; i++) {
      const step = newOrder[i];
      try {
        const result = await xrayService.addTestStep(issueId, {
          action: step.action,
          data: step.data || undefined,
          result: step.result || undefined,
        });
        addedSteps.push({ id: result?.id || 'unknown', action: step.action });
      } catch (addError: any) {
        // Re-add failed partway — dump remaining steps for manual recovery
        const remaining = newOrder.slice(i);
        const recoveryData = remaining
          .map(
            (s, idx) =>
              `Step ${i + idx + 1}: action=${JSON.stringify(s.action)}, data=${JSON.stringify(s.data)}, result=${JSON.stringify(s.result)}`
          )
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Error: Re-add failed at step ${i + 1}/${newOrder.length}. ${addedSteps.length} steps were added successfully.\n\n` +
                `Error: ${addError.message}\n\n` +
                `⚠ REMAINING STEPS (add these manually with add_test_step):\n${recoveryData}`,
            },
          ],
        };
      }
    }

    // Step 7: Verification — fetch steps again and compare
    console.error('Verifying reorder result...');
    const verifyData = await xrayService.getTestWithSteps(test_key);
    const verifiedSteps = verifyData?.steps || [];

    let verificationPassed = true;
    const issues: string[] = [];

    if (verifiedSteps.length !== newOrder.length) {
      verificationPassed = false;
      issues.push(
        `Expected ${newOrder.length} steps, got ${verifiedSteps.length}`
      );
    } else {
      for (let i = 0; i < newOrder.length; i++) {
        if (verifiedSteps[i].action !== newOrder[i].action) {
          verificationPassed = false;
          issues.push(
            `Step ${i + 1}: expected "${newOrder[i].action}", got "${verifiedSteps[i].action}"`
          );
        }
      }
    }

    if (!verificationPassed) {
      return {
        content: [
          {
            type: 'text',
            text: `⚠ Reorder completed but verification found issues:\n${issues.join('\n')}\n\n` +
              `The steps were re-added but may not be in the expected order. Check ${config.JIRA_BASE_URL}/browse/${test_key} manually.`,
          },
        ],
      };
    }

    // Step 8: Success — report new order
    let output = `Successfully reordered ${addedSteps.length} steps on **${test_key}**\n\n`;
    output += '**New order:**\n';
    verifiedSteps.forEach((step: any, idx: number) => {
      output += `${idx + 1}. (ID: ${step.id}) ${step.action}\n`;
    });
    output += `\nView at: ${config.JIRA_BASE_URL}/browse/${test_key}`;

    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (error: any) {
    console.error('Error reordering test steps:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error reordering test steps: ${
            error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error'
          }`,
        },
      ],
    };
  }
}
