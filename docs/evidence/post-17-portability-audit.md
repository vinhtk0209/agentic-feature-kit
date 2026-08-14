# P17-012 Convention and Stack Portability Audit Evidence

Date: 2026-08-14
Roadmap task: P17-012
Result: PASS

## Scope and authority

The implementation follows
`docs/roadmap/p17-012-convention-stack-portability-plan.md`. It replaces prompt-level stack guesses
with an evidence-bound contract over the existing Project Intelligence profile. The verified scope
is the shared core, sync-safe launchers, flagship/content consumers, and the Codex, Claude, and
Copilot provider distributions.

This evidence does not claim support for every framework, a provider installation, marketplace
publication, target sync, deployment, or a live provider run. Unknown, conflicting, or unsupported
stack evidence remains a structured `needs_input` outcome rather than an inferred default.

## Implemented contract

- `@@STACK_PORTABILITY@@` schema/result version `1.0.0` binds every result to the exact Project
  Profile fingerprint and validates a deterministic result hash.
- Repository scanning is bounded to 512 files, 2 MiB, and depth 8; ignored path segments apply at
  every depth and source symlinks/junctions are not followed.
- Framework adapters cover React web, React Native, Vue, and Angular. Unsupported frameworks stop
  with named missing inputs instead of receiving a React layout.
- HTTP evidence covers Open edX, Axios, Ky, GraphQL Request, Apollo, and native Fetch. Open edX
  packages alone do not activate `getHttpClient()` or camel-case transforms; an observed import/call
  or an explicit available declaration is required.
- Framework layouts, capability files, Open edX assumptions, findings, conflicts, and advisories
  are cross-validated in both directions. Contradictory or duplicate evidence is rejected.
- `packages/core/src` remains canonical. `scripts/build-synced-core.ts` atomically creates exactly
  two byte-identical TypeScript mirrors under `.claude/integrations/core` and refuses missing,
  extra, or drifted generated files in check mode.
- The flagship requires exact Project Profile and Stack Portability sentinels, verifies their
  fingerprint binding, and stops before planning on `needs_input`. Legacy query-library framework
  derivation, invented HTTP/transform fallbacks, and framework-default package choices are absent.
- Codex, Claude, and Copilot bundle version `0.4.0` share core version `1.2.0`, two byte-identical
  skills, and four runtimes, including Stack Portability.

## Fixture and attack proof

`npm run test:project-intelligence` passed five canonical fixtures, schema/envelope and deterministic
read-only CLI proof, plus 11 negative controls.

`npm run test:stack-portability` passed 11 assertions and 16 attacks. Positive fixtures cover Open
edX React, generic React, Vue, React Native, Angular, unsupported frameworks, dependency-only Open
edX, explicit declarations, schema/CLI identity, and the exact sync-safe launcher. Negative controls
cover transport conflicts, unavailable declarations, forged profiles/fingerprints, path escape,
symlink non-traversal, oversized evidence, hash/extra-field tampering, contradictory status,
decisions/layout/assumptions/advisories, duplicate evidence, generic-core imports, and ambiguous
CLI arguments.

`npm run test:stack-portability-wiring` passed 10 assertions for both launchers, exact sentinels,
fingerprint binding, pre-plan `needs_input`, removal of legacy defaults, consumer guidance, and
evidence-bound package/branch decisions.

`npm run test:synced-core` passed four missing/write/drift/extra-file controls, and
`npm run check:synced-core` proved two live byte-identical mirrors.

## Provider distribution proof

- `npm run test:provider-bundles`: PASS for three providers, two byte-identical skills, four shared
  runtimes, and version/schema/manifest/agent/security contracts.
- `npm run test:provider-distribution`: PASS for three deterministic archives, 12 extracted clean
  runtime smokes, shared-core/version/content integrity, and three attacks.
- `npm run test:claim-runtime-audit`: PASS for eight claim-to-runtime assertions, including omitted
  capability/shared-skill drift and generated-output mismatch controls.

