# P17-006 Phase-aware Model Selection and Routing Evidence

Date: 2026-08-14  
Roadmap task: P17-006  
Result: PASS

## Scope and authority

The implementation follows `docs/roadmap/p17-006-phase-model-routing-plan.md`. It adds a
provider-neutral policy engine and bounded CLI that can return `selected`, `no_model`, or
`needs_input` for the 24 canonical workflow phases. It also packages the same compiled fifth
runtime, schemas, capability matrix, and thin invocation guidance for Codex, Claude, and Copilot.

This evidence does not claim provider execution, flagship workflow wiring, model entitlement,
phase qualification, marketplace publication, provider installation, target sync, deployment, or
dashboard behavior. The canonical catalog has no real phase-qualified candidate, so every current
model-required route fails closed as `needs_input`. P17-007 owns same-input qualification evidence.

## Implemented contract

- `phase-model-router.ts` is a pure domain module: no filesystem, environment, network, provider
  SDK, process, persistence, clock, or UI dependency.
- Request and decision schemas are closed at version `1.0.0`. Runtime validators reject unknown
  fields, identifiers, vocabularies, duplicates, invalid timestamps, unsafe bounds, and hash drift.
- The trusted matrix must contain exactly 24 phases and bind every one of its five condition IDs
  exactly once. Phase-contract hashes are recomputed before every decision.
- Candidate evidence separates documentation, configuration, runtime entitlement, availability,
  exact phase qualification, capabilities, permissions, context, effort, and optional comparable
  observations. Documentation/entitlement/availability evidence is capped at seven days and phase
  qualification at 30 days from evaluation.
- A decision binds `requestHash`, the matrix and phase-contract hashes, and a nullable
  `candidateEvidenceHash` for every requested candidate. `verifyPhaseModelRoutingDecision` re-routes
  from the original matrix/request/candidates and requires byte-equivalent stable JSON.
- Canonical optimization is disabled. Operator order selects only independently eligible
  candidates. A synthetic optimizer fixture activates the policy only with at least five comparable
  exact-phase observations per eligible candidate.
- Execution-time fallback requires prior-decision lineage, the same phase contract, replay safety,
  and a non-escalating permission ceiling. It never executes or silently substitutes a provider.
- The CLI reads at most 512 KiB from stdin, emits exactly one `@@PHASE_MODEL_ROUTING@@` envelope,
  caps output at 256 KiB, sanitizes errors, and uses exits `0`/`1`/`2` for success-or-no-model,
  valid `needs_input`, and invalid input respectively.
- Provider bundle version `0.5.0` and shared core version `1.3.0` carry five runtimes. The existing
  Workflow Orchestrator skill remains byte-identical across Codex and Claude; Claude/Copilot agents
  and all three public READMEs delegate policy to the shared runtime.

## Outcome examples

| Scenario | Proven result | What it handles |
|---|---|---|
| Canonical B0 request names configured runner inventory but supplies no qualified candidate evidence | `needs_input` with `candidate_unknown` | Prevents inventory or a successful login from being mistaken for phase quality or entitlement. |
| Synthetic B0 candidate has current documentation, exact entitlement/availability, matching contract and adapter hashes, required capabilities/permissions, context, and effort | `selected` with `operator_order_selected` | Produces an explicit auditable recommendation without granting execution authority. |
| Canonical B0.5, B6, B8, B8.5, B9, B9.5, B9.6, or B10.5 request | `no_model` with `phase_model_forbidden` | Keeps deterministic/tooling phases model-free even when candidates are supplied. |
| Optional B12 or B12.5 with no activating condition | `no_model` with `phase_model_not_requested` | Avoids unnecessary model use and cost. |
| First candidate disabled, second independently qualified | second candidate `selected`, first rejection retained | Supports explicit preflight alternatives without silent substitution. |
| Provider failure with missing lineage, changed contract, unsafe replay, or elevated permissions | `needs_input` | Stops unsafe automatic fallback. |
| Synthetic optimizer has five comparable observations per candidate | lower-cost qualified candidate selected with `qualified_tie_break_selected` | Proves the future tie-break path without enabling it for real candidates. |

## Domain and transport proof

`npm run test:phase-model-router` passes all 24 phases and all five condition bindings, 19 candidate
ineligibility attacks, five fallback paths, deterministic request/candidate/decision hashes,
canonical fail-closed behavior, synthetic selected/no-model/optimizer cases, schema/runtime drift,
semantic tampering with a recomputed outer hash, and the 100 ms p95 budget. The latest focused run
measured `1.26 ms` p95 across 80 decisions.

`npm run test:phase-model-router-cli` passes selected exit `0`, needs-input exit `1`, five
usage/input attacks, exact and oversized stdin boundaries, sanitized failures, the output cap,
exactly one sentinel, and absence of environment/file/process I/O.

The existing workspace TypeScript 5.9.3 compiler exits `0` across the router, CLI, their tests, and
provider build/test sources. The kit's declared TypeScript 4.9.5 cannot parse the installed Node 26
declarations; that independent release-toolchain mismatch remains assigned to P17-009 and is not
hidden by this result.

## Provider distribution proof

