# P17-009 — Cross-Platform Release Qualification Plan

Status: APPROVED BY ACTIVE ROADMAP GOAL  
Date: 2026-08-13

## Objective

Make Windows and Linux equal release qualifications. A release gate must consume the aggregate CI
matrix result and fail unless both operating-system jobs complete setup, platform smoke, and the full
kit suite successfully.

## Architecture

1. **Platform-smoke core:** TypeScript functions own CRLF normalization and direct child-process
   lifecycle behavior. They accept no shell command string.
2. **Probe adapters:** temporary fixtures exercise a path containing spaces, opaque argv values with
   shell metacharacters, CRLF input, and a real bounded child termination on the current OS.
3. **Qualification CLI:** one `@@CROSS_PLATFORM@@` content-addressed result; invalid invocation exits
   `2`, failed probe exits `1`, pass exits `0`.
4. **CI matrix:** `ubuntu-latest` and `windows-latest`, Node 24, `npm ci`, the platform smoke, then
   `npm run test:kit`. Platform exclusions must be written explicitly in the workflow.
5. **Release gate:** a separate Ubuntu job consumes the aggregate matrix result and fails closed
   unless it is exactly `success`.
6. **Contract test:** validates the workflow structure, release-gate dependency, CLI/result integrity,
   and hostile path/process fixtures without needing GitHub credentials.

## Edge cases and attacks

- spaces, quotes, ampersand, semicolon, dollar, parentheses, and Unicode remain one opaque argv item;
- CRLF becomes LF without altering existing LF;
- missing child fixture, child timeout, double termination, forged result hash, extra result field;
- workflow omits Windows/Linux, changes Node version, skips `npm ci`, skips smoke/full test, enables
  fail-fast, or makes the release gate independent of the matrix;
- Windows and Linux use the same Node entrypoint; no `date`, GNU/BSD `stat`, `cmd`, PowerShell, Bash,
  or shell interpolation in the smoke runtime;
- macOS remains explicitly unclaimed.

## Highest-valid evidence boundary

- This workstation supplies real Windows process/path/CRLF evidence.
- The committed workflow and validator supply deterministic proof that GitHub will require Windows
  and Linux jobs plus aggregate release gating.
- A remote GitHub Actions pass cannot be claimed until an authorized push/PR actually runs it. Since
  push is forbidden by the active goal, P17-009 may be implementation-complete but cannot be marked
  `done` solely from local evidence. Record the exact pending external evidence honestly.

## Non-goals

No macOS claim, deployment, sync, push, provider execution, credential access, target `.Codex` edit,
or unrelated shell cleanup. TypeScript is preferred unless measured cross-platform behavior requires
another language.
