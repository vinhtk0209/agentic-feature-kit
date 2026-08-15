# P17-016 Wave B3 LOCAL-COMPATIBILITY v1

**Status:** Authorized — inputs locked; implementation unproven
**Date:** 2026-08-15
**Roadmap task:** P17-016
**Parent decisions:** ADR-002 `T1/R1/C1/L1/E1`; ADR-003 `T1/M1/X1/R1/E1/S1`
**Authority:** The durable roadmap goal authorizes implementation and local commits, but not push.
**Locked scope:** `store=F1, path=P1, key=K1, atomic=A1, retention=R1, concurrency=C1, run=U1, orchestrator=O1, central=Z1, evidence=E1`

## Outcome

Wave B3 stops the four dashboard-side raw central writer paths before any tenant migration:

- `dashboard.pty.run-usage`;
- `dashboard.codex-resume.persistence`;
- `dashboard.orchestrator.persistence`; and
- `dashboard.slack.persistence`.

The sidecar keeps the compatibility state required to start, observe, finish, and resume local runs
and to operate the local roadmap/Slack loop. That state moves to one exact, encrypted,
machine-local store. The store is infrastructure owned by the sidecar, not a new central contract.
There is no Supabase fallback for these four families and no claim that tenant-safe central metadata
was persisted.

B3 is split into three independently proven slices:

1. **B3A — store foundation:** build and attack-test the local state boundary without changing a
   production writer.
2. **B3B — run/usage/resume cutover:** move PTY and Codex resume state together because they share
   run identity, usage, and compare-and-set recovery state.
3. **B3C — orchestrator/Slack cutover:** move phase queue, needs-input, event, probe, and canary
   compatibility state together because Slack performs conditional transitions over orchestrator
   records.

This plan does not claim B3 implemented. P17-016 remains `in_progress` after B3 until B4 and the
tenant/retention migration waves are complete.

## Decisions

### F1 — One exact machine-local compatibility store

Use one sidecar-owned TypeScript/Node 20-compatible filesystem store. Do not add a native database,
WASM database, network service, browser storage, or another process. The store exposes typed
application ports; producer code cannot submit table names, REST paths, SQL, arbitrary object
spreads, or a generic key/value payload.

The plaintext state has one exact schema version and only these bounded collections:

- command-run compatibility state and one usage aggregate per run;
- phase execution ledger state;
- needs-input request state;
- short-lived orchestrator audit/probe records; and
- short-lived version-canary compatibility rows.

Unknown root, collection, record, or nested fields fail closed. The plaintext snapshot is capped at
16 MiB. Collection caps are 1,000 runs, 1,000 usage rows, 500 phases, 500 needs-input requests,
2,000 events, and 5,000 canaries. Raw command arguments are capped at 64 KiB; log tail stays capped
at 4,000 characters; question, reason, answer, and event detail are each capped at 32 KiB; probe or
assurance transcript is capped at 256 KiB before persistence. A cap violation returns only a closed
error code and never echoes the rejected value.

### P1 — Per-user state outside repositories

The production default is an OS per-user state directory outside the dashboard, kit, targets, and
their backup trees:

- Windows: `%LOCALAPPDATA%/workflow-kit/kit-dashboard`;
- macOS: `~/Library/Application Support/workflow-kit/kit-dashboard`;
- Linux/other: `$XDG_STATE_HOME/workflow-kit/kit-dashboard`, otherwise the per-user
  `.local/state/workflow-kit/kit-dashboard` directory resolved through `os.homedir()`.

`RUNNER_LOCAL_STATE_DIR` may override the location only with an absolute, non-root path outside the
dashboard repository. Existing path segments and the final directory must not be symbolic links or
Windows junction/reparse-point aliases. Tests inject an isolated temporary root directly and never
read a developer machine path. No state file is created under a target `.claude` directory.

### K1 — Machine-local key and authenticated encryption

On first open, create exactly one random 32-byte key with exclusive-create semantics and restrictive
file mode where the platform supports it. Store only its base64url encoding in `local-state.key` in
the machine-local state directory. Never print, hash as an identifier, return, upload, or copy the
key into `runner.secrets.json`, environment output, receipts, evidence, or tests.

Encrypt every snapshot with AES-256-GCM, a fresh 96-bit nonce, and authenticated associated data
binding schema version, slot, and sequence. A missing key plus existing state, a malformed key,
authentication failure, unsupported algorithm/version, or conflicting same-sequence slots fails
closed. Production never auto-repairs, overwrites, or silently resets unreadable state.

### A1 — Dual-slot crash recovery

Use two encrypted snapshot slots and a monotonic safe-integer sequence. Each commit validates the
current highest valid slot, validates the proposed exact state, encrypts to a unique temporary file,
flushes and closes the file, removes only the inactive slot, then renames the temporary file into
that slot. The previous valid slot remains the rollback copy throughout the commit.

Startup selects the highest independently authenticated and schema-valid sequence. One corrupt
slot is tolerated only when the other is valid. Two absent slots create the exact empty state. Two
invalid slots, sequence overflow, equal-sequence divergence, partial temporary files, oversized
files, or rollback-copy loss fail closed. Temporary files are never selected as committed state.

