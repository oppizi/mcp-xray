import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  getTest,
  getTestTool,
} from '../../../src/tools/tests/getTest';

const TOOL = {
  name: getTestTool.name,
  schema: getTestTool,
  sourcePath: 'src/tools/tests/getTest.ts',
  execute: getTest,
};

const JIRA_BASE = 'https://test.atlassian.net';

describe('get_test', () => {
  describe('happy path', () => {
    it('returns test details when Jira responds normally', async () => {
      const result = await callTool(TOOL, { test_key: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-1');
      expect(result.content[0].text).toContain('Mock Jira Issue');
    });

    it('includes issue links when requested', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.json({
            id: '10000',
            key: 'PAD-1',
            fields: {
              summary: 'Test with links',
              description: null,
              status: { name: 'To Do' },
              priority: { name: 'Medium' },
              labels: [],
              components: [],
              created: '2024-01-01T00:00:00.000Z',
              updated: '2024-01-01T00:00:00.000Z',
              assignee: null,
              reporter: null,
              issuetype: { name: 'Test' },
              issuelinks: [
                {
                  type: { name: 'Test', outward: 'tests', inward: 'is tested by' },
                  outwardIssue: {
                    key: 'PAD-99',
                    fields: { summary: 'Linked issue', status: { name: 'Done' } },
                  },
                },
              ],
            },
          }),
        ),
      );

      const result = await callTool(TOOL, { test_key: 'PAD-1', include_links: true });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-99');
    });
  });

  describe('error paths', () => {
    it('surfaces backend errors as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.json(
            { errorMessages: ['Issue not found'] },
            { status: 404 },
          ),
        ),
      );

      const result = await callTool(TOOL, { test_key: 'PAD-1' });
      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, { test_key: 'PAD-1' });
      expect(result.isError).toBe(true);
    });
  });
});
