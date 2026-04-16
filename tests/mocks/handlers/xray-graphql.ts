// Default MSW handlers for Xray Cloud endpoints.
//
// Design philosophy:
//   - Auth always succeeds (returns a mock bearer token)
//   - Common GraphQL queries have sensible defaults
//   - REST endpoints (imports/exports) have minimal defaults
//   - ANY unhandled GraphQL query returns an error so tests that expected
//     a specific mock fail loudly instead of getting defaults.
//
// Per-test overrides: call `server.use(http.post(..., () => ...))` or
// `server.use(graphql.link(...).query('queryName', () => ...))` inside
// a test. They revert automatically after the test (afterEach resets).

import { HttpResponse, http } from 'msw';

// Helper: match GraphQL requests by the field being queried in the body.
// MSW's graphql.query() matches the OPERATION name (which this tool doesn't
// set), so we pattern-match on the query string instead. This is how Xray's
// client-side code actually identifies queries too.
function matchesXrayField(body: any, field: string): boolean {
  if (!body?.query || typeof body.query !== 'string') return false;
  // Matches `getFolder(...)` or `getTests(...)` etc.
  const re = new RegExp(`\\b${field}\\s*\\(`);
  return re.test(body.query);
}

// ── Schema field validation ──
// The real Xray Cloud API rejects queries that request non-existent fields
// (returning a 200 with `errors[]`). We replicate that behavior here so
// tests catch field-name typos — the exact class of bug that shipped the
// original testCount/testsCount regression.
//
// Each key is a GraphQL type name; the value is the set of valid fields.
// Only types where we've been bitten by field-name bugs are listed.
const SCHEMA_FIELDS: Record<string, Set<string>> = {
  FolderResults: new Set([
    'name', 'path', 'testsCount', 'issuesCount', 'preconditionsCount', 'folders',
  ]),
};

/**
 * Extract the field names requested inside a GraphQL selection set for a
 * given root field. E.g. for `getFolder(...) { name path testsCount }`,
 * returns ['name', 'path', 'testsCount'].
 */
function extractRequestedFields(query: string, rootField: string): string[] {
  // Match: rootField(...) { field1 field2 ... }  (simple top-level fields only)
  const re = new RegExp(`${rootField}\\s*\\([^)]*\\)\\s*\\{([^}]+)\\}`);
  const m = re.exec(query);
  if (!m) return [];
  // Split on whitespace, filter out sub-selections and empty strings
  return m[1].split(/\s+/).filter(f => f && !f.includes('(') && !f.includes('{') && !f.includes('}'));
}

/**
 * Validate that a query only requests fields that exist on the given schema type.
 * Returns a GraphQL-style error response if invalid fields are found, or null if OK.
 */
function validateFields(query: string, rootField: string, schemaType: string): any | null {
  const validFields = SCHEMA_FIELDS[schemaType];
  if (!validFields) return null; // No schema registered — skip validation

  const requested = extractRequestedFields(query, rootField);
  const invalid = requested.filter(f => !validFields.has(f));
  if (invalid.length === 0) return null;

  // Return the same error shape the real Xray API produces
  return HttpResponse.json({
    errors: invalid.map(f => ({
      message: `Cannot query field "${f}" on type "${schemaType}". ` +
        `Did you mean "${[...validFields].find(v => v.toLowerCase().includes(f.toLowerCase().replace('count', ''))) || [...validFields][0]}"?`,
    })),
  });
}

// Stand-in values. Keep them distinct so assertion errors are searchable.
const MOCK_FOLDER = {
  name: 'Test Repository',
  path: '/',
  testsCount: 42,
  issuesCount: 100,
  preconditionsCount: 5,
};

// The real Xray Cloud API returns `jira` as a **JSON string**, not an object —
// because `jira(fields: [...])` is typed as a JSON scalar. Tools MUST parse
// it with JSON.parse before accessing nested fields. We mirror that here so
// tools that skip the parse step (and access `jira.key` directly) silently
// get `undefined` — exactly the production behavior we want tests to catch.
const MOCK_TEST = {
  issueId: '12345',
  jira: JSON.stringify({ key: 'PAD-MOCK-1', summary: 'Mock Test Case', labels: ['mocked'] }),
  testType: { name: 'Manual', kind: 'Steps' },
};

