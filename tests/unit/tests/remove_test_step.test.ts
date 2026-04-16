import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  removeTestStep,
  removeTestStepTool,
} from '../../../src/tools/tests/removeTestStep';

const TOOL = {
  name: removeTestStepTool.name,
  schema: removeTestStepTool,
  sourcePath: 'src/tools/tests/removeTestStep.ts',
  execute: removeTestStep,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

describe('remove_test_step', () => {
  describe('happy path', () => {
    it('removes a step when Xray responds normally', async () => {
      // removeTestStep calls GraphQL mutation (default mutation handler returns { data: {} })
      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        step_id: 'step-id',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-1');
      expect(result.content[0].text).toContain('step-id');
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
        step_id: 'step-id',
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
      });
      expect(result.isError).toBe(true);
    });
  });
});
