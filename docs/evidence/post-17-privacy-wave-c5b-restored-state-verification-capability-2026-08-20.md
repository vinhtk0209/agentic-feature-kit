# P17-016 Wave C5B restored-state verification capability evidence

**Date:** 2026-08-20
**Status:** Source-qualified; exact-head remote qualification pending
**Roadmap task:** P17-016
**Decision lock:** `A1/P1/H1/S1/R1/B1/Q1/M1/O1/N1`
**Source commit:** `820d5816d2e6af885b67000fac9a204ba9924073`
**Source parent:** `d03dd8464a3dab4a5d41e7b8d8d7b5711eea8e72`
**Source tree:** `0dc08ae295960170248bb7883effd59542c4557c`

## Outcome

The seventh canonical C5B operation now has a provider-neutral Node capability instead of an
arbitrary caller-authored five-field parity claim. It admits only the exact six passed predecessor
receipts. It independently obtains restored catalog/ACL rows and the four source component digests,
then executes a closed rollback-suite capability bound to the attempt, packet, backup, and restore
manifest.

Catalog and ACL comparison no longer duplicates the initial probe algorithm. The existing probe and
the verifier share one canonical transcript implementation with identical scalar validation, byte
bounds, ordering, schema/policy domains, and SHA-256 bytes. Success contains only the existing five
metadata fields. Failure remains terminal for the factory and leaves cleanup to the canonical
operator step.

This is local infrastructure qualification. No provider adapter, database read, rollback execution,
cleanup, writer mutation, sync, release, or publication action occurred.

## Qualified source boundary

The source commit changes exactly 12 paths:

- `.claude/integrations/core/live-cutover-catalog-acl-probe-node.ts`;
- `.claude/integrations/core/live-cutover-catalog-acl-transcript.ts`;
- `.claude/integrations/core/live-cutover-restored-state-verification-node.ts`;
- `docs/roadmap/p17-016-wave-c5b-restored-state-verification-capability-plan.md`;
- `package.json`;
- `packages/core/src/live-cutover-catalog-acl-probe-node.ts`;
- `packages/core/src/live-cutover-catalog-acl-transcript.ts`;
- `packages/core/src/live-cutover-restored-state-verification-node.ts`;
- `packages/core/test/live-cutover-restored-state-verification-node.test.ts`;
- `release/public-release-manifest.json`;
- `scripts/build-synced-core.ts`; and
- `scripts/post-17-privacy-wave-c5b-restored-state-verification-capability-plan.test.ts`.

Canonical/generated SHA-256 pairs are exact:

- shared transcript: `a9f83ad8ca792ea0c140cd6de1ccf4d0899879b469c89aada6859ae0c052cf43`;
- refactored catalog/ACL probe: `17aba97cf6cbe197ace1cfb7e5863dea1bca1fb5ae0588fe5e430c12802495ee`;
- restored-state verifier: `417e254e04411aaf7f5fe247d753491a092bb4fc2895c627a528e8ee20505bc3`.

The source manifest has `721` unique JavaScript-ordinal-sorted entries and exactly seven new public
source admissions. Existing modified paths retain their prior single admissions.

## Runtime contract

### Exact admission and lifecycle

- The context must contain one validated packet and exactly six passed predecessor receipts.
- The next canonical operation must be `verify_restored_state`.
- Backup and restore digests must already satisfy the core isolated-restore relationship.
- Invalid prefixes perform zero capability calls and do not consume the factory.
- Once metadata observation starts, concurrent replay, sequential replay, and overlapping packets
  are refused. Success and every admitted failure quarantine the factory.

### Shared transcript

- Catalog/ACL scalar, key, Unicode, row, field, rowset, and aggregate bounds are centralized.
- Rows are fixed-key canonical JSON, byte-sorted, and duplicate-refusing.
- Catalog hashing includes the server version; ACL hashing retains its original domain.
- Both hashes preserve the exact initial probe schema and policy domains.
- Comparison to the initial receipt uses timing-safe equality. Infrastructure cannot supply a final
  digest or parity boolean.

### Independent source proof

- Metadata observation contains exactly the four migration/rollback source digests from the packet.
- Every digest must be lowercase canonical SHA-256 and match its packet component independently.
- The verifier emits the existing packet source-binding hash only after all component checks pass.
- No component digest appears in the result.

### Closed rollback transcript

- Expected test IDs are immutable, unique, ordinal-sorted, closed identifiers from configuration.
- The request binds the same attempt, packet, environment, backup, restore manifest, expected IDs,
  and abort signal.
- The result binds schema, attempt, packet, backup, manifest, canonical chronology, and exactly one
  passed result per expected ID in exact order.
- Duplicate, missing, unexpected, skipped, false, reordered, malformed, or cross-artifact results
  refuse the operation.

### Bounds, privacy, and result

- Metadata and rollback share one referenced deadline timer and one `AbortSignal`.
- The total deadline is the minimum of configured timeout, packet step maximum, and remaining freeze
  time. Late metadata cannot start rollback; late results cannot mutate the closed decision.
- Trusted operation time and rollback transcript time must be canonical, monotonic, nested, and
  inside the freeze window.
- Success is one frozen decision containing exactly `catalogHash`, `aclHash`, `sourceBindingHash`,
  `sourceParity=true`, and `rollbackSuitePassed=true`.
- Raw rows, test IDs, timestamps, provider text, project/resource identity, URL, host, path, SQL,
  credential, key, and process output cannot cross the port.

## RED and review chronology

1. The registered decision validator first failed only because the plan did not exist.
2. The first plan draft then exposed exact prerequisite-path, core-path, binding-phrase, and
   derived-claim wording gaps. Each was corrected in the plan; the validator was not weakened.
