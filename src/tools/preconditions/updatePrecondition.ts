import { AxiosInstance } from 'axios';
import { Config } from '../../types.js';
import { XrayCloudService } from '../../services/XrayCloudService.js';

export const updatePreconditionTool = {
  name: 'update_precondition',
  description:
    'Update a precondition\'s metadata (summary, description, labels) via Jira REST API, and/or its definition and type via Xray Cloud GraphQL API.',
  inputSchema: {
    type: 'object',
    properties: {
      precondition_key: {
        type: 'string',
        description: 'Precondition issue key (e.g., PAD-29700)',
      },
      summary: {
        type: 'string',
        description: 'New summary/title (optional)',
      },
      description: {
        type: 'string',
        description: 'New description (optional)',
      },
      labels: {
        type: 'string',
        description:
          'Comma-separated labels to SET (replaces all existing labels). Use add_labels/remove_labels for incremental changes.',
      },
      add_labels: {
        type: 'string',
        description: 'Comma-separated labels to ADD to existing labels (optional)',
      },
      remove_labels: {
        type: 'string',
        description: 'Comma-separated labels to REMOVE from existing labels (optional)',
      },
      precondition_type: {
        type: 'string',
        description: 'New precondition type: Manual or Cucumber (optional)',
        enum: ['Manual', 'Cucumber'],
      },
      definition: {
        type: 'string',
        description:
          'New precondition definition/steps text. For Manual type, plain text steps. For Cucumber, Given/When/Then syntax.',
      },
    },
    required: ['precondition_key'],
  },
};

export async function updatePrecondition(
  axiosInstance: AxiosInstance,
  config: Config,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const {
      precondition_key,
      summary,
      description,
      labels,
      add_labels,
      remove_labels,
      precondition_type,
      definition,
    } = args;

    console.error(`Updating precondition: ${precondition_key}`);

    const updates: string[] = [];

    // Update Jira fields via REST API
    const jiraFields: any = {};
    if (summary) jiraFields.summary = summary;
    if (description) {
      jiraFields.description = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: description }],
          },
        ],
      };
    }
    if (labels) {
      jiraFields.labels = labels.split(',').map((l: string) => l.trim());
    }

    if (Object.keys(jiraFields).length > 0) {
      await axiosInstance.put(`/rest/api/3/issue/${precondition_key}`, {
        fields: jiraFields,
      });
      updates.push(
        ...Object.keys(jiraFields).map((f) => f.charAt(0).toUpperCase() + f.slice(1))
      );
    }

    // Handle incremental label changes
    if (add_labels || remove_labels) {
      const currentIssue = await axiosInstance.get(
        `/rest/api/3/issue/${precondition_key}?fields=labels`
      );
      let currentLabels: string[] = currentIssue.data.fields.labels || [];

      if (add_labels) {
        const toAdd = add_labels.split(',').map((l: string) => l.trim());
        currentLabels = [...new Set([...currentLabels, ...toAdd])];
      }
      if (remove_labels) {
        const toRemove = remove_labels.split(',').map((l: string) => l.trim());
        currentLabels = currentLabels.filter((l: string) => !toRemove.includes(l));
      }

      await axiosInstance.put(`/rest/api/3/issue/${precondition_key}`, {
        fields: { labels: currentLabels },
      });
      updates.push('Labels');
    }

    // Update Xray-specific fields via GraphQL
    if (definition || precondition_type) {
      const xrayService = XrayCloudService.getInstance(config);
      if (xrayService.isConfigured()) {
        const issueId = await xrayService.resolveIssueId(
          axiosInstance,
          precondition_key
        );
        const defType = precondition_type || 'Manual';
        const def = definition || '';
        if (definition) {
          await xrayService.updatePreconditionDefinition(issueId, defType, def);
          updates.push('Definition');
        }
        if (precondition_type && !definition) {
          await xrayService.updatePreconditionDefinition(issueId, defType, '');
          updates.push('Precondition Type');
        }
      } else {
        updates.push('(Skipped definition/type — Xray Cloud API not configured)');
      }
    }

    if (updates.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No updates provided for ${precondition_key}. Specify at least one field to update.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Successfully updated ${precondition_key}\n\n**Updated fields:** ${updates.join(', ')}\n\nView at: ${config.JIRA_BASE_URL}/browse/${precondition_key}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('Error updating precondition:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error updating precondition: ${
            error.response?.data?.errorMessages?.[0] ||
            (error.response?.data?.errors
              ? JSON.stringify(error.response.data.errors)
              : error.message || 'Unknown error')
          }`,
        },
      ],
      isError: true,
    };
  }
}
