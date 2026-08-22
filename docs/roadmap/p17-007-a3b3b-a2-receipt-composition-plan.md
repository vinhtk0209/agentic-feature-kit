# P17-007 A3B3B Exact A2 Receipt Composition Contract

Status: approved A3B3B pure success-receipt composition; zero provider execution.
Date: 2026-08-22
Parent: exact qualified `main` `19cf96372507cc7ad51324443e70bf729b2ee3c1`
Decision lock: `domain=D1, source=S1, eligibility=E1, mapping=M1, validation=V1, hash=H1, privacy=P1, immutability=I1, runtime=N1, scope=O1`

## Outcome

A3B3B adds one provider-neutral pure composer from a durable, re-admitted A3B3A evidence
attestation to the exact A2 `ProviderParityCandidateReceipt`. The composer emits only a successful
`completed` receipt after every policy, identity, evidence, candidate, cleanup, and metric invariant
has passed A3B3A re-admission and `eligibleForA2Composition` is exactly `true`.

The result is constructed field by field, receives a fresh canonical A2 receipt hash, is re-run
through the existing A2 receipt validator, and is deeply immutable. The boundary performs zero
provider execution and no process, clock, environment, filesystem, network, credential, session,
persistence, database, dashboard, target, sync, or release operation.

## Reconciled sources and prerequisites

- A2 owns the exact candidate-receipt shape, canonical receipt hashing, and runtime validation.
- A3B3A owns durable policy/evidence re-admission, distinct evidence identities, exact provider/run
  identity, candidate summary, cleanup result, metric provenance, and the eligibility decision.
- A3B2B owns the verified post-provider candidate tree and trusted-test evidence; A3B2A owns only
  the initial materialization identity and cleanup capability.
- No existing runtime owns composition. A3B3B is a pure adapter into A2, not a lifecycle runner.
- Exact qualified base is `19cf96372507cc7ad51324443e70bf729b2ee3c1`; A4 remains prohibited.

## Scope and non-scope

A3B3B includes one exported A2 candidate-receipt admission function, one pure integration composer,
exact success-only field mapping, canonical hashing, A2 revalidation, deep immutability, deterministic
replay, mutation isolation, metadata-only privacy checks, adversarial tests, and a 10,000-composition
performance sentinel.

A3B3B excludes `needs_input` and infrastructure `failed` receipt production, provider/model/process
execution, CLI discovery, lifecycle orchestration, environment/settings/hook inspection, evidence
production, credentials/sessions, clocks, filesystem/network, cost lookup, receipt persistence,
evidence sinks, dashboard/database/target changes, target `.Codex` edits, sync, A4, release, tag,
publication, and visibility changes.

## Architecture decision record

### Context

The A2 receipt intentionally omits the A3B3A `satisfied` flags and provenance-mode fields. Directly
mapping an ineligible attestation would turn a false AC or artifact decision into apparent coverage.
The two tree identities also have different meanings: A3B2A cleanup binds the initial materialized
tree, while A2 pairwise reporting needs the independently verified final candidate tree.

### Options considered

| Option | Complexity | Trust property | Decision |
|---|---:|---|---|
| Map every admitted A3B3A receipt | Low | Drops false decisions and fabricates A2 coverage | Rejected |
| Relabel policy/attestation hashes into unrelated A2 fields | Low | Corrupts evidence semantics | Rejected |
| Change A2 schema before composition | High | Unnecessary public compatibility break | Rejected |
| Pure success-only composer plus A2 re-admission | Low | Preserves exact schema and fail-closed evidence | Selected |

### Decision

- **D1:** one pure integration module owns A3B3A-to-A2 composition; A2 remains the semantic owner.
- **S1:** the sole caller input is one durable A3B3A receipt re-admitted by the existing boundary.
- **E1:** composition requires `eligibleForA2Composition=true`; every other receipt fails closed.
- **M1:** every A2 field has one explicit source; no aggregate hash is copied across evidence rows.
- **V1:** the completed object is re-run through the exported existing A2 receipt validator.
- **H1:** the A2 hash is derived only after exact mapping; no caller-supplied A2 hash is accepted.
- **P1:** output contains only the exact metadata-only A2 fields and no provenance content or paths.
- **I1:** the composer owns all fresh arrays/objects and deeply freezes the admitted output.
- **N1:** TypeScript/Node remains authoritative below p95 50 ms and 64 MiB for 10,000 compositions.
- **O1:** this slice composes receipts only; orchestration, persistence, trusted producers, and A4
  remain outside scope.

## Exact field mapping

The composer maps schema version, provider, and run ID from locked A2/A3B3A identities. Execution is
exactly `{ state: "completed", reasonCodes: [] }` only after eligibility passes.

Identity mapping uses A3B3A fixture/revision/fixture/spec/prompt/seed/phase, runner/CLI/model/effort,
source commit, observation time, timeout, output cap, and attempt fields. Adapter capability,
runtime-entitlement evidence, execution policy, and authorization receipt come from the re-admitted
policy. A2 `materializedTreeSha256` maps to
`candidateVerification.candidateTreeSha256`, not A3B3A `identity.materializedTreeSha256`, because A2
uses this field as the verified implementation-tree identity.