### R1 — Store-owned retention and purge

Producers cannot supply or extend expiry. The store clock computes retention:

- active run/resume state is retained while active, but a run older than 30 days becomes
  `recovery_required` and cannot auto-resume;
- raw run arguments/log tail and linked usage are removed within 24 hours after terminal state;
- raw needs-input question/reason/answer, event detail, and probe/assurance transcript are removed
  within 24 hours after close or observation;
- closed run tombstones and closed operational metadata expire after 30 days;
- the minimal phase id/status/idempotency ledger contains no title, path, transcript, or arbitrary
  detail and remains until its source phase has been absent for 30 days; and
- local commit/purge audit metadata contains closed codes and counts only and expires after 365
  days.

Purge runs on open and before each committed transaction, is idempotent, and cannot delete active
state early. Full provider logs remain governed by the existing local `logs/` owner boundary and are
not added to this snapshot. B3 makes no claim that R1 central deletion or backup propagation is
implemented.

### C1 — Single-sidecar serialized commits

Only the PTY sidecar may write this store. Next.js pages, browser code, provider children, tests,
and future workers receive no file or key capability. One synchronous in-process transaction
boundary serializes mutations. A bounded exclusive transaction lock rejects a second writer; it does not wait
indefinitely or guess that a live owner is stale. Every mutation re-reads the latest sequence before
commit so stale expected state fails closed.

B3 does not turn this local compatibility store into the ADR-003 distributed worker journal. That
journal may reuse proven primitives later, but it owns different delivery/envelope semantics.

### U1 — Coupled PTY, usage, and Codex resume cutover

Run start persists an exact local row before provider spawn. If the local commit fails, no provider
process starts. If spawn fails after the commit, the same run is atomically marked terminal. Usage,
terminal status, retry/trigger/reasoning provenance, and Codex gate state update the same local run
identity. A local persistence error never falls back to Supabase and never logs raw state.

Codex pause and claim retain exact one-row compare-and-set semantics, canonical phase validation,
unfinished-claim startup refusal, duplicate-run rejection, and bounded recovery. Recovery reads the
same local usage snapshot and run row. A resume claim is durable before sending the provider reply.
The existing full local log remains the source for reattached scrollback; it is not copied into the
encrypted store.

### O1 — Coupled Orchestrator and Slack cutover

Orchestrator phase upsert, dependency reads, active-roadmap-run checks, state transitions,
needs-input creation, audit/probe records, canaries, and run linking use typed local repository
methods. Phase ingestion continues to preserve status and idempotency. Run linking checks the local
run repository directly; the old read-after-Supabase-insert polling loop is removed.

Slack configuration no longer requires Supabase credentials. Its external Slack API remains an
explicit external transport, but load/attach/answer/expire/event operations use the same local
needs-input state and exact conditional transitions. Answer state commits before its local audit
record. Overlapping poll protection, allowlist, TTL, pagination, and no-launch/no-resume boundaries
remain unchanged.

### Z1 — Zero raw central fallback and honest legacy reads

After B3B/B3C, production sources for the four registry IDs contain no reachable raw Supabase REST
or RPC mutation and no anonymous/service-role fallback. Registry entries remain durable history but
become `transport=in_process`, `currentPrivacyState=outside_central_scope`, and
`disposition=fail_closed`; discovery recognizes the typed local cutover markers so deletion of the
old central write cannot silently delete the registry record.

Current Next.js pages and APIs that read historical `command_runs`, `token_usage`, `phase_queue`,
`orchestrator_events`, or `needs_input_requests` are not silently repointed to the raw local store.
They remain legacy/historical until Wave C creates tenant-safe metadata repositories and P17-021
owns the public read/action model. B3 does not expose local args, logs, questions, answers, or
transcripts through a new HTTP route, browser API, or Control Panel surface.

### E1 — Offline evidence before local commits

Every slice requires plan/RED/GREEN evidence, exact attack fixtures, TypeScript, affected runtime
canaries, the full dashboard regression, the full kit regression for cross-repository plan/registry
contracts, diff/whitespace review, and a staged-added-line credential scan with five proven positive
controls. Tests inject temporary directories, clocks, entropy, filesystem faults, and adapters.
They make no network request and launch no provider.

## Clean architecture boundaries

- Local state schemas and transition rules do not import Supabase, Next.js, React, Slack, provider
  SDKs, process spawning, or UI modules.
- Filesystem, crypto, path selection, clock, entropy, and fault injection live in infrastructure.
- PTY, Codex resume, Orchestrator, and Slack call typed application ports only.
- The shared central privacy policy/writer remains unchanged in B3 because tenant attestation and a
  Wave C sink are still unavailable.
- No raw local record is accepted by, transformed into, or returned from the central writer core.

## Implementation manifest

Plan gate in `claude-workflow-kit`:

- `docs/roadmap/p17-016-b3-local-compatibility-plan.md`;
- `scripts/post-17-privacy-b3-local-compatibility-plan.test.ts`; and
- `package.json`.

B3A foundation in `kit-dashboard`:

