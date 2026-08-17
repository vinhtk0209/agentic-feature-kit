# P17-005 — Project-Derived Conditional Quality Gates Evidence

Date: 2026-08-13  
Status: DONE  
Scope: deterministic shared TypeScript core plus existing Project Intelligence provider adapters

## Outcome

The shared core now evaluates three project-derived gates in a fixed order: i18n completeness,
router registration, and style ownership. A validated Project Profile is the only authority that
can enable or disable a gate. Unknown or conflicting profile state leaves every gate applicable but
`needs_input`; it never silently disables enforcement. Every `pass`, `fail`, `needs_input`, and
`not_applicable` result contains sorted, unique evidence.

The public request/result schema is version `1.0.0`. The read-only CLI consumes one JSON request on
stdin and emits exactly one `@@CONDITIONAL_GATES@@` envelope. Exit codes are `0` for pass, `1` for
fail or needs-input, and `2` for malformed input.

## Artifacts

| Artifact | SHA-256 |
|---|---|
| `packages/core/src/conditional-quality-gates.ts` | `9a1b280c5f53c2241aa0a3e96f652473ca5a471c46e3d2123dd59b673711fb75` |
| `docs/schemas/conditional-quality-gates.schema.json` | `c1011cebf27e749b5ca71f93b2662c9a1e06d6768b309259eb484efbaaa17d82` |
| Project Intelligence skill, byte-identical across all three providers | `32a08de8497e6202638d5c4a9f3c0fa3e989475f41380d8387c274038cb627fa` |
| Optimized conditional-gate runtime, byte-identical across all three providers | `79a37ed42148a36c930ea9c0013f6ed9ba4f09cc4b4b88b6f3939efb5ed05630` |

## Focused proof

`npm run test:conditional-quality-gates` passes 9 positive assertions and 8 attacks. The proof
covers React Router plus i18n and CSS ownership, a no-i18n project, missing message usage, registered
and unregistered routes, Vue Router plus `$t` and SCSS, unknown/conflicting profiles, non-UI change
scope, deterministic hashing, schema validation, and direct source CLI execution. Attacks reject a
forged profile fingerprint, path traversal, duplicate file paths, extra fields, missing desired
route, result-hash tampering, missing evidence, and an inconsistent overall status.

Notable fail-closed corrections retained by the suite:

- symbol-prefixed `$t` and `$localize` usage is matched explicitly without weakening the requirement
  for both message-source and usage evidence;
- Sass ownership accepts both `.sass` and `.scss`, while CSS-in-JS remains independently mapped;
- an untrusted profile cannot mark a gate non-applicable;
- each hostile request gets an isolated profile fixture;
- importing the profiler validator cannot accidentally launch its CLI.

An isolated TypeScript 5.7.3 no-emit compilation of the changed core, builder, and focused tests
exits `0`. The temporary compiler remains outside the repository because the pinned TypeScript 4.9.5
and installed Node type definitions have a pre-existing parser incompatibility.

## Provider distribution proof

Aggregate bundle version is `0.3.0` and shared-core version is `1.1.0`; the independently versioned
Project Profile, Conditional Gate, and Orchestrator JSON contracts remain `1.0.0`.

| Provider | ZIP bytes | Files | ZIP SHA-256 | Manifest SHA-256 |
|---|---:|---:|---|---|
| Codex | 1,392,681 | 18 | `2df441dfd117aa0161616bd38ce7bb41f49864ff203f46b8e9da9e9703bbf598` | `3f17859a0b958a3d6d9e7e20342dc6d227c01e35dd6f2e41660fccd76701b12f` |
| Claude | 1,392,938 | 18 | `9e30875abd259139959071367e38acb0abe959fbba4af1f8cab535f5f3a8e09c` | `bf50c4d8cbd0c87cf7cb439c90e982400cddc689f5cdf60ed0016e50a9840d8b` |
| Copilot | 1,392,465 | 17 | `68b1ebe276e170bef6aa9c6e5607780910a0536370751b9a621e9efa9f9357e7` | `692075fb2b7ae299a3152af72ed95421fe313cac7a767318fe2ed994ee3bfb8c` |

`npm run test:provider-distribution` proves three deterministic archives, nine clean extracted-runtime
smokes, and three tamper/drift attacks. All 12 source/generated skills pass the official skill
validator; source/generated Codex and Claude manifests pass their official validators. The first
valid build exposed a measured ~17.3 MB/provider duplication. Externalizing only the exact profiler
import to the adjacent packaged runtime reduces the new launcher to 17,371 bytes while clean-copy
execution proves the bundle is still self-contained.

## Regression proof

- Full `npm test`: exit `0`, 160.8 seconds.
- Final `npm run test:post-17-roadmap`: 21 tasks / 4 initiatives pass with P17-005 done.
- Dashboard full Vitest: 57 files / 420 tests, 6.26 seconds before status closeout.
- Final dashboard focused suite: 2 files / 6 tests pass after status closeout.
- Dashboard TypeScript and both repository diff checks pass after closeout.

## Boundaries

No flagship command decomposition, provider/model call, credential access, user-directory install,
marketplace publication, sync, push, or target `.Codex` edit occurred. TypeScript met the measured
runtime and bundle-size requirements; Python, Rust, and Go were not justified.
