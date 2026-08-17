# P17-014 A3B — Worker Request Authentication and Machine Key Lifecycle Evidence

Date: 2026-08-17
Status: source complete and locally proven; evidence commit pending at capture time
Roadmap task: P17-014
Slice: A3B

Decision lock:

`slice=A3B, request=W1, path=P1, freshness=F1, nonce=N1, keyset=K1, rotation=R1, revocation=V1, composition=C1, sequence=Q1, evidence=E1`

## Verdict

P17-014 A3B is complete locally at source commit
`a836decd6b49da4f0977dba18932ebeea6c94303`.

The slice adds two pure Clean Architecture domain modules:

- an exact public-only machine key-set lifecycle and authorization boundary; and
- an exact Ed25519 worker-request wrapper and injected authentication composition boundary.

The source commit has the exact predecessor
`ecd4d8e04717765d0a0ed389b068c841de5b4962`, changes nine files, and contains 2,681 insertions and
5 deletions. It was created by a normal Git commit after the tracked `spec-integrity` hook passed.

The immutable source passes:

- the A3B plan gate;
- 7 machine-key behavior groups;
- 10 worker-request authentication behavior groups;
- TypeScript 5.9.3 strict with `skipLibCheck=false` and zero diagnostics;
- 21 predecessor and neighbor commands;
- the complete `test:kit` suite with exit `0`; and
- exact source-SHA, clean-worktree, backup, and dashboard-preservation checks.

No persistence, HTTP route, worker runtime, remote execution, sync, target edit, dashboard edit,
database action, or deployment is claimed by this evidence.

## Starting state and predecessors

The accepted P17-014 topology is ADR-003 M1. The parent implementation plan makes A3 pure contracts
locally derivable before privacy-gated persistence.

A3A already supplied exact domain-separated Ed25519 signer and verifier ports plus the isolated real
Node adapter. The exact predecessor chain used by A3B is:

| Boundary | Source/evidence identity |
|---|---|
| A3A detached signing source | `2a96bd7e052b6e7753e96cc255cba20583369b3c` |
| A3A detached signing evidence | `f56288ca19bb727d228fbaf6c4a95b315acda2c6` |
| Clean-checkout repository-boundary source | `3b1fab07ca7274a35d3cad64d1cdd04417c4da85` |
| Clean-checkout repository-boundary evidence / A3B parent | `ecd4d8e04717765d0a0ed389b068c841de5b4962` |

Read-only reconciliation positively located the A3A plan, source, adapter, and tests. A separately
controlled A3B path inventory found no A3B plan, source, or test before this slice. No prior A3B
implementation was overwritten or silently reclassified.

## Scope and ownership

### Machine key lifecycle

`packages/core/src/control-plane-machine-keys.ts` owns:

- schema and contract versions;
- exact deeply frozen key-set and public-key record values;
- at most eight sorted public key records;
- one highest-version active key or no active key;
- monotonically advancing key-set CAS versions;
- initial active-key creation from an already authorized public input;
- active-key-only rotation with a single non-renewable grace window;
- immediate idempotent revocation without fallback; and
- active, retiring, retired, and revoked request authorization decisions.

It owns no key generation, secret key material, enrollment grant, storage, database row identity,
network, process, provider, host, email, or runtime adapter.

### Worker request authentication

`packages/core/src/control-plane-worker-request-auth.ts` owns:

- one exact Ed25519 request signature wrapper;
- the five closed kinds `claim`, `heartbeat`, `events`, `complete`, and `key_rotate`;
- exact `POST` path derivation from request kind and optional lowercase UUID lease identity;
- exact UTF-8 body hashing with a 64 KiB bound;
- canonical 32-byte unpadded base64url nonce validation;
- a 60-second maximum age and 30-second future-skew window from one injected clock read;
- key-set resolution through a tenant/machine-only port;
- verifier construction through the A3A detached verifier interface;
- a domain-separated tenant/machine/key-bound nonce hash; and
- atomic nonce consumption with the observed key-set version.

It owns no database transaction, HTTP handler, session, cookie, authorization header, enrollment,
nonce generation, worker loop, execution mutation, provider call, or network listener.

### One-way dependency rule

The dependency direction is:

`A3A signer/verifier ports -> A3B request composition <- A3B machine-key policy`

Injected clock, key-set lookup, verifier-factory, hash, and authorized-nonce ports point inward to the
pure request policy. No A3A module imports A3B. No A3B production module imports Node, filesystem,
environment, process, network, dashboard, provider, or persistence code.

## Plan-before-code evidence

The standalone validator was added before its plan and registrations. Its first execution exited
`1` with exactly these readiness gaps:

