import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  createTest,
  createTestTool,
} from '../../../src/tools/tests/createTest';

const TOOL = {
  name: createTestTool.name,
  schema: createTestTool,
  sourcePath: 'src/tools/tests/createTest.ts',
  execute: createTest,
};

const JIRA_BASE = 'https://test.atlassian.net';

describe('create_test', () => {
  describe('happy path', () => {
    it('creates a test when Jira responds normally', async () => {
      // createTest calls GET /project/:key, GET /issue/createmeta, POST /issue
      // We need to mock createmeta since it's not in default handlers
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/createmeta`, () =>
          HttpResponse.json({
            projects: [
              {
                id: '10001',
                key: 'PAD',
                issuetypes: [
                  { id: '10100', name: 'Test' },
                  { id: '10101', name: 'Bug' },
                ],
              },
            ],
          }),
        ),
      );

      const result = await callTool(TOOL, {
        project_key: 'PAD',
        summary: 'New test case',
        folder_path: '/',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-MOCK-NEW');
      expect(result.content[0].text).toContain('New test case');
    });
  });

  describe('error paths', () => {
    it('surfaces backend errors as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/project/:key`, () =>
          HttpResponse.json(
            { errorMessages: ['Project not found'] },
            { status: 404 },
          ),
        ),
      );

      const result = await callTool(TOOL, {
        project_key: 'PAD',
        summary: 'x',
        folder_path: '/',
      });
      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/project/:key`, () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, {
        project_key: 'PAD',
        summary: 'x',
        folder_path: '/',
      });
      expect(result.isError).toBe(true);
    });
  });
});