3. The runtime suite reached the exact missing verifier module and failed as intended.
4. The first implementation executed all nine groups and reported an honest `6/9` RED. Review found
   three test-fixture issues: two admission assertions expected the wrong closed reason, a numeric-only
   digest made the uppercase mutation ineffective, and the operator result assertion used a missing
   property.
5. The corrected suite reached `8/9`; the operator fixture supplied a bare function instead of the
   exact clock port. After that shape was fixed, chronology correctly rejected attestation evidence
   outside its `100ms` receipt. A `500ms` deterministic cadence made the fixture contract-valid.
6. Final focused execution passes all `9/9` groups. No runtime validation was removed to obtain GREEN.
7. Strict TypeScript 5.9.3 found two real test-source mutations against readonly/literal types.
   Widening only the local attack array and using `Object.defineProperty` preserved production types.
8. The extracted initial catalog/ACL probe passes its full `9/9` regression with exact hash bytes.
9. Pre-stage public Git authority passed `6/7` and failed only on the seven new manifest paths. Exact
   12-path staging made the unchanged gate pass `7/7`.

## Focused attack matrix

The restored-state runtime passes nine grouped attacks:

1. invalid, accessor, Symbol, proxy, aliased, widened, mutable, and unsorted configuration;
2. invalid/wrong/missing prefix, concurrency, sequential replay, overlap, and zero I/O before
   admission;
3. malformed, accessor, Symbol, oversized, timed-out, aborted, late metadata and error sanitization;
4. canonical transcript permutation stability plus catalog, ACL, and server-version drift;
5. exact four-component source proof, uppercase/invalid digest, and no component leakage;
6. rollback shape, order, completeness, duplicate, failure, attempt, packet, backup, and manifest
   binding;
7. combined timeout, abort, operation/rollback chronology, invalid time, and clock rollback;
8. exact frozen metadata result, terminal single use, no cleanup surface, and static no-I/O proof;
9. real operator success to canonical cleanup plus verification-refusal compensation cleanup and
   writer unfreeze.

## Qualification matrix

| Gate | Result |
|---|---|
| Restored-state plan | PASS, ten decision locks |
| Restored-state runtime | PASS, `9/9` grouped attacks |
| Catalog/ACL shared transcript regression | PASS, `9/9` |
| Preflight core | PASS, `9/9` |
| Operator application | PASS, `9/9` |
| Logical-backup chain | PASS, executable `9/9`, connection `8/8`, adapter `11/11` groups |
| Strict TypeScript 5.9.3 | PASS, zero source diagnostics with library declarations skipped |
| Synced core | PASS, `17` byte-identical files |
| Public readiness | PASS, one canonical plus `40` attacks |
| Git-index public adapter | PASS, `7/7` after intended pre-stage RED |
| Provider distribution | PASS, `71/8/11/79/15/4` qualification counts |
| Public contract | PASS, `18` attacks plus link/license/secret/docs gates |
| Public source readiness | PASS, `721` paths, `216` Markdown, `48/48` links, zero issues |
| Dependency catalog | PASS, `4` lockfiles, `754` occurrences, `617` unique |
| Secret readiness | PASS, `718` text files, ten families, zero findings |
| Full native kit | PASS, exit `0`, `283.7s`, `2379` output lines |

The full run preserves v3.25, prompt budget `163,206/176,128`, the current feature index, and `60/60`
lesson synchronization.

## Encoding, privacy, and source audit

All 12 source paths pass strict UTF-8, no BOM, final LF, no CR, and no trailing whitespace. The
trailing-whitespace negative scan was accepted only after its positive control matched. Feature
content is English. Cached diff check and exact source Git index both pass.

Public readiness reports `721` unique ordinal-sorted paths, `48/48` valid internal links, `617`
unique dependencies, and zero findings across ten secret-detector families. The only broad manual
pattern hits are the plan validator's detector definition and constructed positive control. Runtime
modules import no filesystem, child-process, environment, network, provider SDK, database, browser,
or logging surface.

## Architecture review

The shared transcript is the single owner of byte canonicalization and domain hashing; the probe and
verifier remain orchestration adapters. The verifier depends inward on validated core contracts and
the transcript, while live database and rollback mechanisms remain injected outward-facing
capabilities. Cleanup is deliberately not composed into verification.

TypeScript remains appropriate because no measured latency or memory threshold is breached. Adding
Rust, Go, or Python would introduce a process/FFI boundary and a new cross-platform supply chain
without improving this bounded metadata operation.

## Backup and rollback

The verified daily rollback boundary predates all source edits:

- ZIP SHA-256 `f4bdc06c3f55919cfa590d90809680885f8898d29099fb7108c4a6d1e06e837a`;
- Git tag `backup/2026-08-20` at `4230aa6b7c754bfd39427b6efc60c1a124475952`; and
- exact source commit/tree listed above.

No dependency junction, hard reset, hook bypass, or direct target edit was used.

## External effects and non-claims

The restored-state source itself has not been pushed or opened as a PR at the time of this evidence
snapshot. No provider, database, dashboard, target, or Supabase mutation occurred.

No direct-main push, branch deletion, target `.Codex` edit, sync, tag, release, package publication,
marketplace publication, or visibility change occurred.

This evidence does not claim that a live project was attested, a backup was restored, restored
metadata was read, rollback tests were executed, isolated cleanup ran, writers were unfrozen, C5B is
complete, or P17-016 is complete. Operation eight cleanup and a future composition root remain.

## Remote qualification still required

The evidence commit must add only this document and its sorted manifest row. Its exact head must be
pushed non-force to the retained restored-state branch, opened as a Draft PR into current `main`, and
pass fresh Linux, Windows, aggregate, artifact, exact-head, Ready, standard-merge, merge-parent,
merge-tree, and retained-branch verification before this capability is remotely complete.
