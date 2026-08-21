# P17-007 A3B2B Independent Candidate Verifier Qualification

**Date:** 2026-08-21

**Roadmap item:** P17-007

**Slice:** A3B2B — provider-neutral candidate inventory and trusted-test boundary

**Result:** Source-qualified locally; remote qualification is not claimed by this document.

## Exact source identity

| Field | Value |
|---|---|
| Source commit | `0ef2801c03821f103046b755b51326efd2edf524` |
| Parent | `8eb0a3cd5db086ed017769358d892577ab3f2586` |
| Source tree | `e0c4494155179cceb7737ec5e6ab03f5c195fc8e` |
| Branch | `p17-007-a3b2b-candidate-verifier` |
| Source paths | 9 |
| Diff | 1,591 insertions, 5 deletions |

The parent is the exact qualified main merge for A3B2A. The source commit contains only the ceiling
declared in `docs/roadmap/p17-007-a3b2b-candidate-verifier-plan.md`.

## Reconciled boundary

A1 owns the exact public synthetic golden, A2 owns the closed parity-receipt vocabulary, A3B1 owns a
deny-default direct-process implementation, and A3B2A owns isolated materialization and cleanup.
A3B2B fills only the independent post-provider candidate-verification gap. It does not launch a
provider, choose a model, create or delete the fixture, attest managed policy or hooks, assemble an
A2 receipt, persist evidence, or rank providers.

## Architecture result

`createProviderParityCandidateVerifier` is a provider-neutral, one-use Node boundary with these
closed properties:

- exact admission of one immutable A3B2A receipt for the canonical A1 fixture;
- canonical-root and live `dev`/`ino` handle binding before and after every inventory;
- no-follow, bounded, regular-file inventory over the exact locked/allowed path union;
- exact locked hashes, required-file checks, and five closed violation flags;
- writable-JavaScript dependency scanning that admits only declared in-fixture relative targets and
  the three approved Node built-ins for the optional additional test;
- ephemeral secret, credential, control, and absolute-local-path scanning over writable bytes and
  captured process output, with no raw bytes retained in the receipt;
- explicit POSIX permission ceilings and a separate Windows non-reparse node-kind rule;
- exactly one frozen request for `node --test test/report.test.js`, empty stdin, exact root, direct
  `shell:false`, 1,200,000 ms timeout, and 16,777,216 captured-byte cap;
- malformed result, exception, nonzero exit, signal, timeout, cap, stderr, or output disclosure
  converted to closed metadata-only failure;
- complete post-test re-inventory so any byte, path, kind, permission, or root change fails even
  when the process exits zero;
- fixed errors, deeply frozen public receipts, and no candidate source, stdout, stderr, absolute
  path, executable path, username, credential, session, provider response, or OS diagnostic;
- mandatory root-handle close on every terminal path; close failure overrides a pending success.

The verifier defines a small provider-neutral process port. The one real local test proof injects
the already-qualified A3B1 Node port structurally; production A3B2B imports no provider adapter or
process executor.

## Evidence-first ladder and repairs

1. The plan, validator, exact source ceiling, package/full-suite routes, roadmap/design anchors, and
   public-manifest rows were registered before the production module.
2. The first plan-validator run exited `1` because
   `.claude/integrations/provider-parity-candidate-node.test.ts` was absent.
3. The first strict TypeScript pass exposed four readonly-tuple narrowings, one incomplete return,
   and one widened receipt literal. The type-only correction then passed with zero diagnostics.
4. The first focused runtime aggregate passed nine of 11 groups. Both failures were in the synthetic
   test candidate: duplicate `docs/` creation and a code-unit comparator inconsistent with the
   locked fixture expectation. The helper became idempotent and the synthetic implementation used
   a fixed `en` comparator; verifier policy did not relax.
5. Manual review then rejected relative imports that escape or target undeclared fixture files,
   made root-handle close failure terminal, broadened case-safe Windows path disclosure detection,
   and aligned the sentinel assertions exactly with the N1 15-second / 64-MiB ceiling.
6. The public-link gate intentionally failed while the new plan was untracked. Staging exactly the
   nine declared source paths made the same Git-index-aware gate pass without creating a commit
   early or broadening the manifest.
7. The first source-commit attempt stopped before creation when the sandboxed hook launcher hit a
   transient Windows `uv_os_get_passwd ENOMEM`. The same exact staged commit was retried outside the
   sandbox with hooks enabled; `spec-integrity` passed. No hook bypass was used.

## Focused qualification

