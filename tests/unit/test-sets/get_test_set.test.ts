import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  getTestSet,
  getTestSetTool,
} from '../../../src/tools/test-sets/getTestSet';

const TOOL = {
  name: getTestSetTool.name,
  schema: getTestSetTool,
  sourcePath: 'src/tools/test-sets/getTestSet.ts',
  execute: getTestSet,
};

const JIRA_BASE = 'https://test.atlassian.net';

describe('get_test_set', () => {
  describe('happy path', () => {
    it('returns formatted test set details when Jira responds normally', async () => {
      const result = await callTool(TOOL, { test_set_key: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Test Set: PAD-1');
      expect(result.content[0].text).toContain('Mock Jira Issue');
    });
  });

  describe('error paths', () => {
    it('surfaces backend errors as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.json(
            { errorMessages: ['Issue does not exist'] },
            { status: 404 },
          ),
        ),
      );

      const result = await callTool(TOOL, { test_set_key: 'PAD-1' });
      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, { test_set_key: 'PAD-1' });
      expect(result.isError).toBe(true);
    });
  });
});
