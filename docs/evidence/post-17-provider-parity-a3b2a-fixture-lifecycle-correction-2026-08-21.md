# P17-007 A3B2A Cross-Platform Fixture Lifecycle Correction

**Date:** 2026-08-21

**Roadmap item:** P17-007

**Slice:** A3B2A — isolated fixture lifecycle cross-platform correction

**Result:** Source-qualified locally; replacement remote qualification is not claimed by this document.

## Exact correction identity

| Field | Value |
|---|---|
| Correction source commit | `476db9cc8b90ef4bd7155b6534f4e3ddbda1cbd7` |
| Parent evidence commit | `145bc8c99fc255efcd8b07047ad52fd40996f29e` |
| Correction source tree | `b0997a8f811b8ff58018a9395551d1a160c2db7a` |
| Qualified base | `ec67b899220f51a4b7e340e0891d82189dac2e84` |
| Branch | `p17-007-a3b2a-fixture-lifecycle` |
| Correction paths | 5 |
| Diff | 68 insertions, 21 deletions |

The correction does not amend the original A3B2A source or evidence commits. It changes only the
lifecycle module, its attack suite, the locked plan, provider architecture, and the consolidated
Post-17 roadmap note.

## Failed exact-head evidence

Draft PR #42 initially ran Workflow Kit CI on exact head
`145bc8c99fc255efcd8b07047ad52fd40996f29e`:

- run `32491531782`;
- Linux job `96800083586`;
- Windows job `96800083299`;
- aggregate job `96800984153`.

The run failed correctly and the PR remained Draft. Linux reached A3B2A but returned `8/9`: the
real-directory replacement attack expected `cleanup-failed`, while the stale `dev`/`ino` snapshot
could equal a rapidly recreated directory after Linux reused the released inode. Linux emitted a
failure artifact of 541 bytes with SHA-256
`51079cd35c060764f77891152596ae9bfc9c1afd3f483fe76005c4e8efb51647`.

Windows exposed an independent test-harness issue before positive materialization. Its hosted
runner presents `os.tmpdir()` through a lexical alias, while the production contract intentionally
requires lexical and canonical parent paths to match. The harness therefore received the correct
opaque `invalid-parent` result from an unsuitable positive parent. Windows emitted a failure
artifact of 545 bytes with SHA-256
`cd910bfe8863174eefaa0d084f732093492c34f41ff4ba2cb3b6314b6540334d`.

The aggregate gate reported matrix, aggregate, and committed-clone failure. The Node 20 action
deprecation notices were non-blocking runner warnings and were not treated as either root cause.

## Evidence-first correction RED

Before changing production, the source-boundary attack required a live owned-root handle identity
comparison and terminal handle closure. The focused suite exited `1`: all runtime attacks passed,
but the source-boundary assertion failed exactly because `fs.fstatSync` was absent. Sandbox wrapper
and user-info failures were excluded from product evidence.

## Correction

The lifecycle now:

1. opens the newly created owned root with read-only, no-follow, and directory flags where the
   platform exposes them;
2. derives the retained root identity from the live directory handle with `fstat`;
3. compares that identity with the lexical root `lstat` before recursive cleanup;
4. keeps the original directory object pinned so a delete/recreate sequence cannot qualify through
   inode reuse;
5. retains alias-safe behavior: a root link or junction is unlinked without traversing its target;
6. closes the directory handle on successful cleanup and every best-effort failure path; and
7. continues to emit only fixed opaque failures.

The positive test helper now creates its disposable parent beneath
`fs.realpathSync.native(os.tmpdir())`. The explicit alias-parent attack remains unchanged and still
proves that production rejects non-canonical parents. No production policy was relaxed.

## Local qualification

| Gate | Result |
|---|---|
| A3B2A focused attacks | PASS — 9/9 |
| Repeated real-filesystem sentinel | PASS — 100 cycles, 2,634.694 ms, 901,120-byte RSS delta, zero external calls/residue |
| TypeScript 5.9.3 | PASS — strict, no emit, NodeNext, `skipLibCheck=false` |
| A1 input lock | PASS |
| A2 evaluator | PASS — 10,000 admitted receipts |
| A3A Claude adapter | PASS — 13/13, zero provider calls |
| A3B1 process port | PASS — 12/12, zero provider calls |
| Provider bundles | PASS — 3 providers, 5 shared runtimes |
| Provider distribution | PASS — 3 archives, 71 entries, 15 clean runtime smokes, 4 attacks |
| Cross-platform release contract | PASS — 11/11 |
| Complete native `npm run test:kit` | PASS — exit 0, 192 ordered commands |
| Public contract | PASS — 18/18 |
| Public link gate | PASS — 7/7, 48/48 links |
| Public license gate | PASS — 7/7 |
| Public secret gate | PASS — 6/6, zero findings |
| Public docs gate | PASS |
| Public aggregate | `eligible-for-r5c2`; 804 paths, 243 Markdown files, 801 text files, zero issues |

## Security and privacy

The directory handle is an internal local capability. It is never returned, persisted, logged, or
serialized. The correction reads no environment variables, credentials, sessions, tenant data,
provider output, private specifications, network resources, or external state. Replacement
directories and alias targets remain outside cleanup authority.

## Compatibility and external effects

There is no version, schema, CLI, provider capability, database, or migration change. The only
external effects before replacement CI are the retained non-force branch update and Draft PR #42.
No provider/model call, credential/session read, direct-main push, force, sync, database/dashboard/
target mutation, tag, release, publication, or visibility change is part of this correction.

## Remote qualification still required

This document does not convert the failed head into success. A new evidence commit must be pushed
non-force to the retained branch. Linux, Windows, aggregate, both platform artifacts, and the
committed-clone matrix must all qualify on that new exact head before PR #42 may become Ready.
