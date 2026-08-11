# O2 Continuous Assurance Evidence — 2026-08-11

## Scope

This evidence covers the canonical Confluence refetch foundation, the US-AD-095 baseline,
nightly-manifest activation, dashboard scheduler secret wiring, and the current live-access result.
It does not claim O2 complete while the source page cannot be authenticated.

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

## Remaining operator evidence

O2 can only become complete after an approved Confluence credential returns HTTP 200 for both the
current-user endpoint and page 830569842, the actor produces a fresh exact sentinel, the nightly
drift check passes or reports real drift, and the scheduled outcome is persisted and delivered to
Slack. No workspace process can obtain or reset that external account credential.
