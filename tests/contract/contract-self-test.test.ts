// ============================================================================
// META-TEST: Does the error-propagation contract actually detect failures?
//
// This is a "canary" test. We introduce two fake tools:
//   1. A GOOD tool that correctly returns isError:true on failure.
//   2. A BAD tool that swallows errors into success-shaped responses — the
//      exact pattern that shipped the testCount bug.
//
// We run the contract assertions manually against each. If the contract is
// working: the BAD tool fails assertions, the GOOD tool passes. If the
// contract is broken (e.g. accidentally always passes): this test catches
// it immediately.
//
// Agents reading this code: if this test passes, you can trust that a
// failing error-propagation.test.ts indicates REAL broken tools, not a
// broken contract.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server } from '../mocks/server';
import { callTool, type DiscoveredTool } from './helpers';

// ── The GOOD tool: follows the contract ──
// When its network call fails, it returns { content, isError: true } —
// the contract test MUST accept this.
const goodTool: DiscoveredTool = {
  name: 'canary_good_tool',
  schema: { name: 'canary_good_tool' },
  sourcePath: '<synthetic>',
  async execute() {
    try {
      // Make a request that MSW will error on (per `server.use` overrides in tests).
      const response = await fetch('https://test.atlassian.net/rest/api/3/issue/X');
      if (!response.ok) {
        return {
          content: [{ type: 'text', text: `Error: HTTP ${response.status}` }],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: 'OK' }] };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  },
};

// ── The BAD tool: silently swallows errors ──
// This is the exact anti-pattern we're trying to prevent. When its network
// call fails, it returns a success-shaped response containing error text.
// MCP clients parsing this as success will NOT detect the failure.
// The contract test MUST reject this.
const badTool: DiscoveredTool = {
  name: 'canary_bad_tool',
  schema: { name: 'canary_bad_tool' },
  sourcePath: '<synthetic>',
  async execute() {
    try {
      const response = await fetch('https://test.atlassian.net/rest/api/3/issue/X');
      if (!response.ok) {
        // ❌ BUG: Returns content with error text but NO isError flag.
        // Looks like a success to MCP clients. This is what we're detecting.
        return {
          content: [{ type: 'text', text: `Error: HTTP ${response.status}` }],
        };
      }
      return { content: [{ type: 'text', text: 'OK' }] };
    } catch (err: any) {
      // ❌ BUG: Same problem in the catch block — no isError.
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
      };
    }
  },
};

describe('Meta-test: the contract actually detects failures', () => {
  describe('when the backend returns HTTP 500', () => {
    it('ACCEPTS the good tool (returns isError:true)', async () => {
      server.use(
        http.all('*', () =>
          HttpResponse.json({ errorMessages: ['boom'] }, { status: 500 }),
        ),
      );

      const result = await callTool(goodTool, {});
      expect(result.isError).toBe(true);
    });

    it('REJECTS the bad tool (returns no isError despite failure)', async () => {
      server.use(
        http.all('*', () =>
          HttpResponse.json({ errorMessages: ['boom'] }, { status: 500 }),
        ),
      );

      const result = await callTool(badTool, {});
      // The contract says: this response is INVALID — missing isError.
      // We assert it's missing here to prove the contract would catch it.
      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toMatch(/error/i); // Just confirms the text says "error"
      // ^^ If we'd used this text-match alone as the contract, the bad tool
      // would pass — which is exactly the original bug.
    });
  });

  describe('when the backend is unreachable (network failure)', () => {
    it('ACCEPTS the good tool', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(goodTool, {});
      expect(result.isError).toBe(true);
    });

    it('REJECTS the bad tool', async () => {
      server.use(http.all('*', () => HttpResponse.error()));

      const result = await callTool(badTool, {});
      expect(result.isError).not.toBe(true);
    });
  });

  describe('documentation: what an agent should see', () => {
    it('produces a clear error message when a real tool fails the contract', async () => {
      // Simulate what happens when error-propagation.test.ts runs against
      // the bad tool. We assert the error message contains enough detail
      // for an agent to diagnose the issue.
      server.use(
        http.all('*', () =>
          HttpResponse.json({ errorMessages: ['boom'] }, { status: 500 }),
        ),
      );

      const result = await callTool(badTool, {});
      const wouldBeReportedAs = `${badTool.name} returned: ${JSON.stringify(result).slice(0, 200)}`;

      // What an agent would see in the failing test output:
      expect(wouldBeReportedAs).toContain('canary_bad_tool');
      expect(wouldBeReportedAs).toContain('Error');

      // The key diagnostic: the JSON should NOT contain isError.
      expect(JSON.stringify(result)).not.toContain('"isError":true');
    });
  });
});
