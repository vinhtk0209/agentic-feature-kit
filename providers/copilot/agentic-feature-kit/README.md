# Agentic Feature Kit for GitHub Copilot

The GitHub Copilot source bundle exposes evidence-backed Project Intelligence through the supported
repository skill and custom-agent surfaces. It profiles the repository before implementation so
Copilot does not guess the framework, router, i18n system, styling stack, data layer, package
manager, task names, or reference-feature layout.

## Release status

| Contract | Value |
|---|---|
| Bundle version | `0.1.0` |
| Shared core schema | `1.0.0` |
| Runtime | Node.js 20+ with `tsx` |
| License | Apache-2.0 |
| Distribution stage | Versioned repository source bundle |

This bundle is public-ready source, but it is not yet a self-contained copy/install artifact.
`P17-008` will add the content allowlist, clean-copy discovery smoke, version checksum, and release
archive. GitHub Copilot has no plugin manifest in this bundle because its documented customization
unit is the repository's `.github` content.

## Bundle layout

```text
.github/skills/project-intelligence/SKILL.md
.github/agents/project-intelligence.agent.md
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
npm run test:provider-bundles
```

The profiler emits one `@@PROJECT_PROFILE@@` JSON envelope. Exit `0` means the profile is ready;
exit `1` means the profile is valid but needs input (or inspection failed safely); exit `2` means
the CLI arguments are invalid. The agent must stop on any invalid transport or `needs_input` status.

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
manifest. The canonical business logic remains in `packages/core`; this adapter contains only
discovery metadata, portable tool aliases, and invocation policy.

See [`providers/README.md`](../../README.md) for the cross-provider version contract and the
repository root `LICENSE` for Apache-2.0 terms.
