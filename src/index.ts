#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { Config, ConfigSchema } from './types.js';

// Tests
import { listTests, listTestsTool } from './tools/tests/listTests.js';
import { getTest, getTestTool } from './tools/tests/getTest.js';
import { getTestWithSteps, getTestWithStepsTool } from './tools/tests/getTestWithSteps.js';
import { createTest, createTestTool } from './tools/tests/createTest.js';
import { updateTest, updateTestTool } from './tools/tests/updateTest.js';

// Test Executions
import {
  listTestExecutions,
  listTestExecutionsTool,
} from './tools/test-executions/listTestExecutions.js';
import {
  getTestExecution,
  getTestExecutionTool,
} from './tools/test-executions/getTestExecution.js';
import {
  createTestExecution,
  createTestExecutionTool,
} from './tools/test-executions/createTestExecution.js';
import {
  updateTestRun,
  updateTestRunTool,
} from './tools/test-executions/updateTestRun.js';

// Test Plans
import {
  listTestPlans,
  listTestPlansTool,
} from './tools/test-plans/listTestPlans.js';
import {
  getTestPlan,
  getTestPlanTool,
} from './tools/test-plans/getTestPlan.js';
import {
  createTestPlan,
  createTestPlanTool,
} from './tools/test-plans/createTestPlan.js';
import {
  addTestsToTestPlan,
  addTestsToTestPlanTool,
} from './tools/test-plans/addTestsToTestPlan.js';

// Test Steps
import { addTestStep, addTestStepTool } from './tools/tests/addTestStep.js';
import { updateTestStep, updateTestStepTool } from './tools/tests/updateTestStep.js';
import { removeTestStep, removeTestStepTool } from './tools/tests/removeTestStep.js';
import { searchTests, searchTestsTool } from './tools/tests/searchTests.js';
import { updateGherkin, updateGherkinTool } from './tools/tests/updateGherkin.js';

// Test Sets
import {
  listTestSets,
  listTestSetsTool,
} from './tools/test-sets/listTestSets.js';
import { getTestSet, getTestSetTool } from './tools/test-sets/getTestSet.js';
import { createTestSet, createTestSetTool } from './tools/test-sets/createTestSet.js';
import {
  addTestsToTestSet,
  addTestsToTestSetTool,
} from './tools/test-sets/addTestsToTestSet.js';

// Preconditions
import {
  createPrecondition,
  createPreconditionTool,
} from './tools/preconditions/createPrecondition.js';
import {
  addPreconditionToTest,
  addPreconditionToTestTool,
} from './tools/preconditions/addPreconditionToTest.js';

// Import Operations
import {
  importExecutionResults,
  importExecutionResultsTool,
} from './tools/import/importExecutionResults.js';
import {
  importCucumberResults,
  importCucumberResultsTool,
} from './tools/import/importCucumberResults.js';
import {
  importJUnitResults,
  importJUnitResultsTool,
} from './tools/import/importJUnitResults.js';
import {
  importTestNGResults,
  importTestNGResultsTool,
} from './tools/import/importTestNGResults.js';
import {
  importNUnitResults,
  importNUnitResultsTool,
} from './tools/import/importNUnitResults.js';
import {
  importRobotResults,
  importRobotResultsTool,
} from './tools/import/importRobotResults.js';
import {
  importBehaveResults,
  importBehaveResultsTool,
} from './tools/import/importBehaveResults.js';
import {
  importFeatureFile,
  importFeatureFileTool,
} from './tools/import/importFeatureFile.js';

// Export Operations
import {
  exportCucumberFeatures,
  exportCucumberFeaturesTool,
} from './tools/export/exportCucumberFeatures.js';

class XrayMCPServer {
  private server: Server;
  private config: Config;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.server = new Server({
      name: 'xray-mcp',
      version: '1.0.0',
      capabilities: {
        tools: {},
      },
    });

