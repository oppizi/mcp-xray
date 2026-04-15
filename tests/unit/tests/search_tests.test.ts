import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  searchTests,
  searchTestsTool,
} from '../../../src/tools/tests/searchTests';

const TOOL = {
  name: searchTestsTool.name,
  schema: searchTestsTool,
  sourcePath: 'src/tools/tests/searchTests.ts',
  execute: searchTests,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

describe('search_tests', () => {
  describe('happy path', () => {
    it('returns search results when Xray responds normally', async () => {
      // Default getTests handler returns MOCK_TEST with issueId + testType
      const result = await callTool(TOOL, { jql: 'project = PAD' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Found');
      expect(result.content[0].text).toContain('12345');
    });

    it('warns users when results are paginated (total > returned count)', async () => {
      // Silent-truncation guard: searchTests (Xray GraphQL) must expose both
      // the backend-reported total and the returned page length so users
      // know when they're missing results.
      server.use(
        http.post(XRAY_GRAPHQL, async ({ request }) => {
          const body: any = await request.clone().json().catch(() => ({}));
          if (typeof body?.query === 'string' && /\bgetTests\b/.test(body.query)) {
            return HttpResponse.json({
              data: {
                getTests: {
                  total: 250,
                  start: 0,
                  limit: 50,
                  results: Array.from({ length: 50 }, (_, i) => ({
                    issueId: `${5000 + i}`,
                    testType: { name: 'Manual', kind: 'Steps' },
                  })),
                },
              },
            });
          }
          return HttpResponse.json('mock-xray-bearer-token');
        }),
      );

      const result = await callTool(TOOL, { jql: 'project = PAD', limit: 50 });
      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('250');
      expect(result.content[0].text).toContain('50');
    });

    it('returns no-results message when search is empty', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, async ({ request }) => {
          const body: any = await request.clone().json().catch(() => ({}));
          if (typeof body?.query === 'string' && /\bgetTests\b/.test(body.query)) {
            return HttpResponse.json({
              data: {
                getTests: { total: 0, start: 0, limit: 50, results: [] },
              },
            });
          }
          // Auth
          return HttpResponse.json('mock-xray-bearer-token');
        }),
      );

      const result = await callTool(TOOL, { jql: 'project = EMPTY' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('No tests found');
    });
  });

  describe('error paths', () => {
    it('surfaces GraphQL errors as isError', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () =>
          HttpResponse.json({
            errors: [{ message: 'Invalid JQL query' }],
          }),
        ),
      );

      const result = await callTool(TOOL, { jql: 'project = PAD' });
      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () => HttpResponse.error()),
      );

      const result = await callTool(TOOL, { jql: 'project = PAD' });
      expect(result.isError).toBe(true);
    });
  });
});
