import axios, { AxiosInstance } from 'axios';
import { Config, XrayCloudToken } from '../types.js';

export class XrayCloudService {
  private static instance: XrayCloudService;
  private token: XrayCloudToken | null = null;
  private config: Config;
  private axiosInstance: AxiosInstance;

  private constructor(config: Config) {
    this.config = config;
    this.axiosInstance = axios.create({
      baseURL: 'https://xray.cloud.getxray.app/api/v2',
      timeout: 30000,
    });
  }

  public static getInstance(config: Config): XrayCloudService {
    if (!XrayCloudService.instance) {
      XrayCloudService.instance = new XrayCloudService(config);
    }
    return XrayCloudService.instance;
  }

  public isConfigured(): boolean {
    return !!(this.config.XRAY_CLIENT_ID && this.config.XRAY_CLIENT_SECRET);
  }

  private isTokenValid(): boolean {
    if (!this.token) return false;
    // Check if token expires in less than 5 minutes
    return this.token.expiresAt > Date.now() + 5 * 60 * 1000;
  }

  public async authenticate(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error(
        'Xray Cloud API credentials not configured.\n\n' +
        'This tool requires Xray Cloud API access. To set up:\n' +
        '1. Ask Natalia (QA Lead) for Xray Cloud API credentials (Client ID + Secret)\n' +
        '2. Add them to your .mcp.env file:\n' +
        '   XRAY_CLIENT_ID=\'your_client_id\'\n' +
        '   XRAY_CLIENT_SECRET=\'your_client_secret\'\n' +
        '3. Restart Claude Code to pick up the new credentials\n\n' +
        'Note: Jira-based test tools (list_tests, create_test, etc.) work without these credentials.\n' +
        'Only test steps, imports, and exports require the Xray Cloud API.'
      );
    }

    // Return cached token if still valid
    if (this.isTokenValid() && this.token) {
      return this.token.token;
    }

