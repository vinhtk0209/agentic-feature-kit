# Agentic Feature Kit for Codex

The Codex source package exposes evidence-backed Project Intelligence as an Agent Skill. It profiles
the repository before implementation so Codex does not guess the framework, router, i18n system,
styling stack, data layer, package manager, task names, or reference-feature layout.

## Release status

| Contract | Value |
|---|---|
| Bundle version | `0.2.0` |
| Shared core schema | `1.0.0` |
| Runtime | Node.js 20+ with `tsx` |
| License | Apache-2.0 |
| Distribution stage | Versioned source package |

This package is public-ready source, but it is not yet a self-contained install archive. `P17-008`
will add the archive builder, content allowlist, clean-install smoke test, and release checksum. Do
not copy this directory into a user plugin directory and claim install parity before that evidence
exists.

## Package layout

```text
.codex-plugin/plugin.json
skills/project-intelligence/SKILL.md
skills/project-intelligence/agents/openai.yaml
skills/workflow-orchestrator/SKILL.md
skills/workflow-orchestrator/agents/openai.yaml
README.md
```

Codex discovers the skill through the plugin manifest. No standalone Codex agent manifest is
invented: the skill uses the host's normal bounded agent capabilities when the user requests them.

## Source-checkout verification

From the Agentic Feature Kit repository root:

```bash
npm ci
npx tsx packages/core/src/project-intelligence.ts <repository-root>
npm run test:project-intelligence
npm run test:provider-bundles
```

The profiler emits one `@@PROJECT_PROFILE@@` JSON envelope. Exit `0` means the profile is ready;
exit `1` means the profile is valid but needs input (or inspection failed safely); exit `2` means
the CLI arguments are invalid. Provider instructions must not parse ad-hoc text or bypass the
runtime validator.

The Workflow Orchestrator then uses bounded stdin JSON and one `@@ORCHESTRATOR_RESULT@@` response to
create or validate phase envelopes, resume from a verified prefix, and compare semantic conservation
against the sanctioned golden. It never turns a provider action smoke into completion evidence.

## Failure and security behavior

- Repository inspection is read-only and does not use network credentials.
- Symlinks are not followed; build/dependency folders are excluded from bounded traversal.
- Unknown framework signals and contradictory router/package-manager signals block planning.
- Missing, duplicate, extra, malformed, or fingerprint-invalid envelopes are hard failures.
- The skill must not recreate framework detection rules in prompt text.
- Installation, marketplace registration, sync, push, and provider execution are outside tests.

## Compatibility

The source package is validated against the local Codex plugin ingestion contract with the official
plugin and skill validators. The canonical business logic remains in `packages/core`; this adapter
contains discovery metadata and invocation policy only.

See [`providers/README.md`](../../README.md) for the cross-provider version contract and the
repository root `LICENSE` for Apache-2.0 terms.
