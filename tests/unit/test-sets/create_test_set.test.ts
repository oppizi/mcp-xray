import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  createTestSet,
  createTestSetTool,
} from '../../../src/tools/test-sets/createTestSet';

const TOOL = {
  name: createTestSetTool.name,
  schema: createTestSetTool,
  sourcePath: 'src/tools/test-sets/createTestSet.ts',
  execute: createTestSet,
};

const JIRA_BASE = 'https://test.atlassian.net';

describe('create_test_set', () => {
  describe('happy path', () => {
    it('returns success when test set is created', async () => {
      // createTestSet first fetches createmeta to find the "Test Set" issue type ID
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/createmeta`, () =>
          HttpResponse.json({
            projects: [
              {
                key: 'PAD',
                issuetypes: [
                  { id: '10100', name: 'Test Set' },
                  { id: '10001', name: 'Task' },
                ],
              },
            ],
          }),
        ),
      );

      const result = await callTool(TOOL, { project_key: 'PAD', summary: 'x' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Successfully created test set');
      expect(result.content[0].text).toContain('PAD-MOCK-NEW');
    });
  });

  describe('error paths', () => {
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
