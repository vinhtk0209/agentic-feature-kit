# P17-018 R3A — Public Governance Surface Plan

**Date:** 2026-08-17
**Task:** P17-018
**Scope lock:** `slice=R3A, governance=G1, security=S1, support=U1, community=C1, templates=T1, links=L1, evidence=E1`
**Starting commit:** `95169e18f73906b07245f0a22de9f947d0d91545`

## Outcome

Create the smallest public governance surface that lets an external evaluator contribute, request
support, report a vulnerability privately, and understand community expectations without access to
workspace history or an internal contact. The documents and templates must own distinct concerns,
link to one another rather than duplicate policy, and preserve the release candidate's explicit
not-public-ready state.

## Reconciled starting state

- P17-018 R1 owns the fail-closed public-tree manifest and marker registry. The current contract is
  valid but intentionally blocked by 31 unresolved marker dispositions.
- P17-018 R2 owns the provider-neutral root identity, package metadata, quickstart, limitations, and
  documentation map. Its README intentionally omits links to governance files that did not exist.
- `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`, issue forms, and a pull request
  template are absent at the exact starting commit.
- `.github/workflows/workflow-kit-ci.yml` is the only tracked `.github` surface. There is no approved
  `CODEOWNERS` identity and no enabled-Discussions evidence.
- Root package identity remains `feature-from-confluence-kit@3.25.0`, `private: true`; the public
  product display name remains Agentic Feature Kit.
- The verified 2026-08-17 backup tag is
  `38888187c4191206dbb81562ccb387463fcbbc76`; the worktree ZIP SHA-256 is
  `d175cad9f64b9e02ac4a037151a27adbace3e0d76d6e9eb21ecf56c0844df196`.

## Scope and non-goals

R3A adds the four root governance owners, two issue forms plus configuration, one pull request
template, README routing, a plan validator, an adversarial governance contract, package/full-suite
registration, and exact release-manifest entries.

R3A does not update the changelog or create release notes. Changelog and release notes remain
deferred to R3B. All 31 unresolved marker dispositions remain deferred. Dependency/license
inventory, SBOM, action pinning, secret and archive scans, nightly CI, clean-clone qualification,
version migration, tag, release, publication, repository visibility, provider/runtime behavior,
dashboard, database, sync, and target repositories are outside this slice.

No `CODEOWNERS` file is added. No governance document promises an SLA, legal representation,
provider endorsement, current public release, or guaranteed response.

## Locked R3A decisions

### G1 — Contribution guidance owns the development contract

`CONTRIBUTING.md` owns development setup, architecture boundaries, plan readiness, test ladders,
generated files, and contribution evidence. It points to existing architecture and provider docs
instead of copying shared-core business rules. It requires English feature artifacts, scoped changes,
exact tests, and an explicit external-write declaration.

### S1 — Security reporting is private and non-secret

`SECURITY.md` owns supported-version status, GitHub private vulnerability reporting, safe-harbor
language, best-effort response targets, and disclosure coordination. The reporting URL uses this
repository's GitHub Security Advisory flow. No personal or internal corporate email address is a
reporting path. Public issues must not contain exploit details, credentials, private specifications,
or sensitive evidence.

Before the first public release, only the current default-branch source is considered for best-effort
security fixes; historical tags and preview bundles are not declared supported release lines.

### U1 — Support routing is explicit and carries no SLA

`SUPPORT.md` owns questions, bugs, security routing, required reproduction evidence, unsupported use
cases, and the no-SLA boundary. Bugs use the repository bug form. Feature proposals use the feature
request form. Security and sensitive conduct reports use a private GitHub Security Advisory. GitHub
Discussions is not named as an active route until enablement is proven.

### C1 — Community conduct is versioned and attributed

`CODE_OF_CONDUCT.md` is explicitly versioned and attributed to Contributor Covenant 2.1. It states
the project pledge, expected and unacceptable behavior, enforcement responsibilities, scope,
private reporting route, proportionate consequences, and attribution. The policy itself carries an
R3A document revision so future changes are reviewable without pretending the upstream covenant
version changed.

