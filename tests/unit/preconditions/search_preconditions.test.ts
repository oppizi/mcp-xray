import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  searchPreconditions,
  searchPreconditionsTool,
} from '../../../src/tools/preconditions/searchPreconditions';

const TOOL = {
  name: searchPreconditionsTool.name,
  schema: searchPreconditionsTool,
  sourcePath: 'src/tools/preconditions/searchPreconditions.ts',
  execute: searchPreconditions,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

describe('search_preconditions', () => {
  describe('happy path', () => {
    it('returns found preconditions when Xray responds with results', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () => {
          return HttpResponse.json({
            data: {
              getPreconditions: {
                total: 1,
                start: 0,
                limit: 50,
                results: [
                  {
                    issueId: '67890',
                    // Real Xray API returns `jira` as a JSON string, not object.
                    jira: JSON.stringify({
                      key: 'PAD-100',
                      summary: 'Login precondition',
                      status: { name: 'To Do' },
                      labels: ['login'],
                      created: '2025-01-01T00:00:00Z',
                    }),
                    preconditionType: { name: 'Manual' },
                    definition: 'User is logged in',
                  },
                ],
              },
            },
          });
        }),
      );

      const result = await callTool(TOOL, { jql: 'project = PAD' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Found 1 precondition');
      expect(result.content[0].text).toContain('PAD-100');
    });

    it('returns no-results message when search finds nothing', async () => {
      // Default mock returns empty results for getPreconditions
      const result = await callTool(TOOL, { jql: 'project = PAD' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('No preconditions found');
    });

    it('warns users when results are paginated (total > returned count)', async () => {
      // Regression guard for silent-truncation bug class: when Xray has more
      // results than the page limit, users MUST see both the total and the
      // actual count returned — otherwise they'll think the tool saw 50
      // when reality is 500 and silently missed 450.
      server.use(
        http.post(XRAY_GRAPHQL, () => {
          return HttpResponse.json({
            data: {
              getPreconditions: {
                total: 450,
                start: 0,
                limit: 50,
                results: Array.from({ length: 50 }, (_, i) => ({
                  issueId: `${1000 + i}`,
                  jira: JSON.stringify({
                    key: `PAD-${100 + i}`,
                    summary: `Precondition ${i}`,
                    status: { name: 'To Do' },
                    labels: [],
                    created: '2025-01-01T00:00:00Z',
                  }),
                  preconditionType: { name: 'Manual' },
                  definition: 'x',
                })),
              },
            },
          });
        }),
      );

      const result = await callTool(TOOL, { jql: 'project = PAD' });

      expect(result.isError).not.toBe(true);
      // Must surface BOTH total and shown count so users know they're truncated
      expect(result.content[0].text).toContain('450');
      expect(result.content[0].text).toContain('50');
    });
  });

  describe('error paths', () => {
    it('surfaces backend errors as isError', async () => {
      server.use(
        http.all('*', () =>
          HttpResponse.json(
            { errorMessages: ['Server error'] },
            { status: 500 },
          ),
        ),
      );

      const result = await callTool(TOOL, { jql: 'project = PAD' });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, { jql: 'project = PAD' });

      expect(result.isError).toBe(true);
    });
  });
});
