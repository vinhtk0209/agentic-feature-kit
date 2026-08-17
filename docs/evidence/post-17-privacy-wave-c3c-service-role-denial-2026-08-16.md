# P17-016 Wave C3C Cross-Repository Service-Role Denial Evidence

**Date:** 2026-08-16
**Scope:** corrected C3C execution truth and executable cross-repository dashboard denial gate
**Source commit:** `baeadb2ab7acfff312beb656c760a1b0e509f178`
**Source parent:** `f788801d0307bc309f14ca0db6c6bf1f262b0074`
**Dashboard peer source:** `e3700b4f00b5b276fc0106e0ebb4e1eee1531b36`

## Outcome

The accepted C3 plan now records the reconciled pre-C3C baseline: one exported global service-role
client and 31 invocations across 28 consumer files. The inherited 27/30 count omitted the
version-metrics route and is retained only as correction history.

A fail-closed cross-repository validator is registered in the full kit suite. It requires the
dashboard global client to be absent; binds all 28 consumers, 15 closed API files, 14 closed pages,
and seven transitioned writers; scans application, library, feature, and server runtime sources;
checks the bounded payload/auth/view/progress/RBAC/client surfaces; and rejects four representative
reintroductions of the old import, service key, service SDK, and raw REST capability.

## Exact source manifest

The authoritative parent diff contains exactly three files, 232 insertions, and 4 deletions:

- `docs/roadmap/p17-016-wave-c3-tenant-foundation-execution-plan.md`;
- `package.json`; and
- `scripts/post-17-privacy-wave-c3c-service-role-denial.test.ts`.

The normal spec-integrity and commit-message hooks passed. The source commit is on `main`, and its
parent, manifest, stat, and clean worktree read back exactly.

## Validator execution and corrections

Repo-local `tsx` could not start inside the Windows sandbox because its temporary-directory
bootstrap calls `os.userInfo()` and receives `uv_os_get_passwd ENOMEM`. The isolated validators
were therefore compiled with the installed dashboard TypeScript 5.9 toolchain using
`skipLibCheck=false`, executed as plain CommonJS, and removed from an exactly resolved in-repo
temporary directory in `finally`.

The first compiled run found a validator-only case-sensitive response matcher; the dashboard
action helper was correct. The second found a validator patch escape that embedded a NUL in its own
delimiter regex. The validator was recreated without the fragile delimiter assertion while the
dashboard runtime test retained exact-key, frozen-payload, extra-field, and prototype attacks.
After these harness corrections, the C3C gate and predecessor C3 execution-plan validator pass.

The final gate reports:

`P17-016 Wave C3C service-role denial: PASS (28/31 baseline, 15 APIs, 14 pages, 7 writers, 4 attacks)`

Two independent positive-controlled dashboard source matchers find zero old global import,
service-key, service-SDK, or raw-REST production hits. Five staged credential detectors pass all
controls and find zero hits across the kit's 232 staged added lines. Package parsing and cached
whitespace pass.

## Exact-SHA full regression

The authoritative `npm run test:kit` at the source SHA exits `0` in 258.3 seconds with 1,609
captured output lines. The C3C cross-repository validator runs in-chain. Prompt budget is
163,206/176,128 bytes, version stamps remain v3.25, and lesson sync is 60/60.

The peer dashboard source SHA passes 83 files and 539 tests in 8.53 seconds. Dashboard TypeScript
retains only one unrelated pre-existing assurance-import diagnostic.

## Non-claims

This evidence does not claim migration `0018` was applied, a live tenant foundation or trusted
attestation exists, tenant-safe dashboard functionality is restored, a central sink is available,
disposable two-tenant database proof passed, or C3/Wave C/P17-016 is complete. No SQL apply, sync,
push, merge, deploy, provider mutation, target command, or target `.Codex` edit occurred.
