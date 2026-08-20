# P17-004 A1 Provider-Neutral Specification Adapter Input-Lock Evidence

**Task:** P17-004
**Slice:** A1 synthetic provider input lock
**Date:** 2026-08-21
**Decision lock:** `schema=S1, fixtures=F1, provenance=P1, mapping=M1, unsupported=U1, config=C1, discovery=D1, privacy=R1, failure=E1, scope=N1`
**Source status:** locally qualified; evidence commit and exact-head PR qualification pending

## Outcome

P17-004 now has approved privacy-safe, provider-shaped synthetic inputs for Jira Cloud and Azure
DevOps. The input lock retains P17-003 `SemanticSourceInput` as the only canonical content contract
and defines a later additive `SpecAdapterResult` application wrapper. It does not introduce a second
semantic schema or implement a provider runtime.

The two fixtures have different provider envelopes, markup, fields, and anchors but the same
normalized title and acceptance-criterion meanings. Every raw field is either mapped or explicitly
unsupported. Expected title and paragraph bytes resolve literally to their configured raw fields;
acceptance-criterion quotes resolve literally to provider-qualified paragraph anchors.

## Source identity

| Identity | Value |
|---|---|
| Source commit | `ac4cf7be624908d3d93027da0f919f60ef3cdc8f` |
| Parent | `70ebfc74f0301afbfd04ae60ffab40e7f814310e` |
| Source tree | `00bd06fa7d5ab3296cfa5aa7a1bc28b040063cca` |
| Branch | `p17-004-a1-spec-adapter-input-lock` |
| Source paths | exactly nine |
| Unstaged/untracked after source commit | `0/0` |

The source commit changes only:

1. `docs/roadmap/fixtures/p17-004-azure-devops-minimal.json`
2. `docs/roadmap/fixtures/p17-004-jira-minimal.json`
3. `docs/roadmap/p17-004-a1-spec-adapter-input-lock-plan.md`
4. `docs/roadmap/post-17-roadmap.json`
5. `docs/roadmap/post-17-roadmap.md`
6. `package.json`
7. `release/public-release-manifest.json`
8. `scripts/post-17-spec-adapter-input-lock.test.ts`
9. `scripts/public-release-readiness-contract.test.ts`

## Fixture and contract hashes

| Path | Bytes | SHA-256 |
|---|---:|---|
| `docs/roadmap/fixtures/p17-004-azure-devops-minimal.json` | 2,315 | `64fa75101f193a848a2bc2af90bdb04f19de722f9df3117c47cbfcee2a9d47e6` |
| `docs/roadmap/fixtures/p17-004-jira-minimal.json` | 2,743 | `d684bb0f86e2b61fb2125f7c44a8d9dfb1434651774963fc76234aa264909069` |
| `docs/roadmap/p17-004-a1-spec-adapter-input-lock-plan.md` | 13,539 | `3c2c16fc92775cfa8be7e643408eee08ef8e8f6202d1f66733ffddde927a3e24` |
| `scripts/post-17-spec-adapter-input-lock.test.ts` | 14,331 | `14819bd21ebbeba8a2cc623010f4022d4493ea9aace5472d631bc7811c90e0a3` |
| `scripts/public-release-readiness-contract.test.ts` | 12,176 | `3027ba54426fd780d7d239cb6405433d025c325cecc3a17fff4955d0379a82c2` |

The source index contained exactly nine paths, passed `git diff --cached --check`, used strict UTF-8
without BOM or CR, ended every file with LF, and had no trailing whitespace. The public manifest had
`732/732` unique entries in JavaScript ordinal order before this evidence entry.

## Provider-shape authority

The minimal envelopes are bounded by official provider documentation:

- Jira Cloud REST API v3 issue resources expose issue identity and a `fields` object:
  https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/
- Azure DevOps REST 7.1 work items expose `id`, `rev`, `fields`, and `url`:
  https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-item?view=azure-devops-rest-7.1

These references justify only the synthetic envelope shapes. They do not claim full-field support,
authorize a provider request, or establish credential behavior.

## RED chain

The implementation preserved each closed boundary before making it GREEN:

1. The registered A1 validator exited `1` because the decision plan did not exist.
2. With the plan present, it exited `1` on the exact decision-label formatting mismatch; only the
   literal expectation was corrected.
3. It then exited `1` because the Jira fixture did not exist.
4. With both fixtures present, the privacy gate exited `1` because its private-IPv4 detector failed
   its own positive control `192.168.1.5`; the detector was repaired before accepting zero findings.
5. Fixture/privacy gates then exposed the expected roadmap `backlog` versus `in_progress` mismatch.
6. After the truthful readiness transition, the validator exposed the four missing public-manifest
   entries.
7. Code review found three additional gaps before qualification: expected content was not yet bound
   to mapped raw fields; URL userinfo/cross-origin mutations were missing; and unsupported-value
   wording contradicted the controlled synthetic raw placeholder. All three were closed.
