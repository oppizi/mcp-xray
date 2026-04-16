import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  listTestExecutions,
  listTestExecutionsTool,
} from '../../../src/tools/test-executions/listTestExecutions';

const TOOL = {
  name: listTestExecutionsTool.name,
  schema: listTestExecutionsTool,
  sourcePath: 'src/tools/test-executions/listTestExecutions.ts',
  execute: listTestExecutions,
};

const JIRA_BASE = 'https://test.atlassian.net';

const MOCK_EXECUTION_ISSUE = {
  id: '20001',
  key: 'PAD-EXEC-1',
  fields: {
    summary: 'Sprint 42 Regression',
    status: { name: 'In Progress' },
    assignee: { displayName: 'Jane Doe' },
    reporter: { displayName: 'John Smith' },
    created: '2026-01-15T10:00:00.000Z',
    updated: '2026-01-16T12:00:00.000Z',
  },
};

describe('list_test_executions', () => {
  describe('happy path', () => {
    it('returns formatted execution list when Jira responds normally', async () => {
      server.use(
        http.post(`${JIRA_BASE}/rest/api/3/search/jql`, () => {
          return HttpResponse.json({
            issues: [MOCK_EXECUTION_ISSUE],
            total: 1,
            startAt: 0,
            maxResults: 50,
          });
        }),
      );

      const result = await callTool(TOOL, { project_key: 'PAD' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-EXEC-1');
      expect(result.content[0].text).toContain('Sprint 42 Regression');
      expect(result.content[0].text).toContain('In Progress');
      expect(result.content[0].text).toContain('Jane Doe');
    });

    it('warns users when results are paginated (total > returned count)', async () => {
      // Silent-truncation guard — see list_tests.test.ts for rationale.
      const mockIssues = Array.from({ length: 50 }, (_, i) => ({
        ...MOCK_EXECUTION_ISSUE,
        id: `${20000 + i}`,
        key: `PAD-EXEC-${i}`,
      }));
      server.use(
        http.post(`${JIRA_BASE}/rest/api/3/search/jql`, () =>
          HttpResponse.json({
            issues: mockIssues,
            total: 175,
            startAt: 0,
            maxResults: 50,
          }),
        ),
      );

      const result = await callTool(TOOL, { project_key: 'PAD', max_results: 50 });
      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('175');
      expect(result.content[0].text).toContain('50');
    });

    it('returns empty message when no executions found', async () => {
      server.use(
        http.post(`${JIRA_BASE}/rest/api/3/search/jql`, () => {
          return HttpResponse.json({
            issues: [],
            total: 0,
            startAt: 0,
            maxResults: 50,
          });
        }),
      );

      const result = await callTool(TOOL, { project_key: 'PAD' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('No test executions found');
    });

    it('includes count in summary when executions are found', async () => {
      server.use(
        http.post(`${JIRA_BASE}/rest/api/3/search/jql`, () => {
          return HttpResponse.json({
            issues: [
              MOCK_EXECUTION_ISSUE,
              { ...MOCK_EXECUTION_ISSUE, key: 'PAD-EXEC-2', fields: { ...MOCK_EXECUTION_ISSUE.fields, summary: 'Smoke Test' } },
            ],
            total: 2,
            startAt: 0,
            maxResults: 50,
          });
        }),
      );

      const result = await callTool(TOOL, { project_key: 'PAD' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Found 2 test execution(s)');
    });
  });

  describe('error paths', () => {
    it('surfaces backend errors as isError', async () => {
      server.use(
        http.post(`${JIRA_BASE}/rest/api/3/search/jql`, () =>
          HttpResponse.json(
            { errorMessages: ['Server error'] },
            { status: 500 },
          ),
        ),
      );

      const result = await callTool(TOOL, { project_key: 'PAD' });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.post(`${JIRA_BASE}/rest/api/3/search/jql`, () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, { project_key: 'PAD' });

      expect(result.isError).toBe(true);
    });
  });
});
