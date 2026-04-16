import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  updatePreconditionFolder,
  updatePreconditionFolderTool,
} from '../../../src/tools/folders/updatePreconditionFolder';

const TOOL = {
  name: updatePreconditionFolderTool.name,
  schema: updatePreconditionFolderTool,
  sourcePath: 'src/tools/folders/updatePreconditionFolder.ts',
  execute: updatePreconditionFolder,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

describe('update_precondition_folder', () => {
  describe('happy path', () => {
    it('returns success message when precondition is moved', async () => {
      const result = await callTool(TOOL, {
        precondition_key: 'PAD-1',
        folder_path: '/',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Successfully moved precondition');
      expect(result.content[0].text).toContain('PAD-1');
    });
  });

  describe('error paths', () => {
    it('surfaces backend errors as isError', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () =>
          HttpResponse.json(
            { errors: [{ message: 'Folder not found' }] },
            { status: 500 },
          ),
        ),
      );

      const result = await callTool(TOOL, {
        precondition_key: 'PAD-1',
        folder_path: '/nonexistent',
      });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, {
        precondition_key: 'PAD-1',
        folder_path: '/',
      });

      expect(result.isError).toBe(true);
    });
  });
});
