import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  updateTestRun,
  updateTestRunTool,
} from '../../../src/tools/test-executions/updateTestRun';

const TOOL = {
  name: updateTestRunTool.name,
  schema: updateTestRunTool,
  sourcePath: 'src/tools/test-executions/updateTestRun.ts',
  execute: updateTestRun,
};

const JIRA_BASE = 'https://test.atlassian.net';
const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

/**
 * Install handlers that cover the full updateTestRun flow:
 *   1. Xray auth (already covered by default handlers)
 *   2. resolveIssueId for test_key → GET /rest/api/3/issue/:key
 *   3. resolveIssueId for test_execution_key → same endpoint
 *   4. getTestRun GraphQL query → returns a test run ID
 *   5. updateTestRunStatus mutation → generic success
 *
 * Steps 2-3 use the default Jira handler (returns { id: '10000' }).
 * Step 4 needs a custom GraphQL handler because getTestRun isn't in defaults.
 */
function installUpdateHandlers(opts?: { testRunId?: string | null }) {
  const testRunId = opts && 'testRunId' in opts ? opts.testRunId : 'run-42';

  server.use(
    http.post(XRAY_GRAPHQL, async ({ request }) => {
      const body: any = await request.clone().json().catch(() => ({}));
      const query = body?.query || '';

      // getTestRun query — return the requested test run ID
      if (query.includes('getTestRun')) {
        return HttpResponse.json({
          data: {
            getTestRun: testRunId
              ? { id: testRunId, status: { name: 'TO DO' } }
              : null,
          },
        });
      }

      // Mutations (updateTestRunStatus, updateTestRunComment, addDefectsToTestRun)
      if (/\bmutation\b/.test(query)) {
        return HttpResponse.json({ data: {} });
      }

      // Fallback
      return HttpResponse.json({ data: {} });
    }),
  );
}

describe('update_test_run', () => {
  describe('happy path', () => {
    it('returns success message when test run is updated', async () => {
      installUpdateHandlers();

      const result = await callTool(TOOL, {
        test_execution_key: 'PAD-1',
        test_key: 'PAD-2',
        status: 'PASS',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Successfully updated test run');
      expect(result.content[0].text).toContain('PAD-2');
      expect(result.content[0].text).toContain('PAD-1');
      expect(result.content[0].text).toContain('PASS');
    });

    it('returns message when no test run is found (not an error)', async () => {
      installUpdateHandlers({ testRunId: null });

      const result = await callTool(TOOL, {
        test_execution_key: 'PAD-1',
        test_key: 'PAD-99',
        status: 'PASS',
      });

      // The tool returns informational text (not isError) when no run is found
      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('No test run found');
    });
  });

  describe('error paths', () => {
    it('surfaces GraphQL errors as isError', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () =>
          HttpResponse.json({
            errors: [{ message: 'Internal server error' }],
          }),
        ),
      );

      const result = await callTool(TOOL, {
        test_execution_key: 'PAD-1',
        test_key: 'PAD-2',
        status: 'PASS',
      });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      // Network failure on the Jira REST call (resolveIssueId)
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, {
        test_execution_key: 'PAD-1',
        test_key: 'PAD-2',
        status: 'PASS',
      });

      expect(result.isError).toBe(true);
    });
  });
});