export const xrayHandlers = [
  // ── Authentication ──
  // Xray returns the bearer token as a JSON string literal (not an object).
  http.post('https://xray.cloud.getxray.app/api/v2/authenticate', () => {
    return HttpResponse.json('mock-xray-bearer-token');
  }),

  // ── Import endpoints (REST, not GraphQL) ──
  http.post(
    'https://xray.cloud.getxray.app/api/v2/import/execution/:format',
    () => {
      return HttpResponse.json({ id: 'mock-exec-id', key: 'PAD-EXEC-1' });
    },
  ),

  // ── GraphQL: body-based dispatch ──
  // We inspect the query text to figure out which operation the tool wants.
  // This is because the tools build queries as raw strings without operation
  // names, so MSW's graphql.query('xxx', ...) (which matches by operation name)
  // doesn't fire. Matching the field name is equivalent + works reliably.
  http.post('https://xray.cloud.getxray.app/api/v2/graphql', async ({ request }) => {
    const body: any = await request.clone().json().catch(() => ({}));

    if (matchesXrayField(body, 'getFolder')) {
      const fieldError = validateFields(body.query, 'getFolder', 'FolderResults');
      if (fieldError) return fieldError;
      return HttpResponse.json({
        data: {
          getFolder: {
            ...MOCK_FOLDER,
            folders: JSON.stringify([]),
          },
        },
      });
    }

    if (matchesXrayField(body, 'getPreconditionFolder')) {
      const fieldError = validateFields(body.query, 'getPreconditionFolder', 'FolderResults');
      if (fieldError) return fieldError;
      return HttpResponse.json({
        data: {
          getPreconditionFolder: {
            name: 'Precondition Repository',
            path: '/',
            testsCount: 0,
            issuesCount: 20,
            preconditionsCount: 15, // Real schema includes this; keep in sync.
            folders: JSON.stringify([]),
          },
        },
      });
    }

    if (matchesXrayField(body, 'getTests')) {
      return HttpResponse.json({
        data: {
          getTests: { total: 1, start: 0, limit: 50, results: [MOCK_TEST] },
        },
      });
    }

    if (matchesXrayField(body, 'getTest')) {
      return HttpResponse.json({
        data: { getTest: MOCK_TEST },
      });
    }

    if (matchesXrayField(body, 'getPreconditions')) {
      return HttpResponse.json({
        data: {
          getPreconditions: { total: 0, start: 0, limit: 50, results: [] },
        },
      });
    }

    if (matchesXrayField(body, 'getPrecondition')) {
      return HttpResponse.json({
        data: {
          getPrecondition: {
            issueId: '67890',
            // jira returned as JSON string to match real API (see MOCK_TEST comment).
            jira: JSON.stringify({ key: 'PAD-MOCK-PC', summary: 'Mock Precondition', labels: [] }),
            preconditionType: { name: 'Manual' },
            tests: { total: 0, results: [] },
          },
        },
      });
    }

    // Check getTestRuns BEFORE getTestRun so the plural form matches first
    // (both contain the substring "getTestRun").
    if (matchesXrayField(body, 'getTestRuns')) {
      return HttpResponse.json({
        data: {
          getTestRuns: { total: 0, start: 0, limit: 100, results: [] },
        },
      });
    }

    if (matchesXrayField(body, 'getTestRun')) {
      // Single-run lookup — default to null (not found). Tests that want
      // a specific run override with `server.use(...)`.
      return HttpResponse.json({
        data: { getTestRun: null },
      });
    }

    // Mutations (createTest, addTestStep, etc.) — generic success shape.
    // Tests that need specific responses override this with server.use().
    if (typeof body?.query === 'string' && /\bmutation\b/.test(body.query)) {
      return HttpResponse.json({ data: {} });
    }

    // Catch-all: any query NOT matched above returns an explicit error so
    // tests that needed a specific response fail loudly instead of silently
    // reaching defaults they didn't expect.
    return HttpResponse.json({
      errors: [
        {
          message:
            'MSW-UNHANDLED: this Xray GraphQL query was not mocked in this test. ' +
            'Add a `server.use(http.post(...))` override inside your test, or add ' +
            'a default handler to tests/mocks/handlers/xray-graphql.ts.',
        },
      ],
    });
  }),
];
