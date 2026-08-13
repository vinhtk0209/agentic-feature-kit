# Agentic Feature Kit for Claude Code

The Claude Code source package exposes evidence-backed Project Intelligence as both a skill and a
read-only specialized agent. It profiles the repository before implementation so Claude does not
guess the framework, router, i18n system, styling stack, data layer, package manager, task names, or
reference-feature layout.

## Release status

| Contract | Value |
|---|---|
| Bundle version | `0.1.0` |
| Shared core schema | `1.0.0` |
| Runtime | Node.js 20+ with `tsx` |
| License | Apache-2.0 |
| Distribution stage | Versioned source package |

This package is public-ready source, but it is not yet a self-contained install archive. `P17-008`
will add the archive builder, content allowlist, clean-install smoke test, and release checksum.
Local source validation does not install or enable the plugin.

## Package layout

```text
.claude-plugin/plugin.json
skills/project-intelligence/SKILL.md
agents/project-intelligence.md
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
npm run test:provider-bundles
claude plugin validate providers/claude/agentic-feature-kit --strict
```

The profiler emits one `@@PROJECT_PROFILE@@` JSON envelope. Exit `0` means the profile is ready;
exit `1` means the profile is valid but needs input (or inspection failed safely); exit `2` means
the CLI arguments are invalid. The skill must stop on any invalid transport or `needs_input` status.

## Failure and security behavior

- Repository inspection is read-only and does not use network credentials.
- Symlinks are not followed; build/dependency folders are excluded from bounded traversal.
- Unknown framework signals and contradictory router/package-manager signals block planning.
- Missing, duplicate, extra, malformed, or fingerprint-invalid envelopes are hard failures.
- The agent must not install dependencies, edit files, invoke remote providers, sync, or push.
- Provider instructions cannot weaken shared gate or evidence semantics.

## Compatibility

The layout follows Claude Code's `.claude-plugin/plugin.json`, `skills/`, and `agents/` contracts.
The package passes `claude plugin validate --strict` locally. The canonical business logic remains
in `packages/core`; this adapter contains only discovery metadata, tool limits, and invocation
policy.

See [`providers/README.md`](../../README.md) for the cross-provider version contract and the
repository root `LICENSE` for Apache-2.0 terms.
