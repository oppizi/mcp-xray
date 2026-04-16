import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  getLinkedTests,
  getLinkedTestsTool,
} from '../../../src/tools/tests/getLinkedTests';

const TOOL = {
  name: getLinkedTestsTool.name,
  schema: getLinkedTestsTool,
  sourcePath: 'src/tools/tests/getLinkedTests.ts',
  execute: getLinkedTests,
};

const JIRA_BASE = 'https://test.atlassian.net';

describe('get_linked_tests', () => {
  describe('happy path', () => {
    it('returns linked tests when Jira responds normally', async () => {
      // Tool reads args.ticket_key (not issue_key)
      // Default GET /issue/:key returns MOCK_ISSUE without issuelinks,
      // so we need to override to include links.
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.json({
            id: '10000',
            key: 'PAD-1',
            fields: {
              summary: 'Source ticket',
              issuelinks: [
                {
                  type: {
                    name: 'Test',
                    outward: 'tests',
                    inward: 'is tested by',
                  },
                  outwardIssue: {
                    key: 'PAD-100',
                    fields: {
                      summary: 'Test case for feature',
                      status: { name: 'To Do' },
                      issuetype: { name: 'Test' },
                    },
                  },
                },
              ],
            },
          }),
        ),
      );

      const result = await callTool(TOOL, { ticket_key: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-100');
      expect(result.content[0].text).toContain('Test Links');
    });

    it('reports no links when issue has none', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.json({
            id: '10000',
            key: 'PAD-1',
            fields: {
              summary: 'No links issue',
              issuelinks: [],
            },
          }),
        ),
      );

      const result = await callTool(TOOL, { ticket_key: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('No issue links found');
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

      const result = await callTool(TOOL, { ticket_key: 'PAD-1' });
      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, { ticket_key: 'PAD-1' });
      expect(result.isError).toBe(true);
    });
  });
});
