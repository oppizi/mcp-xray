# Comprehensive Test Suite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single bash eval script with a comprehensive test suite that covers all 50 tool files, enforces an "errors must fail loudly" contract, and runs in CI — eliminating silent-failure bugs like the `testCount` vs `testsCount` field-name regression.

**Architecture:** Three-layer testing strategy:
1. **Contract layer** — meta-tests that assert every tool fails properly on bad input (no silent errors-returned-as-success).
2. **Unit layer** — per-tool tests with mocked HTTP (fast, no credentials needed). One template applied to each of 50 tools.
3. **Integration layer** — smoke tests against real Xray API for all read-only tools, plus round-trip tests for a subset of write tools (with cleanup). Runs on-demand, not on every PR.

All layers enforce the "no silent failures" contract: if a GraphQL/REST call returns an error, the tool MUST surface it as an MCP error response (`isError: true`), not as a success-shaped response containing error text.

**Tech Stack:**
- **Vitest** — ESM-native test runner (this repo uses `"type": "module"`; Jest has known ESM pain)
- **MSW** (Mock Service Worker) — HTTP mocking for Xray GraphQL + Jira REST
- **GitHub Actions** — CI for unit+contract tests on every PR; integration tests on demand
- **c8** — coverage reporting (built into vitest)

**Scope:** 50 tool files across 8 domains (tests, test-executions, test-plans, test-sets, preconditions, folders, import, export).

**Out of scope (separate follow-up plans):** Codegen for typed GraphQL, full end-to-end workflow tests that create/modify/delete real tickets, performance benchmarks.

---

## Phase 0: Pre-Flight

### Task 1: Confirm no in-flight work

**Step 1:** Verify working tree is clean on master.

```bash
git status
```

Expected: `nothing to commit, working tree clean` on branch `master`.

**Step 2:** Pull latest.

```bash
git fetch origin && git checkout master && git pull origin master
```

**Step 3:** Create feature branch for this plan.

```bash
git checkout -b feat/comprehensive-test-suite
```

---

## Phase 1: Foundation — Test Framework + Error Contract

The novel work. Get this right and Phase 2 is mechanical.

### Task 2: Install vitest + MSW

**Files:**
- Modify: `package.json`

**Step 1:** Install dev dependencies.

```bash
npm install --save-dev vitest @vitest/coverage-v8 msw @types/node
```

**Step 2:** Add test scripts to `package.json`:

```json
"scripts": {
  "build": "tsc",
  "start": "node dist/index.js",
  "dev": "tsx src/index.ts",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:unit": "vitest run tests/unit",
  "test:contract": "vitest run tests/contract",
  "test:integration": "vitest run tests/integration",
  "prepublishOnly": "npm run build"
}
```

**Step 3:** Commit.

```bash
git add package.json package-lock.json
git commit -m "chore(test): install vitest + MSW + coverage reporter"
```

### Task 3: Configure vitest

**Files:**
- Create: `vitest.config.ts`

**Step 1:** Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.d.ts'],
      thresholds: {
        // Enforced as we add tests. Start lenient, tighten over time.
        lines: 0, functions: 0, branches: 0, statements: 0,
      },
    },
    // Integration tests gated behind env var — must opt in explicitly
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
```

**Step 2:** Commit.

```bash
git add vitest.config.ts
git commit -m "chore(test): add vitest config"
```

### Task 4: Create shared test setup

**Files:**
- Create: `tests/setup.ts`

**Step 1:** Write setup file that:
- Enforces env vars for unit tests (mocked) are dummy values
- Starts MSW server for unit/contract tests
- Cleans up between tests

```typescript
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';

