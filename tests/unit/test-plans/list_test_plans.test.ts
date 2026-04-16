import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  listTestPlans,
  listTestPlansTool,
} from '../../../src/tools/test-plans/listTestPlans';

const TOOL = {
  name: listTestPlansTool.name,
  schema: listTestPlansTool,
  sourcePath: 'src/tools/test-plans/listTestPlans.ts',
  execute: listTestPlans,
};

const JIRA_BASE = 'https://test.atlassian.net';

describe('list_test_plans', () => {
  describe('happy path', () => {
    it('returns formatted test plan list when Jira responds normally', async () => {
      const result = await callTool(TOOL, { project_key: 'PAD' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('test plan');
    });

    it('warns users when results are paginated (total > returned count)', async () => {
      // Silent-truncation guard — see list_tests.test.ts for rationale.
      const mockIssues = Array.from({ length: 50 }, (_, i) => ({
        id: `${10000 + i}`,
        key: `PAD-TP-${100 + i}`,
        fields: {
          summary: `Test Plan ${i}`,
          status: { name: 'To Do' },
          created: '2025-01-01T00:00:00.000Z',
          updated: '2025-01-01T00:00:00.000Z',
        },
      }));
      server.use(
        http.post(`${JIRA_BASE}/rest/api/3/search/jql`, () =>
          HttpResponse.json({
            issues: mockIssues,
            total: 300,
            startAt: 0,
            maxResults: 50,
          }),
        ),
      );

      const result = await callTool(TOOL, { project_key: 'PAD', max_results: 50 });
      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('300');
      expect(result.content[0].text).toContain('50');
    });
  });

  describe('error paths', () => {
    it('surfaces Jira 500 errors as isError', async () => {
      server.use(
        http.post(`${JIRA_BASE}/rest/api/3/search/jql`, () => {
          return HttpResponse.json(
            { errorMessages: ['Internal server error'] },
            { status: 500 },
          );
        }),
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