8. The first exact-index public-readiness run exited `1` with sole gap
   `non-target-status-drift`. Diagnosis proved its repository assertion compared an immutable
   pre-R6 catalog with the mutable current roadmap, unintentionally freezing every unrelated future
   task status.

The R6 repair keeps all pure transition attacks unchanged. Repository reconstruction now compares
pre-R6 commit `c8e81bbe5ed5f21a166bae14a7849fe8dd57be3e` with accepted R6 merge
`df2c9ea16079f83c0c16ff16a95d8bfe14df9923`, while the current roadmap separately must preserve the
exact completed P17-018 task record. This permits honest later roadmap progress without weakening
the historical release-readiness proof.

## GREEN qualification

### Focused and dependency matrix

- `test:post-17-spec-adapter-input-lock`: PASS — `9` source paths, `2` synthetic providers, `3`
  positive-controlled privacy families, `5` negative attacks.
- `test:post-17-roadmap`: PASS — `22` tasks, `4` initiatives.
- `test:semantic-spec`: PASS — `8` assertions, `12` attacks.
- `test:post-17-wave-1-inputs`: PASS — `23` mandatory phases, `1` conditional phase, `3`
  providers, `7` negative controls.
- `test:provider-distribution`: PASS — `3` deterministic archives, `71` entries, `15` runtime
  smokes, `4` attacks.
- `test:provider-bundles`: PASS — `3` providers, `2` byte-identical skills, `5` shared runtimes.

### Exact-index public qualification

- `test:public-release-readiness`: PASS — `1` canonical transition plus `40` attacks.
- `test:public-release-contract`: PASS — `18` contract tests; current source scan covered `732`
  manifest paths, `220` Markdown files, `48/48` relative links, `4` lockfiles, `729` text files,
  `10` secret-detector families, and zero findings.
- `test:public-release-contract-node`: PASS — `7` Git-index/adapter/CLI tests.
- `check:public-release-contract`: PASS — `eligible-for-later-gates`, zero blockers.

### Complete native suite

`npm test` exited `0` in `321.6s` on the exact nine-path staged source candidate. It included all
Post-17, core, provider, public-release, privacy, control-plane, sync-guard, CI, browser-target,
version, prompt-budget, and lesson-sync gates. Version stamps remained `v3.25`; prompt budget was
within its `172 KB` limit; lesson sync was `60/60`.

The source commit hook also passed spec integrity: `2` TypeScript files, `0` feature folders,
`142ms`.

## Privacy, URL, and failure boundaries

- Fixture identities are synthetic and all hosts end in `.example.invalid`.
- Positive-controlled detectors cover email, credential assignment, and private IPv4 data; URL
  enumeration positively proves every fixture URL uses a reserved host.
- Base URLs require HTTPS and reject userinfo, query, and fragment. Azure payload URL origin must
  equal the injected base origin and cannot redirect configuration.
- Unsupported raw values remain only in the controlled synthetic payload; expected adapter output,
  logs, errors, and evidence retain unsupported names only.
- Missing field ownership, duplicate mapping, non-reserved host, userinfo, and cross-origin payload
  mutations fail closed.
- No raw tenant payload, person data, credential, token, comment, attachment, history, provider
  response, or normalized requirement body was collected or persisted.

## Architecture, language, naming, and version decision

TypeScript remains the correct A1 implementation language because this slice is a repository-local
contract/fixture validator with no runtime hot path, systems boundary, native library requirement,
or measured performance deficit. Adding Rust, Go, or Python here would introduce packaging and
supply-chain complexity without a benchmarked benefit. Any later cross-language component requires
an ADR, representative benchmark, provider-bundle compatibility plan, and Linux/Windows evidence.

Public names stay provider-neutral: `SemanticSourceInput`, future `SpecAdapterResult`, `jira`, and
`azure-devops`. Provider-specific JSON remains an infrastructure concern; the shared semantic core
imports no provider, HTTP, auth, environment, or filesystem client.

The kit remains `v3.25`. A1 supplies an input contract but no public runtime capability, so it does
not justify a compatibility or release-version bump by itself. Versioning remains a separate
roadmap decision after an executable adapter slice and compatibility evidence.

## Backup and rollback

The verified pre-change snapshot is
`_backups/claude-workflow-kit/2026-08-21/claude-workflow-kit-2026-08-21.zip`, SHA-256
`08634e703fbe2eb85f4dddae899636352a3c6eaadd7ea637e67c31aa7e8825ab`. Tag
`backup/2026-08-21` resolves to `aa7a5c3453a2158d58b03215c1e5ef945dcb9982`.

Rollback before merge removes the A1 branch or restores the verified snapshot. After merge, revert
the PR through the normal review path; do not reset or push directly to `main`.

## Non-claims

This evidence does not claim P17-004 complete, a Jira/Azure DevOps/Confluence/local-file adapter
exists, provider parity is proven, a network or credential flow ran, a real export was read,
capability discovery executes, P17-019 is ready, the repository is public, a package/plugin was
published, a version was released, a tag was created, sync ran, or any target `.Codex` directory or
dashboard file changed.
