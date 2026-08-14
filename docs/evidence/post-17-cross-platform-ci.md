# P17-009 — Cross-Platform Release Qualification Evidence

Date: 2026-08-14
Status: IMPLEMENTATION HARDENED — REMOTE CI RERUN PENDING
Qualified locally: Windows, Node 24  
First remote attempt: Linux and Windows both exposed the same clean-checkout dependency gap

## Outcome

The release workflow now treats Windows and Linux as equal matrix legs. Each leg runs `npm ci`, a
shared TypeScript platform smoke, and the full kit suite. Each leg uploads one content-addressed
qualification artifact. A separate release job runs with `if: always()`, consumes
`needs.kit-verify.result`, downloads both artifacts, and fails unless the aggregate matrix result is
exactly `success` and the directory contains exactly valid `linux.json` and `windows.json` results.

This design follows the documented GitHub Actions semantics for
[`needs.<job_id>.result`](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts?from=20421)
and uses `fail-fast: false` so both matrix legs finish, as documented in
[matrix job behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations).
The committed contract does not claim macOS support.

## Runtime boundary

`scripts/cross-platform-smoke.ts` uses `child_process` with `shell:false`. It verifies:

- Node major version 20 or newer;
- a temporary working directory containing spaces and Unicode;
- one opaque argv item containing quotes, ampersand, semicolon, dollar sign, parentheses, and Unicode;
- deterministic CRLF-to-LF normalization without changing LF input;
- bounded termination of a real lingering child, including safe repeated cleanup.

The workflow supplies `QUALIFICATION_PLATFORM` and `QUALIFICATION_OUT` as explicit environment
bindings. A real negative probe showed that npm consumes the reserved `--platform` and `--out`
option names before the script; the environment boundary removes that ambiguity and is covered by a
real nested `npm run test:cross-platform` test.

The Windows artifact emitted through that exact boundary passed with content hash
`77b273cb103f0da570a32390b4b4f134e910f9caf4604d8c3e4b09f91d8f1351`.

## Source artifacts

| Artifact | SHA-256 |
|---|---|
| `scripts/cross-platform-smoke.ts` | `d5f1f7e1dd758f1e2d69a00d12eb8b37af8e0f796acba940eb07ef65b0696e1c` |
| `scripts/release-matrix-gate.ts` | `0d59205671f491ccbf7bc4cee50aad43b76ef3dd36bfa1a55ee6ae0ca3025f10` |
| `scripts/cross-platform-workflow-contract.ts` | `3eb5b97811a1927e7ffa9348a05eff56b0cf0cb3b9d954eacc8aa3b04cb4797d` |
| `scripts/cross-platform-release.test.ts` | `34ff60b6ce3ff33be66de3bb79059316af78088754a0646049d93f348cb9e240` |
| `.github/workflows/workflow-kit-ci.yml` | `8c5ef008c0eb71a7239ee33641d66e87b49ad23b0151e6b37802f57d15d9fb9b` |

## Verification

- Focused suite: 9 grouped tests pass, 0 fail.
- Attacks reject platform mismatch, forged hash, extra fields, reordered probes, duplicate evidence,
  contradictory summary, missing artifact, extra artifact, failed aggregate matrix, omitted Windows
  leg, enabled fail-fast, detached release gate, forged aggregate result, and skipped full suite.
- Isolated TypeScript 5.7.3 no-emit compilation: exit `0`.
- Final full kit suite after the npm-boundary correction: exit `0` in 166.2 seconds.
- Dashboard full suite with P17-009 active: 57 files / 420 tests pass in 6.32 seconds.
- `git diff --check`: exit `0` before evidence-only closeout edits.

The Linux fixture used by the release-gate unit test is explicitly synthetic and tests only artifact
validation. It is not runtime evidence for Linux.

## First remote run and clean-checkout remediation

The operator authorized pushing exact kit HEAD to new branch `p17-009-cross-platform-ci` and opening
a draft PR into `main`. Draft PR #1 is
`https://github.com/vinhtk0209/agentic-feature-kit/pull/1`; it remains draft and unmerged.

GitHub Actions run `31820016737` provided the first real two-platform evidence:

- Linux job `94830749920` and Windows job `94830749826` both passed checkout, Node 24 setup, root
  `npm ci`, and the real cross-platform smoke;
- both failed at the same full-suite step, `test:confluence-http`, because clean checkout could not
  resolve `axios` imported by `.claude/mcp-server/confluence-http.ts`;
- both platform qualification artifacts uploaded successfully despite the later suite failure;
- the failure was not OS divergence: root installation omitted the committed nested
  `.claude/mcp-server/package-lock.json`, while the development worktree already had nested
  `node_modules` and therefore masked the gap.

The narrow remediation adds one matrix step before smoke/full verification:

```yaml
- name: Install Confluence MCP dependencies
  working-directory: .claude/mcp-server
  run: npm ci --ignore-scripts
```

Axios was not duplicated into the root manifest, and release-gate behavior did not change. The
workflow contract first failed with exactly two missing-step/order reasons, then passed 9/9 after
the change. Its attack matrix now removes this exact nested install step and must fail closed.

A detached clean-checkout worktree with no junction/reparse-point dependencies proved root `npm ci`,
nested `npm ci --ignore-scripts`, `test:confluence-http`, `test:confluence-markdown`, and the real
cross-platform smoke all pass. Both scratch `node_modules` directories were verified as ordinary
directories before the scratch worktree was removed. Full local `npm run test:kit` then exited 0 in
266.3 seconds.

## Pending highest-valid evidence

P17-009 remains `in_progress`. Its acceptance criterion requires the committed remediation to pass
on both `ubuntu-latest` and `windows-latest`, followed by the aggregate release gate. Push the
reviewed fix only to the existing PR branch and capture the rerun; do not close the task from local
or failed-remote evidence.

No sync, provider/model execution, publication, target `.Codex` edit, direct-main push, merge, or
macOS qualification occurred. Git credential use was bounded to the authorized branch/PR API
operations and was never printed or persisted.
