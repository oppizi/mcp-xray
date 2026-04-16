import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  addTestsToTestPlan,
  addTestsToTestPlanTool,
} from '../../../src/tools/test-plans/addTestsToTestPlan';

const TOOL = {
  name: addTestsToTestPlanTool.name,
  schema: addTestsToTestPlanTool,
  sourcePath: 'src/tools/test-plans/addTestsToTestPlan.ts',
  execute: addTestsToTestPlan,
};

const JIRA_BASE = 'https://test.atlassian.net';
const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

describe('add_tests_to_test_plan', () => {
  describe('happy path', () => {
    it('adds tests to test plan when APIs respond normally', async () => {
      // addTestsToTestPlan calls resolveIssueId (GET /rest/api/3/issue/:key)
      // for the plan and each test key, then sends a GraphQL mutation.
      // The default Jira handler returns { id: '10000' } and the default
      // Xray handler matches `mutation` bodies with a generic success.
      const result = await callTool(TOOL, {
        test_plan_key: 'PAD-1',
        test_keys: 'PAD-2',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Successfully added tests');
    });
  });

  describe('error paths', () => {
    it('surfaces Jira 500 errors as isError', async () => {
      // resolveIssueId is the first network call — make it fail.
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () => {
          return HttpResponse.json(
            { errorMessages: ['Internal server error'] },
            { status: 500 },
          );
        }),
      );

      const result = await callTool(TOOL, {
        test_plan_key: 'PAD-1',
        test_keys: 'PAD-2',
      });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, {
        test_plan_key: 'PAD-1',
        test_keys: 'PAD-2',
      });

      expect(result.isError).toBe(true);
    });
  });
});
