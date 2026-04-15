import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  addTestsToFolder,
  addTestsToFolderTool,
} from '../../../src/tools/folders/addTestsToFolder';

const TOOL = {
  name: addTestsToFolderTool.name,
  schema: addTestsToFolderTool,
  sourcePath: 'src/tools/folders/addTestsToFolder.ts',
  execute: addTestsToFolder,
};

const XRAY_GRAPHQL = 'https://xray.cloud.getxray.app/api/v2/graphql';

describe('add_tests_to_folder', () => {
  describe('happy path', () => {
    it('returns success message when tests are added to folder', async () => {
      const result = await callTool(TOOL, {
        folder_path: '/',
        test_issue_ids: ['PAD-1'],
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Successfully added');
      expect(result.content[0].text).toContain('1 test(s)');
    });

    it('accepts numeric IDs without resolving', async () => {
      const result = await callTool(TOOL, {
        folder_path: '/',
        test_issue_ids: ['12345'],
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Successfully added');
    });
  });

  describe('error paths', () => {
    it('surfaces backend errors as isError', async () => {
      server.use(
        http.post(XRAY_GRAPHQL, () =>
          HttpResponse.json(
            { errorMessages: ['Server error'] },
            { status: 500 },
          ),
        ),
      );

      // Use numeric IDs to skip the resolve step and go straight to the mutation
      const result = await callTool(TOOL, {
        folder_path: '/',
        test_issue_ids: ['99999'],
      });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, {
        folder_path: '/',
        test_issue_ids: ['PAD-1'],
      });

      expect(result.isError).toBe(true);
    });
  });
});
