import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  getTestPlan,
  getTestPlanTool,
} from '../../../src/tools/test-plans/getTestPlan';

const TOOL = {
  name: getTestPlanTool.name,
  schema: getTestPlanTool,
  sourcePath: 'src/tools/test-plans/getTestPlan.ts',
  execute: getTestPlan,
};

const JIRA_BASE = 'https://test.atlassian.net';
const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

describe('get_test_plan', () => {
  describe('happy path', () => {
    it('returns test plan details when Jira responds normally', async () => {
      // getTestPlan also calls Xray GraphQL for associated tests via
      // getTestPlanTests which queries `getTestPlans`. The default
      // GraphQL handler returns an MSW-UNHANDLED error for unknown queries,
      // but the tool catches that gracefully and continues without tests.
      const result = await callTool(TOOL, { test_plan_key: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Test Plan: PAD-1');
    });
  });

  describe('error paths', () => {
    it('surfaces Jira 500 errors as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () => {
          return HttpResponse.json(
            { errorMessages: ['Internal server error'] },
            { status: 500 },
          );
        }),
      );

      const result = await callTool(TOOL, { test_plan_key: 'PAD-1' });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, { test_plan_key: 'PAD-1' });

      expect(result.isError).toBe(true);
    });
  });
});
