# P17-007 A3B2A Isolated Fixture Lifecycle Boundary

Status: approved A3B2A offline fixture-lifecycle implementation; zero provider execution.

## Outcome

A3B2A adds the provider-neutral Node filesystem boundary that admits only the exact A1 public
synthetic golden, creates one owned direct-child run root, writes the seed exclusively in ordinal
order, reads back a hash-bound inventory, and removes the complete root without traversing symbolic
links or Windows junctions. The lifecycle is one-use and its receipts contain metadata only.

This slice never launches a child process, runs the golden test command, invokes a provider/model,
reads credentials or sessions, or assembles an A2 parity receipt. Those remain later gates.

## Reconciled evidence and prerequisites

- Exact qualified base is merge commit `ec67b899220f51a4b7e340e0891d82189dac2e84`.
- A1 owns the exact golden identity, five seed files, four locked paths, three allowed-write paths,
  initial RED marker, fixed test argv, seed-tree hash, and closed run limits.
- A2 requires an independently verified materialized tree and `cleanupFailed=false` before a
  completed receipt may qualify; A3B2A supplies neither provider output nor that receipt.
- A3B1 owns bounded deny-default process execution but no filesystem, seed, verifier, or cleanup.
- Recursive `rm` is not sufficient evidence on Windows because a junction may redirect traversal.

## Scope and non-scope

A3B2A includes strict A1-golden admission, one caller-selected absolute parent, one owned
direct-child temporary root, exclusive seed writes, deterministic readback, immutable locked/allowed
inventories, symlink/reparse-safe cleanup, zero-residue proof, one-use lifecycle state, opaque fixed
errors, real-filesystem attacks, a repeated lifecycle sentinel, docs, tests, and public registration.

A3B2A excludes child processes, the trusted test command, provider adapters, provider/model calls,
authentication, entitlement, credentials, environment construction, managed policy or hook
attestation, candidate verification after provider edits, A2 receipt assembly, durable result
storage, network access, package installation, dashboard/database/target changes, sync, release,
publication, and visibility changes.

## Architecture decision record

### Context

Later provider runs need a fresh copy of one immutable public fixture. Materialization and deletion
are security boundaries: path traversal, aliases, replacement races, pre-existing files, mutated
goldens, or recursive traversal through a junction must fail closed without exposing local paths.

### Options

| Option | Safety | Coupling | Decision |
|---|---:|---:|---|
| Reuse A1's test-only `mkdtemp` helper | Low | High: no production contract | Rejected |
| Use recursive `rm` on an arbitrary caller path | Low | Low | Rejected |
| Add a provider-neutral one-use Node lifecycle | High | Low | Selected |
| Add Rust, Go, or Python for filesystem work | No missing primitive or measured benefit | High | Deferred |

### Decision lock

`golden=G1, ownership=O1, paths=P1, materialize=M1, inventory=I1, cleanup=C1, lifecycle=L1,
evidence=E1, runtime=T1, scope=N1`.

- **G1:** accept only fixture ID `p17-007-provider-parity-golden`, revision `1`, classification
  `synthetic-public`, the exact A1 prompt/spec/seed hashes, and the closed public provenance flags.
- **O1:** create exactly one random direct child below a caller-selected absolute non-root parent;
  reject aliased parents and never accept a caller-selected deletion target.
- **P1:** accept only unique JavaScript-ordinal portable relative paths with no empty, dot,
  traversal, drive, control, alternate-separator, or case-fold collision segments.
- **M1:** create directories below the owned root and files with exclusive create semantics; no
  overwrite, merge, fallback root, or partial-success receipt exists.
- **I1:** read back only regular files without following aliases, recompute every content hash and
  the exact A1 tree hash, then freeze cloned locked/allowed path inventories bound by one digest.
- **C1:** inspect with `lstat`; unlink symbolic links and junctions as links, recurse only through
  real directories whose canonical path remains inside the owned root, and prove root absence.
- **L1:** allow `materialize` once and `cleanup` once; invalid transitions fail with fixed codes.
- **E1:** return counts, hashes, state, and the ephemeral run-root capability only; never return
  fixture contents or interpolate attacker input, absolute paths, usernames, or OS diagnostics.
- **T1:** retain TypeScript/Node only if a repeated real-filesystem lifecycle sentinel remains under
  15 seconds and 64 MiB incremental RSS for 100 complete materialize/cleanup cycles.
- **N1:** do not execute a child, test, provider, model, credential, network, sync, or release action.

## Golden admission and materialization contract

Admission recomputes the A1 stable JSON hashes and requires the exact sorted seed, locked, and
allowed inventories. Seed and writable paths must be disjoint except that `src/report.js` is the one
intentionally seeded allowed-write path. Every file's declared SHA-256 must equal its UTF-8 bytes,
and the declared seed-tree hash must equal the canonical `{path, sha256}` list digest.

