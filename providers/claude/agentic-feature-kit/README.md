# Agentic Feature Kit for Claude Code

This directory is a Claude Code plugin source package. Release ZIPs add a self-contained Node 20+
runtime, schemas, contracts, license, and a content-addressed `bundle-manifest.json` while keeping
`.claude-plugin/plugin.json`, `skills/`, and `agents/` at the plugin root.

## Verify and use

1. Verify the release ZIP against the adjacent `SHA256SUMS` entry.
2. Extract it and keep `agentic-feature-kit/` as the plugin root.
3. For a bounded local evaluation, start Claude Code with its documented
   `--plugin-dir <path-to-agentic-feature-kit>` option. Permanent installation or marketplace
   publication is a separate operator action.
4. Verify the packaged runtime offline first:
   `node runtime/project-intelligence.cjs <repository-root>` and pipe a JSON request to
   `node runtime/conditional-quality-gates.cjs` or `node runtime/workflow-orchestrator.cjs resume`.
5. Require the plugin validator to pass before distributing the directory or archive.

The package contains no credentials, hooks, MCP configuration, or provider-specific gate logic.
Both skills and both read-only agent profiles use one bundled shared core.

The Claude Code source package exposes evidence-backed Project Intelligence as both a skill and a
read-only specialized agent. It profiles the repository before implementation so Claude does not
guess the framework, router, i18n system, styling stack, data layer, package manager, task names, or
reference-feature layout.

## Release status

| Contract | Value |
|---|---|
| Bundle version | `0.3.0` |
| Shared core version | `1.1.0` |
| Runtime | Self-contained Node.js 20+ CommonJS launchers |
| License | Apache-2.0 |
| Distribution stage | Deterministic directory + ZIP archive |

The release directory and ZIP are self-contained and covered by clean-copy runtime smoke tests. The
source package in this repository intentionally omits generated runtime files; create them with
`npm run build:providers`. Local validation does not install or enable the plugin.

## Package layout

```text
.claude-plugin/plugin.json
skills/project-intelligence/SKILL.md
agents/project-intelligence.md
skills/workflow-orchestrator/SKILL.md
agents/workflow-orchestrator.md
runtime/project-intelligence.cjs
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

The agent permits `Read`, `Glob`, `Grep`, and `Bash`, explicitly disallows `Write` and `Edit`, and
restricts shell use to the documented read-only profiler. The shared skill owns workflow guidance;
the agent does not copy detection or gate rules.

## Source-checkout verification

From the Agentic Feature Kit repository root:

```bash
npm ci
npx tsx packages/core/src/project-intelligence.ts <repository-root>
npm run test:project-intelligence
npm run test:conditional-quality-gates
npm run test:provider-bundles
npm run test:provider-distribution
claude plugin validate providers/claude/agentic-feature-kit --strict
```

The profiler emits one `@@PROJECT_PROFILE@@` JSON envelope. Exit `0` means the profile is ready;
exit `1` means the profile is valid but needs input (or inspection failed safely); exit `2` means
the CLI arguments are invalid. The skill must stop on any invalid transport or `needs_input` status.

The Workflow Orchestrator uses bounded stdin JSON and one `@@ORCHESTRATOR_RESULT@@` response to
create or validate phase envelopes, resume from verified evidence, and preserve literal human and
trusted computed gates. Its agent coordinates work but cannot approve its own STOP conditions.

The Conditional Quality Gates runtime consumes the validated profile and bounded changed-file
evidence. It emits one `@@CONDITIONAL_GATES@@` envelope and activates i18n, router, or style checks
only when the profile proves that system exists. Unknown/conflicting profiles cannot pass.

## Failure and security behavior

- Repository inspection is read-only and does not use network credentials.
- Symlinks are not followed; build/dependency folders are excluded from bounded traversal.
- Unknown framework signals and contradictory router/package-manager signals block planning.
- Missing, duplicate, extra, malformed, or fingerprint-invalid envelopes are hard failures.
- The agent must not install dependencies, edit files, invoke remote providers, sync, or push.
- Provider instructions cannot weaken shared gate or evidence semantics.

## Compatibility

The layout follows Claude Code's `.claude-plugin/plugin.json`, `skills/`, and `agents/` contracts.
The package passes `claude plugin validate --strict` locally. Canonical source remains in
`packages/core`; release launchers are generated from that source, and the adapter contains only
discovery metadata, tool limits, and invocation policy.

See [`providers/README.md`](../../README.md) for the cross-provider version contract and the
repository root `LICENSE` for Apache-2.0 terms.
