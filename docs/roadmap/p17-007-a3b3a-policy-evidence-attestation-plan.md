# P17-007 A3B3A Policy and Evidence Attestation Contract

Status: approved A3B3A pure attestation implementation; zero provider execution.
Date: 2026-08-21
Parent: exact qualified `main` `081f5af62cd03d8fbdbc2dd7c484830a25e45963`
Decision lock: `domain=D1, identity=I1, policy=P1, hooks=H1, evidence=E1, metrics=M1, verification=V1, cleanup=C1, privacy=R1, runtime=N1, scope=O1`

## Outcome

A3B3A adds a provider-neutral pure boundary for hash-binding the trusted inputs that a later A3B3B
composer needs before it can emit the exact A2 candidate receipt. It represents both a pre-run
execution-policy attestation and a post-run evidence attestation without inspecting a machine,
launching a process, or claiming that supplied evidence exists.

The boundary is fail-closed. It rejects a policy attestation unless environment, filesystem, network,
settings, managed-policy, hooks, runtime entitlement, authorization, and adapter capability are each
bound by a distinct SHA-256 evidence identity. It rejects post-run evidence unless the exact policy,
provider/run identity, phase contracts, acceptance criteria, artifacts, API decision, A3B2B candidate
verification, A3B2A cleanup outcome, and metric provenance are structurally and cryptographically
consistent. Returned receipts contain metadata only and are deeply immutable.

## Reconciled evidence and prerequisites

- A2 owns the exact candidate receipt schema and closed evaluation vocabulary.
- A3A supplies only an offline Claude output/cost adapter foundation; it does not prove runtime
  entitlement, authorization, managed policy, hooks, phase conservation, or cleanup.
- A3B1 supplies the bounded direct-process primitive but does not choose or attest its environment.
- A3B2A owns the isolated-root capability and cleanup receipt.
- A3B2B owns candidate inventory and trusted-test metadata. Its `docs/plan.md` path is optional, so
  its aggregate verification hash cannot honestly be relabelled as all A2 artifact evidence.
- Exact qualified base is `081f5af62cd03d8fbdbc2dd7c484830a25e45963`; no A4 provider receipt
  exists and external execution remains prohibited.

## Scope and non-scope

A3B3A includes exact-key plain-data validation, canonical hashing, distinct policy evidence classes,
closed settings/managed-policy/hook modes, exact provider/run identity binding, the locked A1 fixture
and B3/B10/B11 identities, canonical AC/artifact/gate evidence, A3B2B receipt admission, A3B2A cleanup
success/failure representation, metric provenance, privacy-safe identifiers, immutable metadata-only
receipts, replay determinism, mutation attacks, and a 10,000-composition performance sentinel.

A3B3A excludes provider/model/process execution, CLI or environment discovery, settings or hook file
inspection, credentials/sessions, filesystem access, network, clocks, cost lookup, evidence capture,
A2 receipt emission, persistence, database/dashboard/target changes, target `.Codex` edits, sync,
release, publication, and visibility changes. Trusted producers remain responsible for establishing
the evidence whose hashes are supplied to this pure boundary.

## Architecture decision record

### Context

Directly mapping the A3B2B aggregate hash into every A2 evidence row would allow an absent plan or
unproven phase to appear verified. Trusting a provider adapter to declare that hooks were absent would
repeat the same self-attestation flaw. The contract therefore needs distinct evidence identities and
closed modes before composition.

### Options considered

| Option | Complexity | Trust property | Decision |
|---|---:|---|---|
| Reuse one A3B2B aggregate hash for all A2 fields | Low | Fabricates missing evidence | Rejected |
| Let each provider emit an A2 receipt directly | Medium | Duplicates policy and trusts provider output | Rejected |
| Pure provider-neutral policy/evidence attestation, then a later composer | Medium | Distinct evidence, deterministic attacks | Selected |
| Inspect provider settings and hooks in this module | High | Adds filesystem/provider coupling | Deferred to trusted producers |

### Decision

- **D1:** one pure module owns exact schemas, validation, hashing, and immutable output.
- **I1:** every record binds the exact provider, run, fixture, source commit, model, runner, adapter,
  entitlement, authorization, execution policy, and phase identities; cross-run reuse is rejected.
- **P1:** the pre-run policy has distinct hashes for explicit environment allowlist, isolated-root
  filesystem enforcement, provider-control-only network enforcement, settings boundary, managed
  policy, and hooks. One aggregate hash cannot substitute for a missing class.
- **H1:** settings mode is exactly `isolated-empty-v1` or `independently-attested-v1`; managed-policy
  mode is exactly `absent-v1` or `independently-attested-v1`; hook mode is exactly `disabled-v1` or
  `independently-attested-empty-v1`. Every non-isolated claim still requires its own trusted hash.
- **E1:** acceptance criteria are exactly `AC-1..AC-3`; artifacts use the locked A2 order; gates are
  exactly B3/B10/B11 with their A1 contract hashes. Each row has its own evidence hash and closed
  boolean, so missing or failed evidence remains visible rather than being invented.
- **M1:** duration/tokens/cost are nullable and each metric source is `provider`, `trusted-runner`, or
  `unavailable`; priced cost requires an exact price-basis hash and all token counts.
- **V1:** the admitted A3B2B receipt must pass its own hash, exact-key, fixture, test-command, state,
  reason, violation, and metric invariants. A supplied provider success string has no standing.
- **C1:** cleanup is a closed success receipt or a metadata-only failure receipt. Success binds the
  exact materialized tree and `zeroResidue=true`; failure makes `cleanupFailed=true` later.
- **R1:** no paths, source bytes, prompts, diffs, transcripts, response bodies, session IDs, usernames,
  environment values, or exception text may enter either receipt.
