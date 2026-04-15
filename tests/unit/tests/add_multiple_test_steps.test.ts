import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  addMultipleTestSteps,
  addMultipleTestStepsTool,
} from '../../../src/tools/tests/addMultipleTestSteps';

const TOOL = {
  name: addMultipleTestStepsTool.name,
  schema: addMultipleTestStepsTool,
  sourcePath: 'src/tools/tests/addMultipleTestSteps.ts',
  execute: addMultipleTestSteps,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';
const JIRA_BASE = 'https://test.atlassian.net';

describe('add_multiple_test_steps', () => {
  describe('happy path', () => {
    it('adds multiple steps when backends respond normally', async () => {
      // The tool expects `steps` as a JSON string (it calls JSON.parse)
      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        steps: JSON.stringify([
          { action: 'Step 1', result: 'Result 1' },
          { action: 'Step 2', result: 'Result 2' },
        ]),
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-1');
      expect(result.content[0].text).toContain('2 step(s)');
    });
  });

  describe('error paths', () => {
    it('returns isError for invalid JSON steps', async () => {
      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        steps: 'not valid json',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error parsing steps JSON');
    });

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
        steps: JSON.stringify([{ action: 'a', result: 'r' }]),
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
        steps: JSON.stringify([{ action: 'a', result: 'r' }]),
      });
      expect(result.isError).toBe(true);
    });
  });
});