- `server/local-compatibility-store.ts`;
- `tests/local-compatibility-store.test.ts`;
- `runner.config.example.json` and README/environment guidance only if the implementation exposes
  the optional path setting.

B3B run cutover in `kit-dashboard`:

- `server/local-run-persistence.ts` and its focused test;
- `server/codex-resume-persistence.ts` and its focused tests;
- `server/pty-server.ts`; and
- affected lifecycle/static-boundary tests.

B3C orchestration cutover in `kit-dashboard`:

- `server/local-orchestrator-persistence.ts` and its focused test;
- `server/orchestrator.ts`;
- `server/slack-interactive-runtime.ts`;
- `server/pty-server.ts` bootstrap wiring;
- affected Orchestrator/Slack canaries; and
- `docs/roadmap/p17-016-dashboard-writer-registry.json` plus its registry test.

Each expansion beyond this manifest must be recorded in both root handoffs before editing.

## RED controls

1. B3A store tests fail because the local store module does not exist.
2. B3B source-denial tests fail while PTY or Codex resume contains raw `command_runs`,
   `token_usage`, `pause_codex_run`, or `claim_codex_resume` central endpoints.
3. B3C source-denial tests fail while Orchestrator or Slack contains raw central mutation paths.
4. The registry current-state gate fails while any B3 entry remains `legacy_raw`,
   `local_store_required`, or `local_only_required` after its slice claims GREEN.

No RED control may import the side-effectful PTY main module, bind a port, start a provider, reach
Slack/Supabase, mutate a real local state directory, use a browser, or edit a target.

## Verification and attack matrix

| Boundary | Positive proof | Required attacks |
|---|---|---|
| Path | OS default and explicit absolute temp root resolve | relative/root/repository path, traversal, symlink/junction alias |
| Key | exclusive 32-byte generation and reopen | malformed/truncated key, key loss with state, secret in error/log/receipt |
| Envelope | encrypt/decrypt exact state | changed nonce/tag/ciphertext/AAD/version/algorithm, unknown field, oversize |
| Atomicity | latest valid slot survives every injected fault | temp write/flush/close/unlink/rename failure, corrupt latest, equal divergent sequence |
| Concurrency | serialized monotonic commits | stale sequence, second writer, sequence overflow, re-entrant mutation |
| Retention | exact boundary clocks and idempotent purge | producer expiry extension, early active deletion, expired raw field survival |
| Run lifecycle | start/usage/terminal/retry/resume recovery | store unavailable before spawn, spawn failure, duplicate ID, malformed row, unfinished claim |
| Resume CAS | exactly one pause/claim | zero/two affected, session/generation drift, duplicate phase, answer/secret persistence |
| Orchestrator | status-preserving ingest and run link | reset completed status, missing run, unbounded transcript, arbitrary path/body |
| Slack | attach/answer/expire CAS before event | wrong thread, duplicate answer, stale reply, overlap, launch/resume capability |
| Central denial | local operation makes zero central request | service-role/anon fallback, hidden REST/RPC string, dynamic endpoint construction |
| Registry | all four B3 IDs remain classified once | deleted entry, stale anchor, legacy disposition, injected unregistered writer |

## Edge cases and failure handling

- Initial empty state is created only when both snapshot slots are absent.
- A valid older slot beats an invalid newer slot; corruption is surfaced without raw contents.
- Local disk full, permission denial, or crypto failure blocks the affected stateful operation.
- A provider process is not launched until run-start persistence succeeds.
- Terminal persistence failure is a closed sidecar health fault; it is never reported as a passed
  durable run and never triggers a central fallback.
- Recovery with an unfinished claim remains operator-blocked.
- Missing Slack/local store configuration registers no poller and leaks no configured value.
- No automatic reset, plaintext export, key rotation, or migration of legacy Supabase rows occurs.

## Evidence and completion

B3 completes only when B3A, B3B, and B3C each have durable evidence; all four registry entries are
fail-closed from central persistence; the exact source audit proves no raw central fallback; all
compatibility transitions pass through the local typed store; both repositories are clean after
normal-hook local commits; and the final full test/evidence ladder is green.

The closeout records starting/ending SHAs, exact manifests, RED and correction history, test names,
durations, output counts, attack results, source-absence positive controls, backup hashes, secret
scan controls, and explicit non-claims.

## Rollback

- Reuse the verified 2026-08-15 ZIP snapshots before every B3 edit.
- B3A is additive and can be reverted without state migration.
- B3B/B3C rollback is a source rollback only before real production use; it must not upload local
  snapshots into legacy Supabase tables.
- Never use sync as rollback and do not push.
- If a bulk edit/build fails mid-change, restore the affected repository from today's verified
  snapshot before retrying, as required by workspace policy.

## Non-claims

This scope does not authorize or claim a Supabase migration, live database read/write, tenant
enrollment, browser operation, dashboard public read-model change, provider run, Slack live call,
target edit, real sync, plugin publication, deployment, remote CI action, or push. It does not make
the local store a distributed journal, does not migrate or purge legacy central rows, and does not
complete Wave B4, Wave C, P17-016, P17-014, or P17-021.