- **N1:** TypeScript/Node remains authoritative while 10,000 pure post-run compositions stay below
  p95 50 ms and 64 MiB incremental RSS.
- **O1:** A3B3A creates attestations only. A3B3B remains responsible for exact A2 receipt assembly;
  A4 remains prohibited.

## Pre-run policy attestation contract

The pre-run input contains exact schema version, provider, run ID, execution-policy identity,
adapter-capability identity, runtime-entitlement evidence, authorization receipt, issue/expiry UTC
timestamps, and six separately hashed enforcement facts. Policy expiry must be later than issuance.
All IDs use bounded safe alphabets; all hashes are lowercase SHA-256.

The settings, managed-policy, and hook modes are closed. The module does not infer truth from a mode;
it requires a distinct trusted evidence hash for every class and binds all fields into
`policyAttestationSha256`. The output is metadata-only, deep-frozen, and cannot be mutated for reuse.

## Post-run evidence attestation contract

The post-run input must bind the exact admitted policy plus provider/run identity, locked fixture and
phase identities, runner/CLI/model/effort/source commit, canonical observation timestamps, exactly one
attempt, and A2 timeout/output ceilings. It contains:

1. exactly three ordered acceptance-criterion decisions;
2. exactly four ordered artifact decisions (`plan`, `implementation`, `test`, `trusted-verification`);
3. exactly three ordered B3/B10/B11 conservation decisions and contract hashes;
4. one API-conservation decision;
5. one exact A3B2B verification receipt;
6. one exact A3B2A cleanup success or bounded failure receipt; and
7. nullable duration/token/cost metrics with explicit provenance.

The resulting receipt keeps each decision and hash, derives `cleanupFailed`, binds the policy hash,
and adds `evidenceAttestationSha256`. It does not emit an A2 candidate receipt or convert a failed
decision into a pass. A3B3B must later map only these admitted fields and re-run the A2 validator.

## Attack and evidence ladder

1. Register this plan, validator, nine-path source ceiling, package/full-suite route, architecture/
   roadmap anchors, and public manifest; record the expected missing-module RED.
2. Prove exact policy hashing, closed modes, distinct evidence classes, issue/expiry ordering, deep
   immutability, clone determinism, and no caller mutation.
3. Attack unknown/inherited/accessor/symbol/cyclic/oversized fields, duplicate hashes where evidence
   classes must remain distinct, malformed IDs/hashes/timestamps, cross-provider/run substitution,
   stale policy, and altered policy hashes.
4. Prove exact AC/artifact/gate order and A1 phase hashes; attack missing, duplicate, reordered,
   fabricated, or cross-run evidence and preserve every false decision.
5. Admit exact A3B2B passed/failed receipts; attack its hash, test command, fixture, reason order,
   violations, mutation state, process count, and trusted-test contradictions.
6. Admit exact A3B2A cleanup success and metadata-only cleanup failure; attack tree mismatch,
   zero-residue contradiction, unknown error data, and false cleanup success.
7. Attack metric nullability, pricing contradictions, untrusted provenance, negative/non-integral
   tokens, non-finite cost/duration, raw content/path/secret/transcript fields, and prototype tricks.
8. Run 10,000 deterministic compositions; record p95, wall time, RSS delta, zero process/provider/
   model/network/filesystem/credential/database/dashboard/target/sync calls.
9. Run strict TypeScript, predecessor/neighbor compatibility, provider/public/cross-platform gates,
   and the complete native kit suite before source commit.
10. Commit source first, then add one metadata-only evidence file plus one sorted manifest row and
    qualify immutable exact HEAD before any retained Draft PR.

## TypeScript performance decision

This boundary performs bounded validation and SHA-256 over small metadata records. Node already owns
the A2 evaluator and all predecessor contracts, so a new runtime would add serialization, packaging,
signing, and cross-platform surface without a measured benefit. A reproducible N1 breach requires a
new ADR before changing runtime.

## Exact source manifest

The source commit may change exactly these nine paths:

1. `.claude/integrations/provider-parity-attestation.test.ts`
2. `.claude/integrations/provider-parity-attestation.ts`
3. `docs/design/multi-provider-backends.md`
4. `docs/roadmap/p17-007-a3b3a-policy-evidence-attestation-plan.md`
5. `docs/roadmap/post-17-roadmap.md`
6. `package.json`
7. `release/public-release-manifest.json`
8. `scripts/post-17-provider-parity-attestation-plan.test.ts`
9. `scripts/post-17-provider-parity-candidate-verifier-plan.test.ts`

Qualification evidence later adds exactly
`docs/evidence/post-17-provider-parity-a3b3a-policy-evidence-attestation-2026-08-21.md` plus its one
sorted `release/public-release-manifest.json` row in a separate commit.

## Rollback and next gates

Rollback is deletion/revert of the bounded branch commits or restoration from today's verified
backup. A3B3A owns no external resource and leaves no scratch root. A3B3B may compose an A2 receipt
only from exact admitted A3B3A metadata and must prove byte-for-byte schema compatibility.

A4 remains prohibited until provider-specific trusted producers prove runtime entitlement,
authorization, exact executable/version/flags, cost policy, policy/hook enforcement, isolated
execution, evidence capture, cleanup, and an approved evidence sink for all three providers.

## Non-claims

A3B3A does not claim a provider is installed, authenticated, entitled, authorized, model-ready,
executed, policy-safe, hook-safe, cleaned, equivalent, or ranked. It does not claim an A2 receipt
exists, A3 is complete, or P17-007 is done.

No provider/model/process execution, credential/session read, filesystem/environment inspection,
network request, package install, database/dashboard/target mutation, target `.Codex` edit, sync,
direct-main push, force, tag, release, publication, or visibility change occurs in this slice.
