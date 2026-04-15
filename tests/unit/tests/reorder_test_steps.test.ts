import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  reorderTestSteps,
  reorderTestStepsTool,
} from '../../../src/tools/tests/reorderTestSteps';

const TOOL = {
  name: reorderTestStepsTool.name,
  schema: reorderTestStepsTool,
  sourcePath: 'src/tools/tests/reorderTestSteps.ts',
  execute: reorderTestSteps,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';
const JIRA_BASE = 'https://test.atlassian.net';

describe('reorder_test_steps', () => {
  describe('happy path', () => {
    it('reorders steps when backends respond normally', async () => {
      // reorderTestSteps is complex: it fetches steps, removes all, re-adds in order,
      // verifies, and restores execution data. We need the getTests GraphQL query
      // to return steps with IDs matching the provided step_ids.
      const mockSteps = [
        { id: 'step-a', action: 'First action', data: '', result: 'First result' },
        { id: 'step-b', action: 'Second action', data: '', result: 'Second result' },
      ];

      let callCount = 0;
      server.use(
        http.post(XRAY_GRAPHQL, async ({ request }) => {
          const body: any = await request.clone().json().catch(() => ({}));

          // Auth endpoint
          if (!body?.query) {
            return HttpResponse.json('mock-xray-bearer-token');
          }

          // getTests query (used by getTestWithSteps)
          if (/\bgetTests\b/.test(body.query)) {
            callCount++;
            // First call: returns original order. Second call (verification): returns new order.
            const steps = callCount <= 1
              ? mockSteps
              : [mockSteps[1], mockSteps[0]];
            return HttpResponse.json({
              data: {
                getTests: {
                  total: 1,
                  results: [
                    {
                      issueId: '12345',
                      testType: { name: 'Manual', kind: 'Steps' },
                      steps,
                      gherkin: null,
                    },
                  ],
                },
              },
            });
          }

          // getTestRuns query
          if (/\bgetTestRuns\b/.test(body.query)) {
            return HttpResponse.json({
              data: { getTestRuns: { total: 0, results: [] } },
            });
          }

          // Mutations (removeTestStep, addTestStep, etc.)
          if (/\bmutation\b/.test(body.query)) {
            return HttpResponse.json({ data: {} });
          }

          return HttpResponse.json({ data: {} });
        }),
      );

      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        step_ids: ['step-b', 'step-a'],
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('reordered');
    });
  });

  describe('error paths', () => {
    it('returns isError for empty step_ids', async () => {
      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        step_ids: [],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('non-empty array');
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () => HttpResponse.error()),
      );

      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        step_ids: ['a', 'b'],
      });
      expect(result.isError).toBe(true);
    });
  });
});
