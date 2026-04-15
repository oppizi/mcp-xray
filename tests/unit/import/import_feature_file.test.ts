import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  importFeatureFile,
  importFeatureFileTool,
} from '../../../src/tools/import/importFeatureFile';

const TOOL = {
  name: importFeatureFileTool.name,
  schema: importFeatureFileTool,
  sourcePath: 'src/tools/import/importFeatureFile.ts',
  execute: importFeatureFile,
};

const XRAY_IMPORT_FEATURE = 'https://xray.cloud.getxray.app/api/v2/import/feature';

describe('import_feature_file', () => {
  describe('happy path', () => {
    it('imports successfully when Xray accepts', async () => {
      // Feature file import uses a different URL (/import/feature, not
      // /import/execution/:format) so we need an explicit handler.
      server.use(
        http.post(XRAY_IMPORT_FEATURE, () =>
          HttpResponse.json({
            updatedOrCreatedTests: [{ key: 'PAD-TC-1', id: '111' }],
            updatedOrCreatedPreconditions: [],
          }),
        ),
      );

      const result = await callTool(TOOL, {
        feature_content: 'Feature: x',
        project_key: 'PAD',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Feature File Imported Successfully');
      expect(result.content[0].text).toContain('PAD-TC-1');
    });
  });

  describe('error paths', () => {
    it('surfaces HTTP 500 as isError', async () => {
      server.use(
        http.all('https://xray.cloud.getxray.app/*', () =>
          HttpResponse.json({ error: 'Server error' }, { status: 500 }),
        ),
      );

      const result = await callTool(TOOL, {
        feature_content: 'Feature: x',
        project_key: 'PAD',
      });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, {
        feature_content: 'Feature: x',
        project_key: 'PAD',
      });

      expect(result.isError).toBe(true);
    });
  });
});