1. `A3B worker-request authentication plan`;
2. `focused package registration`; and
3. `full-kit registration`.

The plan then locked W1/P1/F1/N1/K1/R1/V1/C1/Q1/E1, exact contracts, source ownership, attack
matrix, implementation sequence, source manifest, rollback, and non-claims.

Two wording checks initially failed because semantically correct prose did not contain the exact
machine-checked canonical-path and 64 KiB phrases. A complete normalized phrase audit found the
remaining missing strings in one pass. After only equivalent documentation clarification, the plan
validator passed:

`P17-014 A3B plan: PASS (W1/P1/F1/N1/K1/R1/V1/C1/Q1/E1 locked)`

Production modules were still absent at that point.

## Behavior RED evidence

Both behavior suites and their package/full-kit registrations were present while production modules
were absent.

The machine-key suite exited `1` with:

`Cannot find module '../src/control-plane-machine-keys'`

The worker-request suite independently exited `1` at the same missing machine-key boundary before a
production export could satisfy it. This proves the behavior gates preceded implementation rather
than being added after a green source.

## First implementation runs

The first unchanged machine-key behavior run passed all 7 groups:

1. exact, bounded, public-only, deeply frozen initial state;
2. structural, ordering, duplicate, and state attacks;
3. single-version rotation and immutable grace windows;
4. stale authority, gap, reuse, grace-extension, and record-overflow denial;
5. immediate CAS-aware idempotent revocation without fallback;
6. active/grace/rotation/revocation/identity authorization; and
7. pure source ownership.

The first unchanged worker-request behavior run passed all 10 groups:

1. real Ed25519 round trip, exact wrapper order, freeze, and nonce safety;
2. five kind-to-path derivations and kind/lease/path confusion attacks;
3. exact UTF-8 body bytes, empty body, and 64 KiB boundary;
4. inclusive freshness boundaries and closed clock failures;
5. tenant/machine/key/grace/rotation/revocation composition;
6. wrong key, signature tamper, and verifier failure denial;
7. replay, concurrent duplicate, key change, denial, and nonce-port failures;
8. exact wrapper encoding and object-graph attacks;
9. hash, lookup, canonical-byte, and non-echo failures; and
10. source ownership and A3A authorization neutrality.

The first combined focused verdict was 17/17 groups.

## Type-safety corrections

The first attempted TypeScript 5.9.3 command resolved the repository-local TypeScript 4.9.5 binary
instead of the requested cached compiler. It emitted only parser errors in the installed modern Node
declarations and produced no A3B verdict.

The next command executed the absolute cached TypeScript 5.9.3 `tsc.js` and proved its version before
checking the exact graph. It reported:

- one production diagnostic where an `unknown` record property was referenced inside an array
  callback after validation; and
- two test-helper diagnostics where default timestamp parameters inferred single literal types.

The production code now captures the validated set version in a local number before the callback.
The two fixture parameters are explicitly typed as strings. No runtime rule changed.

After this correction:

- both focused suites remained 17/17; and
- TypeScript 5.9.3 strict passed with `skipLibCheck=false` and zero diagnostics.

## Adversarial review corrections

Manual review compared source behavior directly with the locked plan instead of accepting the first
green tests. It found and closed these gaps:

| Finding | Correction and regression |
|---|---|
| Revoking a retiring key preserved its obsolete retirement deadline | Revocation now clears `retireAt`; validation rejects any revoked record that carries one |
| A structurally valid set could name a lower-version active key | Validation now requires the active key to be the highest record version |
| Authorization checked signing time but not observation time against activation | Pre-activation observation now returns closed key denial |
| Key-set lookup received key ID/version beyond its tenant/machine ownership | The port now receives exactly tenant and machine UUIDs; the test locks exact keys |
| Nonce hash included only its domain and raw nonce | Canonical nonce-hash input now binds tenant, machine, key ID, key version, and nonce |
| Key arrays could carry hidden own metadata | Exact array own-key validation rejects hidden and symbol fields |
| Public SPKI text did not constrain unused base64url tail bits | Canonical unpadded base64url tail rules are now validated and attacked |

The hardened focused result remains 17/17 and strict TypeScript remains green.

## Security and failure-order evidence

Authentication is fixed in this order:

1. validate exact wrapper, expected kind/lease/path, body bound, body hash, and canonical inputs;
2. read and validate the injected clock exactly once;
3. enforce age and future-skew bounds before lookup;
4. resolve and exactly validate the tenant/machine key set;
5. authorize the referenced key for state, usage, signed time, observed time, and grace;
6. create the verifier and verify exact canonical signing bytes;
7. derive the domain-separated nonce hash; and
8. atomically consume it while rechecking the observed key-set version.

