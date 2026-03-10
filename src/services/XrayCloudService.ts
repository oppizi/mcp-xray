import axios, { AxiosInstance } from 'axios';
import { Config, XrayCloudToken, XRAY_CREDENTIALS_SETUP_GUIDE } from '../types.js';

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
        XRAY_CREDENTIALS_SETUP_GUIDE + '\n\n' +
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
  public async importCucumberResults(results: any): Promise<any> {
    const token = await this.authenticate();

    try {
      const response = await this.axiosInstance.post('/import/execution/cucumber', results, {
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
  public async importJUnitResults(xmlContent: string): Promise<any> {
    const token = await this.authenticate();

    try {
      const response = await this.axiosInstance.post('/import/execution/junit', xmlContent, {
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
  public async importTestNGResults(xmlContent: string): Promise<any> {
    const token = await this.authenticate();

    try {
      const response = await this.axiosInstance.post('/import/execution/testng', xmlContent, {
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
  public async importNUnitResults(xmlContent: string): Promise<any> {
    const token = await this.authenticate();

    try {
      const response = await this.axiosInstance.post('/import/execution/nunit', xmlContent, {
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
  public async importRobotResults(xmlContent: string): Promise<any> {
    const token = await this.authenticate();

    try {
      const response = await this.axiosInstance.post('/import/execution/robot', xmlContent, {
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
  public async importBehaveResults(results: any): Promise<any> {
    const token = await this.authenticate();

    try {
      const response = await this.axiosInstance.post('/import/execution/behave', results, {
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

  // Import Cucumber feature file
  public async importFeatureFile(featureContent: string): Promise<any> {
    const token = await this.authenticate();

    try {
      const response = await this.axiosInstance.post('/import/feature', featureContent, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
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