AC rows retain each admitted ID and evidence SHA. Artifact decision IDs become A2 artifact classes
with their own hashes. Gate rows retain phase ID, conservation boolean, and distinct evidence hash.
API conservation remains the admitted boolean. Trusted verification retains exact exit code and
evidence hash. The five candidate violations plus `cleanupFailed` form the six A2 flags.

Duration, token counts, pricing state, price-basis hash, and cost map from provenance-validated A3B3A
metrics. Provenance labels and policy-mode evidence remain in A3B3A and are not relabelled into A2.

## Validation and privacy boundary

The public A2 validator becomes callable through a narrow exported admission function that reuses
the existing exact-key/plain-data/hash validation. The composer invokes it on the freshly hashed
receipt before returning. This export does not add a new schema or weaken evaluator validation.

The caller's attestation and every nested value are treated as untrusted. Durable A3B3A re-admission
rejects unknown, inherited, accessor-backed, cyclic, malformed, privacy-unsafe, or hash-invalid
input. Fresh mapping prevents later caller mutation from changing the output; deep freezing prevents
consumer mutation. Raw prompt/spec/source/diff/transcript/response/session/environment/path/error
content has no output field and remains prohibited.

## Attack and evidence ladder

1. Register this plan, source ceiling, validator, package/full-suite route, roadmap/design anchors,
   and public manifest; record the expected missing-composer RED.
2. Export the existing A2 receipt admission function without changing its validation semantics.
3. Prove exact happy-path mapping and fresh A2 receipt hashing against the A2 validator/evaluator.
4. Attack false AC/artifact/gate/API decisions, failed candidate/test, mutation, violations, and
   cleanup failure; every ineligible receipt must fail before A2 emission.
5. Attack attestation/policy/candidate hashes, provider/run/identity substitution, tree confusion,
   reordered or duplicated evidence, and metric contradictions through durable re-admission.
6. Prove the verified candidate tree, distinct evidence hashes, exact policy hashes, nullable
   metrics, and all six violation fields reach their one intended A2 destination.
7. Attack caller mutation, output mutation, unknown fields, raw content/path/secret/transcript data,
   and direct arbitrary A2 admission with a recomputed but contradictory hash.
8. Run 10,000 deterministic compositions; record p95, wall time, RSS delta, and zero I/O calls.
9. Run strict TypeScript, A2/A3B2A/A3B2B/A3B3A compatibility, roadmap/provider/privacy/public/
   cross-platform gates, and the complete native kit suite before source commit.
10. Commit source first, then add one metadata-only evidence file and its one sorted public-manifest
    row in a separate commit before remote qualification.

## TypeScript performance decision

Composition is bounded object mapping, SHA-256, and existing pure validation in the current Node
runtime. A new language or sidecar would add serialization, packaging, SBOM, signing, and platform
surface without evidence of need. A reproducible N1 threshold breach requires a separate ADR.

## Exact source manifest

The source commit may change exactly these eleven paths:

1. `.claude/integrations/provider-parity-receipt-composer.test.ts`
2. `.claude/integrations/provider-parity-receipt-composer.ts`
3. `docs/design/multi-provider-backends.md`
4. `docs/roadmap/p17-007-a3b3b-a2-receipt-composition-plan.md`
5. `docs/roadmap/post-17-roadmap.md`
6. `package.json`
7. `packages/core/src/provider-parity-evaluator.ts`
8. `release/public-release-manifest.json`
9. `scripts/post-17-provider-parity-attestation-plan.test.ts`
10. `scripts/post-17-provider-parity-candidate-verifier-plan.test.ts`
11. `scripts/post-17-provider-parity-receipt-composition-plan.test.ts`

Qualification evidence later adds exactly
`docs/evidence/post-17-provider-parity-a3b3b-a2-receipt-composition-2026-08-22.md` plus its one sorted
`release/public-release-manifest.json` row in a separate commit.

## Rollback and next gates

Rollback is normal revert of the bounded evidence/source commits or restore from the verified
2026-08-22 backup. The pure composer owns no resource and leaves no scratch root or external state.

A4 remains prohibited until trusted provider-specific producers independently prove executable,
version, flags, runtime entitlement, authorization, cost policy, managed-policy/hook enforcement,
isolated execution, evidence capture, zero-residue cleanup, and an approved evidence sink for Codex,
Claude, and Copilot.

## Non-claims

A3B3B does not claim any provider is installed, authenticated, entitled, authorized, model-ready,
executed, policy-safe, hook-safe, cleaned, equivalent, or ranked. It does not create a real A2
receipt, complete A3/A4, persist evidence, update the dashboard, or finish P17-007.

No provider/model/process execution, credential/session access, filesystem/environment/network
inspection, package install, database/dashboard/target mutation, target `.Codex` edit, sync,
direct-main push, force, tag, release, publication, or visibility change occurs in this slice.