No nonce call occurs for malformed, stale, wrong-body, wrong-key, or invalid-signature requests.
Concurrent replay accepts at most one request. A `key_changed` result is a closed denial, requiring a
new request after fresh state resolution. Revoked keys are denied immediately, including during a
former grace window, and active-key revocation never promotes an older key.

Public failures are limited to `worker_request_denied` or `worker_request_unavailable` plus bounded
audit codes. Tests prove that body, nonce, signature, public key, dependency exception text, and
attacker-controlled values are not echoed.

## Focused and companion proof

At immutable source SHA `a836decd6b49da4f0977dba18932ebeea6c94303`, 24 commands passed in
10.5 seconds:

- A3B plan;
- A3B machine-key lifecycle, 7 groups;
- A3B worker-request authentication, 10 groups; and
- the 21 commands below.

| Companion | Terminal result |
|---|---|
| 22-task post-17 roadmap | PASS: 22 tasks, 4 initiatives |
| Public-release plan | PASS: 18 sections; input complete and ready |
| Control Plane topology | PASS: 22 sections; T1/M1/X1/R1/E1/S1 accepted |
| Parent implementation plan | PASS: topology plus C1/O1/P1/V1/Q1/D1/E1/X0 locked |
| A2A plan | PASS: R1/C1/I1/B1/H1/A1/Q1/E1 |
| A2B plan | PASS: E1/I1/O1/T1/D1/H1/B1/Q1/V1 |
| A2C plan | PASS: S1/V1/L1/C1/R1/U1/I1/Q1/E1 |
| A2D plan | PASS: P1/R1/B1/S1/C1/L1/H1/Q1/E1 |
| A3A plan | PASS: S1/E1/R1/C1/K1/D1/Q1/V1 |
| A2A registry/capability | PASS: 11 groups |
| A2B execution envelope | PASS: 12 groups |
| A2C state/lease/replay | PASS: 12 groups |
| A2D progress binding | PASS: 10 groups |
| A3A detached signing | PASS: 10 groups |
| P17-015 cross-machine progress | PASS: 6 assertions and 22 attacks |
| Project Intelligence | PASS: canonical/schema/read-only proof and 11 negative controls |
| Workflow Orchestrator | PASS: 24 phases and 26 attacks |
| Provider bundles | PASS: three providers and shared-runtime integrity |
| Tenant attestation | PASS: 4 contracts and 8 attack groups |
| Privacy policy | PASS: 8 families, 10 contract groups, and 15 attack groups |
| CI repository boundary | PASS: 8 workspace commands excluded from `test:kit` |

TypeScript 5.9.3 strict also passed on the exact source SHA with zero diagnostics.

## Complete-suite proof

The first source-candidate `test:kit` attempt was not a product verdict. It reached the existing
disposable `record-verify.b2b` child fixture, where `npx tsx` had no local dependency and the new
isolated npm cache could not access the registry under sandbox restrictions. It stopped with an
`EACCES` fetch error after five of six B2B groups. HEAD remained unchanged and the preload was
deleted.

The same source candidate then ran with scoped npm-network permission and the same isolated cache:

- exit: `0`;
- elapsed: 344 seconds;
- captured output: 1,755 lines;
- HEAD before/after: exact predecessor working candidate;
- version stamps: v3.25 aligned;
- prompt budget: 163,206 of 176,128 bytes;
- lesson sync: 60/60; and
- temporary preload: deleted immediately.

After the source commit, the authoritative immutable-SHA rerun passed:

- source SHA: `a836decd6b49da4f0977dba18932ebeea6c94303`;
- exit: `0`;
- elapsed: 238.5 seconds;
- captured output: 1,755 lines;
- HEAD before/after: exact source SHA;
- worktree status after: clean;
- version stamps: v3.25 aligned;
- prompt budget: 163,206 of 176,128 bytes;
- lesson sync: 60/60; and
- temporary preload: deleted immediately.

## Static, naming, and documentation audit

The exact source manifest audit proved:

- exactly nine authorized files;
- final LF and zero trailing whitespace in every file;
- parseable `package.json`;
- focused A3B commands registered in `test:kit`;
- public names consistently use `ControlPlaneMachineKey` and `ControlPlaneWorkerRequest` prefixes;
- English-only feature content, with exactly two intentional `é` values in the UTF-8 byte-boundary
  test fixture;
- seven positive-controlled credential, internal-domain, live-project, and host-path detectors with
  zero added-content hits;
- no Node, filesystem, process, network, provider, dashboard, or persistence dependency in the two
  pure source modules;
- no secret-key property or generic authorization-header vocabulary in the pure source; and
- no temporary preload after each gate.

