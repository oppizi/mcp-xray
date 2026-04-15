import { xrayHandlers } from './xray-graphql.js';
import { jiraHandlers } from './jira-rest.js';

// Default handlers layered in priority order:
//   1. Xray-specific (auth, GraphQL fallbacks)
//   2. Jira REST (search, issue CRUD)
//
// Any HTTP call NOT matched by these defaults fails the test (setup.ts
// sets onUnhandledRequest: 'error'). That's intentional — if a tool
// reaches for a URL we haven't anticipated, we want to know.
export const handlers = [...xrayHandlers, ...jiraHandlers];
