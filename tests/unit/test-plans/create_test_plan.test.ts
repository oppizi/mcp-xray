import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  createTestPlan,
  createTestPlanTool,
} from '../../../src/tools/test-plans/createTestPlan';

const TOOL = {
  name: createTestPlanTool.name,
  schema: createTestPlanTool,
  sourcePath: 'src/tools/test-plans/createTestPlan.ts',
  execute: createTestPlan,
};

const JIRA_BASE = 'https://test.atlassian.net';

describe('create_test_plan', () => {
  describe('happy path', () => {
    it('creates a test plan when Jira responds normally', async () => {
      // createTestPlan first calls GET /rest/api/3/issue/createmeta to
      // discover the "Test Plan" issue type, then POST /rest/api/3/issue
      // to create it. The createmeta endpoint is NOT in the default
      // handlers, so we add it here.
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/createmeta`, () => {
          return HttpResponse.json({
            projects: [
              {
                key: 'PAD',
                issuetypes: [
                  { id: '10100', name: 'Test Plan' },
                  { id: '10001', name: 'Bug' },
                ],
              },
            ],
          });
        }),
      );

      const result = await callTool(TOOL, { project_key: 'PAD', summary: 'x' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Successfully created test plan');
    });
  });

  describe('error paths', () => {
    it('surfaces Jira 500 errors as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/createmeta`, () => {
          return HttpResponse.json(
            { errorMessages: ['Internal server error'] },
            { status: 500 },
          );
        }),
      );

      const result = await callTool(TOOL, { project_key: 'PAD', summary: 'x' });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/createmeta`, () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, { project_key: 'PAD', summary: 'x' });

      expect(result.isError).toBe(true);
    });
  });
});
