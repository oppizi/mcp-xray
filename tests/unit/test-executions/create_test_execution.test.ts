import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  createTestExecution,
  createTestExecutionTool,
} from '../../../src/tools/test-executions/createTestExecution';

const TOOL = {
  name: createTestExecutionTool.name,
  schema: createTestExecutionTool,
  sourcePath: 'src/tools/test-executions/createTestExecution.ts',
  execute: createTestExecution,
};

const JIRA_BASE = 'https://test.atlassian.net';

// The tool first fetches createmeta to discover the "Test Execution" issue type,
// then creates the issue. We need to mock both endpoints.
function installCreationHandlers() {
  server.use(
    http.get(`${JIRA_BASE}/rest/api/3/issue/createmeta`, () => {
      return HttpResponse.json({
        projects: [
          {
            key: 'PAD',
            issuetypes: [
              { id: '10100', name: 'Test Execution' },
              { id: '10001', name: 'Task' },
            ],
          },
        ],
      });
    }),
    http.post(`${JIRA_BASE}/rest/api/3/issue`, () => {
      return HttpResponse.json({
        id: '30001',
        key: 'PAD-EXEC-NEW',
        self: `${JIRA_BASE}/rest/api/3/issue/30001`,
      });
    }),
  );
}

describe('create_test_execution', () => {
  describe('happy path', () => {
    it('returns created execution key when Jira responds normally', async () => {
      installCreationHandlers();

      const result = await callTool(TOOL, { project_key: 'PAD', summary: 'New Sprint Run' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-EXEC-NEW');
      expect(result.content[0].text).toContain('New Sprint Run');
    });

    it('also recognizes "Xray Test Execution" issue type name', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/createmeta`, () => {
          return HttpResponse.json({
            projects: [
              {
                key: 'PAD',
                issuetypes: [
                  { id: '10200', name: 'Xray Test Execution' },
                ],
              },
            ],
          });
        }),
        http.post(`${JIRA_BASE}/rest/api/3/issue`, () => {
          return HttpResponse.json({
            id: '30002',
            key: 'PAD-EXEC-ALT',
            self: `${JIRA_BASE}/rest/api/3/issue/30002`,
          });
        }),
      );

      const result = await callTool(TOOL, { project_key: 'PAD', summary: 'Alt Type' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-EXEC-ALT');
    });
  });

  describe('error paths', () => {
    it('returns isError when Test Execution issue type not found', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/createmeta`, () => {
          return HttpResponse.json({
            projects: [
              {
                key: 'PAD',
                issuetypes: [
                  { id: '10001', name: 'Task' },
                  { id: '10002', name: 'Bug' },
                ],
              },
            ],
          });
        }),
      );

      const result = await callTool(TOOL, { project_key: 'PAD', summary: 'x' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Test Execution issue type not found');
    });

    it('surfaces backend errors as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/createmeta`, () =>
          HttpResponse.json(
            { errorMessages: ['Server error'] },
            { status: 500 },
          ),
        ),
      );

      const result = await callTool(TOOL, { project_key: 'PAD', summary: 'x' });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/createmeta`, () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, { project_key: 'PAD', summary: 'x' });

      expect(result.isError).toBe(true);
    });
  });
});
