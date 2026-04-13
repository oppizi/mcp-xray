import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const reorderTestStepsTool = {
  name: 'reorder_test_steps',
  description:
    'Reorder test steps on a manual test case. Provide step IDs in the desired order. Use get_test_with_steps to see current steps and IDs. All existing step IDs must be included — this is a full reorder. Test run execution data (statuses, comments, defects, evidence) is backed up and restored automatically.',
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

// Per-step execution data from a test run
interface StepRunData {
  stepId: string;
  status: string;
  comment: string | null;
  actualResult: string | null;
  defects: string[] | null;
  evidence: Array<{ id: string; filename: string; downloadLink: string }>;
}

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

    // ── Phase 1: Fetch and validate definition steps ──

    const xrayTestData = await xrayService.getTestWithSteps(test_key);
    if (!xrayTestData) {
      return {
        content: [
          { type: 'text', text: `Error: Test ${test_key} not found in Xray.` },
        ],
      };
    }

    interface DefinitionStep {
      id: string;
      action: string;
      data: string;
      result: string;
    }

    const currentSteps: DefinitionStep[] = (xrayTestData.steps || []).map((s: any) => ({
      id: s.id as string,
      action: (s.action || '') as string,
      data: (s.data || '') as string,
      result: (s.result || '') as string,
    }));

    if (currentSteps.length === 0) {
      return {
        content: [
          { type: 'text', text: `${test_key} has no steps to reorder.` },
        ],
      };
    }

    // Validate step_ids match current steps exactly
    const currentIds = new Set(currentSteps.map((s) => s.id));

    const missing = step_ids.filter((id: string) => !currentIds.has(id));
    if (missing.length > 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: These step IDs don't exist on ${test_key}: ${missing.join(', ')}\n\nCurrent step IDs:\n${currentSteps.map((s) => `  ${s.id} — "${s.action}"`).join('\n')}`,
          },
        ],
      };
    }

    const requestedIds = new Set(step_ids);
    const extra = currentSteps.filter((s) => !requestedIds.has(s.id));
    if (extra.length > 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: All existing step IDs must be included. Missing from your list:\n${extra.map((s) => `  ${s.id} — "${s.action}"`).join('\n')}`,
          },
        ],
      };
    }

    // Build new order from step_ids
    const stepMap = new Map<string, DefinitionStep>(currentSteps.map((s) => [s.id, s]));
    const newOrder: DefinitionStep[] = step_ids.map((id: string) => stepMap.get(id)!);

    // ── Phase 2: Backup test run execution data ──
    // Key insight: test run steps keep their OLD IDs and order forever.
    // After reorder, we just write the saved data back to the same IDs.

    const issueId = await xrayService.resolveIssueId(axiosInstance, test_key);
    console.error(`Resolved ${test_key} to issueId: ${issueId}`);

    let testRuns: any[] = [];
    // Map: runId -> stepId -> StepRunData
    const runBackups = new Map<string, Map<string, StepRunData>>();
    let runsWithData = 0;

    try {
      testRuns = await xrayService.getTestRunsForTest(issueId);
      console.error(`Found ${testRuns.length} test run(s) for ${test_key}`);
    } catch (e: any) {
      console.error(`Warning: Could not fetch test runs: ${e.message}. Proceeding without backup.`);
    }

    for (const run of testRuns) {
      const stepBackup = new Map<string, StepRunData>();
      let hasData = false;

      for (const s of (run.steps || []) as any[]) {
        const data: StepRunData = {
          stepId: s.id,
          status: s.status?.name || 'TODO',
          comment: s.comment || null,
          actualResult: s.actualResult || null,
          defects: s.defects || null,
          evidence: ((s.evidence || []) as any[]).map((e: any) => ({
            id: e.id,
            filename: e.filename,
            downloadLink: e.downloadLink,
          })),
        };

        if (data.status !== 'TODO' || data.comment || data.actualResult ||
            (data.defects && data.defects.length > 0) || data.evidence.length > 0) {
          hasData = true;
        }

        stepBackup.set(s.id, data);
      }

      if (hasData) {
        runBackups.set(run.id, stepBackup);
        runsWithData++;
      }
    }

    console.error(`${runsWithData}/${testRuns.length} test run(s) have execution data to preserve`);

    // ── Phase 3: Log full backup to stderr ──

    const backupLog = {
      testKey: test_key,
      issueId,
      definitionSteps: currentSteps,
      testRunBackups: Object.fromEntries(
        Array.from(runBackups.entries()).map(([runId, steps]) => [
          runId,
          Object.fromEntries(steps),
        ])
      ),
    };
    console.error(`FULL BACKUP:\n${JSON.stringify(backupLog, null, 2)}`);

    // ── Phase 4: Download evidence files before removing steps ──

    // Map: runId -> stepId -> downloaded evidence
    const evidenceCache = new Map<string, Map<string, Array<{ filename: string; mimeType: string; data: string }>>>();
    const evidenceWarnings: string[] = [];

    for (const [runId, stepBackup] of runBackups) {
      const runEvidence = new Map<string, Array<{ filename: string; mimeType: string; data: string }>>();

      for (const [stepId, data] of stepBackup) {
        if (data.evidence.length > 0) {
          const downloaded: Array<{ filename: string; mimeType: string; data: string }> = [];
          for (const ev of data.evidence) {
            if (ev.downloadLink) {
              const result = await xrayService.downloadEvidence(ev.downloadLink);
              if (result) {
                downloaded.push({ filename: ev.filename, mimeType: result.mimeType, data: result.data });
              } else {
                evidenceWarnings.push(`Could not download "${ev.filename}" from run ${runId} step ${stepId}`);
              }
            }
          }
          if (downloaded.length > 0) {
            runEvidence.set(stepId, downloaded);
          }
        }
      }

      if (runEvidence.size > 0) {
        evidenceCache.set(runId, runEvidence);
      }
    }

    // ── Phase 5: Remove all steps and re-add in new order ──

    await xrayService.removeAllTestSteps(issueId);
    console.error(`Removed all definition steps from ${test_key}`);

    const addedSteps: Array<{ id: string; action: string }> = [];

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
        const remaining = newOrder.slice(i);
        const recoveryData = remaining
          .map((s, idx) => `Step ${i + idx + 1}: action=${JSON.stringify(s.action)}, data=${JSON.stringify(s.data)}, result=${JSON.stringify(s.result)}`)
          .join('\n');

        return {
          content: [{
            type: 'text',
            text: `Error: Re-add failed at step ${i + 1}/${newOrder.length}. ${addedSteps.length} added.\n\n` +
              `Error: ${addError.message}\n\n` +
              `⚠ REMAINING STEPS (add manually with add_test_step):\n${recoveryData}\n\n` +
              `⚠ Test run data was NOT restored. Check stderr for full backup.`,
          }],
        };
      }
    }

    // ── Phase 6: Verify definition order ──

    console.error('Verifying reorder result...');
    const verifyData = await xrayService.getTestWithSteps(test_key);
    const verifiedSteps = verifyData?.steps || [];

    let verificationPassed = true;
    const verifyIssues: string[] = [];

    if (verifiedSteps.length !== newOrder.length) {
      verificationPassed = false;
      verifyIssues.push(`Expected ${newOrder.length} steps, got ${verifiedSteps.length}`);
    } else {
      for (let i = 0; i < newOrder.length; i++) {
        if (verifiedSteps[i].action !== newOrder[i].action) {
          verificationPassed = false;
          verifyIssues.push(`Step ${i + 1}: expected "${newOrder[i].action}", got "${verifiedSteps[i].action}"`);
        }
      }
    }

    if (!verificationPassed) {
      return {
        content: [{
          type: 'text',
          text: `⚠ Reorder completed but verification failed:\n${verifyIssues.join('\n')}\n\nCheck ${config.JIRA_BASE_URL}/browse/${test_key}. Run data was NOT restored.`,
        }],
      };
    }

    // ── Phase 7: Restore test run execution data ──
    // Run steps keep their old IDs — just write saved data back to the same IDs.

    let restoreStats = { runs: 0, steps: 0, evidence: 0, skipped: 0, errors: 0 };
    const restoreErrors: string[] = [];

    if (runsWithData > 0) {
      console.error(`Restoring execution data for ${runsWithData} test run(s)...`);

      for (const [runId, stepBackup] of runBackups) {
        restoreStats.runs++;

        for (const [stepId, data] of stepBackup) {
          // Skip steps that had no execution data
          if (data.status === 'TODO' && !data.comment && !data.actualResult &&
              (!data.defects || data.defects.length === 0) && data.evidence.length === 0) {
            restoreStats.skipped++;
            continue;
          }

          try {
            // Restore status, comment, actualResult, defects
            await xrayService.restoreTestRunStep(runId, stepId, {
              status: data.status,
              comment: data.comment || undefined,
              actualResult: data.actualResult || undefined,
              defects: data.defects || undefined,
            });
            restoreStats.steps++;

            // Restore evidence
            const cachedEvidence = evidenceCache.get(runId)?.get(stepId);
            if (cachedEvidence && cachedEvidence.length > 0) {
              await xrayService.restoreTestRunStep(runId, stepId, {
                evidence: cachedEvidence,
              });
              restoreStats.evidence += cachedEvidence.length;
            }
          } catch (restoreError: any) {
            restoreErrors.push(`Run ${runId} step ${stepId}: ${restoreError.message}`);
            restoreStats.errors++;
          }
        }
      }
    }

    // ── Phase 8: Report ──

    let output = `Successfully reordered ${addedSteps.length} steps on **${test_key}**\n\n`;
    output += '**New order:**\n';
    verifiedSteps.forEach((step: any, idx: number) => {
      output += `${idx + 1}. (ID: ${step.id}) ${step.action}\n`;
    });

    if (runsWithData > 0) {
      output += `\n**Execution data restored:** ${restoreStats.steps} step(s) across ${restoreStats.runs} run(s)`;
      if (restoreStats.evidence > 0) output += `, ${restoreStats.evidence} evidence file(s)`;
      if (restoreStats.skipped > 0) output += ` (${restoreStats.skipped} TODO steps skipped)`;
      output += '\n';
    }

    if (restoreErrors.length > 0) {
      output += `\n⚠ **Restore warnings** (${restoreErrors.length}):\n`;
      restoreErrors.forEach((e) => (output += `- ${e}\n`));
    }

    if (evidenceWarnings.length > 0) {
      output += `\n⚠ **Evidence warnings** (${evidenceWarnings.length}):\n`;
      evidenceWarnings.forEach((e) => (output += `- ${e}\n`));
    }

    output += `\nView at: ${config.JIRA_BASE_URL}/browse/${test_key}`;

    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (error: any) {
    console.error('Error reordering test steps:', error);
    return {
      content: [{
        type: 'text',
        text: `Error reordering test steps: ${
          error.response?.data?.errors
            ? JSON.stringify(error.response.data.errors)
            : error.message || 'Unknown error'
        }`,
      }],
    };
  }
}
