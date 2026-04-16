import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  addPreconditionToTests,
  addPreconditionToTestsTool,
} from '../../../src/tools/preconditions/addPreconditionToTests';

const TOOL = {
  name: addPreconditionToTestsTool.name,
  schema: addPreconditionToTestsTool,
  sourcePath: 'src/tools/preconditions/addPreconditionToTests.ts',
  execute: addPreconditionToTests,
};

describe('add_precondition_to_tests', () => {
  describe('happy path', () => {
    it('returns success when precondition is linked to multiple tests', async () => {
      // The tool calls test_keys.split(',') so we pass a comma-separated string.
      // resolveIssueId hits Jira REST (mocked), then GraphQL mutations fire.
      const result = await callTool(TOOL, {
        precondition_key: 'PAD-1',
        test_keys: 'PAD-2,PAD-3',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Linked PAD-1');
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
        test_keys: 'PAD-2,PAD-3',
      });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, {
        precondition_key: 'PAD-1',
        test_keys: 'PAD-2,PAD-3',
      });

      expect(result.isError).toBe(true);
    });
  });
});