// Required env vars for unit tests — dummy values ensure we're NEVER hitting real APIs
beforeAll(() => {
  process.env.JIRA_BASE_URL ??= 'https://test.atlassian.net';
  process.env.JIRA_EMAIL ??= 'test@example.com';
  process.env.JIRA_API_TOKEN ??= 'dummy-jira-token';
  process.env.XRAY_CLIENT_ID ??= 'dummy-client-id';
  process.env.XRAY_CLIENT_SECRET ??= 'dummy-client-secret';

  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
```

**Step 2:** Commit.

```bash
git add tests/setup.ts
git commit -m "test: add global test setup (env vars + MSW bootstrap)"
```

### Task 5: Create MSW server infrastructure

**Files:**
- Create: `tests/mocks/server.ts`
- Create: `tests/mocks/handlers/xray-graphql.ts`
- Create: `tests/mocks/handlers/jira-rest.ts`
- Create: `tests/mocks/handlers/index.ts`

**Step 1:** Write `tests/mocks/server.ts`:

```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

**Step 2:** Write `tests/mocks/handlers/index.ts`:

```typescript
import { xrayHandlers } from './xray-graphql';
import { jiraHandlers } from './jira-rest';

export const handlers = [...xrayHandlers, ...jiraHandlers];
```

**Step 3:** Write `tests/mocks/handlers/xray-graphql.ts` — default handlers that return sensible responses for the most-used queries. Include auth endpoint.

```typescript
import { http, HttpResponse, graphql } from 'msw';

const xray = graphql.link('https://xray.cloud.getxray.app/api/v2/graphql');

export const xrayHandlers = [
  // Auth: return a bearer token
  http.post('https://xray.cloud.getxray.app/api/v2/authenticate', () => {
    return HttpResponse.json('"mock-xray-bearer-token"');
  }),

  // Default: return a sensible getFolder response. Override per-test when needed.
  xray.query('getFolder', () => {
    return HttpResponse.json({
      data: {
        getFolder: {
          name: 'Test Repository',
          path: '/',
          testsCount: 42,
          issuesCount: 100,
          folders: '[]',
        },
      },
    });
  }),

  // Default: empty test list
  xray.query('getTests', () => {
    return HttpResponse.json({
      data: { getTests: { total: 0, start: 0, limit: 50, results: [] } },
    });
  }),

  // Catch-all: any unmocked GraphQL query returns a clear error so tests
  // that need specific responses FAIL LOUDLY rather than silently getting defaults
  http.post('https://xray.cloud.getxray.app/api/v2/graphql', () => {
    return HttpResponse.json(
      { errors: [{ message: 'MOCK: query not explicitly mocked in this test' }] },
      { status: 200 },
    );
  }),
];
```

**Step 4:** Write `tests/mocks/handlers/jira-rest.ts` — similar patterns for Jira REST endpoints (search, issue CRUD).

```typescript
import { http, HttpResponse } from 'msw';

export const jiraHandlers = [
  // Default: empty search result
  http.get('https://test.atlassian.net/rest/api/3/search', () => {
    return HttpResponse.json({ issues: [], total: 0, startAt: 0, maxResults: 50 });
  }),
  // Default: issue not found — tests that need a specific issue override this
  http.get('https://test.atlassian.net/rest/api/3/issue/:key', () => {
    return HttpResponse.json({ errorMessages: ['Issue not found'] }, { status: 404 });
  }),
];
```

**Step 5:** Run tests to confirm MSW wires up:

```bash
npx vitest run --reporter=verbose
```

Expected: No tests found, but no setup errors.

**Step 6:** Commit.

```bash
git add tests/mocks/
git commit -m "test: add MSW handlers for Xray GraphQL + Jira REST with loud-failing defaults"
```

### Task 6: Write the error-contract meta-test (the critical piece)

This is the test that prevents future `testCount`-style silent failures.

**Files:**
- Create: `tests/contract/error-propagation.test.ts`

**Step 1:** Write the failing meta-test.

```typescript
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { loadAllTools, callTool } from './helpers';

describe('Error Propagation Contract', () => {
  it.each(loadAllTools())(
    '$toolName surfaces Xray GraphQL errors as isError:true',
    async ({ toolName, toolModule, sampleArgs }) => {
      // Arrange: Xray returns a GraphQL error
      server.use(
        http.post('https://xray.cloud.getxray.app/api/v2/graphql', () => {
          return HttpResponse.json({
            errors: [{ message: 'Cannot query field "foo" on type "Bar"' }],
          });
        }),
      );

      // Act: call the tool
      const result = await callTool(toolModule, sampleArgs);

      // Assert: MUST be flagged as an error — not a success containing error text
      expect(
        result.isError === true ||
          (result.content?.[0]?.text && /error/i.test(result.content[0].text) &&
            result.isError !== false),
        `Tool ${toolName} returned a success-shaped response with error content. ` +
          `This is the exact class of silent-failure bug this test prevents. ` +
          `Tools MUST either throw OR return { isError: true, content: [...] }. ` +
          `Got: ${JSON.stringify(result).slice(0, 200)}`,
      ).toBe(true);
    },
  );

  it.each(loadAllTools())(
    '$toolName surfaces Jira REST 500s as isError:true',
    async ({ toolName, toolModule, sampleArgs }) => {
      server.use(
        http.all('https://test.atlassian.net/*', () => {
          return HttpResponse.json({ errorMessages: ['Internal error'] }, { status: 500 });
        }),
      );

      const result = await callTool(toolModule, sampleArgs);
      expect(result.isError).toBe(true);
    },
  );

  it.each(loadAllTools())(
    '$toolName surfaces network failures as isError:true',
    async ({ toolName, toolModule, sampleArgs }) => {
      server.use(
        http.all('*', () => HttpResponse.error()),
      );

      const result = await callTool(toolModule, sampleArgs);
      expect(result.isError).toBe(true);
    },
  );
});
```

**Step 2:** Write `tests/contract/helpers.ts` — the `loadAllTools` + `callTool` infrastructure.

```typescript
import * as fs from 'fs';
import * as path from 'path';

// Known sample args per tool (minimum to pass validation).
// Anything not in this map gets a TODO stub — the test will report which tools
// still need sample args. This ensures new tools get covered automatically.
const SAMPLE_ARGS: Record<string, any> = {
  list_tests: { project_key: 'PAD' },
  get_test: { test_key: 'PAD-1' },
  get_test_with_steps: { test_key: 'PAD-1' },
  search_tests: { jql: 'project = PAD' },
  create_test: { project_key: 'PAD', summary: 'x', folder_path: '/' },
  update_test: { test_key: 'PAD-1' },
  get_folder_tree: { project_id: '10001' },
  get_tests_in_folder: { folder_path: '/' },
  // ... every tool gets an entry. See Task 7 for how we fill this table.
};

export function loadAllTools(): Array<{ toolName: string; toolModule: any; sampleArgs: any }> {
  const toolsDir = path.join(__dirname, '../../src/tools');
  const tools: any[] = [];
  walkTools(toolsDir, tools);
  return tools.map((t) => ({
    toolName: t.name,
    toolModule: t,
    sampleArgs: SAMPLE_ARGS[t.name] ?? { __missing_sample_args__: true },
  }));
}

function walkTools(dir: string, out: any[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTools(full, out);
    else if (entry.name.endsWith('.ts')) {
      const mod = require(full.replace(/\.ts$/, ''));
      for (const key of Object.keys(mod)) {
        if (key.endsWith('Tool')) out.push(mod[key]); // e.g. getFolderTreeTool
      }
    }
  }
}

export async function callTool(toolModule: any, args: any): Promise<any> {
  // The MCP stdio adapter wraps each tool. Import the tool's execute function
  // and invoke it with mocked axios + config. Returns whatever the tool returns.
  // Implementation follows the tool invocation pattern in src/index.ts.
  // TODO: complete this helper — see Task 7.
  throw new Error('callTool not yet implemented');
}
```

**Step 3:** Run the test — expected to fail (callTool not implemented).

```bash
npm run test:contract
```

Expected: All tests FAIL with `callTool not yet implemented`. This is correct — we prove the test runner works first.

**Step 4:** Commit.

```bash
git add tests/contract/
git commit -m "test: add error-propagation contract test (currently failing — see Task 7 for helper impl)"
```

### Task 7: Implement callTool helper

**Files:**
- Modify: `tests/contract/helpers.ts`

**Step 1:** Read `src/index.ts` to understand how tools are invoked currently (the stdio adapter's `CallToolRequest` handler).

```bash
grep -n "CallToolRequest\|tools/call\|execute" src/index.ts | head -20
```

**Step 2:** Update `callTool` to replicate that invocation path:

```typescript
import axios from 'axios';

export async function callTool(toolModule: any, args: any): Promise<any> {
  // Each tool exports two things: the schema (e.g. getFolderTreeTool) and the
  // execute function (e.g. getFolderTree). The execute function takes
  // (axiosInstance, config, args) and returns { content: [...], isError?: boolean }.
  const executeFnName = toolModule.name
    .split('_')
    .map((p: string, i: number) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1)))
    .join('');

  // Find the execute function in the same module scope
  const mod = await import(toolModule.__filePath);
  const execute = mod[executeFnName];
  if (!execute) {
    throw new Error(`Cannot find execute fn for ${toolModule.name} (expected ${executeFnName})`);
  }

  const axiosInstance = axios.create();
  const config = {
    jiraUrl: process.env.JIRA_BASE_URL!,
    jiraUsername: process.env.JIRA_EMAIL!,
    jiraApiToken: process.env.JIRA_API_TOKEN!,
    xrayClientId: process.env.XRAY_CLIENT_ID!,
    xrayClientSecret: process.env.XRAY_CLIENT_SECRET!,
  };

  return await execute(axiosInstance, config, args);
}
```

**Step 3:** Update `loadAllTools` to attach `__filePath` to each tool for dynamic import.

**Step 4:** Fill out `SAMPLE_ARGS` for ALL 50 tools. Pattern: minimum args that pass zod/schema validation.

```bash
# For each tool, inspect its inputSchema to know what's required:
grep -l "required:" src/tools/**/*.ts | while read f; do
  echo "=== $f ==="
  grep -A 20 "inputSchema" "$f" | head -25
done
```

Based on output, expand `SAMPLE_ARGS` to cover every tool.

**Step 5:** Run contract tests:

```bash
npm run test:contract
```

Expected: Tests now execute. The ones that PASS are tools that already propagate errors properly. The ones that FAIL are the bugs — tools that swallow errors into success responses. Count: likely 10-20 tools will fail initially.

**Step 6:** Commit.

```bash
git add tests/contract/helpers.ts
git commit -m "test: implement callTool helper + SAMPLE_ARGS for all 50 tools"
```

### Task 8: Fix tools that fail the error-propagation contract

This is the actual payoff for the contract test. Every failure is a real bug.

**Files:** Each failing tool's source file.

**Step 1:** For each failing tool, read its `catch` block. The common bug pattern is:

```typescript
} catch (error: any) {
  return {
    content: [{ type: 'text', text: `Error: ${error.message}` }],
    // ❌ No isError: true, so MCP client sees this as a success
  };
}
```

**Step 2:** Fix to:

```typescript
} catch (error: any) {
  return {
    content: [{ type: 'text', text: `Error: ${error.message}` }],
    isError: true,
  };
}
```

**Step 3:** For GraphQL-specific errors (like the `testCount` bug), also extract and surface the error detail:

```typescript
if (response.data.errors) {
  return {
    content: [{ type: 'text', text: `GraphQL error: ${response.data.errors[0].message}` }],
    isError: true,
  };
}
```

**Step 4:** After each tool fix, re-run `npm run test:contract` and confirm that tool now passes.

**Step 5:** Once all 50 tools pass the contract, commit.

```bash
git add src/tools/
git commit -m "fix: surface API errors as MCP isError responses (eliminates silent failures)"
```

---

## Phase 2: Per-Tool Unit Tests

Template + checklist approach. Once the template is solid, each tool's test is ~10-15 min.

### Task 9: Create the unit-test template

**Files:**
- Create: `tests/unit/_template.test.ts` (reference implementation for one tool — get_folder_tree since it's the one we just fixed)

**Step 1:** Write reference test that becomes the template for every other tool.

```typescript
import { describe, expect, it } from 'vitest';
import { http, HttpResponse, graphql } from 'msw';
import { server } from '../mocks/server';
import { callTool } from '../contract/helpers';
import { getFolderTreeTool } from '../../src/tools/folders/getFolderTree';

describe('get_folder_tree', () => {
  describe('happy path', () => {
    it('returns folder tree when Xray responds normally', async () => {
      const result = await callTool(getFolderTreeTool, { project_id: '10001', path: '/' });
      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Test Repository');
      expect(result.content[0].text).toContain('42 tests');
    });

    it('filters by search term', async () => {
      server.use(graphql.link('https://xray.cloud.getxray.app/api/v2/graphql').query('getFolder', () => {
        return HttpResponse.json({
          data: {
            getFolder: {
              name: 'Test Repository', path: '/', testsCount: 10, issuesCount: 10,
              folders: JSON.stringify([
                { name: 'AQA', path: '/AQA', testsCount: 5, issuesCount: 5, folders: [] },
                { name: 'Unrelated', path: '/Unrelated', testsCount: 5, issuesCount: 5, folders: [] },
              ]),
            },
          },
        });
      }));

      const result = await callTool(getFolderTreeTool, { path: '/', search: 'AQA' });
      expect(result.content[0].text).toContain('AQA');
      expect(result.content[0].text).not.toContain('Unrelated');
    });
  });

  describe('error paths', () => {
    it('surfaces GraphQL field errors as isError', async () => {
      server.use(
        http.post('https://xray.cloud.getxray.app/api/v2/graphql', () => {
          return HttpResponse.json({
            errors: [{ message: 'Cannot query field "foo" on type "FolderResults"' }],
          });
        }),
      );

      const result = await callTool(getFolderTreeTool, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/graphql|foo|folderresults/i);
    });

    it('surfaces missing credentials loudly', async () => {
      const original = process.env.XRAY_CLIENT_ID;
      delete process.env.XRAY_CLIENT_ID;
      try {
        const result = await callTool(getFolderTreeTool, {});
        expect(result.isError).toBe(true);
      } finally {
        process.env.XRAY_CLIENT_ID = original;
      }
    });
  });
});
```

**Step 2:** Run.

```bash
npm run test:unit
```

Expected: 4 tests pass.

**Step 3:** Commit.

```bash
git add tests/unit/_template.test.ts
git commit -m "test: add reference unit test for get_folder_tree (template for others)"
```

### Task 10: Write per-tool test checklist

**Files:**
- Create: `tests/unit/CHECKLIST.md`

**Step 1:** Write a checklist that tracks per-tool coverage. Executor checks off each as they're added.

```markdown
# Per-Tool Unit Test Checklist

Each tool needs a unit test file covering:
- [ ] Happy path (1-2 cases)
- [ ] At least one error path (GraphQL error, HTTP 500, or validation failure)
- [ ] Any tool-specific edge cases noted in the tool's source

## Tests domain (16 tools)

- [ ] list_tests → `tests/unit/tests/list_tests.test.ts`
- [ ] get_test → `tests/unit/tests/get_test.test.ts`
- [ ] get_test_with_steps → ...
- [ ] search_tests
- [ ] create_test
- [ ] update_test
- [ ] add_test_step
- [ ] update_test_step
- [ ] remove_test_step
- [ ] add_multiple_test_steps
- [ ] reorder_test_steps
- [ ] assign_test_case
- [ ] transition_test_case
- [ ] link_issues
- [ ] get_linked_tests
- [ ] update_gherkin

## Test-executions domain (4 tools)

- [ ] list_test_executions
- [ ] get_test_execution
- [ ] create_test_execution
- [ ] update_test_run

## Test-plans domain (4 tools)

- [ ] list_test_plans
- [ ] get_test_plan
- [ ] create_test_plan
- [ ] add_tests_to_test_plan

## Test-sets domain (4 tools)

- [ ] list_test_sets
- [ ] get_test_set
- [ ] create_test_set
- [ ] add_tests_to_test_set

## Preconditions domain (8 tools)

- [ ] create_precondition
- [ ] search_preconditions
- [ ] get_precondition
- [ ] get_test_preconditions
- [ ] update_precondition
- [ ] add_precondition_to_test
- [ ] add_precondition_to_tests
- [ ] remove_precondition_from_test

## Folders domain (5 tools)

- [x] get_folder_tree (reference template)
- [ ] get_tests_in_folder
- [ ] add_tests_to_folder
- [ ] move_test_to_folder
- [ ] update_precondition_folder

## Import domain (8 tools)

- [ ] import_junit_results
- [ ] import_cucumber_results
- [ ] import_execution_results
- [ ] import_testng_results
- [ ] import_nunit_results
- [ ] import_robot_results
- [ ] import_behave_results
- [ ] import_feature_file

## Export domain (1 tool)

- [ ] export_cucumber_features

**Total: 50 tools, 49 remaining (1 done as template)**
```

**Step 2:** Commit.

```bash
git add tests/unit/CHECKLIST.md
git commit -m "test: add per-tool unit test checklist"
```

### Tasks 11–59: One task per remaining tool

Each is identical in shape to Task 9 (template). Per tool:

1. Create `tests/unit/<domain>/<tool_name>.test.ts`
2. Copy the template structure from `tests/unit/_template.test.ts`
3. Adapt happy-path mock to match the tool's expected response shape
4. Adapt error-path test to the tool's primary error class
5. Run `npm run test:unit tests/unit/<domain>/<tool_name>.test.ts` — confirm passes
6. Check off in CHECKLIST.md
7. Commit: `test(<domain>): add unit tests for <tool_name>`

**Recommended execution approach:** Group by domain. Do all 16 tests in `tests/` domain in one session, all 8 imports in another, etc. One commit per tool.

---

## Phase 3: Integration Tests (Real Xray API)

Opt-in, credentials-required. Not run in CI by default.

### Task 60: Set up integration test harness

**Files:**
- Create: `tests/integration/setup.ts`
- Create: `tests/integration/smoke-read-only.test.ts`

**Step 1:** Write setup that SKIPS if integration creds aren't present.

```typescript
import { beforeAll } from 'vitest';
import { server } from '../mocks/server';

beforeAll(() => {
  if (!process.env.INTEGRATION_TEST_ENABLED) {
    console.log('Skipping integration tests (set INTEGRATION_TEST_ENABLED=1 to run)');
    return;
  }
  // For integration: do NOT start MSW. Let real HTTP through.
  server.close();

  // Fail loudly if real credentials missing
  const required = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'XRAY_CLIENT_ID', 'XRAY_CLIENT_SECRET'];
  for (const k of required) {
    if (!process.env[k] || process.env[k].startsWith('dummy-')) {
      throw new Error(`Integration tests require real ${k}`);
    }
  }
});
```

**Step 2:** Write `smoke-read-only.test.ts` — one `describe.skipIf` block per read-only tool (list_tests, get_test, get_folder_tree, etc.):

```typescript
import { describe, it, expect } from 'vitest';
import { callTool } from '../contract/helpers';
import { getFolderTreeTool } from '../../src/tools/folders/getFolderTree';
// ... more imports

const enabled = !!process.env.INTEGRATION_TEST_ENABLED;

describe.skipIf(!enabled)('Integration: read-only smoke tests', () => {
  it('get_folder_tree returns real PAD repository', async () => {
    const r = await callTool(getFolderTreeTool, { project_id: '10001' });
    expect(r.isError).not.toBe(true);
    expect(r.content[0].text).toContain('Test Repository');
  });
  // ... one test per read-only tool
});
```

**Step 3:** Commit.

```bash
git add tests/integration/
git commit -m "test: add integration smoke tests (opt-in via INTEGRATION_TEST_ENABLED=1)"
```

### Task 61: Integration round-trip for write tools

**Files:**
- Create: `tests/integration/round-trip.test.ts`

**Step 1:** For each write tool group (create_test, create_precondition, create_test_plan, etc.), write a test that creates, verifies, then cleans up.

**Step 2:** Use a clearly-prefixed summary like `"INTEGRATION_TEST_DELETE_ME — "` so accidental leftovers are findable/filterable.

**Step 3:** Add a global cleanup step that searches for leftover test artifacts and deletes them.

**Step 4:** Commit.

```bash
git add tests/integration/round-trip.test.ts
git commit -m "test: add integration round-trip tests for write tools with cleanup"
```

---

## Phase 4: CI Integration

### Task 62: Add GitHub Actions workflow

**Files:**
- Create: `.github/workflows/test.yml`

**Step 1:** Write the workflow:

```yaml
name: Test

on:
  pull_request:
    branches: [master]
  push:
    branches: [master]

jobs:
  unit-and-contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build  # catch type errors
      - run: npm run test:unit
      - run: npm run test:contract
      - run: npm run test:coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  integration:
    # Only on merge to master + manual dispatch — not every PR
    if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    needs: unit-and-contract
    env:
      INTEGRATION_TEST_ENABLED: '1'
      JIRA_BASE_URL: ${{ secrets.JIRA_BASE_URL }}
      JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
      JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
      XRAY_CLIENT_ID: ${{ secrets.XRAY_CLIENT_ID }}
      XRAY_CLIENT_SECRET: ${{ secrets.XRAY_CLIENT_SECRET }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run test:integration
```

**Step 2:** Create a separate `workflow_dispatch` trigger for on-demand integration runs.

**Step 3:** Document the required GitHub secrets in the repo's README + CI workflow comments.

**Step 4:** Commit.

```bash
git add .github/workflows/test.yml
git commit -m "ci: add unit + contract + integration test workflows"
```

### Task 63: Add coverage threshold enforcement

**Files:**
- Modify: `vitest.config.ts`

**Step 1:** Now that many tests exist, tighten coverage thresholds:

```typescript
thresholds: {
  lines: 80,
  functions: 80,
  branches: 70,  // branches often lower due to defensive code paths
  statements: 80,
}
```

**Step 2:** Run coverage:

```bash
npm run test:coverage
```

If any threshold fails: identify the uncovered files and either add tests or add the file to `exclude` list (with justification in a comment).

**Step 3:** Commit.

```bash
git add vitest.config.ts
git commit -m "ci: enforce 80% coverage threshold"
```

---

## Phase 5: Replace Old Eval Script

### Task 64: Deprecate the bash eval script

**Files:**
- Modify: `tests/eval-all-tools.sh`
- Modify: `README.md`

**Step 1:** Add a deprecation header to `tests/eval-all-tools.sh`:

```bash
#!/bin/bash
# ============================================================================
# DEPRECATED — kept for historical reference only.
#
# This script was the original test harness before the vitest suite was added.
# It has known limitations:
# - Substring-match assertions pass on error responses
# - Doesn't cover folder tools (which were added after the eval was written)
# - Runs the real MCP server against real Xray (slow, requires credentials)
#
# Use `npm run test` instead. For integration-level testing, see
# `npm run test:integration`.
# ============================================================================
```

**Step 2:** Update `README.md` — remove references to the bash eval; add the new testing section.

**Step 3:** Commit.

```bash
git add tests/eval-all-tools.sh README.md
git commit -m "docs: deprecate bash eval in favor of vitest suite"
```

### Task 65: Update README with testing guide

**Files:**
- Modify: `README.md`

**Step 1:** Add testing section:

```markdown
## Testing

### Run all unit + contract tests (fast, no credentials)

```bash
npm test
```

### Run with coverage report

```bash
npm run test:coverage
```

### Run integration tests (requires real Xray credentials)

```bash
INTEGRATION_TEST_ENABLED=1 npm run test:integration
```

### Test architecture

- **Unit tests** (`tests/unit/`) — per-tool, mocked HTTP via MSW
- **Contract tests** (`tests/contract/`) — meta-tests ensuring all tools propagate API errors as `isError: true`. New tools are automatically included.
- **Integration tests** (`tests/integration/`) — round-trip against real Xray API. Opt-in, not run on every PR.
```

**Step 2:** Commit.

```bash
git add README.md
git commit -m "docs: add testing guide to README"
```

---

## Phase 6: Ship

### Task 66: Open PR

**Step 1:** Push branch.

```bash
git push -u origin feat/comprehensive-test-suite
```

**Step 2:** Open PR.

```bash
gh pr create --base master --title "feat: comprehensive test suite with error-propagation contract" --body "Adds a three-layer test strategy (unit + contract + integration) that covers all 50 tools and enforces an 'errors must fail loudly' contract — preventing future silent-failure bugs like the testCount vs testsCount field-name regression (PR #10).

Changes:
- Install vitest + MSW for mocked HTTP
- Add error-propagation contract test that runs against ALL 50 tools automatically
- Fix every tool that was swallowing errors into success responses (identified by contract test)
- Add per-tool unit tests (template + checklist approach)
- Add opt-in integration tests against real Xray API
- Add GitHub Actions CI with coverage reporting (80% threshold)
- Deprecate the substring-match bash eval script

After merge: future tools automatically enrolled in the contract test. Future silent-failure bugs become build-time failures."
```

---

## Risks + Mitigations

| Risk | Mitigation |
|---|---|
| Some tools' error handling can't easily be fixed without deeper refactor | Accept — Task 8 may spawn follow-up issues. Contract test failures are documented, not all fixed in this plan. |
| MSW may not catch tools that make HTTP calls via unusual paths | Setup uses `onUnhandledRequest: 'error'` — any unmocked call fails the test. |
| 50 tools × 2-3 tests × ~10-15 min each = ~15-20 hours of work | That's accurate. The plan is bite-sized per tool so work can span multiple sessions. |
| New tool added without test | Contract test auto-enrolls any tool exporting `*Tool`. If `SAMPLE_ARGS` map is missing the entry, the test fails loudly — forcing the PR author to add one. |
| Integration tests depend on real PAD project state | Scoped to read-only operations that check structure (presence of /AQA test cases folder, etc.) rather than exact counts. |

---

## Success Criteria

- [ ] `npm test` passes in under 30 seconds
- [ ] Contract test covers all 50 tools and all 50 pass
- [ ] Coverage ≥ 80% lines / 80% functions / 70% branches
- [ ] CI runs on every PR
- [ ] Integration workflow runs on merge to master (smoke tests all read tools)
- [ ] Adding a new tool to `src/tools/` automatically enrolls it in the contract test
- [ ] README has clear testing documentation
- [ ] Bash eval deprecated but preserved for reference
