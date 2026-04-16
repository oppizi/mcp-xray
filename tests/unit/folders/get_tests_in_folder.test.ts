import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  getTestsInFolder,
  getTestsInFolderTool,
} from '../../../src/tools/folders/getTestsInFolder';

const TOOL = {
  name: getTestsInFolderTool.name,
  schema: getTestsInFolderTool,
  sourcePath: 'src/tools/folders/getTestsInFolder.ts',
  execute: getTestsInFolder,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

describe('get_tests_in_folder', () => {
  describe('happy path', () => {
    it('returns formatted test list when Xray responds normally', async () => {
      const result = await callTool(TOOL, { folder_path: '/' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Tests in folder');
      expect(result.content[0].text).toContain('PAD-MOCK-1');
    });

    it('returns empty message when folder has no tests', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () => {
          return HttpResponse.json({
            data: {
              getTests: { total: 0, start: 0, limit: 50, results: [] },
            },
          });
        }),
      );

      const result = await callTool(TOOL, { folder_path: '/empty' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('No tests found');
    });
  });

  describe('error paths', () => {
    it('surfaces GraphQL errors as isError', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () => {
          return HttpResponse.json({
            errors: [{ message: 'Cannot query field "foo"' }],
          });
        }),
      );

      const result = await callTool(TOOL, { folder_path: '/' });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () => HttpResponse.error()),
      );

      const result = await callTool(TOOL, { folder_path: '/' });

      expect(result.isError).toBe(true);
    });
  });
});
