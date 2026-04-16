import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  addTestsToTestSet,
  addTestsToTestSetTool,
} from '../../../src/tools/test-sets/addTestsToTestSet';

const TOOL = {
  name: addTestsToTestSetTool.name,
  schema: addTestsToTestSetTool,
  sourcePath: 'src/tools/test-sets/addTestsToTestSet.ts',
  execute: addTestsToTestSet,
};

const JIRA_BASE = 'https://test.atlassian.net';
const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

describe('add_tests_to_test_set', () => {
  describe('happy path', () => {
    it('returns success when tests are added to the set', async () => {
      // addTestsToTestSet resolves issue keys to numeric IDs via Jira REST,
      // then calls the Xray GraphQL mutation. The default Jira mock returns
      // { id: '10000' } and the default GraphQL mutation handler returns
      // { data: {} } — both are sufficient for the happy path.
      const result = await callTool(TOOL, {
        test_set_key: 'PAD-1',
        test_keys: 'PAD-2',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Successfully added');
      expect(result.content[0].text).toContain('PAD-1');
    });
  });

  describe('error paths', () => {
    it('surfaces backend errors as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.json(
            { errorMessages: ['Server error'] },
            { status: 500 },
          ),
        ),
      );

      const result = await callTool(TOOL, {
        test_set_key: 'PAD-1',
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
        test_set_key: 'PAD-1',
        test_keys: 'PAD-2',
      });
      expect(result.isError).toBe(true);
    });
  });
});
