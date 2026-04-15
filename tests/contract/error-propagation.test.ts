// ============================================================================
// THE CONTRACT: tools must surface API errors as MCP isError:true responses.
//
// This test runs automatically against EVERY tool in src/tools/ without opt-in.
// It exists because we once shipped a tool (get_folder_tree) that 400'd on
// every call for 3 weeks because it queried a nonexistent GraphQL field —
// and the eval script marked it as passing.
//
// The rule:
//   When ANY backend (Xray GraphQL, Jira REST, network) returns an error,
//   the tool MUST return { isError: true, content: [...] } — NOT a
//   success-shaped response whose text happens to mention "error".
//
// If this test fails for a tool, the tool is silently eating errors and
// agents calling it can't tell when something's wrong.
// ============================================================================

import { beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../mocks/server';
import {
  callTool,
  loadAllTools,
  sampleArgsFor,
  type DiscoveredTool,
} from './helpers';

let TOOLS: DiscoveredTool[] = [];

beforeAll(async () => {
  TOOLS = await loadAllTools();
  if (TOOLS.length === 0) {
    throw new Error(
      'loadAllTools() returned 0 tools. Something is wrong with tool discovery.',
    );
  }
});

/**
 * Assert that a tool response indicates failure in a way MCP clients detect.
 * An MCP client checks response.isError — if it's not true, the client
 * treats the response as success regardless of the text content.
 */
function assertIsError(tool: DiscoveredTool, result: any, scenario: string) {
  const pretty = JSON.stringify(result).slice(0, 300);
  expect(
    result.isError,
    `Tool "${tool.name}" returned a non-error response during the "${scenario}" scenario. ` +
      `MCP clients treat responses without isError:true as success, so agents cannot ` +
      `detect that this tool failed. ` +
      `Source: ${tool.sourcePath}. ` +
      `Response: ${pretty}`,
  ).toBe(true);
}

describe('Contract: error propagation (runs against every tool)', () => {
  it('discovered at least one tool', () => {
    expect(TOOLS.length).toBeGreaterThan(0);
  });

  describe('Xray GraphQL returns an errors[] array', () => {
    // Any GraphQL error should surface as isError: true.
    // This is the exact class of bug that motivated this contract
    // (the testCount vs testsCount field name regression).
    it.each([{ run: '*' }])('runs for every tool', async () => {
      server.use(
        http.post('https://xray.cloud.getxray.app/api/v2/graphql', () => {
          return HttpResponse.json({
            errors: [
              {
                message:
                  'Cannot query field "foo" on type "FolderResults". ' +
                  'Did you mean "bar" or "baz"?',
              },
            ],
          });
        }),
      );

      const failures: string[] = [];
      for (const tool of TOOLS) {
        const result = await callTool(tool, sampleArgsFor(tool.name));
        if (result.isError !== true) {
          failures.push(
            `  - ${tool.name} (${tool.sourcePath}): ` +
              `${JSON.stringify(result).slice(0, 120)}`,
          );
        }
      }

      if (failures.length > 0) {
        throw new Error(
          `${failures.length}/${TOOLS.length} tools swallow Xray GraphQL errors into ` +
            `non-error responses. Each of these can silently fail in production:\n` +
            failures.join('\n'),
        );
      }
    });
  });

  describe('Backend returns HTTP 500', () => {
    it.each([{ run: '*' }])('runs for every tool', async () => {
      server.use(
        http.all('*', () => {
          return HttpResponse.json(
            { errorMessages: ['Internal Server Error'] },
            { status: 500 },
          );
        }),
      );

      const failures: string[] = [];
      for (const tool of TOOLS) {
        const result = await callTool(tool, sampleArgsFor(tool.name));
        if (result.isError !== true) {
          failures.push(
            `  - ${tool.name}: ${JSON.stringify(result).slice(0, 120)}`,
          );
        }
      }

      if (failures.length > 0) {
        throw new Error(
          `${failures.length}/${TOOLS.length} tools swallow HTTP 500 into ` +
            `non-error responses:\n` + failures.join('\n'),
        );
      }
    });
  });

  describe('Network failure (ECONNREFUSED etc.)', () => {
    it.each([{ run: '*' }])('runs for every tool', async () => {
      server.use(
        http.all('*', () => HttpResponse.error()),
      );

      const failures: string[] = [];
      for (const tool of TOOLS) {
        const result = await callTool(tool, sampleArgsFor(tool.name));
        if (result.isError !== true) {
          failures.push(
            `  - ${tool.name}: ${JSON.stringify(result).slice(0, 120)}`,
          );
        }
      }

      if (failures.length > 0) {
        throw new Error(
          `${failures.length}/${TOOLS.length} tools swallow network failures into ` +
            `non-error responses:\n` + failures.join('\n'),
        );
      }
    });
  });
});
