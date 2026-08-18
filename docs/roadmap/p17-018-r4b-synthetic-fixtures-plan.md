# P17-018 R4B — Synthetic Fixture Privacy Plan

**Date:** 2026-08-18
**Task:** P17-018
**Scope lock:** `slice=R4B, baseline=B1, confluence=C1, projectRef=P1, regression=G1, registry=R1, evidence=E1`
**Starting commit:** `15606c0476bf657372fe4b518c434673c0aa74a3`

## Outcome

Replace six test-only internal-marker bindings with deterministic, reserved, public-safe fixtures
without weakening semantic normalization, provenance, Confluence trust-boundary, privacy-migration,
or release-authority coverage. The slice removes exactly 24 classified occurrences and six blockers
while preserving the remaining genericization and private-archive work as visible blockers.

R4B changes no production runtime and does not claim public-release eligibility. It creates a
recomputable fixture contract so later maintenance can distinguish a privacy-safe synthetic sample
from a cosmetic string replacement.

## Reconciled starting state

- The committed release authority is contract-valid but intentionally blocked: 604 total paths,
  599 includes, five excludes, 70 classified occurrences, and 28 unresolved-disposition blockers.
- The remaining registry groups are `genericize` at 16 bindings and 40 occurrences,
  `move-to-private-archive` at six bindings and six occurrences, and
  `replace-with-synthetic-fixture` at six bindings and 24 occurrences.
- The semantic baseline has 95 paragraphs, 95 unique anchors, and 19 acceptance criteria. All 19
  provenance quotes resolve literally, but the source also carries non-English text, internal host
  names, internal work-item markers, and network URLs. Simple token substitution cannot establish
  a synthetic-source privacy boundary.
- Three Confluence tests preserve useful same-origin and hostile-origin behavior but currently use
  organization-bound host values.
- Two P17-016 privacy tests embed one live project reference as an equality fixture and one as a
  forbidden hard-coded value. Their behavior can be preserved without the historical identifier.
- The R4A legacy-backend regression contract protects the previous runtime remediation but uses
  exact historical counts that would prevent this legitimate later reduction.
- Pre-change focused evidence on the starting commit is green for semantic normalization,
  Confluence B0 intake/refetch/HTTP, C2 schema design, C4D disposable verification, R4A regression,
  and Node Git-index release authority.
- Today's verified rollback authority is tag `backup/2026-08-18` at
  `88005e5bd14764c2d57bd02a261dcc637307bf02` plus worktree ZIP SHA-256
  `468184283a30dd995f8513bea6e262d66fe93242ab75c19397c9def1fae812c0`.

## Scope and non-goals

R4B fully rewrites one offline semantic fixture, converts three Confluence tests to reserved
origins, makes two project-reference tests value-independent, evolves the R4A regression contract,
adds plan and privacy/integrity gates, removes exactly six registry bindings, updates release
manifest authority, and records evidence in a later evidence-only commit.

R4B does not genericize the remaining 16 bindings, move the six historical bindings to a private
archive, alter a production adapter or provider, change a schema or database, change dashboard
snapshots, run sync, touch target repositories, add supply-chain/nightly/clean-clone controls, bump
a version, create a tag or release, publish a package/plugin, push a branch, or change visibility.

## Locked R4B decisions

### B1 — Fully synthetic semantic baseline

The baseline is replaced as a whole with deterministic ASCII English content. It preserves exactly
95 paragraphs, 95 unique anchors, and 19 acceptance criteria; all 19 provenance quotes resolve
literally after normalization, and every criterion retains one structured scenario. IDs and anchors
stay stable where tests depend on them, while people, customers, projects, tickets, paths, hosts,
URLs, and prose become invented provider-neutral data.

The synthetic source hash is recomputed from canonical fixture content by the fixture contract; a
copied constant is not evidence. Canonical bytes use UTF-8, LF, one final newline, stable object
ordering, and no network URL. The contract independently derives semantic and provenance receipts
through the real `normalizeSemanticSpec` path.

### C1 — Reserved Confluence origins preserve security coverage

Confluence fixtures use reserved example.test origins only. Valid cases stay HTTPS and same-origin;
hostile cases vary one trust property at a time. Same-origin, credential, scheme, path, and
host-confusion attacks remain covered, including user-info, sibling-host, suffix, port, encoded,
and non-HTTP variants already represented by the affected suites.

