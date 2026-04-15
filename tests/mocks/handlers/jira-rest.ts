// Default MSW handlers for Jira REST v3 endpoints.
//
// Most Jira-facing tools hit one of: /rest/api/3/search, /rest/api/3/issue,
// or /rest/api/3/issue/:key. Per-test overrides go here when a tool needs
// specific data.

import { HttpResponse, http } from 'msw';

const JIRA_BASE = 'https://test.atlassian.net';

const MOCK_ISSUE = {
  id: '10000',
  key: 'PAD-MOCK-1',
  fields: {
    summary: 'Mock Jira Issue',
    status: { name: 'To Do' },
    labels: ['mocked'],
    issuetype: { name: 'Test' },
  },
};

export const jiraHandlers = [
  // ── JQL search ──
  http.get(`${JIRA_BASE}/rest/api/3/search`, () => {
    return HttpResponse.json({
      issues: [MOCK_ISSUE],
      total: 1,
      startAt: 0,
      maxResults: 50,
    });
  }),

  // Enhanced search (newer API used by some tools)
  http.post(`${JIRA_BASE}/rest/api/3/search/jql`, () => {
    return HttpResponse.json({
      issues: [MOCK_ISSUE],
      total: 1,
      startAt: 0,
      maxResults: 50,
    });
  }),

  // ── Get issue by key ──
  http.get(`${JIRA_BASE}/rest/api/3/issue/:key`, ({ params }) => {
    return HttpResponse.json({
      ...MOCK_ISSUE,
      key: params.key,
    });
  }),

  // ── Create issue ──
  http.post(`${JIRA_BASE}/rest/api/3/issue`, () => {
    return HttpResponse.json({
      id: '10001',
      key: 'PAD-MOCK-NEW',
      self: `${JIRA_BASE}/rest/api/3/issue/10001`,
    });
  }),

  // ── Update / Edit issue (PUT) ──
  http.put(`${JIRA_BASE}/rest/api/3/issue/:key`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // ── Transitions ──
  http.get(`${JIRA_BASE}/rest/api/3/issue/:key/transitions`, () => {
    return HttpResponse.json({
      transitions: [
        { id: '11', name: 'To Do' },
        { id: '21', name: 'In Progress' },
        { id: '31', name: 'Done' },
      ],
    });
  }),

  http.post(`${JIRA_BASE}/rest/api/3/issue/:key/transitions`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // ── Issue links ──
  http.post(`${JIRA_BASE}/rest/api/3/issueLink`, () => {
    return new HttpResponse(null, { status: 201 });
  }),

  // ── Assign ──
  http.put(`${JIRA_BASE}/rest/api/3/issue/:key/assignee`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // ── Get project ──
  http.get(`${JIRA_BASE}/rest/api/3/project/:key`, ({ params }) => {
    return HttpResponse.json({
      id: '10001',
      key: params.key,
      name: 'Mock Project',
    });
  }),

  // ── User search (for assign by email) ──
  http.get(`${JIRA_BASE}/rest/api/3/user/search`, () => {
    return HttpResponse.json([
      { accountId: 'mock-account-id', emailAddress: 'test@example.com' },
    ]);
  }),
];
