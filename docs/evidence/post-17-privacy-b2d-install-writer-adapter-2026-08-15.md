# P17-016 Wave B2D install writer adapter evidence

**Date:** 2026-08-15
**Status:** Complete
**Roadmap task:** P17-016
**Locked scope:** `writer=I1, core=C1, command=R1, batch=B1, context=T1, receipt=L1, sink=S1, dry=D1, compatibility=F1, evidence=E1`
**Authority:** The durable roadmap goal authorizes in-scope local work and external proof except push.

## Result

`kit.sync.install-report`, the final adapter-planned kit writer, no longer sends raw target
repository/version rows to the historical `installs` table. Normal sync owns one command UUID
before admission or target writes. After existing target work, one or more eligible local install
observations produce one command-level `blocked/tenant_attestation_unavailable` receipt. The
receipt exposes neither observations nor their cardinality.

Dry-run remains non-writing and emits no privacy receipt. Rollback, dirty-tree admission,
verified-run admission, snapshots, file copying, source-ref behavior, socket cleanup, and exit
semantics remain unchanged and independently tested. No real sync was run.

No central row, trusted tenant context, opaque repository mapping, sink capability, database
migration, dashboard change, target edit, browser operation, durable local receipt, sync, or push
is claimed. P17-016 remains `in_progress`.

## Preconditions and reconciliation

- Starting kit head: `94d8a56ed29ac4a93f37b7a4b26a4fe762afd349`, local `main`, clean.
- Dashboard remained untouched and clean at feature-branch head
  `4fab8ce2dae9a3821d099aaa66973cc3c4e21f07`.
- Reused verified 2026-08-15 kit snapshot: 20,291,659 bytes, SHA-256
  `9F1D633152C7AEE9416A6A90B3AB22E82F2E4D6E3F2AED525687267E5CFA7655`.
- Reused verified 2026-08-15 dashboard snapshot: 5,495,854 bytes, SHA-256
  `250F66A557078FEB60B9FEE67CF72882D251853DD34C13F74650F21D1FA003D4`.
- CodeGraph was absent at the kit root, so exact source anchors were inspected directly.
- Fixed-string `rg` and PowerShell `Select-String`, with `reportInstalls` in production as a
  positive control, found zero dedicated tests for the writer before B2D.

The legacy writer ran after target copies, accepted a multi-target raw observation list, and sent
one anonymous REST upsert per target. This ordering made the smallest safe cutover a post-copy,
non-blocking command-level receipt rather than a premature per-target central event.

## Plan-first and RED proof

The formal B2D plan and its validator passed before production code changed. It locks clean
dependency direction, one command identity, batch cardinality privacy, dry-run truth, compatibility,
exact files, attacks, edge cases, failure handling, evidence, exclusions, and rollback.

The pre-implementation candidate failed all three intended RED controls without invoking sync or
network:

| Control | RED result |
|---|---|
| Shared exact writer allowlist | Exit 1: 6 passed/1 failed because `kit.sync.install-report` was refused |
| Install adapter | Exit 1: `Cannot find module './install-writer-adapter'` |
| Legacy sink denial | Exit 1: production still contained `/rest/v1/installs` |

The first sink assertion printed its entire source on failure. It was immediately changed to a
boolean-only diagnostic and rerun RED, producing only `true !== false`. No credential value is
copied into this evidence.

## Implementation boundaries

### Canonical compatibility core and thin adapter

The exact shared writer allowlist now contains only the three implemented fail-closed writer IDs.
The canonical source remains under `packages/core`; its generated runtime mirror is byte-identical.
The install adapter binds only `kit.sync.install-report`, accepts only `runId` and `createdAt`, owns
no I/O, and translates shared refusals to one stable non-echo adapter error.

### Command and reporting seam

Rollback mode returns before install identity creation. Normal sync creates one UUID before dirty
and verified admission or target writes, then passes it unchanged to the post-copy reporter. An
empty observation batch emits nothing. A non-dry batch of any size calls the adapter once and emits
one exact receipt. The non-dry path reads only array length; malicious element getters are not
touched. A malformed local identity produces one generic warning and no receipt or fallback.

Dry-run retains local per-target observation preview, but its heading states that central
persistence is disabled. It emits no receipt and never touches fetch.

### Sink, registry, and public truth

The raw installs endpoint, per-target auth/header/body construction, and substitute writes are
absent from the install reporting path. A fetch tripwire stays at zero for empty, single, multi,
dry-run, and refused cases.

