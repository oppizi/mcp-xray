// ============================================================================
// CONTRACT: GraphQL queries must use the correct Xray schema field names.
//
// This is a source-code audit complementing the runtime mock validation in
// `tests/mocks/handlers/xray-graphql.ts`. Why both?
//   - Mock validation catches bugs during test execution (runtime).
//   - Source audit catches bugs even if no test exercises the query path.
//
// The audit maintains a list of KNOWN-WRONG field names that were discovered
// in prior incidents (e.g., testCount → should be testsCount). If any of
// these names reappear in source, this test fails with a link to the fix.
//
// Add new entries here when you fix a field-name bug — it prevents the
// same mistake from being re-introduced later.
// ============================================================================

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_ROOT = path.resolve(__dirname, '../../src');

/**
 * Fields that DO NOT exist on the real Xray Cloud GraphQL schema, but have
 * been mistakenly used in code. Each entry documents the fix.
 *
 * When adding: include the type it was on, the correct field name, and the
 * commit/issue where the fix landed — so future regressions get context.
 */
const KNOWN_WRONG_FIELDS: Array<{
  wrong: string;
  type: string;
  correct: string;
  fixRef: string;
}> = [
  {
    wrong: 'testCount',
    type: 'FolderResults',
    correct: 'testsCount',
    fixRef: 'fix(folders): use correct Xray schema field names (commit 9a5ecfd)',
  },
  // Add future discoveries here.
];

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
 * Search for a wrong field name inside GraphQL-looking template literals.
 *
 * Approach: find every backtick-delimited string in the source. For each,
 * check if it contains a `query` or `mutation` keyword (GraphQL indicator)
 * AND the wrong field name as a whole word on its own indented line.
 * Returns line numbers relative to the original source.
 */
function findWrongFieldUsage(
  src: string,
  wrong: string,
): Array<{ line: number; snippet: string }> {
  const violations: Array<{ line: number; snippet: string }> = [];

  // Find all backtick-delimited strings. Non-greedy match, allow newlines.
  // We don't attempt to handle escaped backticks perfectly — for source
  // that defines GraphQL queries, escaped backticks are essentially never
  // used, so this is good enough.
  const backtickRegex = /`([\s\S]*?)`/g;
  let match: RegExpExecArray | null;

  while ((match = backtickRegex.exec(src)) !== null) {
    const template = match[1];

    // Only consider template literals that look like GraphQL
    if (!/\b(query|mutation)\b/.test(template)) continue;

    // Within that literal, look for the wrong field name as a whole word
    // on a line that isn't a JS comment
    const matchStartOffset = match.index + 1; // skip opening backtick
    const templateLines = template.split('\n');

    // Precompute line numbers in the source for each template line
    const preSrc = src.slice(0, matchStartOffset);
    const lineOfTemplateStart = preSrc.split('\n').length; // 1-indexed line number

    for (let i = 0; i < templateLines.length; i++) {
      const templateLine = templateLines[i];
      const stripped = templateLine.trim();
      if (stripped.startsWith('//') || stripped.startsWith('*')) continue;

      // Strip trailing JS-style comments before matching
      const codeOnly = templateLine.replace(/\/\/.*$/, '');
      const re = new RegExp(`\\b${wrong}\\b`);
      if (re.test(codeOnly)) {
        violations.push({
          line: lineOfTemplateStart + i,
          snippet: templateLine.trim(),
        });
      }
    }
  }

  return violations;
}

describe('Contract: GraphQL schema field names (source audit)', () => {
  const tsFiles = collectTsFiles(SRC_ROOT);

  it('discovered source files to audit', () => {
    expect(tsFiles.length).toBeGreaterThan(0);
  });

  describe('no queries use known-wrong field names', () => {
    // One test case per known-wrong field. This makes failures legible:
    // each failing field name appears as its own test in the report.
    for (const entry of KNOWN_WRONG_FIELDS) {
      it(`does not use "${entry.wrong}" (should be "${entry.correct}" on ${entry.type})`, () => {
        const allViolations: Array<{ file: string; line: number; snippet: string }> = [];

        for (const file of tsFiles) {
          const src = fs.readFileSync(file, 'utf-8');
          const violations = findWrongFieldUsage(src, entry.wrong);
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
            `"${entry.wrong}" is not a valid field on ${entry.type}. ` +
              `Use "${entry.correct}" instead. ` +
              `See: ${entry.fixRef}\n\n` +
              `Violations:\n` +
              lines.join('\n'),
          );
        }
      });
    }
  });
});
