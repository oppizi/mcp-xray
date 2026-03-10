import { z } from 'zod';

// Environment variables validation
export const ConfigSchema = z.object({
  JIRA_BASE_URL: z.string().min(1, 'Jira base URL is required').url('Must be a valid URL'),
  JIRA_EMAIL: z.string().min(1, 'Jira email is required').email('Must be a valid email'),
  JIRA_API_TOKEN: z.string().min(1, 'Jira API token is required'),
  XRAY_CLIENT_ID: z.string().optional(),
  XRAY_CLIENT_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

// Shared error message for missing Xray Cloud credentials.
// Used by all tools that require XRAY_CLIENT_ID / XRAY_CLIENT_SECRET.
export const XRAY_CREDENTIALS_SETUP_GUIDE =
  'Xray Cloud API credentials not configured.\n\n' +
  'To set up Xray Cloud API access:\n' +
  '1. Ask Natalia (QA Lead) for Xray Cloud API credentials (Client ID + Secret)\n' +
  '2. Add them to your .mcp.env file:\n' +
  "   XRAY_CLIENT_ID='your_client_id'\n" +
  "   XRAY_CLIENT_SECRET='your_client_secret'\n" +
  '3. Restart Claude Code to pick up the new credentials';

// Xray Cloud Authentication Token
export interface XrayCloudToken {
  token: string;
  expiresAt: number; // timestamp
}

// Jira User
export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  active: boolean;
}

// Xray Test Types
export type XrayTestType = 'Manual' | 'Cucumber' | 'Generic';

// Test Status
export type TestStatus = 'TODO' | 'EXECUTING' | 'PASS' | 'FAIL' | 'ABORTED';

// Test Step
export interface XrayTestStep {
  id?: string;
  index?: number;
  step: string;
  data?: string;
  result?: string;
  attachments?: string[];
}

// Xray Test (Test issue)
export interface XrayTest {
  key: string;
  id: string;
  summary: string;
  description?: string;
  testType?: XrayTestType;
  projectKey: string;
  assignee?: JiraUser;
  reporter?: JiraUser;
  status: {
    name: string;
    id: string;
  };
  priority?: {
    name: string;
    id: string;
  };
  labels?: string[];
  components?: Array<{
    id: string;
    name: string;
  }>;
  created: string;
  updated: string;
  steps?: XrayTestStep[];
  gherkin?: string;
}

// Test Run (result of a test within an execution)
export interface XrayTestRun {
  id: number;
  status: TestStatus;
  testKey: string;
  testExecKey: string;
  startedOn?: string;
  finishedOn?: string;
  assignee?: string;
  executedBy?: string;
  comment?: string;
  defects?: string[];
  evidences?: Array<{
    filename: string;
    fileURL?: string;
  }>;
  examples?: string[];
  steps?: Array<{
    index: number;
    status: TestStatus;
    comment?: string;
    defects?: string[];
    evidences?: Array<{
      filename: string;
    }>;
  }>;
}

// Test Execution (Test Execution issue)
export interface XrayTestExecution {
  key: string;
  id: string;
  summary: string;
  description?: string;
  projectKey: string;
  assignee?: JiraUser;
  reporter?: JiraUser;
  status: {
    name: string;
    id: string;
  };
  testEnvironments?: string[];
  created: string;
  updated: string;
  startedOn?: string;
  finishedOn?: string;
  testRuns?: XrayTestRun[];
}

// Test Plan (Test Plan issue)
export interface XrayTestPlan {
  key: string;
  id: string;
  summary: string;
  description?: string;
  projectKey: string;
  assignee?: JiraUser;
  reporter?: JiraUser;
  status: {
    name: string;
    id: string;
  };
  created: string;
  updated: string;
  tests?: string[];
  testExecutions?: string[];
}

// Test Set (Test Set issue)
export interface XrayTestSet {
  key: string;
  id: string;
  summary: string;
  description?: string;
  projectKey: string;
  assignee?: JiraUser;
  reporter?: JiraUser;
  status: {
    name: string;
    id: string;
  };
  created: string;
  updated: string;
  tests?: string[];
}

// Precondition
export interface XrayPrecondition {
  key: string;
  id: string;
  summary: string;
  description?: string;
  preconditionType?: string;
  definition?: string;
}

// Jira Issue (generic)
export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: any;
    issuetype: {
      id: string;
      name: string;
      subtask: boolean;
    };
    project: {
      id: string;
      key: string;
      name: string;
    };
    status: {
      id: string;
      name: string;
    };
    priority?: {
      id: string;
      name: string;
    };
    assignee?: JiraUser;
    reporter?: JiraUser;
    created: string;
    updated: string;
    labels?: string[];
    components?: Array<{
      id: string;
      name: string;
    }>;
    [key: string]: any;
  };
}

// Jira Search Response
export interface JiraSearchResponse {
  expand: string;
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

// Test Import Response
export interface TestImportResponse {
  testExecIssue: {
    id: string;
    key: string;
    self: string;
  };
  testIssues?: {
    success?: Array<{
      id: string;
      key: string;
      self: string;
    }>;
  };
}

// Common response wrapper
export interface MCPResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

