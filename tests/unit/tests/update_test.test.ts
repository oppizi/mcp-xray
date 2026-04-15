import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  updateTest,
  updateTestTool,
} from '../../../src/tools/tests/updateTest';

const TOOL = {
  name: updateTestTool.name,
  schema: updateTestTool,
  sourcePath: 'src/tools/tests/updateTest.ts',
  execute: updateTest,
};

const JIRA_BASE = 'https://test.atlassian.net';

describe('update_test', () => {
  describe('happy path', () => {
    it('updates a test when Jira responds with 204', async () => {
      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        summary: 'updated summary',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-1');
      expect(result.content[0].text).toContain('updated summary');
    });

    it('updates labels and priority', async () => {
      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        labels: 'smoke,regression',
        priority: 'High',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('smoke');
      expect(result.content[0].text).toContain('High');
    });
  });

  describe('error paths', () => {
    it('surfaces backend errors as isError', async () => {
      server.use(
        http.put(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.json(
            { errorMessages: ['Update failed'] },
            { status: 400 },
          ),
        ),
      );

      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        summary: 'updated',
      });
      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.put(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        summary: 'updated',
      });
      expect(result.isError).toBe(true);
    });
  });
});