    console.error('Authenticating with Xray Cloud API...');

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/authenticate',
        {
          client_id: this.config.XRAY_CLIENT_ID,
          client_secret: this.config.XRAY_CLIENT_SECRET,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const token = response.data;
      
      // Xray tokens typically expire in 1 hour, but we'll refresh after 50 minutes to be safe
      this.token = {
        token,
        expiresAt: Date.now() + 50 * 60 * 1000,
      };

      console.error('Successfully authenticated with Xray Cloud API');
      return token;
    } catch (error: any) {
      console.error('Failed to authenticate with Xray Cloud:', error.message);
      throw new Error(
        `Failed to authenticate with Xray Cloud: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }

  public async getTestSteps(testKey: string): Promise<any> {
    return this.getTest(testKey);
  }

  public async getTest(testKey: string): Promise<any> {
    const token = await this.authenticate();

    try {
      // Use getTests (plural) with JQL - getTest (singular) requires numeric IDs
      // and passing issue keys returns null
      const query = `
        query {
          getTests(jql: ${JSON.stringify(`key = ${testKey}`)}, limit: 1) {
            total
            results {
              issueId
              testType {
                name
                kind
              }
              steps {
                id
                data
                action
                result
              }
              gherkin
            }
          }
        }
      `;

      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      const results = response.data.data.getTests?.results || [];
      return results.length > 0 ? results[0] : null;
    } catch (error: any) {
      console.error(`Failed to fetch test from Xray Cloud for ${testKey}:`, error.message);

      if (error.response?.status === 401) {
        this.token = null;
      }

      throw error;
    }
  }

  // Get test using getTests query (plural) - this works more reliably for getting test steps
  public async getTestWithSteps(testKey: string): Promise<any> {
    const token = await this.authenticate();

    try {
      // Use getTests (plural) with JQL filter - this reliably returns test steps
      const query = `
        query {
          getTests(jql: "key = ${testKey}", limit: 1) {
            total
            results {
              issueId
              testType {
                name
                kind
              }
              steps {
                id
                action
                data
                result
              }
              gherkin
            }
          }
        }
      `;

      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      const results = response.data.data.getTests?.results || [];
      if (results.length === 0) {
        return null;
      }

      return results[0];
    } catch (error: any) {
      console.error(`Failed to fetch test from Xray Cloud for ${testKey}:`, error.message);
      
      if (error.response?.status === 401) {
        this.token = null;
      }
      
      throw error;
    }
  }

  // Import test execution results in Xray JSON format
  public async importExecutionResults(results: any): Promise<any> {
    const token = await this.authenticate();

    try {
      const response = await this.axiosInstance.post('/import/execution', results, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('Failed to import execution results:', error.message);
      
      if (error.response?.status === 401) {
        this.token = null;
      }
      
      throw error;
    }
  }

  // Import Cucumber JSON results
  public async importCucumberResults(results: any, projectKey?: string): Promise<any> {
    const token = await this.authenticate();

    try {
      const params = new URLSearchParams();
      if (projectKey) params.append('projectKey', projectKey);
      const url = `/import/execution/cucumber${params.toString() ? '?' + params.toString() : ''}`;
      const response = await this.axiosInstance.post(url, results, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('Failed to import Cucumber results:', error.message);
      
      if (error.response?.status === 401) {
        this.token = null;
      }
      
      throw error;
    }
  }

  // Import JUnit XML results
  public async importJUnitResults(xmlContent: string, projectKey?: string): Promise<any> {
    const token = await this.authenticate();

    try {
      const params = new URLSearchParams();
      if (projectKey) params.append('projectKey', projectKey);
      const url = `/import/execution/junit${params.toString() ? '?' + params.toString() : ''}`;
      const response = await this.axiosInstance.post(url, xmlContent, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/xml',
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('Failed to import JUnit results:', error.message);
      
      if (error.response?.status === 401) {
        this.token = null;
      }
      
      throw error;
    }
  }

  // Import TestNG XML results
  public async importTestNGResults(xmlContent: string, projectKey?: string): Promise<any> {
    const token = await this.authenticate();

    try {
      const params = new URLSearchParams();
      if (projectKey) params.append('projectKey', projectKey);
      const url = `/import/execution/testng${params.toString() ? '?' + params.toString() : ''}`;
      const response = await this.axiosInstance.post(url, xmlContent, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/xml',
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('Failed to import TestNG results:', error.message);
      
      if (error.response?.status === 401) {
        this.token = null;
      }
      
      throw error;
    }
  }

  // Import NUnit XML results
  public async importNUnitResults(xmlContent: string, projectKey?: string): Promise<any> {
    const token = await this.authenticate();

    try {
      const params = new URLSearchParams();
      if (projectKey) params.append('projectKey', projectKey);
      const url = `/import/execution/nunit${params.toString() ? '?' + params.toString() : ''}`;
      const response = await this.axiosInstance.post(url, xmlContent, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/xml',
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('Failed to import NUnit results:', error.message);
      
      if (error.response?.status === 401) {
        this.token = null;
      }
      
      throw error;
    }
  }

  // Import Robot Framework XML results
  public async importRobotResults(xmlContent: string, projectKey?: string): Promise<any> {
    const token = await this.authenticate();

    try {
      const params = new URLSearchParams();
      if (projectKey) params.append('projectKey', projectKey);
      const url = `/import/execution/robot${params.toString() ? '?' + params.toString() : ''}`;
      const response = await this.axiosInstance.post(url, xmlContent, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/xml',
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('Failed to import Robot Framework results:', error.message);
      
      if (error.response?.status === 401) {
        this.token = null;
      }
      
      throw error;
    }
  }

  // Import Behave JSON results
  public async importBehaveResults(results: any, projectKey?: string): Promise<any> {
    const token = await this.authenticate();

    try {
      const params = new URLSearchParams();
      if (projectKey) params.append('projectKey', projectKey);
      const url = `/import/execution/behave${params.toString() ? '?' + params.toString() : ''}`;
      const response = await this.axiosInstance.post(url, results, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('Failed to import Behave results:', error.message);
      
      if (error.response?.status === 401) {
        this.token = null;
      }
      
      throw error;
    }
  }

  // Import Cucumber feature file (requires multipart file upload)
  public async importFeatureFile(featureContent: string, projectKey?: string): Promise<any> {
    const token = await this.authenticate();

    try {
      const params = new URLSearchParams();
      if (projectKey) params.append('projectKey', projectKey);
      const url = `https://xray.cloud.getxray.app/api/v2/import/feature${params.toString() ? '?' + params.toString() : ''}`;

      // Xray Cloud requires multipart file upload for feature files
      const boundary = '----XrayMCPBoundary' + Date.now();
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="import.feature"',
        'Content-Type: text/plain',
        '',
        featureContent,
        `--${boundary}--`,
        '',
      ].join('\r\n');

      const response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        timeout: 30000,
      });

      return response.data;
    } catch (error: any) {
      console.error('Failed to import feature file:', error.message);
      
      if (error.response?.status === 401) {
        this.token = null;
      }
      
      throw error;
    }
  }

  // Resolve a Jira issue key (e.g., PAD-29661) to its numeric ID (e.g., 55891)
  // The GraphQL mutations require numeric IDs, not keys
  public async resolveIssueId(
    axiosInstance: AxiosInstance,
    issueKey: string
  ): Promise<string> {
    const response = await axiosInstance.get(
      `/rest/api/3/issue/${issueKey}?fields=id`
    );
    return response.data.id;
  }

  // Add a test step to a manual test
  // issueId must be the numeric Jira issue ID (use resolveIssueId first)
  public async addTestStep(
    issueId: string,
    step: { action: string; data?: string; result?: string }
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        addTestStep(
          issueId: "${issueId}"
          step: {
            action: ${JSON.stringify(step.action)}
            ${step.data ? `data: ${JSON.stringify(step.data)}` : ''}
            ${step.result ? `result: ${JSON.stringify(step.result)}` : ''}
          }
        ) {
          id
          action
          data
          result
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.addTestStep;
    } catch (error: any) {
      console.error(`Failed to add test step to ${issueId}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Update an existing test step
  public async updateTestStep(
    testKey: string,
    stepId: string,
    updates: { action?: string; data?: string; result?: string }
  ): Promise<any> {
    const token = await this.authenticate();

    const stepFields: string[] = [];
    if (updates.action !== undefined) stepFields.push(`action: ${JSON.stringify(updates.action)}`);
    if (updates.data !== undefined) stepFields.push(`data: ${JSON.stringify(updates.data)}`);
    if (updates.result !== undefined) stepFields.push(`result: ${JSON.stringify(updates.result)}`);

    const mutation = `
      mutation {
        updateTestStep(
          stepId: "${stepId}"
          step: { ${stepFields.join(', ')} }
        ) {
          warnings
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.updateTestStep;
    } catch (error: any) {
      console.error(
        `Failed to update test step on ${testKey}:`,
        error.message
      );
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Remove all test steps from a test definition (test run history is NOT affected)
  public async removeAllTestSteps(issueId: string): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        removeAllTestSteps(issueId: "${issueId}")
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.removeAllTestSteps;
    } catch (error: any) {
      console.error(
        `Failed to remove all test steps from ${issueId}:`,
        error.message
      );
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Remove a test step
  public async removeTestStep(testKey: string, stepId: string): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        removeTestStep(stepId: "${stepId}")
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.removeTestStep;
    } catch (error: any) {
      console.error(
        `Failed to remove test step from ${testKey}:`,
        error.message
      );
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Search tests using GraphQL
  public async searchTests(
    jql: string,
    limit: number = 50,
    includeSteps: boolean = false
  ): Promise<any[]> {
    const token = await this.authenticate();

    const stepsFragment = includeSteps
      ? `steps { id action data result }`
      : '';

    const query = `
      query {
        getTests(jql: ${JSON.stringify(jql)}, limit: ${limit}) {
          total
          results {
            issueId
            testType {
              name
              kind
            }
            ${stepsFragment}
          }
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.getTests?.results || [];
    } catch (error: any) {
      console.error('Failed to search tests:', error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Add a precondition to a test
  // Both IDs must be numeric Jira issue IDs (use resolveIssueId first)
  public async addPreconditionToTest(
    preconditionId: string,
    testId: string
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        addPreconditionsToTest(
          issueId: "${testId}"
          preconditionIssueIds: ["${preconditionId}"]
        ) {
          addedPreconditions
          warning
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.addPreconditionsToTest;
    } catch (error: any) {
      console.error(
        `Failed to add precondition ${preconditionId} to ${testId}:`,
        error.message
      );
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Search preconditions using GraphQL
  public async searchPreconditions(
    jql: string,
    limit: number = 50
  ): Promise<any> {
    const token = await this.authenticate();

    const query = `
      query {
        getPreconditions(jql: ${JSON.stringify(jql)}, limit: ${limit}) {
          total
          results {
            issueId
            jira(fields: ["key", "summary", "status", "labels", "created", "updated"])
            preconditionType {
              name
            }
            definition
          }
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.getPreconditions;
    } catch (error: any) {
      console.error('Failed to search preconditions:', error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Get a single precondition by key
  public async getPrecondition(preconditionKey: string): Promise<any> {
    const token = await this.authenticate();

    const query = `
      query {
        getPreconditions(jql: "key = ${preconditionKey}", limit: 1) {
          total
          results {
            issueId
            jira(fields: ["key", "summary", "description", "status", "labels", "created", "updated", "assignee", "reporter", "priority"])
            preconditionType {
              name
            }
            definition
            tests(limit: 100) {
              total
              results {
                issueId
                jira(fields: ["key", "summary", "status"])
                testType {
                  name
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      const results = response.data.data.getPreconditions?.results || [];
      return results.length > 0 ? results[0] : null;
    } catch (error: any) {
      console.error(`Failed to get precondition ${preconditionKey}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Get preconditions linked to a specific test
  public async getTestPreconditions(testKey: string): Promise<any> {
    const token = await this.authenticate();

    const query = `
      query {
        getTests(jql: "key = ${testKey}", limit: 1) {
          results {
            issueId
            preconditions(limit: 100) {
              total
              results {
                issueId
                jira(fields: ["key", "summary", "status", "labels"])
                preconditionType {
                  name
                }
                definition
              }
            }
          }
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      const results = response.data.data.getTests?.results || [];
      if (results.length === 0) return null;
      return results[0].preconditions;
    } catch (error: any) {
      console.error(`Failed to get preconditions for test ${testKey}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Remove a precondition from a test
  public async removePreconditionFromTest(
    preconditionId: string,
    testId: string
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        removePreconditionsFromTest(
          issueId: "${testId}"
          preconditionIssueIds: ["${preconditionId}"]
        )
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.removePreconditionsFromTest;
    } catch (error: any) {
      console.error(
        `Failed to remove precondition ${preconditionId} from test ${testId}:`,
        error.message
      );
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Add a precondition to multiple tests at once
  public async addPreconditionToTests(
    preconditionId: string,
    testIds: string[]
  ): Promise<any[]> {
    const results: any[] = [];
    for (const testId of testIds) {
      try {
        const result = await this.addPreconditionToTest(preconditionId, testId);
        results.push({ testId, success: true, result });
      } catch (error: any) {
        results.push({ testId, success: false, error: error.message });
      }
    }
    return results;
  }

  // Add tests to a test plan (numeric IDs required)
  public async addTestsToTestPlan(
    planId: string,
    testIds: string[]
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        addTestsToTestPlan(
          issueId: "${planId}"
          testIssueIds: [${testIds.map(id => `"${id}"`).join(', ')}]
        ) {
          addedTests
          warning
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.addTestsToTestPlan;
    } catch (error: any) {
      console.error(`Failed to add tests to plan ${planId}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Add tests to a test set (numeric IDs required)
  public async addTestsToTestSet(
    setId: string,
    testIds: string[]
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        addTestsToTestSet(
          issueId: "${setId}"
          testIssueIds: [${testIds.map(id => `"${id}"`).join(', ')}]
        ) {
          addedTests
          warning
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.addTestsToTestSet;
    } catch (error: any) {
      console.error(`Failed to add tests to set ${setId}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Update Gherkin/BDD definition for a Cucumber-type test
  // issueId must be numeric Jira issue ID
  public async updateGherkinDefinition(
    issueId: string,
    gherkin: string
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        updateGherkinTestDefinition(
          issueId: "${issueId}"
          gherkin: ${JSON.stringify(gherkin)}
        ) {
          issueId
          gherkin
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.updateGherkinTestDefinition;
    } catch (error: any) {
      console.error(
        `Failed to update Gherkin for ${issueId}:`,
        error.message
      );
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Update test type via GraphQL (e.g. Manual → Cucumber or Generic)
  public async updateTestType(
    issueId: string,
    testType: string
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        updateTestType(
          issueId: "${issueId}"
          testType: { name: ${JSON.stringify(testType)} }
        ) {
          issueId
          testType {
            name
            kind
          }
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data.updateTestType;
    } catch (error: any) {
      console.error(`Failed to update test type for ${issueId}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Update precondition type and definition
  public async updatePreconditionDefinition(
    issueId: string,
    preconditionType: string,
    definition: string
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        updatePrecondition(
          issueId: "${issueId}"
          data: {
            preconditionType: { name: ${JSON.stringify(preconditionType)} }
            definition: ${JSON.stringify(definition)}
          }
        ) {
          issueId
          preconditionType {
            name
          }
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.updatePrecondition;
    } catch (error: any) {
      console.error(
        `Failed to update precondition definition for ${issueId}:`,
        error.message
      );
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Get test execution details including test runs via GraphQL
  public async getTestExecutionDetails(testExecKey: string): Promise<any> {
    const token = await this.authenticate();

    try {
      const query = `
        query {
          getTestExecutions(jql: ${JSON.stringify(`key = ${testExecKey}`)}, limit: 1) {
            results {
              issueId
              testEnvironments
              testRuns(limit: 100) {
                results {
                  id
                  status { name }
                  comment
                  startedOn
                  finishedOn
                  executedById
                  defects
                  test { issueId jira(fields: ["key"]) }
                }
              }
            }
          }
        }
      `;

      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      const results = response.data.data.getTestExecutions?.results || [];
      return results.length > 0 ? results[0] : null;
    } catch (error: any) {
      console.error(`Failed to fetch test execution ${testExecKey}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Get test plan associated tests via GraphQL
  public async getTestPlanTests(testPlanKey: string): Promise<string[]> {
    const token = await this.authenticate();

    try {
      const query = `
        query {
          getTestPlans(jql: ${JSON.stringify(`key = ${testPlanKey}`)}, limit: 1) {
            results {
              issueId
              tests(limit: 100) {
                results {
                  issueId
                  jira(fields: ["key"])
                }
              }
            }
          }
        }
      `;

      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      const results = response.data.data.getTestPlans?.results || [];
      if (results.length === 0) return [];

      const tests = results[0].tests?.results || [];
      return tests.map((t: any) => {
        const jira = typeof t.jira === 'string' ? JSON.parse(t.jira) : t.jira;
        return jira?.key || t.issueId;
      });
    } catch (error: any) {
      console.error(`Failed to fetch test plan tests for ${testPlanKey}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Get test set associated tests via GraphQL
  public async getTestSetTests(testSetKey: string): Promise<string[]> {
    const token = await this.authenticate();

    try {
      const query = `
        query {
          getTestSets(jql: ${JSON.stringify(`key = ${testSetKey}`)}, limit: 1) {
            results {
              issueId
              tests(limit: 100) {
                results {
                  issueId
                  jira(fields: ["key"])
                }
              }
            }
          }
        }
      `;

      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      const results = response.data.data.getTestSets?.results || [];
      if (results.length === 0) return [];

      const tests = results[0].tests?.results || [];
      return tests.map((t: any) => {
        const jira = typeof t.jira === 'string' ? JSON.parse(t.jira) : t.jira;
        return jira?.key || t.issueId;
      });
    } catch (error: any) {
      console.error(`Failed to fetch test set tests for ${testSetKey}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Add tests to a test execution via GraphQL
  public async addTestsToTestExecution(
    execId: string,
    testIds: string[]
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        addTestsToTestExecution(
          issueId: "${execId}"
          testIssueIds: [${testIds.map(id => `"${id}"`).join(', ')}]
        ) {
          addedTests
          warning
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data.addTestsToTestExecution;
    } catch (error: any) {
      console.error(`Failed to add tests to execution ${execId}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Add test execution to a test plan via GraphQL
  public async addTestExecutionToTestPlan(
    planId: string,
    execIds: string[]
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        addTestExecutionsToTestPlan(
          issueId: "${planId}"
          testExecIssueIds: [${execIds.map(id => `"${id}"`).join(', ')}]
        ) {
          addedTestExecutions
          warning
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data.addTestExecutionsToTestPlan;
    } catch (error: any) {
      console.error(`Failed to add executions to plan ${planId}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Add test environments to a test execution via GraphQL
  public async addTestEnvironments(
    execId: string,
    environments: string[]
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        addTestEnvironmentsToTestExecution(
          issueId: "${execId}"
          testEnvironments: [${environments.map(e => `"${e}"`).join(', ')}]
        ) {
          addedTestEnvironments
          warning
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data.addTestEnvironmentsToTestExecution;
    } catch (error: any) {
      console.error(`Failed to add environments to execution ${execId}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Get test run ID for a specific test within an execution
  // Note: getTestRun requires numeric Jira issue IDs, not keys
  public async getTestRunId(testExecKey: string, testKey: string, axiosInstance?: AxiosInstance): Promise<string | null> {
    const token = await this.authenticate();

    try {
      // Resolve keys to numeric IDs if they look like keys (contain letters)
      let testIssueId = testKey;
      let testExecIssueId = testExecKey;
      if (axiosInstance && /[A-Za-z]/.test(testKey)) {
        testIssueId = await this.resolveIssueId(axiosInstance, testKey);
      }
      if (axiosInstance && /[A-Za-z]/.test(testExecKey)) {
        testExecIssueId = await this.resolveIssueId(axiosInstance, testExecKey);
      }

      const query = `
        query {
          getTestRun(testIssueId: ${JSON.stringify(testIssueId)}, testExecIssueId: ${JSON.stringify(testExecIssueId)}) {
            id
            status { name }
          }
        }
      `;

      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data.getTestRun?.id || null;
    } catch (error: any) {
      console.error(`Failed to get test run for ${testKey} in ${testExecKey}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Update test run status via GraphQL
  public async updateTestRunStatus(
    testRunId: string,
    status: string
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        updateTestRunStatus(
          id: "${testRunId}"
          status: ${JSON.stringify(status)}
        )
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data.updateTestRunStatus;
    } catch (error: any) {
      console.error(`Failed to update test run ${testRunId}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Update test run comment via GraphQL
  public async updateTestRunComment(
    testRunId: string,
    comment: string
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        updateTestRunComment(
          id: "${testRunId}"
          comment: ${JSON.stringify(comment)}
        )
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data.updateTestRunComment;
    } catch (error: any) {
      console.error(`Failed to update test run comment ${testRunId}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Add defects to a test run via GraphQL
  public async addDefectsToTestRun(
    testRunId: string,
    defectKeys: string[]
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        addDefectsToTestRun(
          id: "${testRunId}"
          issues: [${defectKeys.map(k => `"${k}"`).join(', ')}]
        ) {
          addedDefects
          warning
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data.addDefectsToTestRun;
    } catch (error: any) {
      console.error(`Failed to add defects to test run ${testRunId}:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // ── Folder Operations ──────────────────────────────────────────────

  // Get folder tree from Xray repository (Test or Precondition)
  public async getFolderTree(
    projectId: string,
    path: string = '/',
    repositoryType: 'test' | 'precondition' = 'test'
  ): Promise<any> {
    const token = await this.authenticate();

    const queryName = repositoryType === 'precondition' ? 'getPreconditionFolder' : 'getFolder';
    const query = `
      query {
        ${queryName}(projectId: "${projectId}", path: ${JSON.stringify(path)}) {
          name
          path
          testCount
          folders
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      const data = response.data.data[queryName];

      // folders field is a JSON scalar — parse it
      if (data && typeof data.folders === 'string') {
        try {
          data.folders = JSON.parse(data.folders);
        } catch {
          // leave as-is if not valid JSON
        }
      }

      return data;
    } catch (error: any) {
      console.error(`Failed to get folder tree:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Get tests in a specific folder
  public async getTestsInFolder(
    projectId: string,
    folderPath: string,
    options?: { jql?: string; limit?: number; includeSteps?: boolean }
  ): Promise<any> {
    const token = await this.authenticate();

    const limit = options?.limit || 50;
    const jqlFilter = options?.jql ? `, jql: ${JSON.stringify(options.jql)}` : '';
    const stepsField = options?.includeSteps
      ? `steps { id action data result }`
      : '';

    const query = `
      query {
        getTests(
          limit: ${limit}
          ${jqlFilter}
          folder: { projectId: "${projectId}", path: ${JSON.stringify(folderPath)} }
        ) {
          total
          results {
            issueId
            jira(fields: ["key", "summary", "status", "priority", "labels", "assignee"])
            testType { name kind }
            ${stepsField}
            preconditions(limit: 50) {
              results {
                issueId
                jira(fields: ["key", "summary"])
              }
            }
          }
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.getTests;
    } catch (error: any) {
      console.error(`Failed to get tests in folder:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Add tests to a folder (numeric issue IDs required)
  public async addTestsToFolder(
    projectId: string,
    path: string,
    testIssueIds: string[]
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        addTestsToFolder(
          projectId: "${projectId}"
          path: ${JSON.stringify(path)}
          testIssueIds: [${testIssueIds.map(id => `"${id}"`).join(', ')}]
        ) {
          folder {
            name
            path
          }
          warnings
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.addTestsToFolder;
    } catch (error: any) {
      console.error(`Failed to add tests to folder:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Update a precondition's folder in the Precondition Repository
  public async updatePreconditionFolder(
    issueId: string,
    folderPath: string
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        updatePreconditionFolder(
          issueId: "${issueId}"
          folder: ${JSON.stringify(folderPath)}
        ) {
          issueId
          folder {
            name
            path
          }
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.updatePreconditionFolder;
    } catch (error: any) {
      console.error(`Failed to update precondition folder:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Move a test to a different folder in the Test Repository
  public async moveTestToFolder(
    issueId: string,
    destinationPath: string
  ): Promise<any> {
    const token = await this.authenticate();

    const mutation = `
      mutation {
        updateTestFolder(
          issueId: "${issueId}"
          folder: ${JSON.stringify(destinationPath)}
        ) {
          issueId
          folder {
            name
            path
          }
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://xray.cloud.getxray.app/api/v2/graphql',
        { query: mutation },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data.updateTestFolder;
    } catch (error: any) {
      console.error(`Failed to move test to folder:`, error.message);
      if (error.response?.status === 401) {
        this.token = null;
      }
      throw error;
    }
  }

  // Export Cucumber features
  public async exportCucumberFeatures(testKeys?: string[]): Promise<string> {
    const token = await this.authenticate();

    try {
      const params = testKeys ? `?keys=${testKeys.join(';')}` : '';
      const response = await this.axiosInstance.get(`/export/cucumber${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        responseType: 'text',
      });

      return response.data;
    } catch (error: any) {
      console.error('Failed to export Cucumber features:', error.message);
      
      if (error.response?.status === 401) {
        this.token = null;
      }
      
      throw error;
    }
  }
}