### T1 — Issue and pull request templates collect bounded evidence

Issue forms collect version, provider, operating system, Node version, reproduction, expected and
actual behavior, and sanitized evidence. They warn users not to submit credentials, access tokens,
private specifications, customer data, or exploit details. Forms do not accept arbitrary uploads as
proof of safety and do not route security reports into public issues.

The pull request template requires a plan or task, scope, tests and evidence, generated drift,
security impact, compatibility, and external writes. It also requires a release-boundary statement
and confirmation that generated provider artifacts were rebuilt or explicitly unaffected.

### L1 — README routes to one canonical owner per policy

README links are repository-relative and resolve to the canonical policy owners. The documentation
map links exactly once to contribution, security, support, and conduct policies. Policy documents
cross-link only when routing requires it; they do not copy one another's checklists.

`scripts/public-entry-contract.test.ts` transitions from the R2 “premature governance link” denial
to requiring the four exact links once the files exist. Synthetic missing, case-drift, duplicate,
traversal, mail, and external-host attacks remain fail-closed.

### E1 — Evidence remains separate from policy

Policy files cannot claim their own verification. The source commit contains only implementation and
tests; one later evidence-only commit records the RED/GREEN history, exact manifest, static and
runtime gates, full suite, and non-claims. R3A completion does not change P17-018 catalog status or
the release candidate's blocked state.

## Document ownership and link graph

```text
README.md
  -> CONTRIBUTING.md -> architecture/provider/testing authorities
  -> SECURITY.md     -> private advisory reporting and disclosure
  -> SUPPORT.md      -> bug/feature/security routing
  -> CODE_OF_CONDUCT.md -> community behavior and private conduct reporting

.github/ISSUE_TEMPLATE/bug_report.yml      -> SUPPORT.md and SECURITY.md
.github/ISSUE_TEMPLATE/feature_request.yml -> CONTRIBUTING.md
.github/ISSUE_TEMPLATE/config.yml          -> SECURITY.md/private advisory URL
.github/pull_request_template.md           -> CONTRIBUTING.md
```

`CODEOWNERS` remains absent until stable public maintainer identities are approved. No personal
identity, internal team alias, private hostname, target repository, local filesystem path, or
credential-bearing example belongs in this graph.

## Governance contract matrix

| Owner | Required contract | Explicit denial |
|---|---|---|
| `CONTRIBUTING.md` | clean clone setup, architecture boundaries, plan-first readiness, tests, generated files, evidence, PR lifecycle | direct target edits, secret fixtures, unreviewed generated drift, automatic external writes |
| `SECURITY.md` | current support status, private GitHub reporting, report contents, safe harbor, best-effort timing, disclosure | public exploit reports, personal email, guaranteed remediation, unsupported-version claim |
| `SUPPORT.md` | bug/feature/security routes, reproducible evidence, supported questions, no SLA | secrets, private specifications, hosted-service claim, enabled-Discussions claim |
| `CODE_OF_CONDUCT.md` | version, pledge, standards, scope, enforcement, private report, attribution | public sensitive reports, retaliation, unowned contact identity |
| Issue forms | typed public inputs and mandatory secret warning | blank security issue, hidden credential request, missing environment/reproduction |
| PR template | scope, plan, tests, drift, security, compatibility, external writes | silent publish/sync/database/provider/target action |

## Threat model and attack matrix

The contract suite constructs valid synthetic policies/templates, then proves rejection of:

- a missing owner, empty required section, duplicate root link, unresolved or case-drifted link;
- `mailto:`, a personal/corporate email, private hostname, local path, traversal, or non-GitHub
  reporting destination;
- guaranteed response/remediation language, an SLA, a supported historical tag, provider
  endorsement, or a public-ready claim;
- a security issue template or any request for tokens, credentials, private specifications, customer
  data, raw logs, or exploit details;