| Gate | Result |
|---|---|
| A3B2B plan validator | PASS — 9 paths, 11 headings, 23 boundary phrases |
| Candidate verifier groups | PASS — 12/12 |
| Real trusted test | PASS — one exact bounded Node invocation, exit 0 |
| Repeated verifier sentinel | PASS — 100 complete real-filesystem cycles |
| Maximum final elapsed time | 4,421.858 ms, below 15 seconds |
| Maximum observed incremental RSS | 9,015,296 bytes, below 64 MiB |
| Injected process calls | 100/100 in the sentinel; zero for rejected pre-test candidates |
| TypeScript | PASS — strict, no emit, NodeNext, `skipLibCheck=false`, zero diagnostics |
| External alias victim | Preserved byte-identical; fixture cleanup reported zero residue |
| Cross-platform release | PASS — 11/11 |

The focused groups cover one real passing test plus receipt/option mutation, accessors, prototype and
extra-field ambiguity, locked edits, undeclared nodes, external and escaping dependencies, secret
and path disclosure, platform permission rules, malformed/throwing/failed process outcomes,
post-test mutation, alias non-traversal, duplicate invocation, frozen metadata, and the repeated
sentinel. Timing and RSS are local safety sentinels over the small synthetic fixture, not provider
performance claims.

## Compatibility and public qualification

The predecessor and affected matrix passed before the source commit:

- A2 evaluator: 10,000 admitted receipts and all identity/evidence/privacy/aggregate attacks;
- A3B1 process port: 12/12 and 1,000 fake executions with zero real provider/model calls;
- A3B2A lifecycle: 9/9 and 100 complete zero-residue cycles;
- roadmap: 22 tasks and four initiatives;
- provider bundles: three providers, two byte-identical skills, five shared runtimes;
- provider distribution: three archives, 71 entries, eight sidecars, 11 checksums, 79 text scans,
  15 clean runtime smokes, and four attacks;
- strict public release: contract 18/18, links 7/7, licenses 7/7, secrets 6/6, docs PASS;
- cross-platform release: 11/11.

Git-index public qualification reported `eligible-for-r5c2` with 809 manifest paths, 245 Markdown
files, 48/48 internal links, four lockfiles, 754 dependency occurrences / 617 unique dependencies,
806 text files, ten secret-detector families, and zero issues or findings.

## Complete regression receipt

One complete native `npm.cmd run test:kit` ran from the beginning against the exact staged source
bytes and exited `0` across the registered 193-command route.

Inside that chain:

- A3B2B stayed 12/12; the 100-cycle sentinel completed in 4,421.858 ms with 790,528 bytes
  incremental RSS, exactly 100 injected calls, and zero residue;
- A3B2A stayed 9/9 and A3B1 stayed 12/12 with zero real provider/model calls;
- public readiness remained `eligible-for-r5c2` with zero findings;
- provider distribution remained 3/71/8/11/79/15/4;
- 26 synchronized core files remained byte-identical;
- prompt budget remained below 172 KB and lessons sync ended 60/60;
- all 193 ordered commands completed through the final lesson-sync check.

## Privacy and external effects

The new production verifier imports only Node crypto, filesystem, path, and performance primitives.
Positive-controlled fixed-string scans prove it contains no child-process import and no ambient
environment read. Its source-boundary test also rejects HTTP, fetch, spawn, executor, and provider-
adapter imports.

All candidate roots were synthetic, disposable OS-temporary directories owned by the tests and
removed through A3B2A no-follow cleanup. External alias victims remained unchanged. The only real
child was the existing Node executable running the exact locked synthetic test once. No provider or
model process, credential or session read, network request, package install, database/dashboard or
target mutation, target `.Codex` edit, sync, direct-main push, force, tag, release, publication, or
visibility change occurred.

## Rollback

Local rollback is a revert of source commit `0ef2801c03821f103046b755b51326efd2edf524` and this
evidence commit, or restoration from the verified 2026-08-21 backup. The slice created no persistent
fixture root or external state, so rollback has no external cleanup.

## Next gates and non-claims

A3B3 must compose A3B2B metadata with provider execution identity, A3B2A cleanup, and managed
policy/hook attestation into the exact A2 candidate receipt. A4 remains prohibited until runtime,
authentication, entitlement, exact model, cost, authorization, fixture, cleanup, privacy, and
evidence-sink inputs are all independently qualified.

A3B2B does not claim a provider is authenticated, entitled, model-ready, authorized, executed,
equivalent, or ranked. It does not claim an A2 receipt exists, policy/hooks are attested, three-
provider parity is proven, A3 is complete, or P17-007 is done.
