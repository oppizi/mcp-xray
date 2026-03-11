import { AxiosInstance } from 'axios';
import { Config, JiraIssue } from '../types.js';

/**
 * Create a Jira issue of a specific Xray type (Test Set, Pre-Condition, etc.)
 * Shared by createTestSet and createPrecondition to avoid duplicate issue creation logic.
 */
export async function createXrayIssue(
  axiosInstance: AxiosInstance,
  config: Config,
  options: {
    projectKey: string;
    issueTypeName: string | string[]; // string[] to try multiple names (e.g., ['Pre-Condition', 'Precondition'])
    summary: string;
    description?: string;
    labels?: string[];
  }
): Promise<{ key: string; id: string; url: string }> {
  const { projectKey, issueTypeName, summary, description = '', labels = [] } = options;

  // Get issue type ID
  const issueTypesResponse = await axiosInstance.get(
    `/rest/api/3/issue/createmeta`,
    {
      params: {
        projectKeys: projectKey,
        expand: 'projects.issuetypes.fields',
      },
    }
  );

  const project = issueTypesResponse.data.projects[0];
  const typeNames = Array.isArray(issueTypeName) ? issueTypeName : [issueTypeName];
  const issueType = project.issuetypes.find(
    (type: any) => typeNames.includes(type.name)
  );

  if (!issueType) {
    throw new Error(
      `${typeNames[0]} issue type not found in project ${projectKey}. Make sure Xray is installed.`
    );
  }

  const issueData: any = {
    fields: {
      project: { key: projectKey },
      summary,
      description: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: description }],
          },
        ],
      },
      issuetype: { id: issueType.id },
    },
  };

  if (labels.length > 0) {
    issueData.fields.labels = labels;
  }

  const response = await axiosInstance.post<JiraIssue>(
    '/rest/api/3/issue',
    issueData
  );

  return {
    key: response.data.key,
    id: response.data.id,
    url: `${config.JIRA_BASE_URL}/browse/${response.data.key}`,
  };
}

/**
 * Link items to an Xray entity via the Raven REST API.
 * Shared by addTestsToTestSet and addPreconditionToTest.
 */
export async function linkItemsViaRaven(
  axiosInstance: AxiosInstance,
  entityType: string, // e.g., 'testset', 'precondition'
  entityKey: string,
  itemKeys: string[]
): Promise<void> {
  await axiosInstance.post(
    `/rest/raven/1.0/api/${entityType}/${entityKey}/test`,
    { add: itemKeys }
  );
}

/**
 * Parse a comma-separated string into a trimmed array.
 */
export function parseCommaSeparated(value: string): string[] {
  return value.split(',').map((item: string) => item.trim());
}

/**
 * Format a Jira REST API error for user-friendly display.
 */
export function formatJiraError(error: any): string {
  return (
    error.response?.data?.errorMessages?.[0] ||
    (error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.response?.data?.error || error.message || 'Unknown error')
  );
}
