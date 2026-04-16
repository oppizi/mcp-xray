import { setupServer } from 'msw/node';
import { handlers } from './handlers/index.js';

// Single MSW server instance for all unit + contract tests.
// Tests can override default handlers per-test via `server.use(...)`.
export const server = setupServer(...handlers);
