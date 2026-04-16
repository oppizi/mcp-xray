import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  addPreconditionToTest,
  addPreconditionToTestTool,
} from '../../../src/tools/preconditions/addPreconditionToTest';

const TOOL = {
  name: addPreconditionToTestTool.name,
  schema: addPreconditionToTestTool,
  sourcePath: 'src/tools/preconditions/addPreconditionToTest.ts',
  execute: addPreconditionToTest,
};

describe('add_precondition_to_test', () => {
  describe('happy path', () => {
    it('returns success when precondition is linked to test', async () => {
      // resolveIssueId hits Jira REST (already mocked), then the tool
      // fires a GraphQL mutation (default mutation handler returns success).
      const result = await callTool(TOOL, {
        precondition_key: 'PAD-1',
        test_key: 'PAD-2',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Successfully linked precondition');
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
