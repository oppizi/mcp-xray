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

// Stand-in values. Keep them distinct so assertion errors are searchable.
const MOCK_FOLDER = {
  name: 'Test Repository',
  path: '/',
  testsCount: 42,
  issuesCount: 100,
  preconditionsCount: 5,
};

const MOCK_TEST = {
  issueId: '12345',
  jira: { key: 'PAD-MOCK-1', summary: 'Mock Test Case', labels: ['mocked'] },
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
      return HttpResponse.json({
        data: {
          getPreconditionFolder: {
            name: 'Precondition Repository',
            path: '/',
            testsCount: 0,
            issuesCount: 20,
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
            jira: { key: 'PAD-MOCK-PC', summary: 'Mock Precondition', labels: [] },
            preconditionType: { name: 'Manual' },
            tests: { total: 0, results: [] },
          },
        },
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
