import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  removePreconditionFromTest,
  removePreconditionFromTestTool,
} from '../../../src/tools/preconditions/removePreconditionFromTest';

const TOOL = {
  name: removePreconditionFromTestTool.name,
  schema: removePreconditionFromTestTool,
  sourcePath: 'src/tools/preconditions/removePreconditionFromTest.ts',
  execute: removePreconditionFromTest,
};

describe('remove_precondition_from_test', () => {
  describe('happy path', () => {
    it('returns success when precondition is unlinked from test', async () => {
      // resolveIssueId hits Jira REST (mocked), then the tool fires
      // a GraphQL mutation (default mutation handler returns success).
      const result = await callTool(TOOL, {
        precondition_key: 'PAD-1',
        test_key: 'PAD-2',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Successfully unlinked precondition');
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
        test_key: 'PAD-2',
      });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, {
        precondition_key: 'PAD-1',
        test_key: 'PAD-2',
      });

      expect(result.isError).toBe(true);
    });
  });
});
