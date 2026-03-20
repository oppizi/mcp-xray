import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import {
  createXrayIssue,
  linkItemsViaRaven,
  parseCommaSeparated,
  formatJiraError,
} from '../../utils/jiraHelpers.js';

export const createTestSetTool = {
  name: 'create_test_set',
  description:
    'Create a new Xray Test Set issue in Jira. A test set is a flat collection of tests, useful for organizing related test cases (e.g., all login tests, all regression tests for a feature). Optionally adds tests to the set after creation.',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'Jira project key (e.g., PAD)',
      },
      summary: {
        type: 'string',
        description: 'Test set name/summary',
      },
      description: {
        type: 'string',
        description: 'Test set description',
      },
      labels: {
        type: 'string',
        description: 'Comma-separated labels to apply',
      },
      tests: {
        type: 'string',
        description:
          'Comma-separated test keys to add to the set after creation (e.g., "PAD-100,PAD-101")',
      },
    },
    required: ['project_key', 'summary'],
  },
};

export async function createTestSet(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const labels = args.labels ? parseCommaSeparated(args.labels) : [];
    const testKeys = args.tests ? parseCommaSeparated(args.tests) : [];

    console.error(`Creating test set in project: ${args.project_key}`);

    const issue = await createXrayIssue(axiosInstance, config, {
      projectKey: args.project_key,
      issueTypeName: 'Test Set',
      summary: args.summary,
      description: args.description,
      labels,
    });

    // Add tests to the set if provided
    let addedTests = '';
    if (testKeys.length > 0) {
      try {
        await linkItemsViaRaven(axiosInstance, 'testset', issue.key, testKeys);
        addedTests = `\n**Tests Added:** ${testKeys.join(', ')}`;
      } catch (addError: any) {
        console.error('Could not add tests to test set:', addError.message);
        addedTests = `\n**Warning:** Failed to add tests: ${addError.message}`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Successfully created test set: ${issue.key}

**Summary:** ${args.summary}
**Project:** ${args.project_key}
${labels.length > 0 ? `**Labels:** ${labels.join(', ')}` : ''}${addedTests}

View at: ${issue.url}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error creating test set:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error creating test set: ${formatJiraError(error)}`,
        },
      ],
    };
  }
}
