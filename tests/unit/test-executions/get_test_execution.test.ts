import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  getTestExecution,
  getTestExecutionTool,
} from '../../../src/tools/test-executions/getTestExecution';

const TOOL = {
  name: getTestExecutionTool.name,
  schema: getTestExecutionTool,
  sourcePath: 'src/tools/test-executions/getTestExecution.ts',
  execute: getTestExecution,
};

const JIRA_BASE = 'https://test.atlassian.net';
const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

const MOCK_EXECUTION_ISSUE = {
  id: '20001',
  key: 'PAD-1',
  fields: {
    summary: 'Sprint 42 Regression',
    description: {
      content: [{ content: [{ type: 'text', text: 'Full regression pass' }] }],
    },
    status: { name: 'In Progress' },
    assignee: { displayName: 'Jane Doe' },
    reporter: { displayName: 'John Smith' },
    created: '2026-01-15T10:00:00.000Z',
    updated: '2026-01-16T12:00:00.000Z',
  },
};

describe('get_test_execution', () => {
  describe('happy path', () => {
    it('returns execution details when Jira responds normally', async () => {
      // Override Jira GET issue to return a rich execution issue
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () => {
          return HttpResponse.json(MOCK_EXECUTION_ISSUE);
        }),
      );

      // Override Xray GraphQL to return test runs
      server.use(
        http.post(XRAY_GRAPHQL, async ({ request }) => {
          const body: any = await request.clone().json().catch(() => ({}));
          if (typeof body?.query === 'string' && body.query.includes('getTestExecutions')) {
            return HttpResponse.json({
              data: {
                getTestExecutions: {
                  results: [
                    {
                      issueId: '20001',
                      testRuns: {
                        results: [
                          {
                            id: 'run-1',
                            status: { name: 'PASSED' },
                            comment: 'Looks good',
                            executedById: 'user-1',
                            defects: [],
                            // Real Xray API returns `jira` as a JSON string, not object.
                            test: { issueId: '10001', jira: JSON.stringify({ key: 'PAD-TEST-1' }) },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            });
          }
          // Fallback for other GraphQL queries (e.g. auth)
          return HttpResponse.json({ data: {} });
        }),
      );

      const result = await callTool(TOOL, { test_execution_key: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-1');
      expect(result.content[0].text).toContain('Sprint 42 Regression');
      expect(result.content[0].text).toContain('In Progress');
      expect(result.content[0].text).toContain('Jane Doe');
      expect(result.content[0].text).toContain('PAD-TEST-1');
      expect(result.content[0].text).toContain('PASSED');
    });

    it('shows "No test runs found" when Xray returns empty results', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () => {
          return HttpResponse.json(MOCK_EXECUTION_ISSUE);
        }),
      );

      // Xray returns no test executions (empty results)
      server.use(
        http.post(XRAY_GRAPHQL, async ({ request }) => {
          const body: any = await request.clone().json().catch(() => ({}));
          if (typeof body?.query === 'string' && body.query.includes('getTestExecutions')) {
            return HttpResponse.json({
              data: {
                getTestExecutions: {
                  results: [],
                },
              },
            });
          }
          return HttpResponse.json({ data: {} });
        }),
      );

      const result = await callTool(TOOL, { test_execution_key: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('No test runs found');
    });

    it('continues gracefully when Xray GraphQL fails (returns issue data without runs)', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () => {
          return HttpResponse.json(MOCK_EXECUTION_ISSUE);
        }),
      );

      // Xray returns an error — the tool should catch it and show issue data without runs
      server.use(
        http.post(XRAY_GRAPHQL, () => {
          return HttpResponse.json(
            { error: 'Unauthorized' },
            { status: 401 },
          );
        }),
      );

      const result = await callTool(TOOL, { test_execution_key: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Sprint 42 Regression');
      expect(result.content[0].text).toContain('No test runs found');
    });
  });

  describe('error paths', () => {
    it('surfaces backend errors as isError when Jira returns 500', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.json(
            { errorMessages: ['Server error'] },
            { status: 500 },
          ),
        ),
      );

      const result = await callTool(TOOL, { test_execution_key: 'PAD-1' });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, { test_execution_key: 'PAD-1' });

      expect(result.isError).toBe(true);
    });
  });
});
