// Test infrastructure: auto-discover every tool in src/tools/ and build a list
// of { name, schema, execute, sourcePath } for parameterized testing.
//
// The contract tests use this list to run the same 3 failure scenarios against
// EVERY tool without manual enumeration. New tools added to src/tools/ get
// covered automatically — no opt-in needed.

import axios from 'axios';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOOLS_ROOT = path.resolve(__dirname, '../../src/tools');

export interface DiscoveredTool {
  /** Tool name as exposed to MCP callers (e.g. "get_folder_tree"). */
  name: string;
  /** The exported schema object (has .name, .description, .inputSchema). */
  schema: any;
  /** The exported execute function: (axios, config, args) => Promise<{content, isError?}> */
  execute: (axiosInstance: any, config: any, args: any) => Promise<any>;
  /** Source file path — useful for error messages. */
  sourcePath: string;
}

/**
 * Walk src/tools/ and return every tool paired with its execute function.
 * A "tool" is a module exporting BOTH a `*Tool` schema and a same-base-name
 * execute function. Example: `getFolderTreeTool` + `getFolderTree`.
 */
export async function loadAllTools(): Promise<DiscoveredTool[]> {
  const tsFiles = collectTsFiles(TOOLS_ROOT);
  const discovered: DiscoveredTool[] = [];

  for (const file of tsFiles) {
    // Convert .ts source path → compiled .js path for dynamic import.
    // We import from src via vitest's TS loader, which handles .ts extensions.
    const mod = await import(file);

    // Find exports ending in "Tool" (the schema objects).
    const schemaKeys = Object.keys(mod).filter(
      (k) => k.endsWith('Tool') && typeof mod[k] === 'object' && mod[k]?.name,
    );

    for (const schemaKey of schemaKeys) {
      const schema = mod[schemaKey];
      // Paired execute function: schemaKey minus "Tool".
      // E.g. "getFolderTreeTool" → "getFolderTree"
      const executeKey = schemaKey.slice(0, -'Tool'.length);
      const execute = mod[executeKey];
      if (typeof execute !== 'function') {
        continue; // Not a full tool — skip (template/reference only).
      }
      discovered.push({
        name: schema.name,
        schema,
        execute,
        sourcePath: file,
      });
    }
  }

  return discovered;
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Minimum valid args per tool — what the tool needs to pass its own input
 * validation and reach the network call. Kept in a single table so the
 * contract test auto-detects new tools missing from the table.
 *
 * Tests that need richer args can pass their own via callTool's args param.
 */
export const SAMPLE_ARGS: Record<string, Record<string, any>> = {
  // Tests
  list_tests: { project_key: 'PAD' },
  get_test: { test_key: 'PAD-1' },
  get_test_with_steps: { test_key: 'PAD-1' },
  create_test: { project_key: 'PAD', summary: 'x', folder_path: '/' },
  update_test: { test_key: 'PAD-1', summary: 'updated' },
  search_tests: { jql: 'project = PAD' },
  add_test_step: { test_key: 'PAD-1', action: 'a', result: 'r' },
  add_multiple_test_steps: {
    test_key: 'PAD-1',
    steps: [{ action: 'a', result: 'r' }],
  },
  update_test_step: { test_key: 'PAD-1', step_id: 'step-id', action: 'a' },
  remove_test_step: { test_key: 'PAD-1', step_id: 'step-id' },
  reorder_test_steps: { test_key: 'PAD-1', step_ids: ['a', 'b'] },
  assign_test_case: { test_keys: ['PAD-1'], assignee_email: 'test@example.com' },
  transition_test_case: { test_keys: ['PAD-1'], status: 'Done' },
  link_issues: { inward_issue: 'PAD-1', outward_issue: 'PAD-2', link_type: 'relates to' },
  get_linked_tests: { issue_key: 'PAD-1' },
  update_gherkin: { test_key: 'PAD-1', gherkin: 'Given ...' },

  // Test Executions
  list_test_executions: { project_key: 'PAD' },
  get_test_execution: { test_execution_key: 'PAD-1' },
  create_test_execution: { project_key: 'PAD', summary: 'x' },
  update_test_run: { test_execution_key: 'PAD-1', test_key: 'PAD-2', status: 'PASS' },

  // Test Plans
  list_test_plans: { project_key: 'PAD' },
  get_test_plan: { test_plan_key: 'PAD-1' },
  create_test_plan: { project_key: 'PAD', summary: 'x' },
  add_tests_to_test_plan: { test_plan_key: 'PAD-1', test_keys: 'PAD-2' },

  // Test Sets
  list_test_sets: { project_key: 'PAD' },
  get_test_set: { test_set_key: 'PAD-1' },
  create_test_set: { project_key: 'PAD', summary: 'x' },
  add_tests_to_test_set: { test_set_key: 'PAD-1', test_keys: 'PAD-2' },

  // Preconditions
  create_precondition: { project_key: 'PAD', summary: 'x', folder_path: '/' },
  add_precondition_to_test: { precondition_key: 'PAD-1', test_keys: 'PAD-2' },
  search_preconditions: { jql: 'project = PAD' },
  get_precondition: { precondition_key: 'PAD-1' },
  get_test_preconditions: { test_key: 'PAD-1' },
  update_precondition: { precondition_key: 'PAD-1', summary: 'updated' },
  remove_precondition_from_test: { precondition_key: 'PAD-1', test_key: 'PAD-2' },
  add_precondition_to_tests: { precondition_key: 'PAD-1', test_keys: ['PAD-2', 'PAD-3'] },

  // Folders
  get_folder_tree: { project_id: '10001' },
  get_tests_in_folder: { folder_path: '/' },
  add_tests_to_folder: { folder_path: '/', test_issue_ids: ['PAD-1'] },
  update_precondition_folder: { precondition_key: 'PAD-1', folder_path: '/' },
  move_test_to_folder: { test_key: 'PAD-1', folder_path: '/' },

  // Import / Export
  import_execution_results: { results_json: '{"tests":[]}' },
  import_cucumber_results: { cucumber_json: '[]' },
  import_junit_results: { junit_xml: '<testsuites/>' },
  import_testng_results: { testng_xml: '<testng-results/>' },
  import_nunit_results: { nunit_xml: '<test-results/>' },
  import_robot_results: { robot_xml: '<robot/>' },
  import_behave_results: { behave_json: '[]' },
  import_feature_file: { feature_content: 'Feature: x', project_key: 'PAD' },
  export_cucumber_features: { test_keys: 'PAD-1' },
};

/**
 * Get sample args for a tool. If the tool isn't in the SAMPLE_ARGS table,
 * return a sentinel that makes the test fail loudly so the table gets updated.
 */
export function sampleArgsFor(toolName: string): Record<string, any> {
  const args = SAMPLE_ARGS[toolName];
  if (!args) {
    // Returning bogus args means the test will fail on validation, which is
    // a clearer signal than "tool passed with zero args" — whoever adds a
    // new tool will see the failure and know to add an entry here.
    return { __MISSING_FROM_SAMPLE_ARGS__: true };
  }
  return args;
}

/**
 * Invoke a tool's execute function with mocked axios + dummy config.
 * Returns whatever the tool returns (success response OR error response).
 * Never throws — errors always flow back as the return value.
 */
export async function callTool(
  tool: DiscoveredTool,
  args: Record<string, any>,
): Promise<any> {
  const axiosInstance = axios.create();
  const config = {
    jiraUrl: process.env.JIRA_BASE_URL!,
    jiraUsername: process.env.JIRA_EMAIL!,
    jiraApiToken: process.env.JIRA_API_TOKEN!,
    xrayClientId: process.env.XRAY_CLIENT_ID!,
    xrayClientSecret: process.env.XRAY_CLIENT_SECRET!,
  };

  try {
    return await tool.execute(axiosInstance, config, args);
  } catch (thrownError: any) {
    // Some tools may THROW instead of returning an error response.
    // Normalize to the isError:true shape so contract assertions work either way.
    return {
      content: [
        { type: 'text', text: `Tool threw: ${thrownError?.message ?? String(thrownError)}` },
      ],
      isError: true,
    };
  }
}
