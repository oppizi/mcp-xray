import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  getTestWithSteps,
  getTestWithStepsTool,
} from '../../../src/tools/tests/getTestWithSteps';

const TOOL = {
  name: getTestWithStepsTool.name,
  schema: getTestWithStepsTool,
  sourcePath: 'src/tools/tests/getTestWithSteps.ts',
  execute: getTestWithSteps,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';
const JIRA_BASE = 'https://test.atlassian.net';

describe('get_test_with_steps', () => {
  describe('happy path', () => {
    it('returns test details with steps when backends respond normally', async () => {
      // The default getTests GraphQL handler returns MOCK_TEST with issueId/testType.
      // The default Jira GET /issue/:key handler returns MOCK_ISSUE.
      const result = await callTool(TOOL, { test_key: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-1');
      expect(result.content[0].text).toContain('Mock Jira Issue');
    });

    it('displays steps when Xray returns step data', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, async ({ request }) => {
          const body: any = await request.clone().json().catch(() => ({}));
          // Match the getTests query used by getTestWithSteps
          if (typeof body?.query === 'string' && /\bgetTests\b/.test(body.query)) {
            return HttpResponse.json({
              data: {
                getTests: {
                  total: 1,
                  results: [
                    {
                      issueId: '12345',
                      testType: { name: 'Manual', kind: 'Steps' },
                      steps: [
                        { id: 'step-1', action: 'Click button', data: '', result: 'Button clicked' },
                        { id: 'step-2', action: 'Verify text', data: 'hello', result: 'Text visible' },
                      ],
                      gherkin: null,
                    },
                  ],
                },
              },
            });
          }
          // Auth endpoint
          if (typeof body === 'string' || !body?.query) {
            return HttpResponse.json('mock-xray-bearer-token');
          }
          return HttpResponse.json({ data: {} });
        }),
      );

      const result = await callTool(TOOL, { test_key: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Click button');
      expect(result.content[0].text).toContain('Verify text');
      expect(result.content[0].text).toContain('step-1');
    });
  });

  describe('error paths', () => {
    it('surfaces GraphQL errors as isError', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () =>
          HttpResponse.json({
            errors: [{ message: 'GraphQL query failed' }],
          }),
        ),
      );

      const result = await callTool(TOOL, { test_key: 'PAD-1' });
      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () => HttpResponse.error()),
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () => HttpResponse.error()),
      );

      const result = await callTool(TOOL, { test_key: 'PAD-1' });
      expect(result.isError).toBe(true);
    });
  });
});
