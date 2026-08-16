# P17-016 Wave C3B Verifier Consumer Evidence

**Date:** 2026-08-16
**Scope:** bounded legacy verifier consumers and the C3B compatibility gate
**Source commit:** `3a0f98bec00beeb04402531b99841f6f78ca5ed4`
**Source parent:** `9a4136ff2e902c879f31ad5e5ef059458f98fae7`
**Dashboard peer source:** `1e5d84ea0a8d2f58736f14b3aabb732b67642b68`

## Outcome

The workflow CLI and telemetry consumer now accept only the bounded successful verifier result
`{ valid, runs_used, max_runs }` or a closed invalid reason. They neither require nor display the
legacy raw owner identity. New local login configuration also omits the owner field.

The same source checkpoint registers a fail-closed C3B consumer validator in the full kit suite.
It binds the three-argument verifier call and rejects reintroduction of raw owner output, type,
mock response, or persistence.

## Exact source manifest

The authoritative parent diff contains exactly eight files, 131 insertions, and 9 deletions:

- `.claude/integrations/telemetry-mock-runner.ts`;
- `.claude/integrations/telemetry.test.ts`;
- `.claude/integrations/telemetry.ts`;
- `bin/lib/local-config.ts`;
- `bin/workflow.ts`;
- `docs/roadmap/p17-016-wave-c3-tenant-foundation-execution-plan.md`;
- `package.json`; and
- `scripts/post-17-privacy-wave-c3b-verifier-consumers.test.ts`.

The normal spec-integrity and commit-message hooks passed. Commit readback proves the exact SHA,
parent, manifest, stat, required `main` branch, and clean worktree.

## RED evidence

Before the consumer edits, the unchanged C3B validator rejected 14 concrete gaps across workflow
configuration/CLI, telemetry, its mock, and its tests. The failures included the raw owner result
type, display and persistence, missing bounded messages, and an absent owner-denial assertion.

The RED was executed from a temporary TypeScript artifact because repo-local `tsx` cannot call
`os.userInfo` inside this Windows sandbox. The temporary compile directory was resolved inside the
kit repository and removed after execution. No fallback behavior or product source was changed to
make the RED pass.

## Focused and companion GREEN evidence

The C3B consumer gate passes the bounded response contract and five mutation attacks:

- workflow raw owner use;
- telemetry raw owner use;
- local-config owner persistence;
- mock owner response; and
- loss of the three-argument verifier binding.

Telemetry passes 18/18 tests, including a valid response with no owner text. The Wave C1, C2, C3,
privacy policy/writer, registry, roadmap, and core companion gates also pass. TypeScript 5.9.3
compiles the exact validator graph with `strict` and `skipLibCheck=false`.

Two independent positive-controlled matchers found zero `result.owner` use in the two production
consumers. Five credential detectors passed all controls and found zero AWS, GitHub, JWT,
private-key, or sensitive environment-assignment material across 131 staged added lines. Cached
and parent whitespace checks pass.

## Exact-SHA full regression

The authoritative `npm run test:kit` at the source SHA exits `0` in 255.69 seconds with 1,604
captured output lines. Prompt budget is 163,206 of 176,128 bytes and lesson sync is 60/60. The peer
dashboard source SHA passes 82 files and 547 tests in 7.07 seconds.

An earlier source-candidate direct runner also completed all 115 leaf commands. Two child-process
tests required unchanged outside-sandbox reruns, and the npm workflow boundary required the real
installed npm CLI path. The authoritative post-commit full run supersedes that temporary harness;
all harness files were removed and all nine packages disturbed by rejected `pnpm` probes were
restored with zero files left under `node_modules/.ignored` before staging.

## Non-claims

Historical pre-C3 local configuration may still contain an unused owner property; this work does
not claim historical local-data purge. It does not claim that dashboard migration `0018` ran, the
bounded verifier is deployed, a tenant or grant exists, a central sink is available, two-tenant
isolation is proven, or C3/Wave C/P17-016 is complete. No sync, push, merge, provider action,
target command, or target `.Codex` edit occurred.
