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

// Test Status (Xray Cloud uses PASSED/FAILED, not PASS/FAIL)
export type TestStatus = 'TO DO' | 'EXECUTING' | 'PASSED' | 'FAILED' | 'KNOWN_ISSUE' | 'BLOCKED' | 'SKIPPED';

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

// Jira Search Response (from POST /rest/api/3/search/jql)
export interface JiraSearchResponse {
  issues: JiraIssue[];
  total?: number;
  startAt?: number;
  maxResults?: number;
  isLast: boolean;
  nextPageToken?: string;
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

