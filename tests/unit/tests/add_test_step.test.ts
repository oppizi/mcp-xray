import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  addTestStep,
  addTestStepTool,
} from '../../../src/tools/tests/addTestStep';

const TOOL = {
  name: addTestStepTool.name,
  schema: addTestStepTool,
  sourcePath: 'src/tools/tests/addTestStep.ts',
  execute: addTestStep,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';
const JIRA_BASE = 'https://test.atlassian.net';

describe('add_test_step', () => {
  describe('happy path', () => {
    it('adds a step when backends respond normally', async () => {
      // resolveIssueId calls GET /issue/:key (returns id: '10000')
      // addTestStep calls GraphQL mutation (default mutation handler returns { data: {} })
      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        action: 'Click the button',
        result: 'Button is clicked',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-1');
      expect(result.content[0].text).toContain('Click the button');
    });

    it('adds a step with data field', async () => {
      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        action: 'Enter credentials',
        data: 'user: admin, pass: test',
        result: 'Login succeeds',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Enter credentials');
      expect(result.content[0].text).toContain('user: admin');
    });
  });

  describe('error paths', () => {
    it('surfaces GraphQL errors as isError', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () =>
          HttpResponse.json({
            errors: [{ message: 'Mutation failed' }],
          }),
        ),
      );

      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        action: 'a',
        result: 'r',
      });
      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () => HttpResponse.error()),
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, () => HttpResponse.error()),
      );

      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        action: 'a',
        result: 'r',
      });
      expect(result.isError).toBe(true);
    });
  });
});
