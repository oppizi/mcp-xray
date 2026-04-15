// ============================================================================
// REFERENCE TEMPLATE for all per-tool unit tests.
//
// Structure:
//   - Happy path (1-3 cases)
//   - Error paths (GraphQL error, Jira 500, missing credentials — as applicable)
//
// Pattern for other tests:
//   1. Import the tool schema + execute function
//   2. Import callTool + sampleArgsFor from helpers
//   3. Override mock responses per-test with `server.use(...)`
//   4. Assert on tool output (content text + isError flag)
// ============================================================================

import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  getFolderTree,
  getFolderTreeTool,
} from '../../../src/tools/folders/getFolderTree';

const TOOL = {
  name: getFolderTreeTool.name,
  schema: getFolderTreeTool,
  sourcePath: 'src/tools/folders/getFolderTree.ts',
  execute: getFolderTree,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

describe('get_folder_tree', () => {
  describe('happy path', () => {
    it('returns formatted folder tree when Xray responds normally', async () => {
      const result = await callTool(TOOL, { project_id: '10001', path: '/' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Test Repository');
    });

    it('queries the precondition repository when repository_type=precondition', async () => {
      const result = await callTool(TOOL, {
        project_id: '10001',
        repository_type: 'precondition',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Precondition Repository');
    });

    it('parses nested JSON-scalar `folders` field with multi-level data', async () => {
      // The real Xray API returns `folders` as a JSON scalar (string) that
      // contains the nested folder tree. The default mock returns `[]`,
      // so this test exercises the JSON.parse path with a multi-level tree.
      // Guards against regressions where a change to the parser handles
      // shallow trees but breaks on nested ones.
      server.use(
        http.post(XRAY_GRAPHQL, () => {
          return HttpResponse.json({
            data: {
              getFolder: {
                name: 'Test Repository',
                path: '/',
                testsCount: 30,
                issuesCount: 30,
                folders: JSON.stringify([
                  {
                    name: 'Smoke',
                    path: '/Smoke',
                    testsCount: 10,
                    issuesCount: 10,
                    folders: [
                      {
                        name: 'Login',
                        path: '/Smoke/Login',
                        testsCount: 3,
                        issuesCount: 3,
                        folders: [],
                      },
                      {
                        name: 'Signup',
                        path: '/Smoke/Signup',
                        testsCount: 7,
                        issuesCount: 7,
                        folders: [],
                      },
                    ],
                  },
                ]),
              },
            },
          });
        }),
      );

      const result = await callTool(TOOL, { project_id: '10001', path: '/' });

      expect(result.isError).not.toBe(true);
      // All three nested folders must appear in the output.
      expect(result.content[0].text).toContain('Smoke');
      expect(result.content[0].text).toContain('Login');
      expect(result.content[0].text).toContain('Signup');
      // Counts from nested levels propagate
      expect(result.content[0].text).toContain('3 tests');
      expect(result.content[0].text).toContain('7 tests');
    });

    it('filters folders by search keyword', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () => {
          return HttpResponse.json({
            data: {
              getFolder: {
                name: 'Test Repository',
                path: '/',
                testsCount: 10,
                issuesCount: 10,
                folders: JSON.stringify([
                  { name: 'AQA', path: '/AQA', testsCount: 5, issuesCount: 5, folders: [] },
                  { name: 'Unrelated', path: '/Unrelated', testsCount: 5, issuesCount: 5, folders: [] },
                ]),
              },
            },
          });
        }),
      );

      const result = await callTool(TOOL, { project_id: '10001', search: 'AQA' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('AQA');
      expect(result.content[0].text).not.toContain('Unrelated');
    });
  });

  describe('error paths', () => {
    it('surfaces GraphQL field-name errors as isError (regression guard for testCount/testsCount bug)', async () => {
      server.use(
        http.post('https://xray.cloud.getxray.app/api/v2/graphql', () => {
          return HttpResponse.json({
            errors: [
              { message: 'Cannot query field "foo" on type "FolderResults"' },
            ],
          });
        }),
      );

      const result = await callTool(TOOL, {});

      expect(result.isError).toBe(true);
    });

    // Note: missing-credentials testing is intentionally skipped from
    // per-tool unit tests. XrayCloudService is a singleton that caches
    // the first config it sees, so resetting mid-test requires touching
    // the singleton's internals. The error-propagation contract test
    // covers the "backend unavailable" case via HTTP 500 + network failure,
    // which is more representative of production failure modes.

    it('surfaces network failures as isError', async () => {
      server.use(
        http.post('https://xray.cloud.getxray.app/api/v2/graphql', () =>
          HttpResponse.error(),
        ),
      );

      const result = await callTool(TOOL, {});

      expect(result.isError).toBe(true);
    });
  });
});
