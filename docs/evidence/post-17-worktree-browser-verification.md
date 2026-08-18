# P17-011 Honest Isolated-Worktree Browser Verification Evidence

Date: 2026-08-14
Roadmap task: P17-011
Result: PASS

## Scope and authority

The implementation follows `docs/roadmap/p17-011-worktree-browser-verification-plan.md`. It closes
the historical path where a browser route unavailable from a linked worktree could be reported as
`infra-blocked` while the overall verification still passed. The verified boundary is the shared
target adapter plus its narrow B11 and flagship-prompt integration.

This evidence does not claim a credential-backed product B11 run. It proves the production target
adapter with disposable routes and an independently inspected browser surface. No target `.Codex`
directory, credential, provider runtime, deployment, sync destination, or remote repository was
modified.

## Implemented contract

- A strict closed JSON configuration selects either `managed` or `byte_identity` mode.
- The configured worktree is compared by its resolved real path and a linked worktree is detected
  through its `.git` file contract.
- Managed mode starts one argv-array child with `shell: false`, the exact worktree as `cwd`, bounded
  readiness and route probes, and idempotent process-tree cleanup.
- Byte-identity mode permits only bounded same-origin content comparison and rejects content over
  1 MiB, mismatches, redirects to another origin, and route-origin escape.
- Root `node_modules` symlinks and junctions are rejected before any managed process starts.
- Every accepted target emits hash-validated provenance. An unavailable route returns structured
  `needs_input`; it is never converted into a browser pass.
- B11 requires the identity contract for linked worktrees or explicit opt-in, passes the verified
  server URL to the Playwright child, and always closes the managed session in `finally`.
- HARD RULE 30 no longer contains the historical `worktree-route-not-deployed` pass exception.

## Focused proof

`npm run test:worktree-browser-target` passed 11 grouped cases:

1. strict configuration rejection;
2. linked-worktree detection;
3. byte-identity success;
4. wrong-server byte rejection;
5. missing-route `needs_input`;
6. configured-root mismatch rejection;
7. cross-origin route rejection;
8. exact-worktree managed launch and repeat-safe cleanup;
9. disposable junction refusal;
10. forged-provenance rejection; and
11. B11/prompt removal of the old pass exception.

`npm run test:b11-runner` passed 51 cases and includes the linked-worktree missing-target
`needs_input` route. `npm run test:b11-runner-order` passed 1 ordering case. The Playwright runner
suite passed 63 cases. The affected TypeScript sources also passed an isolated TypeScript 5.7
compiler check.

## Bounded visible browser proof

`scripts/evidence/p17-011-browser-fixture.ts` created a disposable linked-worktree-shaped root at:

`%TEMP%\agentic-feature-kit linked worktree Ω`

The production adapter started its server from that exact real `cwd` with `shell: false`.
Readiness and `/feature` returned HTTP 200 at `http://127.0.0.1:55440/feature`; the emitted
provenance status was `verified/exact-worktree-server`, process ID `19592`, and content hash:

`b51cdfebb804b4b06fe770170f14c7292a52a04b97fc2bca7616c989d1384727`

The Codex in-app browser independently read the bound URL. Its semantic DOM and full-page
screenshot both showed:

- title `P17-011 Worktree Browser Evidence`;
- heading `P17-011 exact worktree browser target`;
- mode `managed exact-worktree server`; and
- route `/feature`.

After capture, the browser tab, five process-tree PIDs, temporary root, and redirected output files
were removed. A process readback found zero remaining fixture processes. This is visible proof for
the disposable harness, not for a real product route.

## Drift failure and remediation

The first full-kit closeout correctly failed at `test:post-17-wave-1-inputs`: the HARD RULE 30
change moved the flagship SHA-256 from
`627a44d0c7139d269ed14b3629ecb0e0a1be2414d12354bbc744832de18fe449` to
`cd7ee78a9d1b2dc9eb1af28a93a1109903f4dba9efb4c0424edb21fff847b3b9`.

The drift gate was not bypassed. `scripts/refresh-post17-orchestrator-boundary.ts` now provides a
fail-closed refresh path: it requires the source bytes to equal the committed `HEAD` blob, validates
every phase anchor, and atomically replaces only the boundary artifact. Four tests prove clean
format-preserving refresh metadata, dirty-boundary refusal, dirty-source refusal with byte-identical
preservation, and phase-anchor refusal.
The existing conservation gate then passed 23 mandatory phases, 1 conditional phase, 3 provider
contracts, and 7 negative controls.

## Full regression

`npm run test:kit` exited 0 in 178.0 seconds on 2026-08-14. The run included the new boundary
refresh tests, the Wave-1 conservation gate, worktree-browser 11/11, B11 51/51, B11 order 1/1,
Playwright 63/63, and every remaining kit test, version, index, prompt-budget, and lesson-sync gate.

## Artifact hashes

| Artifact | SHA-256 |
|---|---|
| `.claude/integrations/worktree-browser-target.ts` | `261393c32dcc2c9ba8ead81986ba9c53e4845cf3b6e7c20001bec70cf8387a9f` |
| `.claude/integrations/worktree-browser-target.test.ts` | `2ec1d12720339c63ea51423c4f951d08b58ba409a3fd764d0df4a131cf59f66a` |
| `.claude/integrations/b11-runner.ts` | `0a28c18922cb42e50f013c018b3e972f4c0d0049ea859774ebfb3c02364b25d3` |
| `.claude/commands/feature-from-confluence.md` | `cd7ee78a9d1b2dc9eb1af28a93a1109903f4dba9efb4c0424edb21fff847b3b9` |
| `scripts/evidence/p17-011-browser-fixture.ts` | `30db6e1956ccda153c5980fd9d680de9eaff3c344ff49c59cefac4abddde77b1` |
| `scripts/refresh-post17-orchestrator-boundary.ts` | `e9bccba44ad77c64f55e0af1b61973be2a2d7181c32e675b8b1ea55582a56200` |
| `scripts/refresh-post17-orchestrator-boundary.test.ts` | `7762973de7513528e7d4bbbfc5e78814d39c473dd852613ed4bc94dbd3173147` |
| `docs/roadmap/post-17-orchestrator-boundaries.json` | `4b4a63eb87e0dda7a92b6a06b619ce59bde62e3b14cbd6492aeaf5ebb44be69c` |

## Result boundary

P17-011 is complete because the browser target is identity-bound, unavailable routes now have a
truthful non-pass outcome, junction reuse is refused, visible browser reachability is proven for the
bounded fixture, and the complete local regression is green. Product-route verification still
requires that product's own route, data, and credentials during its B11 run.
