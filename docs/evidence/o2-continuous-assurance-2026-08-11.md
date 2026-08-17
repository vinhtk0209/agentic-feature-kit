# O2 Continuous Assurance Evidence — 2026-08-11

## Scope

This evidence covers the canonical Confluence refetch foundation, the US-AD-095 baseline,
nightly-manifest activation, dashboard scheduler secret wiring, the historical fail-closed run,
and the final live scheduled PASS closure. The historical 403 observations below are retained as
diagnostic evidence; the final isolated-browser transport proved that those responses were a
Cloudflare challenge, not a trustworthy Confluence credential verdict.

## Canonical baseline

- Source reference: `confluence:830569842`
- Preserved intake artifact date: 2026-07-03
- Source bytes: 10,366
- Source SHA-256: `0ef9ec3fc7061a66fec739731603a8621c1bb09357ff91ffa86682b2ae3075ea`
- Validated SpecIR paragraphs: 86
- Validated acceptance criteria: 19 (`AC1` through `AC19`)
- Baseline: `.claude/assurance/baselines/us-ad-095-progress-reports.spec-ir.json`

The baseline was generated through `stageConfluenceB0Source` and `validateSpecIR`. A parser
regression test proves Markdown table rows such as `| AC1 | ... |` retain literal line-anchored
provenance instead of disappearing from the AC set.

## Refetch and scheduler boundaries

- `.claude/integrations/confluence-refetch-actor.ts` delegates to the existing
  `fetch_confluence_page` MCP tool and emits exactly one `@@SPEC_REFETCH_RESULT@@` sentinel.
- URL identity, source size, source hash, stdout shape, timeout, and output caps fail closed.
- A complete Basic credential pair wins over a stale bearer token. Incomplete Basic credentials
  fail before a fetch. Secrets remain off argv, stdout, the manifest, and the baseline.
- Dashboard continuous assurance accepts an explicit scheduler-owned process environment and
  reads runner secrets fresh for every run. The child process is still direct Node argv with
  `shell:false`.
- `.claude/assurance/nightly.json` contains the active US-AD-095 `spec-refetch-drift` check. A
  source fetch error is a failed check, never a skip.

## Test evidence

- `npm run test:spec-intake`: 23 SpecIR tests + 5 CLI tests passed.
- `npm run test:confluence-refetch-actor`: passed.
- `npm run test:continuous-assurance`: 16 passed.
- Dashboard `npx tsx tests/continuous-assurance.canary.ts`: passed.
- Dashboard `npm test`: 35 files, 252 tests passed.
- Dashboard `npx tsc --noEmit --incremental false`: passed.
- Kit `npm test`: passed, including the actor test in `test:kit`.
- Both repositories: `git diff --check` passed.

## Live fail-closed evidence

Three independently configured credential paths were evaluated without printing values:

1. Dashboard bearer token: HTTP 403 at `/rest/api/user/current` and the page endpoint.
2. MCP-local Basic pair: HTTP 403 at `/rest/api/user/current` and the page endpoint.
3. Dashboard runner Basic pair: HTTP 403 at `/rest/api/user/current` and the page endpoint.

The production actor using the dashboard Basic pair exited 1 with a redacted authentication
failure and emitted no source sentinel. The full nightly runner then produced:

- exit code: 1
- `gatePassed`: false
- checks executed: 4 of 4
- three offline attack/defer checks: pass
- `us-ad-095-progress-reports-spec-drift`: error
- error evidence: `spec-refetch actor exited 1; no fresh source is trustworthy`

## Scheduled persistence, Slack, and dashboard readback

The dashboard sidecar was restarted with the committed scheduler wiring. Its startup log confirmed
the production schedule `0 2 * * *`, direct argv-only manifest execution, and healthy preflight.
For a bounded operator proof, the cron was temporarily changed to every minute and then restored to
`0 2 * * *`; the final sidecar is healthy with zero active runs and the nightly schedule registered.

Three callbacks occurred while the temporary schedule crossed 14:26, 14:27, and 14:28 local time.
Each persisted the full result before alerting:

- `phase_queue.phase_id`: `o2-continuous-assurance`
- `last_probe_result`: `mismatch`
- latest `last_probe_at`: `2026-08-11T14:28:05.718+07:00`
- stored transcript: 9,234 UTF-8 bytes
- immutable audit event: `continuous_assurance_failed`
- Slack history: three matching `Continuous assurance: FAIL` digests, each binding kit `3.25.0`,
  all four checks, evidence hashes, and the failed drift reason

Authenticated `/orchestrator` readback renders the O2 phase as `pending` with the latest
`mismatch` timestamp and expandable transcript. Visual evidence:
`docs/evidence/o2-continuous-assurance-status-2026-08-11.jpg`.