    // Validate environment variables
    this.config = ConfigSchema.parse({
      JIRA_BASE_URL: process.env.JIRA_BASE_URL,
      JIRA_EMAIL: process.env.JIRA_EMAIL,
      JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
      XRAY_CLIENT_ID: process.env.XRAY_CLIENT_ID,
      XRAY_CLIENT_SECRET: process.env.XRAY_CLIENT_SECRET,
    });

    // Setup Axios instance with Jira authentication
    // Using Basic Auth with email and API token
    const auth = Buffer.from(
      `${this.config.JIRA_EMAIL}:${this.config.JIRA_API_TOKEN}`
    ).toString('base64');

    this.axiosInstance = axios.create({
      baseURL: this.config.JIRA_BASE_URL,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30000,
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Tests
        listTestsTool,
        getTestTool,
        getTestWithStepsTool,
        createTestTool,
        updateTestTool,
        // Test Executions
        listTestExecutionsTool,
        getTestExecutionTool,
        createTestExecutionTool,
        updateTestRunTool,
        // Test Plans
        listTestPlansTool,
        getTestPlanTool,
        createTestPlanTool,
        addTestsToTestPlanTool,
        // Test Steps & Search
        addTestStepTool,
        updateTestStepTool,
        removeTestStepTool,
        searchTestsTool,
        updateGherkinTool,
        // Test Sets
        listTestSetsTool,
        getTestSetTool,
        createTestSetTool,
        addTestsToTestSetTool,
        // Preconditions
        createPreconditionTool,
        addPreconditionToTestTool,
        // Import Operations
        importExecutionResultsTool,
        importCucumberResultsTool,
        importJUnitResultsTool,
        importTestNGResultsTool,
        importNUnitResultsTool,
        importRobotResultsTool,
        importBehaveResultsTool,
        importFeatureFileTool,
        // Export Operations
        exportCucumberFeaturesTool,
      ],
    }));

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest) => {
        const args = request.params.arguments || {};
        const { name } = request.params;
        const handlers: Record<
          string,
          (
            axiosInstance: AxiosInstance,
            config: Config,
            args: any
          ) => Promise<{ content: Array<{ type: string; text: string }> }>
        > = {
          // Tests
          list_tests: listTests,
          get_test: getTest,
          get_test_with_steps: getTestWithSteps,
          create_test: createTest,
          update_test: updateTest,
          // Test Executions
          list_test_executions: listTestExecutions,
          get_test_execution: getTestExecution,
          create_test_execution: createTestExecution,
          update_test_run: updateTestRun,
          // Test Plans
          list_test_plans: listTestPlans,
          get_test_plan: getTestPlan,
          create_test_plan: createTestPlan,
          add_tests_to_test_plan: addTestsToTestPlan,
          // Test Steps & Search
          add_test_step: addTestStep,
          update_test_step: updateTestStep,
          remove_test_step: removeTestStep,
          search_tests: searchTests,
          update_gherkin: updateGherkin,
          // Test Sets
          list_test_sets: listTestSets,
          get_test_set: getTestSet,
          create_test_set: createTestSet,
          add_tests_to_test_set: addTestsToTestSet,
          // Preconditions
          create_precondition: createPrecondition,
          add_precondition_to_test: addPreconditionToTest,
          // Import Operations
          import_execution_results: importExecutionResults,
          import_cucumber_results: importCucumberResults,
          import_junit_results: importJUnitResults,
          import_testng_results: importTestNGResults,
          import_nunit_results: importNUnitResults,
          import_robot_results: importRobotResults,
          import_behave_results: importBehaveResults,
          import_feature_file: importFeatureFile,
          // Export Operations
          export_cucumber_features: exportCucumberFeatures,
        };

        if (name in handlers) {
          return await handlers[name](this.axiosInstance, this.config, args);
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }
      }
    );
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Xray MCP Server running on stdio');
  }
}

const server = new XrayMCPServer();
server.run().catch(console.error);

