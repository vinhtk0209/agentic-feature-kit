# P17-011 — Honest Isolated-Worktree Browser Verification Plan

Status: APPROVED BY ACTIVE ROADMAP GOAL  
Date: 2026-08-13

## Objective

Prevent B11 from treating a browser attached to another checkout, or an unavailable feature route,
as evidence for code in an isolated worktree. An isolated worktree must either launch its own server
or prove byte identity against the server it uses. Otherwise the result is structured
`needs_input`, never pass or `infra-blocked` success.

## Architecture

1. **Target contract:** a strict JSON configuration selects exactly one mode: `managed` or
   `byte_identity`. Unknown fields, unsafe paths, ambiguous modes, and shell command strings fail
   closed.
2. **Worktree identity core:** resolve the real worktree root, detect linked Git worktrees, reject a
   root `node_modules` symlink/junction, and produce content-addressed provenance.
3. **Managed adapter:** spawn one executable plus argv with `shell:false` and `cwd` equal to the real
   worktree root, poll a bounded ready URL, retain the process for the browser run, and terminate it
   deterministically afterward.
4. **Byte-identity adapter:** hash a bounded local file inside the worktree and compare it with bytes
   fetched from a same-origin public URL. A missing resource or mismatch rejects the target.
5. **Route preflight:** check the feature URL on the verified origin. Unavailable routes return
   `needs_input` with a stable reason code and required operator action.
6. **B11 integration:** require this preflight only when B11 runs from a linked worktree or when an
   explicit browser-target config is provided. A non-verified result creates failing structured
   route results and never launches Playwright against an unbound server.
7. **Prompt correction:** remove the historical rule that allowed
   `worktree-route-not-deployed` to preserve a pass; point it to the exact-worktree/byte-identity
   contract and `needs_input` behavior.

## Edge cases and attacks

- config root differs from the real B11 cwd;
- managed command uses a shell string, server exits before ready, or readiness times out;
- byte file escapes the worktree, public URL changes origin, bytes differ, or response exceeds cap;
- route returns an unavailable status after identity succeeds;
- a main-workspace server is supplied for worktree-only code;
- `node_modules` is a symlink or Windows junction, including a harmless temp-fixture reproduction;
- provenance fields or content hash are forged;
- cleanup is called twice or after early server exit.

## Highest-valid evidence

- Unit and process tests use real temporary worktree-shaped directories, HTTP servers, byte
  responses, and child cleanup.
- A bounded local browser fixture may prove visible navigation through the selected in-app browser;
  it supplements but does not replace the worktree/server identity contract.
- No test may create a junction aimed at a real repository dependency tree.

## Non-goals

No target `.Codex` edit, unsafe dependency reuse, blanket B11 rewrite, browser credential capture,
provider/model execution, sync, push, deployment, or claim that `needs_input` is a pass.
