import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  listTests,
  listTestsTool,
} from '../../../src/tools/tests/listTests';

const TOOL = {
  name: listTestsTool.name,
  schema: listTestsTool,
  sourcePath: 'src/tools/tests/listTests.ts',
  execute: listTests,
};

const JIRA_BASE = 'https://test.atlassian.net';

describe('list_tests', () => {
  describe('happy path', () => {
    it('returns formatted test list when Jira responds normally', async () => {
      const result = await callTool(TOOL, { project_key: 'PAD' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-MOCK-1');
      expect(result.content[0].text).toContain('Mock Jira Issue');
    });

    it('includes label and component filters in JQL', async () => {
      const result = await callTool(TOOL, {
        project_key: 'PAD',
        labels: 'smoke,regression',
        component: 'Auth',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toBeTruthy();
    });

    it('warns users when results are paginated (total > returned count)', async () => {
      // Regression guard for silent-truncation bug class: when Jira has more
      // tests than the page limit, the output MUST surface both the total
      // and the actual count returned. Otherwise users see "Found 50"
      // and assume that's all, when the true count is 500.
      const mockIssues = Array.from({ length: 50 }, (_, i) => ({
        id: `${10000 + i}`,
        key: `PAD-${100 + i}`,
        fields: {
          summary: `Test ${i}`,
          status: { name: 'To Do' },
          labels: [],
          issuetype: { name: 'Test' },
          components: [],
          created: '2025-01-01T00:00:00.000Z',
          updated: '2025-01-01T00:00:00.000Z',
        },
      }));
      server.use(
        http.post(`${JIRA_BASE}/rest/api/3/search/jql`, () =>
          HttpResponse.json({
            issues: mockIssues,
            total: 500,
            startAt: 0,
            maxResults: 50,
          }),
        ),
      );

      const result = await callTool(TOOL, { project_key: 'PAD', max_results: 50 });

      expect(result.isError).not.toBe(true);
      // Must surface BOTH total and shown count so users know they're truncated
      expect(result.content[0].text).toContain('500');
      expect(result.content[0].text).toContain('50');
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
