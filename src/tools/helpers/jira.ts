/**
 * Xray GraphQL returns the `jira(fields: [...])` selection as a JSON **string**,
 * not as an object — because it's typed as a JSON scalar in the schema.
 *
 * Call sites that forget to parse get silent data loss: `obj.jira?.key`
 * returns `undefined` on a string, and downstream code falls through to
 * "Unknown"/"No summary" defaults. Tests pass because mocks used to return
 * objects; production broke because the real API returns strings.
 *
 * Use this helper everywhere you access a `jira` field from Xray GraphQL.
 */
export function parseJira(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, any>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, any>;
  return {};
}
