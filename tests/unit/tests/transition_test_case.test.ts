import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  transitionTestCase,
  transitionTestCaseTool,
} from '../../../src/tools/tests/transitionTestCase';

const TOOL = {
  name: transitionTestCaseTool.name,
  schema: transitionTestCaseTool,
  sourcePath: 'src/tools/tests/transitionTestCase.ts',
  execute: transitionTestCase,
};

const JIRA_BASE = 'https://test.atlassian.net';

describe('transition_test_case', () => {
  describe('happy path', () => {
    it('transitions a test case when Jira responds normally', async () => {
      // Tool reads args.issue_keys or args.issue_key + args.status_name
      // Default transition handler returns [To Do, In Progress, Done]
      const result = await callTool(TOOL, {
        issue_keys: ['PAD-1'],
        status_name: 'Done',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Transitioned');
      expect(result.content[0].text).toContain('1/1');
      expect(result.content[0].text).toContain('Done');
    });

    it('transitions via single issue_key', async () => {
      const result = await callTool(TOOL, {
        issue_key: 'PAD-1',
        status_name: 'In Progress',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Transitioned');
    });
  });

  describe('error paths', () => {
    it('returns isError when no issue key provided', async () => {
      const result = await callTool(TOOL, {
        status_name: 'Done',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Provide either issue_key or issue_keys');
    });

    it('returns isError when transition name not found', async () => {
      const result = await callTool(TOOL, {
        issue_keys: ['PAD-1'],
        status_name: 'Nonexistent Status',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No transition found');
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/:key/transitions`, () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, {
        issue_keys: ['PAD-1'],
        status_name: 'Done',
      });
      expect(result.isError).toBe(true);
    });
  });
});
