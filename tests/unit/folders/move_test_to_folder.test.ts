import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  moveTestToFolder,
  moveTestToFolderTool,
} from '../../../src/tools/folders/moveTestToFolder';

const TOOL = {
  name: moveTestToFolderTool.name,
  schema: moveTestToFolderTool,
  sourcePath: 'src/tools/folders/moveTestToFolder.ts',
  execute: moveTestToFolder,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

describe('move_test_to_folder', () => {
  describe('happy path', () => {
    it('returns success message when test is moved', async () => {
      // The tool reads args.destination_folder_path (per the inputSchema)
      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        destination_folder_path: '/',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Successfully moved');
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
        test_key: 'PAD-1',
        destination_folder_path: '/nonexistent',
      });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, {
        test_key: 'PAD-1',
        destination_folder_path: '/',
      });

      expect(result.isError).toBe(true);
    });
  });
});