The configured parent must already exist as a real directory and its canonical and lexical paths
must match. `mkdtemp` creates the only owned root directly beneath it. All seed files use ordinal
order, parent directories are contained below the root, and `wx` prevents replacement. A post-write
walk refuses aliases and non-regular nodes, hashes bytes, and must reproduce the exact A1 seed tree.

## Cleanup, lifecycle, and privacy contract

Cleanup starts only from the internally retained owned root. At every node it uses `lstat` before
deciding whether to unlink or recurse. A symbolic link or junction is unlinked without resolving its
target. A real directory is canonicalized and must remain within the canonical owned root before its
children are visited. Root replacement with a link therefore deletes only the link.

After removal, an `lstat` readback must report absence. Missing or externally replaced nodes,
unsafe node kinds, containment drift, or I/O failures become fixed opaque error codes. The lifecycle
does not include exception text or supplied paths in errors or receipts. Failure cleanup is attempted
best-effort with the same no-follow algorithm, but no success receipt is fabricated.

## Attack and evidence ladder

1. Register this plan, validator, exact source ceiling, docs, package scripts, and manifest first;
   record the expected missing-module RED before production implementation.
2. Prove exact golden admission, exclusive ordinal materialization, hashes, modes, immutable cloned
   inventories, direct-child ownership, and initial tree readback on the real filesystem.
3. Attack malformed/mutated top-level fields, provenance, prompt/spec/file/tree hashes, unsorted,
   duplicate, traversal, alternate-separator, drive, case-fold, control, and overlap paths.
4. Attack missing, relative, root, non-directory, symlinked, and caller-mutated parent inputs.
5. Add nested file and directory aliases to external victims; cleanup must remove the owned root
   while victim bytes remain unchanged. Replace the owned root with an alias and prove the same.
6. Attack repeated materialize/cleanup and post-cleanup access; require one-use fixed failures.
7. Assert errors contain none of the injected path, secret, username, or OS diagnostic markers.
8. Run 100 complete real-filesystem cycles; record time, RSS delta, zero residues, and zero child,
   provider, model, credential, network, package, database, dashboard, target, or sync calls.
9. Run focused tests, strict TypeScript, provider/public gates, and the complete native kit suite.
10. Commit source first, then bind a separate metadata-only evidence document to the exact source SHA.

The required A3B2A registration crossed Windows' command-line ceiling in the pre-existing monolithic
`test:kit` value before any product test could start. Keep the same 192 unique commands and order, but
route the first 32 foundation commands through a short `test:kit:foundation` segment. The main route
must remain below 7,500 characters, preserve fail-fast sequencing, and retain every Post-17 command
directly so their existing registration validators remain authoritative.

## TypeScript performance decision

Node 20 already provides exclusive file creation, `lstat`, `realpath`, cryptographic hashes, and
portable symlink/junction inspection. This slice is bounded to five small seed files, so another
runtime would add packaging and process boundaries without a demonstrated capability. A measured
sentinel breach or missing safe primitive requires a new ADR before changing runtime.

## Exact source manifest

The source commit may change exactly these eight paths:

1. `.claude/integrations/provider-parity-fixture-node.test.ts`
2. `.claude/integrations/provider-parity-fixture-node.ts`
3. `docs/design/multi-provider-backends.md`
4. `docs/roadmap/p17-007-a3b2a-fixture-lifecycle-plan.md`
5. `docs/roadmap/post-17-roadmap.md`
6. `package.json`
7. `release/public-release-manifest.json`
8. `scripts/post-17-provider-parity-fixture-lifecycle-plan.test.ts`

Qualification evidence later adds exactly
`docs/evidence/post-17-provider-parity-a3b2a-fixture-lifecycle-2026-08-21.md` plus its one sorted
`release/public-release-manifest.json` row in a separate commit.

## Rollback and next gates

Rollback is deletion/revert of the bounded branch commits or restoration from today's verified
backup. Focused tests own disposable OS-temporary parents and prove zero residue. No external service
cleanup exists because A3B2A performs no network, provider, model, database, dashboard, target, sync,
release, publication, or visibility action.

A3B2B must independently inventory the post-provider candidate, enforce locked/allowed paths and
closed violation flags, and invoke exactly one trusted Node test through A3B1. A3B3 must assemble the
metadata-only A2 receipt and attest or isolate managed policy/hooks. A4 remains prohibited until all
runtime, auth, entitlement, model, cost, authorization, fixture, cleanup, privacy, and evidence-sink
inputs are qualified.

## Non-claims

A3B2A does not claim any provider is authenticated, entitled, model-ready, authorized, executed, or
equivalent. It does not claim a candidate tree was verified, a trusted test ran, a receipt exists,
three-provider parity is proven, ranking is allowed, A3 is complete, or P17-007 is done.

No child/provider/model process, credential/session read, network request, package install,
dashboard/database/target mutation, target `.Codex` edit, sync, direct-main push, force, tag, release,
publication, or visibility change occurs in this slice.