The distribution test builds and extracts only disposable archives. Nothing was installed into a
user-owned Codex, Claude, or Copilot directory.

## Boundary drift and remediation

The first sanctioned orchestrator-boundary refresh correctly failed at `phase anchor drifted: B8`.
The portability edit had removed eight package-default lines before B8, moving B8 from line 1843 to
1835 and making every later `sourceLines` range stale. No generated metadata was accepted.

Commit `0387c41` records the complete contiguous B7 through B12.8 semantic ranges. The refresh
generator now also refuses a phase whose end is not exactly before the next phase, or whose final end
does not match EOF. Its five focused tests cover clean refresh, dirty boundary refusal, dirty source
refusal, anchor drift, and range/EOF drift. The sanctioned refresh then bound the 2,686-line flagship
to commit `0387c41ad075bb839dcef838c8fc450028f1497f`, blob
`be90b90f1b127320d9e5fd6b4e6560501a3dd09f`, and SHA-256
`216d29a23bfb7baba8d61a620e248d0443598e05ffe99e25c3aeb21c3041d717`.

The Wave-1 conservation gate passed 23 mandatory phases, one conditional phase, three providers,
and seven negative controls. Core orchestrator tests passed 24 boundaries and 26 attacks; the CLI
one-sentinel transport/validate/resume controls also passed.

## Full regression

`npm run test:kit` exited 0 in 196 seconds on 2026-08-14. The run included all portability,
sync-safe mirror, provider, orchestrator, roadmap, boundary-refresh, cross-platform, worktree-browser,
Playwright, version, index, prompt-budget, and lesson-sync gates. The flagship remained within the
172 KB budget at 162,860 bytes.

## Artifact hashes

| Artifact | SHA-256 |
|---|---|
| `packages/core/src/stack-portability.ts` | `aac0309870c794a14a1df48aab4699d962b100c155dd9356f98812a2a20b9203` |
| `docs/schemas/stack-portability.schema.json` | `ab0d5473bb115e208a23fa14aead22450f2a15a1dd936571b84a742b79f2ec85` |
| `.claude/integrations/core/stack-portability.ts` | `aac0309870c794a14a1df48aab4699d962b100c155dd9356f98812a2a20b9203` |
| `.claude/integrations/stack-portability.ts` | `701697dc8ebd6b3c7fadbf4b81afe5ca014e8a8192d012874d9974d7c6f70eb0` |
| `.claude/commands/feature-from-confluence.stack-portability-wiring.test.ts` | `b0a1a69b4e0e63e4ed0fa96d1217f8f13f93d401cc24728b93fc6f6dda43c41f` |
| `scripts/build-synced-core.ts` | `964d5d62e2e99f3fb2fb4c6fe7706d5128f7ffd966f89ebdb9e76d7d3f5acc55` |
| `scripts/build-provider-bundles.ts` | `087b28df294cbc5a2bba3d98ea42c29d6ca217bcf159e50b188c2ad26d7c763b` |
| `providers/provider-bundles.json` | `96681b6852ed316778787e5a621fc8c795acc42dbc7adbfc8c7d3fbff689ccc6` |
| `docs/roadmap/p17-012-convention-stack-portability-plan.md` | `3550a6b85a2544f9791c687a108913baef390bcb9f32803260839894141110d1` |
| `docs/roadmap/post-17-orchestrator-boundaries.json` | `56edbe192eac7ff7fcff39031e1cac923d3a18349027611beabe6389685e7c71` |

## Result boundary

P17-012 is complete because stack decisions are now evidence-bound, target assumptions are declared,
generic core imports no Open edX helper, unsupported/conflicting stacks fail clearly, the sync-safe
runtime is byte-locked, all three provider packages carry the same capability, and full local
regression is green. New frameworks still require an explicit adapter plus fixtures and attacks.
