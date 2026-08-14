# Agentic Feature Kit for GitHub Copilot

This directory is a repository customization bundle, not a fabricated Copilot plugin. Release ZIPs
add a self-contained Node 20+ runtime, schemas, contracts, license, and a content-addressed
`bundle-manifest.json`; official discovery content remains under `.github/skills/` and
`.github/agents/`.

## Verify and use

1. Verify the release ZIP against the adjacent `SHA256SUMS` entry.
2. Extract it outside the destination repository and review `bundle-manifest.json`.
3. Copy the extracted `.github/skills/` and `.github/agents/` trees into the repository that should
   use them. Keep `runtime/` and `docs/` together in a stable project-owned tool directory, then
   update local invocation paths if that directory is not the extracted bundle root.
4. Verify the runtime offline before asking Copilot to use the skills:
   `node runtime/project-intelligence.cjs <repository-root>`, then
   `node runtime/stack-portability.cjs <repository-root>`, and pipe a JSON request to
   `node runtime/conditional-quality-gates.cjs` or `node runtime/workflow-orchestrator.cjs resume`.
5. Commit repository customization only through that repository's normal review process.

The bundle has no plugin manifest, credentials, provider calls, or forked business rules. Copilot
skills and agent profiles rely on the same shared runtime and contract versions as Codex and Claude.

The GitHub Copilot source bundle exposes evidence-backed Project Intelligence through the supported
repository skill and custom-agent surfaces. It profiles the repository, then resolves framework
layout and transport/mapping conventions through the fingerprint-bound Stack Portability contract
so Copilot does not guess target-specific helpers.

## Release status

| Contract | Value |
|---|---|
| Bundle version | `0.4.0` |
| Shared core version | `1.2.0` |
| Runtime | Self-contained Node.js 20+ CommonJS launchers |
| License | Apache-2.0 |
| Distribution stage | Deterministic repository bundle + ZIP archive |

The release directory and ZIP are self-contained and covered by clean-copy runtime smoke tests. The
source package in this repository intentionally omits generated runtime files; create them with
`npm run build:providers`. GitHub Copilot has no plugin manifest because its documented
customization unit is repository `.github` content.

## Bundle layout

```text
.github/skills/project-intelligence/SKILL.md
.github/agents/project-intelligence.agent.md
.github/skills/workflow-orchestrator/SKILL.md
.github/agents/workflow-orchestrator.agent.md
runtime/project-intelligence.cjs
runtime/stack-portability.cjs
runtime/conditional-quality-gates.cjs
runtime/workflow-orchestrator.cjs
docs/schemas/*
docs/roadmap/post-17-orchestrator-*.json
bundle-manifest.json
LICENSE
THIRD_PARTY_NOTICES.md
licenses/typescript-LICENSE.txt
README.md
```

The custom agent enables the portable `read`, `search`, and `execute` aliases. Its instructions
restrict `execute` to the documented read-only profiler command. The adapter contains no framework
or gate business rules.

## Source-checkout verification

From the Agentic Feature Kit repository root:

```bash
npm ci
npx tsx packages/core/src/project-intelligence.ts <repository-root>
npm run test:project-intelligence
npm run test:stack-portability
npm run test:conditional-quality-gates
npm run test:provider-bundles
npm run test:provider-distribution
```

The profiler emits one `@@PROJECT_PROFILE@@` JSON envelope. Exit `0` means the profile is ready;
exit `1` means the profile is valid but needs input (or inspection failed safely); exit `2` means
the CLI arguments are invalid. The agent must stop on any invalid transport or `needs_input` status.

Stack Portability then emits one `@@STACK_PORTABILITY@@` schema `1.0.0` envelope bound to the
profile fingerprint. It selects only declared or observed framework/HTTP/mapping adapters, reports
target-specific assumptions, and returns `needs_input` rather than inventing an unavailable helper.

The Workflow Orchestrator uses bounded stdin JSON and one `@@ORCHESTRATOR_RESULT@@` response to
create or validate phase envelopes, resume from verified evidence, and preserve literal human and
trusted computed gates. Delegated agents cannot alter the canonical phase order or claim done.

The Conditional Quality Gates runtime consumes the validated profile and bounded changed-file
evidence. It emits one `@@CONDITIONAL_GATES@@` envelope and activates i18n, router, or style checks
only when the profile proves that system exists. Unknown/conflicting profiles cannot pass.

## Failure and security behavior

- Repository inspection is read-only and does not use GitHub or MCP credentials.
- Symlinks are not followed; build/dependency folders are excluded from bounded traversal.
- Unknown framework signals and contradictory router/package-manager signals block planning.
- Missing, duplicate, extra, malformed, or fingerprint-invalid envelopes are hard failures.
- `execute` must not be used to install dependencies, edit files, call remote services, sync, or push.
- Provider instructions cannot weaken shared gate or evidence semantics.

## Compatibility

The bundle follows GitHub's `.github/skills/<name>/SKILL.md` and
`.github/agents/<name>.agent.md` conventions. It intentionally contains no fabricated provider
manifest. Canonical source remains in `packages/core`; release launchers are generated from that
source, and the adapter contains only discovery metadata, portable tool aliases, and invocation
policy.

See [`providers/README.md`](../../README.md) for the cross-provider version contract and the
repository root `LICENSE` for Apache-2.0 terms.
