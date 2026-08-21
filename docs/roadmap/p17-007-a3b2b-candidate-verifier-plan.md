# P17-007 A3B2B Independent Candidate Verifier and Trusted Test Runner

Status: approved A3B2B offline candidate-verifier implementation; zero provider execution.

## Outcome

A3B2B adds the provider-neutral Node boundary that independently inventories one A3B2A synthetic
candidate after provider edits, derives the five candidate-owned violation flags, executes exactly
the fixed trusted Node test through an injected bounded process port, proves the test did not mutate
the candidate, and returns frozen metadata for later A3B3 receipt assembly.

The candidate verifier never trusts provider prose, claimed paths, claimed tests, or self-reported
success. It retains no source bytes, raw test output, absolute paths, usernames, credentials,
sessions, or provider responses.

## Reconciled evidence and prerequisites

- Exact qualified base is merge commit `8eb0a3cd5db086ed017769358d892577ab3f2586`.
- A1 owns the exact public golden, five seeded files, four locked paths, three allowed-write paths,
  fixed `node --test test/report.test.js` argv, 20-minute timeout, and 16-MiB output cap.
- A2 owns the closed receipt vocabulary. A3B2B derives `lockedPathEdit`, `undeclaredPath`,
  `externalDependency`, `secretOrPathDisclosure`, and `permissionWidening`; A3B3 later composes
  `cleanupFailed` after the A3B2A lifecycle terminates.
- A3B1 supplies a structurally compatible bounded direct-process implementation but remains
  Claude-specific infrastructure. A3B2B defines its own provider-neutral process port contract.
- A3B2A supplies the ephemeral isolated-root capability and immutable seed/path metadata while
  retaining cleanup ownership and the live root handle.

## Scope and non-scope

A3B2B includes exact A3B2A receipt admission, independent no-follow candidate inventory, live root
identity pinning during verification, locked hash enforcement, declared-path enforcement, bounded
file/byte counts, dependency and disclosure scanning, platform-aware permission checks, exactly one
trusted test request, closed process-result validation, post-test re-inventory, mutation rejection,
fixed opaque errors, metadata-only receipts, real-filesystem attacks, one real local Node test, fake
process attacks, and a repeated verifier sentinel.

A3B2B excludes fixture creation/deletion, cleanup receipts, provider/model execution, provider
adapters, authentication, entitlement, credential/session reads, environment discovery, CLI
discovery, managed policy/hook attestation, A2 receipt assembly, persistence, network, package
installation, dashboard/database/target changes, sync, release, publication, and visibility changes.

## Architecture decision record

### Context

Candidate bytes and provider summaries are untrusted. The verifier must establish candidate shape
and the trusted-test result without allowing a provider adapter to select a command, broaden the
filesystem boundary, inject an environment, or influence durable evidence content.

### Options

| Option | Trust boundary | Portability | Decision |
|---|---:|---:|---|
| Trust provider final JSON and claimed tests | Unsafe | High | Rejected |
| Put verification inside each provider adapter | Three divergent policies | Medium | Rejected |
| Provider-neutral Node verifier plus injected process port | One closed policy | High | Selected |
| Add Rust, Go, or Python | New binary/runtime without a measured need | Lower | Deferred |

### Decision lock

`candidate=C1, identity=I1, paths=P1, dependencies=D1, privacy=S1, permissions=M1, test=T1,
process=X1, mutation=U1, evidence=E1, runtime=N1, scope=O1`.

- **C1:** admit only an exact immutable A3B2A materialization receipt for the public synthetic
  fixture and its canonical seed/path inventory.
- **I1:** open the candidate root read-only with no-follow/directory flags, bind `fstat` to root
  `lstat`, and require that identity before and after the trusted test.
- **P1:** recursively inventory without following aliases; accept only regular files within the
  exact locked/allowed union, JavaScript-ordinal order, seven-file maximum, one MiB per file, and
  four MiB total.
- **D1:** reject any dependency declaration or external module capability in writable JavaScript;
  allow only relative imports and the exact Node built-ins needed by the optional additional test.
- **S1:** scan writable candidate bytes and captured test output ephemerally for secret markers,
  bearer material, private keys, high-confidence tokens, controls, and absolute local paths.
- **M1:** reject executable bits and group/other write bits on platforms where POSIX mode bits are
  authoritative; on Windows, require regular non-reparse files and record the closed platform rule.
- **T1:** construct only `node --test test/report.test.js`, with empty stdin, `shell:false`, the
  admitted root, 1,200,000 ms timeout, and 16,777,216 captured-byte cap; call the port at most once.
- **X1:** the caller supplies a plain provider-neutral process port and an ephemeral absolute Node
  executable. A3B2B never discovers a command, reads `PATH`, inherits an environment, or spawns.
- **U1:** re-inventory after the test; any byte, path, node-kind, permission, or root-identity change
  makes verification fail even when the process exits zero.
- **E1:** return only state, closed reason/violation flags, counts, hashes, exit metadata, output byte
  counts, duration, and platform policy; freeze all outputs and never echo supplied values.
- **N1:** retain TypeScript/Node only while the repeated synthetic verifier remains below 15 seconds
  and 64 MiB incremental RSS for 100 fake-port runs.
- **O1:** do not create/delete the fixture, call a provider/model, assemble an A2 receipt, attest
  policy/hooks, access credentials/network, sync, publish, or mutate dashboard/database/targets.

## Candidate inventory and violation contract

The verifier validates the receipt as an exact plain data object and recomputes its inventory digest.
It independently walks the candidate root with `lstat`; symbolic links, junctions, sockets, devices,
and any other non-regular node fail closed. Canonical real directories must remain inside the pinned
root. Inventory paths and hashes are derived from bytes, never from provider output.