- issue forms missing version/provider/OS/Node/reproduction/expected/actual/sanitized-evidence fields;
- a PR template missing plan/scope/tests/evidence/drift/security/compatibility/external-write checks;
- a conduct policy without its document revision, Contributor Covenant 2.1 attribution, enforcement
  scope, private route, or anti-retaliation boundary;
- a `CODEOWNERS` file, unclassified manifest path, unknown tracked file, non-English product string,
  CRLF/case ambiguity, or forbidden workspace marker in the new public surface.

Positive controls prove that each secret/path/email/claim detector actually fires before a zero-hit
result is accepted.

## TDD and verification ladder

1. Register the standalone R3A plan validator and prove RED only on the missing plan.
2. Add this plan and require the unchanged validator to pass all G1/S1/U1/C1/T1/L1/E1 clauses.
3. Register an adversarial governance contract and prove current-root RED only on the named missing
   documents, templates, README links, and release-manifest entries while synthetic attacks pass.
4. Add only the locked public files and update the existing README/public-entry contract transition.
5. Require focused governance/public-entry/release-domain/Node-index tests, exact TypeScript 5.9.3
   with `strict` and `skipLibCheck=false`, UTF-8/LF/final-newline/whitespace, link/English/privacy,
   positive-controlled secret/path/email/internal-marker scans, exact source manifest, and unchanged
   31-blocker disposition registry.
6. Run the full kit on the worktree candidate, stage only the exact source manifest, review the index,
   commit through normal hooks, and rerun focused/full gates on the immutable source SHA.
7. Write one English evidence file, add exactly its release-manifest entry, validate and commit it
   separately, then run final immutable proof before a feature branch and PR.

TypeScript and Node remain the measured implementation choice. R3A is file validation and Markdown/
YAML policy work; it has no measured CPU, memory, concurrency, binary-distribution, or systems API
gap that justifies Rust, Go, Python, an FFI layer, or a sidecar.

## Exact source and evidence manifests

The intended source commit is limited to:

- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/pull_request_template.md`
- `CODE_OF_CONDUCT.md`
- `CONTRIBUTING.md`
- `README.md`
- `SECURITY.md`
- `SUPPORT.md`
- `docs/roadmap/p17-018-r3a-governance-surface-plan.md`
- `package.json`
- `release/public-release-manifest.json`
- `scripts/post-17-public-release-r3a-plan.test.ts`
- `scripts/public-entry-contract.test.ts`
- `scripts/public-governance-contract.test.ts`
- `scripts/public-release-contract-node.test.ts`

The later evidence commit is limited to:

- `docs/evidence/post-17-public-release-r3a-governance-surface-2026-08-17.md`
- `release/public-release-manifest.json`

`release/internal-marker-classification.json` is not changed in R3A. Its SHA-256 and exact 73
classified occurrences remain stable; the candidate remains blocked by exactly the existing 31
`unresolved-marker-disposition` results.

## Rollback and external-action boundary

Every R3A file is additive or a bounded README/test/manifest/package edit. If a content, manifest,
test, build, or commit step fails after a partial update, restore the affected repository from
today's verified snapshot before retrying any broad operation. Narrow local edits may be corrected
only after the index and worktree prove the exact affected paths.

No network, credential, database, provider execution, sync, publish, release, tag, visibility, or
merge side effect is part of R3A verification. A later separately authorized feature-branch push and
PR may occur only after immutable local evidence. Root `private: true`, version `3.25.0`, provider
IDs, archive names, shared-core runtime, sync guards, and target source-of-truth boundaries remain
unchanged.

## Completion boundary

R3A is complete only when all four policy owners, three issue-template files, the PR template, and
the README route exist; focused synthetic attacks, TypeScript, static/privacy/link checks, manifest
contract, and full kit pass on exact source and evidence commits; a qualified PR is recorded; and no
out-of-scope mutation occurred.

R3A completion proves a bounded governance surface only. It does not prove current changelog/release
notes, zero internal markers, SBOM/license inventory, pinned actions, nightly CI, clean-clone timing,
public visibility, a v4 release candidate, package publication, marketplace availability, or full
P17-018/post-17 completion.
