import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  getPrecondition,
  getPreconditionTool,
} from '../../../src/tools/preconditions/getPrecondition';

const TOOL = {
  name: getPreconditionTool.name,
  schema: getPreconditionTool,
  sourcePath: 'src/tools/preconditions/getPrecondition.ts',
  execute: getPrecondition,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

describe('get_precondition', () => {
  describe('happy path', () => {
    it('returns precondition details when Xray responds normally', async () => {
      // getPrecondition queries getPreconditions(jql: "key = <key>", limit: 1)
      // and takes results[0]. The default mock returns empty results, so we
      // override to return a precondition with the matching key.
      server.use(
        http.post(XRAY_GRAPHQL, () => {
          return HttpResponse.json({
            data: {
              getPreconditions: {
                total: 1,
                start: 0,
                limit: 1,
                results: [
                  {
                    issueId: '67890',
                    // Real Xray API returns `jira` as a JSON string, not object.
                    jira: JSON.stringify({
                      key: 'PAD-1',
                      summary: 'Mock Precondition',
                      status: { name: 'To Do' },
                      labels: [],
                      created: '2025-01-01T00:00:00Z',
                      updated: '2025-01-02T00:00:00Z',
                    }),
                    preconditionType: { name: 'Manual' },
                    definition: 'Test definition',
                    tests: { total: 0, results: [] },
                  },
                ],
              },
            },
          });
        }),
      );

      const result = await callTool(TOOL, { precondition_key: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Precondition: PAD-1');
      expect(result.content[0].text).toContain('Mock Precondition');
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

      const result = await callTool(TOOL, { precondition_key: 'PAD-1' });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, { precondition_key: 'PAD-1' });

      expect(result.isError).toBe(true);
    });
  });
});
