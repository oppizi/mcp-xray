import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  importJUnitResults,
  importJUnitResultsTool,
} from '../../../src/tools/import/importJUnitResults';

const TOOL = {
  name: importJUnitResultsTool.name,
  schema: importJUnitResultsTool,
  sourcePath: 'src/tools/import/importJUnitResults.ts',
  execute: importJUnitResults,
};

describe('import_junit_results', () => {
  describe('happy path', () => {
    it('imports successfully when Xray accepts', async () => {
      const result = await callTool(TOOL, { junit_xml: '<testsuites/>' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('JUnit Results Imported Successfully');
    });
  });

  describe('error paths', () => {
    it('surfaces HTTP 500 as isError', async () => {
      server.use(
        http.all('https://xray.cloud.getxray.app/*', () =>
          HttpResponse.json({ error: 'Server error' }, { status: 500 }),
        ),
      );

      const result = await callTool(TOOL, { junit_xml: '<testsuites/>' });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, { junit_xml: '<testsuites/>' });

      expect(result.isError).toBe(true);
    });
  });
});
