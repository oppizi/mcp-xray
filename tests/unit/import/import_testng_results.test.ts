import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  importTestNGResults,
  importTestNGResultsTool,
} from '../../../src/tools/import/importTestNGResults';

const TOOL = {
  name: importTestNGResultsTool.name,
  schema: importTestNGResultsTool,
  sourcePath: 'src/tools/import/importTestNGResults.ts',
  execute: importTestNGResults,
};

describe('import_testng_results', () => {
  describe('happy path', () => {
    it('imports successfully when Xray accepts', async () => {
      const result = await callTool(TOOL, { testng_xml: '<testng-results/>' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('TestNG Results Imported Successfully');
    });
  });

  describe('error paths', () => {
    it('surfaces HTTP 500 as isError', async () => {
      server.use(
        http.all('https://xray.cloud.getxray.app/*', () =>
          HttpResponse.json({ error: 'Server error' }, { status: 500 }),
        ),
      );

      const result = await callTool(TOOL, { testng_xml: '<testng-results/>' });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, { testng_xml: '<testng-results/>' });

      expect(result.isError).toBe(true);
    });
  });
});
