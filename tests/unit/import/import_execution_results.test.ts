import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  importExecutionResults,
  importExecutionResultsTool,
} from '../../../src/tools/import/importExecutionResults';

const TOOL = {
  name: importExecutionResultsTool.name,
  schema: importExecutionResultsTool,
  sourcePath: 'src/tools/import/importExecutionResults.ts',
  execute: importExecutionResults,
};

const XRAY_IMPORT = 'https://xray.cloud.getxray.app/api/v2/import/execution';

describe('import_execution_results', () => {
  describe('happy path', () => {
    it('imports successfully when Xray accepts', async () => {
      // The default handler matches /import/execution/:format but not the
      // bare /import/execution path, so we add an explicit handler here.
      server.use(
        http.post(XRAY_IMPORT, () =>
          HttpResponse.json({
            testExecIssue: { key: 'PAD-EXEC-1', id: 'mock-exec-id', self: 'https://example.com' },
          }),
        ),
      );

      const result = await callTool(TOOL, { results_json: '{"tests":[]}' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('PAD-EXEC-1');
    });
  });

  describe('error paths', () => {
    it('surfaces HTTP 500 as isError', async () => {
      server.use(
        http.all('https://xray.cloud.getxray.app/*', () =>
          HttpResponse.json({ error: 'Server error' }, { status: 500 }),
        ),
      );

      const result = await callTool(TOOL, { results_json: '{"tests":[]}' });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, { results_json: '{"tests":[]}' });

      expect(result.isError).toBe(true);
    });
  });
});