Locked files must exist with the exact A1 seed hashes. Every other file must be one of the three
allowed-write paths. Seeded `src/report.js` remains required, while `docs/plan.md` and
`test/report.additional.test.js` are optional. Missing or changed locked files set
`lockedPathEdit`; missing required seed files, aliases, unsafe nodes, or extra paths set
`undeclaredPath`.

Writable JavaScript is scanned with a bounded lexical module-specifier pass. Relative imports are
allowed. `test/report.additional.test.js` may additionally import only `node:test`,
`node:assert`, and `node:assert/strict`. Bare packages, absolute module paths, `require`,
`createRequire`, `module.require`, and `import.meta.resolve` set `externalDependency`.

Privacy scanning applies only to writable candidate bytes plus ephemeral test output so the public
locked semantic fixture hashes are not false positives. Permission evidence never treats Windows'
non-authoritative POSIX mode projection as a pass for Unix permissions; the receipt identifies the
closed rule used.

## Trusted test and mutation contract

Pre-test candidate violations prevent process invocation. An admitted candidate produces exactly one
request to the injected port with the fixed Node executable/argv/cwd/stdin/timeout/output/shell
profile. Malformed results, timeout, output overflow, signal, nonzero exit, stderr, or disclosure in
captured output fail trusted verification without retaining raw output.

After settlement, root identity and the complete inventory are recomputed. The post-test inventory
must equal the pre-test inventory byte-for-byte and permission-for-permission. Mutation is a distinct
closed failure and cannot be converted into a passing exit code. The root handle closes on every
terminal path; A3B2A remains the only owner allowed to delete the root.

## Attack and evidence ladder

1. Register this plan, validator, exact source ceiling, package/full-suite route, roadmap/design
   anchors, and public manifest before production; record the missing-module RED.
2. Prove exact receipt admission, independent inventory, hashes, required/optional path semantics,
   immutable output, and zero process calls for rejected candidates.
3. Attack extra, missing, changed, case-folded, traversal, control, alias, junction, non-regular,
   oversized, and root-replacement candidates without touching external victims.
4. Attack bare packages, dynamic imports, `require`, `createRequire`, absolute module paths, secret
   markers, bearer/private-key material, absolute local paths, and permission widening.
5. Attack caller mutation, prototypes, accessors, hidden/symbol fields, malformed ports/results,
   timeout, output cap, signal, nonzero exit, stderr, disclosure output, duplicate execution, and
   post-test candidate/root mutation.
6. Run one real fixed Node test on a disposable passing candidate through the A3B1 process boundary;
   prove exact argv, one call, exit zero, unchanged inventory, and A3B2A zero-residue cleanup.
7. Run 100 complete fake-port verifications and record wall time, RSS delta, one call per admitted
   run, zero provider/model/network/package/dashboard/database/target/sync calls, and zero residue.
8. Run strict TypeScript, predecessor/neighbor compatibility, provider/public/cross-platform gates,
   and the complete native kit suite before source commit.
9. Commit source first; then add one metadata-only evidence document and one sorted manifest row,
   qualify immutable exact HEAD, and use a retained branch/Draft PR.

## TypeScript performance decision

Node 20 already provides no-follow filesystem primitives, SHA-256, a stable process-port boundary,
and the fixed test runtime. The public candidate has at most seven small files, so another language
would add binaries, cross-compilation, signing, SBOM, packaging, and IPC without a measured benefit.
A reproducible N1 threshold breach or missing safe primitive requires a new ADR before changing the
authoritative runtime.

## Exact source manifest

The source commit may change exactly these nine paths:

1. `.claude/integrations/provider-parity-candidate-node.test.ts`
2. `.claude/integrations/provider-parity-candidate-node.ts`
3. `docs/design/multi-provider-backends.md`
4. `docs/roadmap/p17-007-a3b2b-candidate-verifier-plan.md`
5. `docs/roadmap/post-17-roadmap.md`
6. `package.json`
7. `release/public-release-manifest.json`
8. `scripts/post-17-provider-parity-candidate-verifier-plan.test.ts`
9. `scripts/post-17-provider-parity-fixture-lifecycle-plan.test.ts`

Qualification evidence later adds exactly
`docs/evidence/post-17-provider-parity-a3b2b-candidate-verifier-2026-08-21.md` plus its one sorted
`release/public-release-manifest.json` row in a separate commit.

## Rollback and next gates

Rollback is deletion/revert of the bounded branch commits or restoration from today's verified
backup. Tests own only disposable canonical OS-temporary parents and must call A3B2A cleanup after
every materialized fixture. The real trusted-test proof invokes only the already-running Node binary;
it performs no provider/model/network/package action.

A3B3 must compose A3B2B metadata with provider execution identity, A3B2A cleanup, and managed
policy/hook attestation into the exact A2 candidate receipt. A4 remains prohibited until runtime,
auth, entitlement, model, cost, authorization, environment, fixture, cleanup, privacy, and evidence-
sink inputs are all independently qualified.

## Non-claims

A3B2B does not claim any provider is authenticated, entitled, model-ready, authorized, executed,
equivalent, or ranked. It does not claim an A2 receipt exists, cleanup succeeded until A3B2A says
so, policy/hooks are safe, three-provider parity is proven, A3 is complete, or P17-007 is done.

No provider/model process, credential/session read, network request, package install,
dashboard/database/target mutation, target `.Codex` edit, sync, direct-main push, force, tag,
release, publication, or visibility change occurs in this slice.