`packages/core/README.md` now documents the A3A/A3B ownership boundary, exact public behavior, port
composition, and explicit non-claims. The names describe protocol responsibility and do not mention
Supabase, a provider, a dashboard, or an implementation location.

## Runtime-language decision

TypeScript remains the correct language for A3B. The slice performs bounded validation and
asynchronous port orchestration over existing TypeScript A2/A3A contracts. Real Ed25519 operations
already execute in Node's native crypto implementation.

No measured request latency, throughput, memory, key-set size, binary size, or capability limit was
breached. Rust or Go would introduce FFI or sidecar, cross-platform build, key-lifetime, and
distribution surfaces before a measured need. Python would add a second runtime and cryptography
package boundary without supplying a missing method. Reconsider Rust or Go only if later worker
benchmarks miss an accepted signing, dispatch, or state budget; Python remains appropriate for
offline analysis rather than this trust boundary without evidence.

## Backup and preservation proof

The verified pre-change kit backup is:

- path: `_backups/claude-workflow-kit/2026-08-17/claude-workflow-kit-2026-08-17.zip`;
- SHA-256: `d175cad9f64b9e02ac4a037151a27adbace3e0d76d6e9eb21ecf56c0844df196`; and
- immutable tag: `backup/2026-08-17` at
  `38888187c4191206dbb81562ccb387463fcbbc76`.

The dashboard tracked tree remained unchanged at
`1c5442a56e127ad5b35a684d47f9c40b787ee9ed`. Its user-owned local settings file was never read,
edited, staged, or deleted. No target `.Codex` directory was modified.

The disposable npm cache is under the workspace scratch boundary and is not part of the source
manifest. Every disclosed `os.userInfo` preload was deleted immediately after its command.

## Commit evidence

Source commit:

`a836decd6b49da4f0977dba18932ebeea6c94303`

Sole parent:

`ecd4d8e04717765d0a0ed389b068c841de5b4962`

Exact source manifest:

1. `docs/roadmap/p17-014-a3b-worker-request-auth-plan.md`
2. `docs/roadmap/p17-014-control-plane-implementation-plan.md`
3. `package.json`
4. `packages/core/README.md`
5. `packages/core/src/control-plane-machine-keys.ts`
6. `packages/core/src/control-plane-worker-request-auth.ts`
7. `packages/core/test/control-plane-machine-keys.test.ts`
8. `packages/core/test/control-plane-worker-request-auth.test.ts`
9. `scripts/post-17-control-plane-a3b-plan.test.ts`

The normal Git Bash commit path executed the tracked hook successfully:

`spec-integrity OK — 5 .ts, 0 feature(s) checked (382ms)`

This evidence file is intentionally excluded from the source commit and must be the only file in a
separate evidence commit whose sole parent is the source SHA.

## Pull request and merge recommendation

After the evidence-only commit is proven, publish one non-force branch:

`p17-014-a3b-worker-request-auth`

The stacked PR base is the existing branch `p17-014-a3a-detached-signing` at exact evidence head
`ecd4d8e04717765d0a0ed389b068c841de5b4962`. That produces a two-commit A3B PR: one nine-file source
commit plus one evidence-only commit. It avoids publishing the unrelated main delta.

Merge recommendation: approve A3B only after its own local and remote Linux/Windows checks are green
and after PR #2 plus every earlier stacked predecessor is accepted in dependency order. Do not merge
A3B directly into remote main while its base branch is unaccepted. Do not force-push, auto-merge, or
claim that a green stacked diff resolves the predecessor chain.

No push or PR mutation occurred while writing this evidence.

## Rollback

Before publication, rollback is the exact source/evidence commit pair or the verified daily backup.
After publication, revert the A3B evidence commit and source commit in reverse order without resetting
or overwriting unrelated work.

A3B creates no stored key, nonce, row, route, process, or remote request. Rollback therefore requires
no credential revocation, data migration, deployment, dashboard repair, or target repair.

## Non-claims

This evidence does not prove or enable:

- enrollment grants;
- secret-key generation, storage, or permissions;
- cryptographic nonce generation;
- tenant persistence or database CAS;
- an implemented nonce repository;
- RPCs or HTTP routes;
- session authentication, RBAC, CSRF, or origin enforcement;
- worker polling or process execution;
- lease or progress mutation;
- transactional execution state or crash recovery;
- provider integration;
- dashboard UI;
- distribution packaging;
- remote execution;
- deployment;
- P17-014 completion; or
- merge readiness before the predecessor stack is accepted.

No sync, target edit, direct-main push, force push, merge, tag creation, release, database mutation,
dashboard source change, or target `.Codex` modification was performed by A3B.
