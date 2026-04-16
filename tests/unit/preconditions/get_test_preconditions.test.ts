import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  getTestPreconditions,
  getTestPreconditionsTool,
} from '../../../src/tools/preconditions/getTestPreconditions';

const TOOL = {
  name: getTestPreconditionsTool.name,
  schema: getTestPreconditionsTool,
  sourcePath: 'src/tools/preconditions/getTestPreconditions.ts',
  execute: getTestPreconditions,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

describe('get_test_preconditions', () => {
  describe('happy path', () => {
    it('returns preconditions linked to a test when Xray responds with data', async () => {
      // getTestPreconditions queries getTests (with preconditions subfield),
      // not getPreconditions. Override the default getTests mock to include
      // the preconditions subfield.
      server.use(
        http.post(XRAY_GRAPHQL, () => {
          return HttpResponse.json({
            data: {
              getTests: {
                total: 1,
                start: 0,
                limit: 1,
                results: [
                  {
                    issueId: '12345',
                    preconditions: {
                      total: 1,
                      results: [
                        {
                          issueId: '67890',
                          // Real Xray API returns `jira` as a JSON string, not object.
                          jira: JSON.stringify({
                            key: 'PAD-PC-1',
                            summary: 'User is logged in',
                            status: { name: 'To Do' },
                            labels: ['login'],
                          }),
                          preconditionType: { name: 'Manual' },
                          definition: 'Navigate to login page and authenticate',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          });
        }),
      );

      const result = await callTool(TOOL, { test_key: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Preconditions for PAD-1');
      expect(result.content[0].text).toContain('PAD-PC-1');
    });

    it('returns no-preconditions message when test has none', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () => {
          return HttpResponse.json({
            data: {
              getTests: {
                total: 1,
                start: 0,
                limit: 1,
                results: [
                  {
                    issueId: '12345',
                    preconditions: { total: 0, results: [] },
                  },
                ],
              },
            },
          });
        }),
      );

      const result = await callTool(TOOL, { test_key: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('No preconditions linked');
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

      const result = await callTool(TOOL, { test_key: 'PAD-1' });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, { test_key: 'PAD-1' });

      expect(result.isError).toBe(true);
    });
  });
});
