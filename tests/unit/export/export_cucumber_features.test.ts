import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../../mocks/server';
import { callTool } from '../../contract/helpers';
import {
  exportCucumberFeatures,
  exportCucumberFeaturesTool,
} from '../../../src/tools/export/exportCucumberFeatures';

const TOOL = {
  name: exportCucumberFeaturesTool.name,
  schema: exportCucumberFeaturesTool,
  sourcePath: 'src/tools/export/exportCucumberFeatures.ts',
  execute: exportCucumberFeatures,
};

const XRAY_EXPORT_URL = 'https://xray.cloud.getxray.app/api/v2/export/cucumber';

describe('export_cucumber_features', () => {
  describe('happy path', () => {
    it('returns Gherkin feature content when export succeeds', async () => {
      const mockFeature = 'Feature: Login\n  Scenario: Valid credentials\n    Given a user';

      server.use(
        http.get(XRAY_EXPORT_URL, () => {
          return new HttpResponse(mockFeature, {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }),
      );

      const result = await callTool(TOOL, { test_keys: 'PAD-1' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Cucumber Features Exported');
      expect(result.content[0].text).toContain('Feature: Login');
    });
  });

  describe('error paths', () => {
    it('surfaces backend errors as isError', async () => {
      server.use(
        http.get(XRAY_EXPORT_URL, () =>
          HttpResponse.json(
            { error: 'Server error' },
            { status: 500 },
          ),
        ),
      );

      const result = await callTool(TOOL, { test_keys: 'PAD-1' });

      expect(result.isError).toBe(true);
    });

    it('surfaces network failures as isError', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(TOOL, { test_keys: 'PAD-1' });

      expect(result.isError).toBe(true);
    });
  });
});
