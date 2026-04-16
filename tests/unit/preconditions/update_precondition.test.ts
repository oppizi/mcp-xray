import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  updatePrecondition,
  updatePreconditionTool,
} from '../../../src/tools/preconditions/updatePrecondition';

const TOOL = {
  name: updatePreconditionTool.name,
  schema: updatePreconditionTool,
  sourcePath: 'src/tools/preconditions/updatePrecondition.ts',
  execute: updatePrecondition,
};

describe('update_precondition', () => {
  describe('happy path', () => {
    it('returns success when Jira fields are updated', async () => {
      const result = await callTool(TOOL, {
        precondition_key: 'PAD-1',
        summary: 'updated',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Successfully updated PAD-1');
      expect(result.content[0].text).toContain('Summary');
    });

    it('returns no-updates message when no fields are provided', async () => {
      const result = await callTool(TOOL, { precondition_key: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('No updates provided');
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

      const result = await callTool(TOOL, {
        precondition_key: 'PAD-1',
        summary: 'updated',
      });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, {
        precondition_key: 'PAD-1',
        summary: 'updated',
      });

      expect(result.isError).toBe(true);
    });
  });
});
