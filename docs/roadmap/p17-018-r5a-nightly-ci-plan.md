# P17-018 R5A — Nightly CI Safety Plan

Status: implementation approved under the operator's standing post-17 authorization.

Scope lock: `slice=R5A, workflow=W1, triggers=T1, pins=P1, visibility=V1, restrictions=S1, evidence=E1`.

## Outcome

Make the already-proven Workflow Kit CI runnable nightly and on demand without weakening the
P17-009 Linux/Windows qualification matrix or granting any mutation, provider, database, or
publication authority. This slice produces static attack-tested contracts plus an exact-head
remote run; it does not claim clean-clone, supply-chain, release-candidate, or public-release
readiness.

## Reconciled baseline

- `.github/workflows/workflow-kit-ci.yml` already runs Node 24 on Linux and Windows for pull
  requests and pushes to `develop` or `main`.
- Both platform legs run the cross-platform smoke and full kit suite, upload one qualification
  artifact each, and feed a fail-closed aggregate gate.
- Repository permissions are `contents: read`, and the README already links a stable workflow
  badge.
- The workflow has no `schedule`, no `workflow_dispatch`, and no aggregate job summary.
- Its first-party action dependencies use floating major tags rather than immutable commit SHAs.

## W1 — Preserve one workflow and one matrix

Extend the existing Workflow Kit CI instead of introducing a second qualification workflow. The
same `kit-verify` Linux/Windows matrix and `release-gate` aggregate remain authoritative for pull
request, push, schedule, and manual events. R5A must not fork a cheaper nightly path or skip the
full kit suite.

## T1 — Deterministic triggers

- Keep `pull_request` and pushes to `develop` or `main` unchanged.
- Add one daily schedule at `17 3 * * *` (03:17 UTC) to avoid the top-of-hour congestion window.
- Add one input-free `workflow_dispatch` trigger. Inputs cannot be used to select a secret,
  provider, target, database, publish mode, or bypass.
- A pull-request run proves the exact workflow tree; an additional manual run on merged `main`
  proves the dispatch path. A future elapsed scheduled run may strengthen operational evidence,
  but its absence cannot be misrepresented as a failed or completed nightly observation.

## P1 — Immutable reviewed action pins

Pin every `actions/*` use to the exact commit resolved from the official repository's `v4` ref on
2026-08-18:

| Action | Immutable commit |
|---|---|
| `actions/checkout` | `11d5960a326750d5838078e36cf38b85af677262` |
| `actions/setup-node` | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| `actions/upload-artifact` | `ea165f8d65b6e75b540449e92b4886f43607fa02` |
| `actions/download-artifact` | `d3f86a106a0bac45b974a628896c90dbdf5c8093` |

The contract fails on a floating tag, shortened SHA, changed SHA, unknown action owner, local
action, Docker action, duplicate use, or missing expected use. Updating a pin requires a reviewed
source change and fresh evidence; comments may retain the reviewed `v4` family for readability.

## V1 — Failure visibility

- Retain the stable README badge and link for `workflow-kit-ci.yml`.
- The aggregate job always appends a bounded Markdown summary to `GITHUB_STEP_SUMMARY` after the
  fail-closed matrix gate, including the matrix result, aggregate result, qualified platforms,
  and read-only permission statement.
- The summary step uses only trusted job status and needs-context values. It does not interpolate
  branch, PR, commit-message, issue, or dispatch input text.
- A red matrix or missing artifact remains a failed workflow even though the summary step runs.

## S1 — Read-only and zero-external-effect boundary

- Keep top-level `permissions: contents: read`; forbid write permissions and `write-all`.
- Do not reference GitHub secrets or define token/key/password/service-role environment inputs.
- Permit only the existing lockfile installs, tests, artifact transfer, aggregate validation, and
  job-summary write.
- Forbid provider CLI execution, external provider calls, Supabase/database writes, sync, git
  push, issue creation, deployment, npm/marketplace publication, tags, and GitHub Releases.
- Artifact uploads are CI evidence retention, not product publication or a GitHub Release.

## Test and attack matrix

1. The existing cross-platform workflow contract must still prove equal Linux/Windows legs,
   Node 24, lockfile installs, full kit tests, platform artifacts, and fail-closed aggregation.
2. The R5A contract must reject missing/duplicate schedule or dispatch triggers.
3. It must reject floating, shortened, changed, missing, duplicated, or third-party action refs.
4. It must reject repository write permission, secret/token bindings, sync, provider, database,
   push, deploy, tag, release, or publication commands.
5. It must reject a missing/conditional/untrusted job summary and a stale workflow badge/link.
6. The full kit suite must pass locally and at the exact feature-branch head on both Linux and
   Windows, followed by the aggregate release gate.

## Evidence contract

Durable evidence belongs at
`docs/evidence/post-17-public-release-r5a-nightly-ci-safety-2026-08-18.md` and records:

- scope lock and explicit nonclaims;
- exact source/evidence commits, parent, trees, and path manifests;
- official action-ref lookup result and the committed pin table;
- RED failure before workflow implementation and GREEN focused/full-suite receipts;
- exact PR/head/base, Linux/Windows/aggregate job IDs, durations, conclusions, and artifact hashes;
- manual-dispatch run identity after merge, separately from scheduled-run nonclaims;
- rollback boundary and confirmation of no sync, provider/database write, publication, tag, release,
  visibility change, dashboard mutation, target mutation, or branch deletion.

## Rollback and stop conditions

Rollback is one revert of the R5A source/evidence commits or restoration from the verified
2026-08-18 backup. Stop and do not merge if either platform, the aggregate gate, action-pin
contract, read-only boundary, or exact-head binding fails. Do not compensate by disabling a leg,
using a floating action tag, adding a credential, bypassing a test, or publishing partial
artifacts.

## Deferred beyond R5A

Documentation link checking, package/license/secret/archive gates, dependency inventory, SBOM,
clean-clone qualification, deterministic double-build evidence, RC/version changes, dashboard
release management, tags, GitHub Release, marketplace/npm publication, repository visibility,
sync, and target installation are explicitly deferred.
