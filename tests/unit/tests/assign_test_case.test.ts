import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  assignTestCase,
  assignTestCaseTool,
} from '../../../src/tools/tests/assignTestCase';

const TOOL = {
  name: assignTestCaseTool.name,
  schema: assignTestCaseTool,
  sourcePath: 'src/tools/tests/assignTestCase.ts',
  execute: assignTestCase,
};

const JIRA_BASE = 'https://test.atlassian.net';

describe('assign_test_case', () => {
  describe('happy path', () => {
    it('assigns a test case when Jira responds normally', async () => {
      // Tool reads args.issue_keys or args.issue_key (not test_keys)
      const result = await callTool(TOOL, {
        issue_keys: ['PAD-1'],
        assignee_email: 'test@example.com',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Assigned');
      expect(result.content[0].text).toContain('1/1');
    });

    it('assigns via single issue_key', async () => {
      const result = await callTool(TOOL, {
        issue_key: 'PAD-1',
        assignee_email: 'test@example.com',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Assigned');
    });
  });

  describe('error paths', () => {
    it('returns isError when no issue key provided', async () => {
      const result = await callTool(TOOL, {
        assignee_email: 'test@example.com',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Provide either issue_key or issue_keys');
    });

    it('surfaces user-not-found as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/user/search`, () =>
          HttpResponse.json([]),
        ),
      );

      const result = await callTool(TOOL, {
        issue_keys: ['PAD-1'],
        assignee_email: 'nobody@example.com',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No user found');
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/user/search`, () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, {
        issue_keys: ['PAD-1'],
        assignee_email: 'test@example.com',
      });
      expect(result.isError).toBe(true);
    });
  });
});
