# Oppizi AI Project Security Rules

These rules apply to all AI projects in the `oppizi` GitHub org (repos tagged `oppizi-ai-project`).
They are enforced by Greptile on every PR as a contextual review layer alongside the automated
security gate in `compose/.github/workflows/ai-security.yml`.

**Status: placeholder / test phase.** The rules below are intentionally minimal while the
infrastructure is being validated end-to-end. The full rule set will be populated once Matheus
delivers the risk scaffold from the 2026-04-22 meeting.

---

## 1. No committed `.env` files

AI projects must not commit `.env`, `.env.local`, `.env.production`, or any other `.env.*` variant
to the repository. Use `.env.example` with placeholder values instead. Any real credential that
appears in a `.env` file belongs in the team secrets manager, not in git history.

## 2. No hardcoded credentials in source files

API keys, database passwords, tokens, and connection strings must be read from environment
variables — never written as literal values in source code, config files, or scripts. This
applies even if the value looks like a placeholder, test value, or temporary credential.

Examples of violations:
- `const apiKey = "sk-..."`  (literal API key)
- `DATABASE_URL=postgres://user:real_password@host/db` in any file other than `.env.example`
- Real credentials left in a comment ("testing with...")

Correct pattern: `const apiKey = process.env.API_KEY`

---

## TODO — rules to add after Matheus's risk scaffold arrives

The following areas need rules but are intentionally deferred until the risk scaffold arrives
to avoid over-blocking legitimate code patterns:

- Database access patterns (direct driver use vs. API layer vs. restricted DB user)
- MCP server authentication requirements
- API endpoint authentication requirements
- Deployment target restrictions
- CORS policy
- PII handling and logging
- Production credential use in development

**Design rule for future credential-pattern checks:** the CI workflow's `grep` is line-based.
Any high-entropy credential pattern added later (API keys, tokens, etc.) must scan the diff
as a single blob — not line-by-line — otherwise an attacker can split a literal across two
lines to bypass the check. Either use python `re.DOTALL` / `pcregrep -M`, or land the rule
here in Greptile (which has full code context) instead of in the deterministic CI workflow.

Reference: 2026-04-22 AI Dev Tech Review meeting, Matheus Bortoletto's action item
*"Draft Security Risks: Scaffold a list of risks to be addressed by new developer skills."*
