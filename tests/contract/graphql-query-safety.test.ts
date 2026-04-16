// ============================================================================
// CONTRACT: GraphQL queries must escape all user-controlled string values.
//
// This is a source-code audit, not a runtime test. We scan every .ts file
// under src/ looking for GraphQL template literals that interpolate a variable
// directly inside a double-quoted string argument WITHOUT wrapping it in
// JSON.stringify().
//
// Two tests:
//   1. JQL arguments — highest risk (JQL injection, attacker-controlled).
//   2. All GraphQL string args — lower risk but still causes malformed
//      queries if the value contains a quote character.
//
// Why it matters:
//   - If the value contains a `"` or `\`, the query becomes malformed and
//     the real API returns a parse error (200 OK + errors[]).
//   - Runtime mocks (MSW) don't parse the query, so they return mock data
//     regardless of query validity. Production silently 400s.
//
// The rule: every interpolated string argument MUST use JSON.stringify(), e.g.
//     jql: ${JSON.stringify(`key = ${testKey}`)}
//     issueId: ${JSON.stringify(issueId)}
//   NOT
//     jql: "key = ${testKey}"
//     issueId: "${issueId}"
// ============================================================================

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_ROOT = path.resolve(__dirname, '../../src');

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
 * Find lines that look like: `jql: "... ${variable} ..."`
 * — raw interpolation inside a double-quoted JQL string literal.
 *
 * The SAFE pattern looks like: `jql: ${JSON.stringify(...)}` — no quotes
 * around the interpolation, because JSON.stringify produces its own quotes.
 *
 * We return { file, line, snippet } for each violation.
 */
function findUnsafeJqlInterpolations(
  file: string,
  src: string,
): Array<{ line: number; snippet: string }> {
  const violations: Array<{ line: number; snippet: string }> = [];
  const lines = src.split('\n');

  // Match: jql: "..${...}.." — the literal chars `jql: "`, then anything that
  // includes a `${` interpolation, then more content up to the closing `"`.
  // We require the backtick-interpolation syntax inside the double-quoted string.
  //
  // Explanation: JSON.stringify's output is NEVER double-quoted in source —
  // it's an expression, not a literal. So `jql: "${...}"` is ALWAYS the
  // unsafe pattern. `jql: ${JSON.stringify(...)}` is safe.
  const UNSAFE = /\bjql\s*:\s*"[^"\n]*\$\{/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (UNSAFE.test(line)) {
      violations.push({ line: i + 1, snippet: line.trim() });
    }
  }
  return violations;
}

describe('Contract: GraphQL query safety (source audit)', () => {
  const tsFiles = collectTsFiles(SRC_ROOT);

  it('discovered source files to audit', () => {
    expect(tsFiles.length).toBeGreaterThan(0);
  });

  it('no GraphQL queries use unescaped string argument interpolation', () => {
    // Broader check: ANY GraphQL argument like `argName: "${variable}"`
    // is unsafe. This catches issueId, projectId, stepId, testRunId, etc.
    // — not just JQL. Lower risk than JQL injection (these are typically
    // numeric IDs from Jira), but still causes malformed queries if the
    // value ever contains a quote character.
    //
    // Pattern caught: `identifier: "${...}"` inside backtick strings
    // containing `query` or `mutation`.
    // Pattern allowed: `identifier: ${JSON.stringify(...)}`
    // Pattern allowed: `identifier: "${literalString}"` (no ${} interpolation)
    const allViolations: Array<{ file: string; line: number; snippet: string }> = [];

    // Match: someArg: "${interpolation}" inside a GraphQL query
    // This catches patterns like: issueId: "${issueId}"
    const UNSAFE_ARG = /\w+\s*:\s*"[^"\n]*\$\{[^}]+\}[^"\n]*"/;

    for (const file of tsFiles) {
      const src = fs.readFileSync(file, 'utf-8');

      // Find all backtick template literals that look like GraphQL
      const backtickRegex = /`([\s\S]*?)`/g;
      let match: RegExpExecArray | null;

      while ((match = backtickRegex.exec(src)) !== null) {
        const template = match[1];
        if (!/\b(query|mutation)\b/.test(template)) continue;

        const matchStartOffset = match.index + 1;
        const preSrc = src.slice(0, matchStartOffset);
        const lineOfTemplateStart = preSrc.split('\n').length;
        const templateLines = template.split('\n');

        for (let i = 0; i < templateLines.length; i++) {
          const line = templateLines[i];
          if (UNSAFE_ARG.test(line)) {
            allViolations.push({
              file: path.relative(SRC_ROOT, file),
              line: lineOfTemplateStart + i,
              snippet: line.trim(),
            });
          }
        }
      }
    }

    if (allViolations.length > 0) {
      const lines = allViolations.map(
        (v) => `  - src/${v.file}:${v.line}\n      ${v.snippet}`,
      );
      throw new Error(
        `Found ${allViolations.length} GraphQL queries with unescaped string interpolation.\n` +
          `A value containing a quote character will produce a malformed query.\n\n` +
          `Fix: use JSON.stringify() for ALL interpolated string arguments:\n` +
          `    issueId: \${JSON.stringify(issueId)}\n` +
          `NOT:\n` +
          `    issueId: "\${issueId}"\n\n` +
          `Violations:\n` +
          lines.join('\n'),
      );
    }
  });

  it('no GraphQL queries use unescaped JQL string interpolation', () => {
    const allViolations: Array<{ file: string; line: number; snippet: string }> = [];

    for (const file of tsFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      const violations = findUnsafeJqlInterpolations(file, src);
      for (const v of violations) {
        allViolations.push({
          file: path.relative(SRC_ROOT, file),
          line: v.line,
          snippet: v.snippet,
        });
      }
    }

    if (allViolations.length > 0) {
      const lines = allViolations.map(
        (v) => `  - src/${v.file}:${v.line}\n      ${v.snippet}`,
      );
      throw new Error(
        `Found ${allViolations.length} GraphQL queries with unescaped JQL interpolation.\n` +
          `These will break against the real API if the key contains a quote or backslash, ` +
          `and allow JQL injection for attacker-controlled values.\n\n` +
          `Fix: wrap the interpolation in JSON.stringify(), e.g.\n` +
          `    jql: \${JSON.stringify(\`key = \${testKey}\`)}\n` +
          `NOT:\n` +
          `    jql: "key = \${testKey}"\n\n` +
          `Violations:\n` +
          lines.join('\n'),
      );
    }
  });
});
