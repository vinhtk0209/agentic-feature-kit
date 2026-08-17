# P17-008 — Installable Distribution Bundles Evidence

Date: 2026-08-13

Status: complete

Scope: deterministic, self-contained local distributions for Codex, Claude Code, and GitHub
Copilot over the shared Project Intelligence and Workflow Orchestrator core. Public publication,
marketplace submission, user-directory installation, external provider execution, repository
visibility changes, sync, and push are excluded.

## Outcome

`npm run build:providers` now generates `dist/provider-bundles/0.2.0/` with:

- one provider directory for Codex, Claude Code, and GitHub Copilot;
- one deterministic ZIP per provider;
- one content-addressed `bundle-manifest.json` per directory;
- one release-level `SHA256SUMS` file;
- bundled CommonJS launchers for Project Intelligence and Workflow Orchestrator;
- the Project Profile and phase-envelope schemas;
- the locked Orchestrator boundary and sanctioned golden contracts;
- the Apache-2.0 license and provider-specific public usage instructions.
- `THIRD_PARTY_NOTICES.md` and the bundled TypeScript runtime's full Apache-2.0 license text.

The generated launchers target Node 20+ and run without `tsx`, a source checkout, or repository
`node_modules`. Runtime bundling uses the repository-pinned esbuild `~0.28.0`; it is now an explicit
development dependency instead of an accidental transitive dependency.
The lockfile root metadata was also normalized from its stale `3.18.0` value to the existing
package version `3.25.0` by `npm install --package-lock-only --ignore-scripts`; no dependency
lifecycle script ran.

The generated output stays ignored. Release or marketplace publication can attach the verified
ZIPs later, but the build itself never changes external state.

## Provider formats

| Provider | Supported distribution unit | Required discovery surface |
|---|---|---|
| Codex | plugin directory and ZIP | `.codex-plugin/plugin.json` + `skills/` |
| Claude Code | plugin directory and ZIP | `.claude-plugin/plugin.json` + `skills/` + `agents/` |
| GitHub Copilot | repository customization directory and ZIP | `.github/skills/` + `.github/agents/` |

Copilot deliberately has no fabricated plugin manifest. Codex deliberately has no fabricated
standalone-agent manifest. Each README explains verification and the provider-supported installation
or discovery boundary without performing it.

## Shared-core and content contract

`providers/provider-bundles.json` pins:

- bundle version `0.2.0`;
- shared core version `1.0.0`;
- builder and output paths;
- deterministic ZIP and checksum formats;
- Node engine `>=20`;
- both packaged runtime entrypoints.

The builder rejects unknown source-package files, symlinks, `.env`, dependency/build output,
missing registry references, path escapes, manifest drift, undeclared output files, missing files,
and content hash or byte-count mismatches. All paths are sorted before hashing and archive creation;
ZIP timestamps and encoding flags are fixed.

Thin-adapter source hashes at closeout:

- Project Intelligence skill, identical across all providers:
  `28cf2a1b872558a598561fb24d032e37e5abe4749e256d2f4089b0f6cb8aab8e`
- Workflow Orchestrator skill, identical across all providers:
  `951e26a64ea75991574e5ac50c259ec037eb2bf1ebbe52173ad651b84d889a71`

Generated runtime hashes, identical across all providers:

- `runtime/project-intelligence.cjs`:
  `d0af6f9a8a4eac23463e91957f2207b9921372019b7e98558c165df41444bd77`
- `runtime/workflow-orchestrator.cjs`:
  `c3f0c93d9b659d8b5c3bbaa383382c070911e0d1bcf9826077004c5574df6541`

## Generated artifact record

Final local build under ignored `dist/provider-bundles/0.2.0/`:

| Provider | Declared files | Directory bytes | Manifest hash | ZIP SHA-256 |
|---|---:|---:|---|---|
| Codex | 15 | 8,690,967 | `a603a62abdd1b3e7fcd34ea5f4f8b1bd322058138b6a3d81b1faccd5848db216` | `8898db841352f7fb3adc2898ec66c4b032c0e3d4242ad5fb3a18015025691e6b` |
| Claude | 15 | 8,691,449 | `bead238da6ced000cb45720d5d39d8d4c47ab6aeb609d6ccdb8144d207c236d9` | `9079e5b03893957174a3d8c197229da6af27e2643178d9076d09988175d9d12e` |
| Copilot | 14 | 8,690,756 | `d53613c6acccd350b0d5313ef90fc5d4b56d288f2fcbd65a46053553fe4194c1` | `b161d9d158939c609e700e460a34c42032ca2f8395115c40d48b93f1a31efbd3` |

The release directory is local evidence, not a published release. Rebuilding from the committed
source reproduces it.

## Clean-install smoke

The focused suite builds twice into separate temporary roots and requires all three archive hashes
to match byte-for-byte. It then extracts every ZIP with an independent test reader into a clean
temporary root and, for each provider:

1. validates the extracted content manifest and provider/core versions;
2. proves there is no `node_modules` or source `packages/` tree;
3. runs `node runtime/project-intelligence.cjs <fixture>` from outside the bundle and accepts exactly
   one ready `@@PROJECT_PROFILE@@` envelope;
4. runs `node runtime/workflow-orchestrator.cjs resume` from outside the bundle and accepts exactly
   one `@@ORCHESTRATOR_RESULT@@` envelope that resumes at missing phase `B0`;
5. validates the archive hash against `SHA256SUMS`.

That is six real offline runtime executions across three extracted distributions. The host runtime
for this evidence was Node `v24.15.0`; Node 20 compatibility is an esbuild target and engine contract,
while the Windows/Linux CI matrix remains P17-009.

Three independent negative controls append runtime tamper, add an undeclared file, and forge a core
version. Each is rejected fail closed.

## Validation record

```text
npm run test:provider-distribution
PASS — 3 deterministic archives, 6 clean runtime smokes,
       shared-core/version/content integrity, 3 attacks

npm run test:provider-bundles
PASS — 3 providers, 2 byte-identical skills, one core version,
       manifest/agent/security contracts

npm run test:project-intelligence
PASS — 5 canonical fixtures, deterministic read-only behavior, 11 negative controls

npm run test:workflow-orchestrator-cli
PASS — one-sentinel transport, validate/resume, malformed/mode/size controls

isolated TypeScript 5.7.3 no-emit check — exit 0
official skill quick validator — PASS for all 6 generated skills
official Codex plugin validator — PASS on generated Codex bundle
claude plugin validate --strict — PASS on generated Claude bundle
claude-workflow-kit: npm test — exit 0 in 161.1 seconds on the final license-complete tree
kit-dashboard: npm test — 57 files / 420 tests passed in 7.84 seconds
kit-dashboard: npx tsc --noEmit --incremental false — exit 0
git diff --check — exit 0 in both repositories
```

The first focused RED was a synthetic fixture error: it declared `react` and a router but omitted
the existing Project Intelligence positive web-framework signal `react-dom`. The fixture was fixed;
the production detector and its fail-closed readiness behavior were not weakened.

## Boundary after completion

P17-008 completes the local/private installable distribution story for the two priority
capabilities. It does not claim marketplace availability, npm publication, real external-provider
execution, cross-provider semantic parity, or Windows/Linux release qualification. Those remain
separate P17-007/P17-009 or release-authorization work.
