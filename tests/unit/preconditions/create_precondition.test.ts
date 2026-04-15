import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  createPrecondition,
  createPreconditionTool,
} from '../../../src/tools/preconditions/createPrecondition';

const TOOL = {
  name: createPreconditionTool.name,
  schema: createPreconditionTool,
  sourcePath: 'src/tools/preconditions/createPrecondition.ts',
  execute: createPrecondition,
};

const JIRA_BASE = 'https://test.atlassian.net';

describe('create_precondition', () => {
  describe('happy path', () => {
    it('returns expected output when backend responds normally', async () => {
      // createPrecondition hits /rest/api/3/issue/createmeta which the
      // default :key handler returns as a plain issue. We need to override
      // it to return the createmeta shape the tool expects.
      server.use(
        http.get(`${JIRA_BASE}/rest/api/3/issue/createmeta`, () => {
          return HttpResponse.json({
            projects: [
              {
                key: 'PAD',
                issuetypes: [
                  { id: '10100', name: 'Precondition' },
                  { id: '10001', name: 'Test' },
                ],
              },
            ],
          });
        }),
      );

      const result = await callTool(TOOL, {
        project_key: 'PAD',
        summary: 'Test Precondition',
        folder_path: '/',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Successfully created precondition');
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
        project_key: 'PAD',
        summary: 'x',
        folder_path: '/',
      });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, {
        project_key: 'PAD',
        summary: 'x',
        folder_path: '/',
      });

      expect(result.isError).toBe(true);
    });
  });
});
