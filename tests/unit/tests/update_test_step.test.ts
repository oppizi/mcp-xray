import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  updateTestStep,
  updateTestStepTool,
} from '../../../src/tools/tests/updateTestStep';

const TOOL = {
  name: updateTestStepTool.name,
  schema: updateTestStepTool,
  sourcePath: 'src/tools/tests/updateTestStep.ts',
  execute: updateTestStep,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

describe('update_test_step', () => {
  describe('happy path', () => {
    it('updates a step when Xray responds normally', async () => {
      // updateTestStep calls GraphQL mutation (default mutation handler returns { data: {} })
      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        step_id: 'step-id',
        action: 'Updated action',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-1');
      expect(result.content[0].text).toContain('Updated action');
    });
  });

  describe('error paths', () => {
    it('returns isError when no fields provided to update', async () => {
      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        step_id: 'step-id',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('At least one of');
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
        step_id: 'step-id',
        action: 'a',
      });
      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () => HttpResponse.error()),
      );

      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        step_id: 'step-id',
        action: 'a',
      });
      expect(result.isError).toBe(true);
    });
  });
});