- `npm run test:provider-bundles`: PASS for three providers, two byte-identical skills, five shared
  runtimes, the verifier export, schemas, versions, manifests, agents, READMEs, and security guards.
- `npm run test:provider-distribution`: PASS for three deterministic archives, 15 extracted
  clean-copy runtime smokes, shared-core/version/content integrity, and three tamper attacks.
- The build/extraction tests use disposable scratch paths only. Nothing was installed into a
  user-owned Codex, Claude, or Copilot directory.

The repository-native tests are the authoritative artifact proof for this slice. The optional
Codex/Claude skill quick validators and Codex plugin validator were each attempted with both the
default and bundled Codex Python runtimes, but every process stopped before reading an artifact
because neither environment contains PyYAML. A read-only workspace/cache search found no reusable
`yaml` module. No dependency was installed, and these external validators are recorded as
infrastructure-blocked rather than passed.

## Review remediation and RED history

- The first isolated compile stopped in installed Node declarations because TypeScript 4.9.5 cannot
  parse their syntax. Re-running with the already-installed compatible TypeScript 5.9.3 exposed and
  then verified eight real narrowing fixes at the matrix boundary.
- Registering the new suites briefly removed `test:synced-core`; the exact package-script readback
  caught this before full regression and the prior gate was restored.
- The first CLI process fixture used a package subpath blocked by `tsx` exports. The test now invokes
  the repository-local CLI entry file used by existing direct-process suites; production code was
  unchanged.
- Provider README and contract-test batch patches failed on provider-specific wrapping/anchors and
  were reapplied as exact provider-local hunks. No partial result was assumed.
- Code review found that the first decision identity did not bind complete request/candidate
  evidence. The remediation added request/candidate hashes, full re-verification, global condition
  conservation, vocabulary checks, freshness ceilings, and attacks that recompute the outer hash
  after evidence or semantic tampering.
- The first valid full regression reached the pre-existing claim/runtime audit and exposed its
  hard-coded `0.4.0`/four-runtime expectation. The audit contract now requires all five runtime
  keys, the current semver-consistent README/manifest evidence, the `0.5.0` documentation anchor,
  and an explicit omitted-phase-runtime attack. Its focused suite passes 8/8.

## Full regression and security closeout

The final `npm run test:kit` run exits `0` in 212 seconds. It includes the phase router and CLI,
provider source/distribution, claim/runtime audit, cross-platform release, worktree-browser,
Playwright runner, version/index, prompt budget, and lesson-sync gates. The flagship remains within
its 172 KiB budget at 162,860 bytes, and all 60 lesson annotations are synchronized.

The final changed-file secret scan enumerates all tracked modifications plus untracked source
artifacts, verifies two matches against a fake positive control, scans 29 files, and reports zero
secret hits. `git diff --check` exits `0`; final review confirms `test:synced-core` remains registered,
both new suites are in the full chain, the router contains no environment/write/spawn path, and the
dashboard was clean on `feature/ISUITE2026-Codex-custom-workflows` before status reconciliation.

Browser evidence is intentionally not required because this slice adds no UI or live provider path.

## Artifact hashes

| Artifact | SHA-256 |
|---|---|
| `packages/core/src/phase-model-router.ts` | `27c4112132088dd38e6c9a9da40c01de8450f6e5e388245de900a6f153108fcb` |
| `packages/core/src/phase-model-router-cli.ts` | `5321c8a83bc8831f6abbf588915493f52fab5cf7fc94909b36ad54e070de47e6` |
| `docs/schemas/phase-model-routing-request.schema.json` | `f082186b306522d442843417f17f5c07eefd1c2a1224d1844e846686e538e7a1` |
| `docs/schemas/phase-model-routing-decision.schema.json` | `9073763a48896b0104c01d31efb963f73f3a9f680b341eef2c3fe08512899d51` |
| `docs/roadmap/post-17-phase-capability-matrix.json` | `1f4a7de71e37383998e96989d7d263624ad02b40764fb3d79be2e25573360d34` |
| `scripts/build-provider-bundles.ts` | `35d22a23fcd04de6302e33d6b0c426b66bbd37b3388d7d32e074d15df7e7905e` |
| `providers/provider-bundles.json` | `a665fa457931e539c33f962f73168aec93a2741ff2e62bf2ac4054f61d8576f3` |
| `docs/roadmap/p17-006-phase-model-routing-plan.md` | `92f2899f90fe78c52083fd0073c40f65e190fac96fa5ecfb93bdd93ec6ae63f7` |
| `.claude/integrations/claim-runtime-audit.ts` | `5602f03b3e55f7d3bd09d07dcb3e52695eb00f5bf9dfc0874f0bcb56c435952d` |
| `docs/claims/runtime-claims.json` | `e3228494b092f9c4883c84e0f17aefe198dfdf0f25cfb346c126b3cd31b22543` |

## Result boundary

P17-006 satisfies its local completion criteria: routing is explicit and content-addressed,
fallback preserves the phase contract and permission ceiling, unknown capability blocks, provider
packages share one tested runtime, and the full regression/security closeout is green. The completed
claim is a deterministic packaged decision capability, not a live model router: real candidates
stay unroutable until P17-007 qualification and a separately approved integration task wires a
verified decision into provider execution.
