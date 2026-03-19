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
      // Use GraphQL to get test details - this is the correct way for Xray Cloud
      const query = `
        query {
          getTest(issueId: "${testKey}") {
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

      return response.data.data.getTest;
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