Registry discovery now anchors the install writer to its in-process adapter as
`contract_validated/fail_closed/tenant_attestation_and_sink_unavailable`. No adapter-planned kit
writer remains. Three legacy RPC/insert entries remain migration-blocked. README and B1 next-slice
truth state that `installs` and `repo_runs` rows are historical/stale until a tenant-attested Wave C
sink exists.

## Verification results

| Gate | Result |
|---|---|
| B2D formal plan | PASS: I1/C1/R1/B1/T1/L1/S1/D1/F1/E1 locked |
| Shared compatibility core | PASS: 7/7 with the exact third writer and unknown-writer attack |
| Install writer adapter | PASS: 5/5 |
| Install reporter | PASS: 0/1/N batch, malicious getters, dry-run, refusal, fetch tripwire |
| Writer registry | PASS: 7 entries, 6 source files, 8 attacks |
| B2A current-state compatibility | PASS: central sink remains blocked |
| B1/B2C/B2D plan companions | PASS |
| Privacy policy | PASS: 8 families, 10 contract groups, 15 attack groups |
| Privacy writer | PASS: 4 contract groups, 7 attack groups, 8 families |
| B2B verification adapter/integration | PASS: 8/8 + 6/6 |
| Historical record verification isolated rerun | PASS: 28/28 |
| B2C run-version/telemetry | PASS: core 7/7 + adapter 5/5 + telemetry 18/18 |
| Sync rollback | PASS: 4/4 |
| Mock-only verified-sync guard | PASS: fail-closed; no real sync |
| Canonical synced core | PASS: 4 attacks, 5 byte-identical files |
| Canonical post-17 roadmap | PASS: 22 tasks, 4 initiatives |
| Exact TypeScript | PASS: 5.9.3, ES2022/bundler, no cast or `skipLibCheck` escape |
| Full `npm run test:kit` | PASS: exit 0 in 221 seconds, 1,549 output lines |
| Prompt budget in full chain | PASS: 163,206 / 176,128 bytes |
| Lesson synchronization in full chain | PASS: 60/60 |

## Transient companion observation

The first broader companion run reached 27/28 historical record-verification assertions because
one Windows child returned native status `3221226505` for the stale-tree fixture. B2D changed no
verification source or test. The immediate isolated aggregate rerun passed B2B 8/8 + 6/6 and all
historical checks 28/28; the later full kit suite also passed that chain. The native exit is retained
as a transient Windows child-process observation rather than hidden or treated as production proof.

## Exact candidate manifest

The local source candidate is limited to:

- B2D plan, validator, package/full-suite registration, and this evidence;
- canonical writer allowlist/test plus generated mirror;
- install adapter and focused test;
- sync command/reporter integration and isolated reporter test;
- kit writer registry/discovery and B2A current-state assertion;
- B1 next-slice truth and README current-runtime truth.

The flagship command, privacy family/writer contracts, verification and telemetry production,
dashboard, migrations, provider bundles, targets, and external state are unchanged.

## Local source closeout

- Source commit: `6ed03b09e950e81be9e3df4151e943860f748bf0` (`feat: add fail-closed
  install writer adapter`).
- Exact source manifest: 16 files, 812 insertions, 85 deletions, zero unstaged files, and zero
  untracked files at the commit boundary.
- Cached and parent-commit whitespace checks passed. Exact SHA, parent, stat, and 16-path readback
  passed; the normal `spec-integrity` hook passed.
- Fixed-string `rg` and PowerShell `Select-String` used the reporter test as a positive control and
  found zero `/rest/v1/installs` hits in production. The strengthened reporter test also proves its
  function body has no fetch, process environment, Supabase, or REST dependency.
- Five credential detectors first matched all five synthetic positive controls, then scanned all
  812 staged added lines: GitHub token 0, Supabase service key 0, bearer token 0, JWT 0, private
  key 0.
- Exact review corrected one adjacent stale README credential claim and strengthened command-order,
  one-call-site, environment-spoof, reporter-source, and runtime fetch-tripwire assertions before
  the source commit.
- The evidence-only closeout commit changes no runtime source. Final worktree/dashboard readback is
  recorded in the workspace handoffs because a commit cannot self-record its own SHA.
- No real sync, push, migration, dashboard/browser mutation, target edit, or live external I/O
  occurred.
