# P17-009 — Cross-Platform Release Qualification Evidence

Date: 2026-08-15
Status: THIRD REMEDIATION FULL LOCAL GREEN — FOURTH REMOTE RUN PENDING
Qualified locally: Windows, Node 24  
First remote attempt: Linux and Windows both exposed the same clean-checkout dependency gap
Second remote attempt: Linux and Windows exposed separate test-fixture/checkout portability gaps
Third remote attempt: Linux and Windows exposed remaining fixture inventory and non-canonical source provenance

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
| `scripts/cross-platform-release.test.ts` | `0fd2321f66962261c752f4e8fc6dab9ab1e879f393f5b6dab69ca4c38b9971da` |
| `.github/workflows/workflow-kit-ci.yml` | `8c5ef008c0eb71a7239ee33641d66e87b49ad23b0151e6b37802f57d15d9fb9b` |
| `.gitattributes` | `907d78349ba2f018d07a7abc27d4775b3b39900813aff0c6a0c50b163592ca24` |
| `.claude/integrations/gemini-cli-adapter.test.ts` | `e29e7330c62efd4f310bd46d1d11082421150b5688e24767289ec1480128369c` |
| `scripts/i2-live-evidence-verify.test.ts` | `a6174ac0b7b9ed9318ad3451e5719f7819cbf8215ca9ea0dee73ebef16d9a112` |
| `scripts/i2-provider-live-smoke.test.ts` | `c94be11140717f2d248d16019e1c56ab6f2e01c24e40df989a153bdc04e08d49` |
| `docs/roadmap/post-17-orchestrator-boundaries.json` | `80a544bab7fcf7c56574d7ae2b5a9660221f7fc9272b75babf6f994dcb68e5ac` |
| `scripts/post-17-wave-1-inputs.test.ts` | `f1f67cac55c0aedf6fcd9155f9a50cd05eee9069cc50358511c7e83354aeaf02` |
| `docs/roadmap/post-17-phase-capability-matrix.json` | `b92758db45bece1641024601331b68861371e4f67f79c0464b42b62a0dd2a6ea` |
| `scripts/post-17-phase-capability-matrix.test.ts` | `becdaab61d46f90922146467040a0e4c0d938b940335b743079b33b3f42c43ee` |
| `scripts/refresh-post17-orchestrator-boundary.ts` | `888d8725d61799cb9212dd584f4e779cc71b6947a80c843ead8305b3edf38d38` |
| `scripts/refresh-post17-orchestrator-boundary.test.ts` | `b463d11f9fa3416209ad32e221e5208c41671bbb9ed3ea3b4346eea5c0381085` |

## Verification

- Cross-platform release suite: 11 grouped tests pass, 0 fail.
- Attacks reject platform mismatch, forged hash, extra fields, reordered probes, duplicate evidence,
  contradictory summary, missing artifact, extra artifact, failed aggregate matrix, omitted Windows
  leg, enabled fail-fast, detached release gate, forged aggregate result, and skipped full suite.
- The original P17-009 implementation's isolated TypeScript 5.7.3 no-emit compilation exited `0`.
- A current standalone no-emit rerun is not a valid remediation result: the kit's declared
  TypeScript 4.9.5 cannot parse transitive `@types/node` 26.1.0, while the already-installed
  TypeScript 5.9.3 reaches the pre-existing `codex-cli-adapter.ts:232` `unknown < number` debt even
  when only the I2 test is selected. This second remediation does not expand into that unrelated
  adapter/toolchain scope.
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

## Second remote run and fixture/checkout remediation

Replacement run `31821422424` proved the nested dependency boundary: both jobs passed root and
nested installs plus their real platform smoke. The full suite then exposed two independent gaps:

- Linux job `94835308465` failed in `gemini-cli-adapter.test.ts` because its test-only default
  entrypoint was the Windows literal `C:\\gemini\\bundle\\gemini.js`. On POSIX that string is
  relative, so the production adapter correctly rejected it before spawn. The fixture now builds an
  absolute JavaScript path from the current platform root and asserts that invariant; production
  `strictEntrypoint` is unchanged.
- Windows job `94835308400` failed the valid I2 live-evidence group because Git checkout converted
  hash-bound LF JSON to CRLF. The repository had an LF attribute only for hooks. A controlled
  `git -c core.autocrlf=true checkout-index` reproduced the failure exactly: the receipt changed
  from 1,311 to 1,351 bytes and each backend binding from 459 to 476 bytes. `.gitattributes` now
  locks committed evidence JSON and evidence transcript text to LF. The I2 test discovers every
  file referenced by both live manifests and fails unless Git reports `eol=lf` for each one.

