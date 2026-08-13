# P17-009 — Cross-Platform Release Qualification Evidence

Date: 2026-08-13  
Status: IMPLEMENTATION COMPLETE — REMOTE CI PENDING  
Qualified locally: Windows, Node 24  
Not yet qualified remotely: Linux and Windows GitHub-hosted runners

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
| `scripts/cross-platform-workflow-contract.ts` | `90e2267879586065f1bb95dfaba10fdeeda2bdaab8a22591726d9ca3ada21a8e` |
| `scripts/cross-platform-release.test.ts` | `05be5103a5cb8c256dbf16d2c568317d76743a69b0e3c949008da3a92a7128c9` |
| `.github/workflows/workflow-kit-ci.yml` | `ee7adce26acf5f8b259b76fc6aa8b61b559cfeed21d8febc8cfc721b34533f31` |

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

## Pending highest-valid evidence

P17-009 remains `in_progress`. Its acceptance criterion requires the committed workflow to pass on
both `ubuntu-latest` and `windows-latest`. No push or PR was authorized, so no GitHub-hosted run
exists for this implementation. Only an authorized remote run may close the task; local Windows
proof and static workflow validation must never be relabeled as that run.

No sync, push, provider/model execution, credential access, install/publication, target `.Codex`
edit, or macOS qualification occurred.