No test reaches the network. Mock transports observe sanitized request behavior, not a private
host, credential, or page body.

### P1 — Project-reference assertions become value-independent

The C2 migration-design test verifies that project_ref values are checked by shape and
cross-snapshot equality; the committed dashboard snapshot remains an input and is not edited. The
C4D disposable-verification test rejects generic hard-coded project-reference patterns and uses a
reserved synthetic value only where a positive control is required. No exact live project
identifier remains in a public test.

These changes preserve tenant count, repository count, scenario count, replay, idempotency, and
failure-path assertions. They neither execute nor authorize a Supabase operation.

### G1 — Prior regression contracts become remediation-safe

R4A regression assertions use explicit runtime-path denial and monotonic ceilings. The contract
still proves that the three remediated runtime paths contain no embedded backend URL or JWT-like
credential and that their registry bindings cannot return. It permits only a reduction in total
classified occurrences/blockers, never an increase or reclassification that hides an unresolved
runtime finding.

The new R4B contract owns exact current fixture counts. This separates historical regression
protection from current-slice authority and lets later reviewed remediation reduce the remaining
blockers without weakening R4A.

### R1 — Marker authority changes exactly

Remove only the six `replace-with-synthetic-fixture` bindings after their source occurrences are
absent. Internal-hostname falls from 21 occurrences to zero. Live-supabase-project-ref falls from
eight occurrences to five. Classified occurrences fall from 70 to 46. Release blockers fall from
28 to 22.

The remaining authority contains only `genericize` at 16 bindings/40 occurrences and
`move-to-private-archive` at six bindings/six occurrences. Final manifest authority is 608 total
paths, 603 include, and five exclude after the source and evidence owners are registered. Unknown
tracked files, stale removed bindings, suppressed findings, or a count below the remaining
classified evidence fail closed.

### E1 — Evidence remains immutable and separate

The source commit contains the locked plan, readiness gate, privacy/integrity contract, fixture and
test rewrites, remediation-safe regression, exact registry delta, package routing, and source
manifest update. A later evidence-only commit records plan RED/GREEN, contract RED/GREEN, affected
suite, authority, strict/static/staged/full-kit, immutable-source, and immutable-evidence receipts.

Evidence records exact commit identities, hashes, counts, rollback authority, and non-claims. It
does not repeat private values or turn a local proof into a publication claim.

## Threat model and attack matrix

The R4B contracts reject:

- any private/corporate hostname, live Supabase project reference, JWT-like literal, internal
  work-item marker, personal name/email, user-profile or drive path, file URI, traversal path,
  non-English fixture line, control character, CRLF, trailing whitespace, or missing final newline;
- source-hash or semantic/provenance receipt tampering, reordered canonical material, duplicate or
  missing paragraph anchors, duplicate/missing criterion IDs, unresolved/lossy provenance, and a
  structured-scenario count other than 19;
- Confluence URLs with credentials, HTTP non-loopback schemes, wrong paths, query/fragment abuse,
  sibling/suffix/Unicode host confusion, unexpected ports, or origins outside reserved namespaces;
- project-reference assertions that copy an exact live value, compare against unrelated snapshots,
  accept malformed shape, or weaken the existing disposable-verification matrix;
- R4A regressions that reintroduce a runtime secret/endpoint, allow a registry binding for one of
  those runtime paths, increase historical ceilings, or pass through count suppression;
- registry/manifest drift, unknown tracked files, unsorted entries, stale counts, missing package
  routing, and diagnostics that echo sensitive fixture content.

Every absence claim uses a positive control and a second fixed-string or content-anchored method.
Synthetic origins and identifiers use standards-reserved namespaces.

## TDD and verification ladder

1. Add and package-register the readiness validator; prove RED only because this plan is missing.
2. Add this plan and require the unchanged B1/C1/P1/G1/R1/E1 readiness validator to pass.
3. Add the synthetic-fixture privacy/integrity contract first. Require its attacks to pass and the
   current tree to fail only on the six named bindings, historical fixture content, old registry
   authority, and pre-remediation R4A count assumptions.
4. Replace the semantic baseline and update only the affected semantic/Confluence/privacy tests.
   Require exact 95/95 paragraph-anchor uniqueness, 19/19 criteria, 19/19 resolved provenance,
   19/19 scenarios, and zero private-pattern/network-URL hits.