The checkout-stability regression first failed only on the missing LF attribute (6 prior groups
passed, 1 new group failed), then passed 7/7 after the attribute change. Gemini tests pass 8/8 and
the cross-platform release suite passes 9/9. A new `core.autocrlf=true` scratch checkout preserves
the receipt at its exact SHA-256 `41448112...ca338` and 1,311 bytes, and both backend bindings at
`f9cccb6c...3344c` and 459 bytes. The scratch directory was removed after proof. No verifier
normalization, production adapter relaxation, sync, provider call, merge, or direct-main push
occurred.

The complete CI-equivalent local command, `npm run test:kit`, exits `0` after 275.7 seconds with
both remediations in place.

## Third remote run and canonical provenance remediation

Run `31823362462` was the first run on commit `756f7557eb81a56f11524b3832be127a727619de`.
The earlier fixes were load-bearing: both jobs passed root/nested installs and platform smoke;
Linux passed the unit Gemini adapter fixture, and Windows passed the I2 evidence LF gate. The run
then exposed two later instances of the same portability classes:

- Linux job `94841626581` reached `test:i2-provider-smoke` and failed only its remaining
  Windows-literal Gemini entrypoint (7/8 groups passed).
- Windows job `94841626383` reached `post-17-wave-1-inputs.test.ts` and showed that the boundary's
  stored SHA `216d29a2...d717` described a local mixed-EOL flagship rather than a clean checkout.
  The Windows checkout produced `6783e35e...368c1`; a controlled LF checkout produced
  `bb33e2a5...2f410`.
- Aggregate release job `94842338055` failed closed because both platform legs were not successful.

An exact fixed-string inventory found three remaining `C:\\gemini` source occurrences, all in
`scripts/i2-provider-live-smoke.test.ts`. The first inventory implementation searched the runtime
single-backslash form and was discarded as an invalid zero-hit. The corrected scanner constructs
the source-escaped form, requires a positive control, failed on that single file, and now passes
after the fixture moved to a platform-native absolute path. The cross-platform suite also requires
Git `eol=lf` on the hash-bound flagship and passes 11/11.

Repository text checkout is now canonical LF through `* text=auto eol=lf`; Git binary detection
remains automatic. The boundary metadata and binding validators additionally enforce
`crlf-to-lf` canonicalization so a source hash is independent of an already-existing mixed-EOL
worktree. The flagship's canonical SHA
is `bb33e2a5...2f410`, model-config's is `5e52d489...f575d`, and the updated boundary's downstream
matrix SHA is `80a544ba...e5ac`. Boundary refresh tests prove LF and CRLF fixtures produce the same
SHA and keep dirty/anchor/range failures closed. Focused results are provider smoke 8/8, I2 evidence
7/7, boundary refresh 6/6, Wave-1 input PASS, phase matrix PASS, and cross-platform release 11/11.

One attempted checkout proof read the old HEAD boundary blob because the remediation was still
unstaged. Its flagship and model-config legs passed and its temporary directory was cleaned, but
the boundary leg is not evidence. The exact changed set must be staged before repeating the clean
checkout proof, followed by the full kit suite and fourth remote run.

The exact 12-file set was then staged. A new `core.autocrlf=true` checkout from that staged index
reproduced all four representative contracts exactly and cleaned its temporary directory: flagship
`bb33...`/160,569 bytes, model config `5e52...`/7,765 bytes, boundary `80a5...`/14,470 bytes, and I2
receipt `4144...`/1,311 bytes. The first full-suite attempt then correctly rejected an unnecessary
new phase-matrix root key through the production exact-key validator after 146.7 seconds. That root
key was removed without changing runtime `MATRIX_KEYS`; canonicalization remains explicit in the
boundary and validator implementations. Phase-router runtime/CLI, matrix, and cross-platform gates
passed, then the CI-equivalent full `npm run test:kit` exited `0` in 219.3 seconds.

## Pending highest-valid evidence

P17-009 remains `in_progress`. Its acceptance criterion requires the committed canonical-
provenance remediation to pass on both `ubuntu-latest` and `windows-latest`, followed by the
aggregate release gate. Stage and prove the exact diff, run the full local suite, push only the
reviewed remediation commit to the existing PR branch, and capture the fourth run; do not close
the task from local or failed-remote evidence.

No sync, provider/model execution, publication, target `.Codex` edit, direct-main push, merge, or
macOS qualification occurred. Git credential use was bounded to the authorized branch/PR API
operations and was never printed or persisted.
