// Global test setup. Runs once before the first test file.
//
// Responsibilities:
//   1. Set dummy env vars so tools don't pick up real credentials.
//   2. Start MSW server with strict "unmocked calls fail the test" policy.
//   3. Reset handlers between tests so each test starts from the defaults.
//
// Integration tests override this via their own setup (see tests/integration/setup.ts).

import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';

beforeAll(() => {
  // Force dummy env vars. If a real credential leaks in from the shell,
  // our unit tests could accidentally hit the real API — fail loudly.
  process.env.JIRA_BASE_URL = 'https://test.atlassian.net';
  process.env.JIRA_EMAIL = 'test@example.com';
  process.env.JIRA_API_TOKEN = 'dummy-jira-token';
  process.env.XRAY_CLIENT_ID = 'dummy-xray-client-id';
  process.env.XRAY_CLIENT_SECRET = 'dummy-xray-client-secret';

  // onUnhandledRequest: 'error' = any HTTP call NOT covered by a handler
  // fails the test loudly. Prevents silent real-network contamination.
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  // Reset to default handlers between tests so per-test `server.use(...)`
  // overrides don't leak.
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