5. Evolve the R4A contract to runtime-path denial plus monotonic ceilings. Remove exactly six
   registry bindings and update package/manifest routing. Require exact 46 classified occurrences,
   22 blockers, and the two remaining disposition groups.
6. Run every affected focused suite, the R4A gate, direct and Node Git-index release authority, and
   the new fixture contract. Compile all affected TypeScript with `strict` and
   `skipLibCheck=false`.
7. Audit the exact source manifest for UTF-8/LF/final newline/trailing whitespace, JSON validity,
   English feature content, link safety, manifest sort/digest, and positive-controlled privacy and
   marker scans. Stage only that manifest in an isolated normal-index worktree and run full kit.
8. Commit source through normal hooks; rerun focused/full verification on the immutable source SHA.
   Add and separately commit evidence plus its manifest entry; rerun focused/full verification on
   the immutable evidence SHA. Remote branch/PR/CI work requires separate explicit authorization.

TypeScript and Node remain the measured implementation choice. This slice validates small static
fixtures inside existing TypeScript contracts; Rust, Go, or Python would add a toolchain and
cross-platform distribution boundary without a measured performance, concurrency, memory,
cryptography, or systems-API gap.

## Exact source and evidence manifests

The source manifest contains exactly these 15 paths, in ordinal order:

- `.claude/assurance/baselines/us-ad-095-progress-reports.spec-ir.json`
- `.claude/integrations/confluence-b0-intake.test.ts`
- `.claude/integrations/confluence-refetch-actor.test.ts`
- `.claude/mcp-server/confluence-http.test.ts`
- `docs/roadmap/p17-018-r4b-synthetic-fixtures-plan.md`
- `package.json`
- `packages/core/test/semantic-spec.test.ts`
- `release/internal-marker-classification.json`
- `release/public-release-manifest.json`
- `scripts/post-17-privacy-wave-c2-schema-migration-design.test.ts`
- `scripts/post-17-privacy-wave-c4d-disposable-verification.test.ts`
- `scripts/post-17-public-release-r4b-plan.test.ts`
- `scripts/public-release-contract-node.test.ts`
- `scripts/public-release-legacy-backend-contract.test.ts`
- `scripts/public-release-synthetic-fixture-contract.test.ts`

The LF-final source-manifest identity is SHA-256
`e16fd7305c29152f4dd20f76e42223e47423974edfe8c6fc8e49471ad142669f`.

The later evidence manifest contains exactly:

- `docs/evidence/post-17-public-release-r4b-synthetic-fixtures-2026-08-18.md`
- `release/public-release-manifest.json`

The LF-final evidence-manifest identity is SHA-256
`f5527395df91a8ac8b9c953e13bf8eb7dc6d54bc82e877167fb7cc1fc3dd227e`.

No generated log, archive, environment file, dashboard snapshot, target path, local configuration,
or raw classified value belongs to either commit.

## Rollback and external-action boundary

Edits are bounded to the source manifest and made through test-first checkpoints. A focused test
failure may be corrected only after exact worktree/index scope inspection. If a bulk fixture,
registry, manifest, staged-index, commit, or other broad operation fails after partial mutation,
restore the affected repository from today's verified snapshot before retrying; do not retain a
half-synthetic fixture or half-updated release authority.

No sync, push, tag, release, publication, visibility, database, provider, dashboard, or target side
effect belongs to R4B local work. No dashboard snapshot is modified. A later retained feature
branch, draft PR, exact-head Linux/Windows/aggregate CI, and PR merge require a separate direct
authorization after immutable local evidence.

## Completion boundary

R4B is locally complete only when the six test-only bindings and all 24 classified occurrences are
absent; semantic structure/provenance and Confluence/privacy attack coverage remain exact; R4A is
remediation-safe; registry authority is exactly 46 classified occurrences and 22 blockers; final
manifest authority is exact; focused, strict, static, staged, immutable-source, and
immutable-evidence gates pass; and neither dashboard nor target state changed.

R4B does not complete the remaining genericization/private-archive remediation, P17-018, public
release eligibility, supply-chain/nightly/clean-clone readiness, version/tag/release/publication,
provider execution, sync, dashboard, database, or target verification.
