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

import { HttpResponse, graphql, http } from 'msw';

const xrayGraphql = graphql.link('https://xray.cloud.getxray.app/api/v2/graphql');

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

  // ── GraphQL: getFolder ──
  xrayGraphql.query('getFolder', () => {
    return HttpResponse.json({
      data: {
        getFolder: {
          ...MOCK_FOLDER,
          // `folders` is a JSON scalar in the real schema — return a JSON string.
          folders: JSON.stringify([]),
        },
      },
    });
  }),

  // ── GraphQL: getPreconditionFolder ──
  xrayGraphql.query('getPreconditionFolder', () => {
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
  }),

  // ── GraphQL: getTests ──
  xrayGraphql.query('getTests', () => {
    return HttpResponse.json({
      data: {
        getTests: { total: 1, start: 0, limit: 50, results: [MOCK_TEST] },
      },
    });
  }),

  // ── GraphQL: getTest ──
  xrayGraphql.query('getTest', () => {
    return HttpResponse.json({
      data: { getTest: MOCK_TEST },
    });
  }),

  // ── GraphQL: getPreconditions ──
  xrayGraphql.query('getPreconditions', () => {
    return HttpResponse.json({
      data: {
        getPreconditions: { total: 0, start: 0, limit: 50, results: [] },
      },
    });
  }),

  // ── GraphQL: getPrecondition ──
  xrayGraphql.query('getPrecondition', () => {
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
  }),

  // ── GraphQL: mutations (createTest, addTestStep, etc.) ──
  // Default success shape — per-test overrides provide specific data.
  xrayGraphql.mutation(/.*/, ({ query }) => {
    return HttpResponse.json({ data: {} });
  }),

  // ── Import endpoints (REST, not GraphQL) ──
  http.post(
    'https://xray.cloud.getxray.app/api/v2/import/execution/:format',
    () => {
      return HttpResponse.json({ id: 'mock-exec-id', key: 'PAD-EXEC-1' });
    },
  ),

  // Catch-all: any GraphQL operation NOT matched above returns an explicit
  // error so tests that needed a specific response fail loudly.
  http.post('https://xray.cloud.getxray.app/api/v2/graphql', () => {
    return HttpResponse.json({
      errors: [
        {
          message:
            'MSW-UNHANDLED: this Xray GraphQL query was not mocked in this test. ' +
            'Add a `server.use(graphql.link(...).query(...))` inside your test.',
        },
      ],
    });
  }),
];
