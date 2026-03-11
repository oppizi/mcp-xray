import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import {
  createXrayIssue,
  parseCommaSeparated,
  formatJiraError,
} from '../../utils/jiraHelpers.js';

export const createPreconditionTool = {
  name: 'create_precondition',
  description:
    'Create a new Xray Precondition issue in Jira. Preconditions define setup requirements that must be met before a test can run (e.g., "User must be logged in", "Database seeded with test data"). Preconditions can be linked to multiple tests.',
  inputSchema: {
    type: 'object',
    properties: {
      project_key: {
        type: 'string',
        description: 'Jira project key (e.g., PAD)',
      },
      summary: {
        type: 'string',
        description: 'Precondition name/summary',
      },
      description: {
        type: 'string',
        description: 'Detailed precondition description',
      },
      precondition_type: {
        type: 'string',
        description: 'Precondition type: Manual or Cucumber (default: Manual)',
        enum: ['Manual', 'Cucumber'],
        default: 'Manual',
      },
      labels: {
        type: 'string',
        description: 'Comma-separated labels to apply',
      },
    },
    required: ['project_key', 'summary'],
  },
};

export async function createPrecondition(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const labels = args.labels ? parseCommaSeparated(args.labels) : [];

    console.error(`Creating precondition in project: ${args.project_key}`);

    const issue = await createXrayIssue(axiosInstance, config, {
      projectKey: args.project_key,
      issueTypeName: ['Pre-Condition', 'Precondition'],
      summary: args.summary,
      description: args.description,
      labels,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Successfully created precondition: ${issue.key}

**Summary:** ${args.summary}
**Project:** ${args.project_key}
${labels.length > 0 ? `**Labels:** ${labels.join(', ')}` : ''}

View at: ${issue.url}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error creating precondition:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error creating precondition: ${formatJiraError(error)}`,
        },
      ],
    };
  }
}