## Remaining operator evidence

This section described the remaining evidence at the time of the historical failed run. It is
superseded by the live closure below.

## Live PASS closure

### Cloudflare diagnosis and bounded transport

The direct REST 403 responses carried `Server: cloudflare` and `cf-mitigated: challenge`. The
refetch client now attempts the direct request first and permits a browser fallback only for that
exact challenge signature. The fallback requires an operator-configured absolute regular,
non-symlink Chrome executable, launches an isolated headless context without a persistent profile
or cookies, blocks cross-origin requests and redirects, and retains the same timeout and body-size
fail-closed boundaries. Ordinary HTTP 401/403 responses do not trigger it.

The final approved source read succeeded through this bounded transport:

- source reference: `confluence:830569842`
- canonical source SHA-256: `dd36b30b0c1c162bafac9f6b464105da6ad3310014a13ce81931f02d41c9ea93`
- validated paragraphs: 95
- validated acceptance criteria: 19
- current baseline artifact SHA-256: `033c3f6d578e20199bbb3c177b4cdc5693191ba07a56647a0aa959b4e82a20dd`
- previous baseline artifact SHA-256 (replacement provenance):
  `a7ec162ec8b65f5ad78d02496e934f23d750a0fb7599138108381693e99a3808`

The capture boundary requires the exact source reference and SHA-256, expected AC count, a path
contained under the baseline root, and an explicit replacement flag. It restores the prior file
if a replacement fails. Table rows are normalized through the canonical Confluence-to-Markdown
and SpecIR path; semantic drift remains detectable while Markdown table/emphasis changes alone do
not manufacture drift.

### Independent and scheduled evidence

An independent production nightly execution passed all four checks with `gatePassed=true` and
zero spec drift:

- observed at: `2026-08-11T08:19:15.783Z`
- report SHA-256: `6a0fca3f9ca0a1ae0b92f41e331dc702dbf238f90a47da5bea9753356d027155`
- drift-canary evidence SHA-256: `c69665a5827a48188b3250f75e8fa134a63182a7b398a268c0cbabe355f97b24`

For scheduled proof, the cron was temporarily set to every minute, the verified sidecar was
restarted, and a real callback persisted before alert delivery. The production cron was then
restored to `0 2 * * *`, the sidecar was restarted again, and `/health` returned HTTP 200.

- phase row: `438089eb-b691-4390-abac-12085829b735`
- persisted probe: `pass` at `2026-08-11T15:31:05.839+07:00`
- stored transcript: 9,340 UTF-8 bytes
- stored transcript SHA-256:
  `516c30041cb5537b9963c500cfdf805d0dbeecbfddc734f12f9eaf0033093c34`
- scheduled report: schema 1, kit `3.25.0`, observed at `2026-08-11T08:31:01.470Z`,
  `gatePassed=true`, four of four checks passed
- Slack history readback: `ok=true`, message timestamp `1786437067.603439`, four checks;
  digest SHA-256 `a2965110fe6a05ba4c9f1670934812ce567400dcad94abbe56e3be5d8c479f40`
- immutable linked completion event: `3d75cfeb-dfcb-4752-b83f-fcb1ad797032`
- completion detail SHA-256:
  `f4b25708074d645f4c3681dc06eb0558285436d42c0c51ce0ebb4cbf3f6b7e11`

The completion transition used a compare-and-set boundary from pending with a passing probe to
done. Authenticated dashboard readback then showed `16 of 17 phases marked done`, `94% done`, and
the O2 row as `done` / `pass`.

Visual evidence:

- `docs/evidence/o2-continuous-assurance-progress-2026-08-11.png` — 88,081 bytes, SHA-256
  `a50486cbcdaa884a7fd4c33f3fa90eaaae1b88f2d8d81db1cc992f24b6be1c4b`
- `docs/evidence/o2-continuous-assurance-pass-2026-08-11.png` — 83,215 bytes, SHA-256
  `c84b5fe1a47426ff5d72b83dd222a9b685265a05471d768633c12a4435ed4eb0`

### Final regression evidence

- Confluence HTTP, Markdown, baseline-capture, actor, continuous-assurance, and SpecIR focused
  suites passed, including 17 continuous-assurance attack/regression cases.
- Full kit `npm test`: exit 0 in 110.2 seconds.
- `git diff --check`: passed.
- Exact-value scan of all three configured Confluence credential values found zero diff hits;
  values, headers, and response bodies were never printed or committed.
- Implementation commit: `cc76d27 feat(o2): harden live Confluence assurance` (local only,
  no push).

O2 is complete. I1 is the sole remaining roadmap phase.
