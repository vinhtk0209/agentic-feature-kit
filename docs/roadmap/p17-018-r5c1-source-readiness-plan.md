# P17-018 R5C1 — Source-readiness gates

Date: 2026-08-18
Status: approved implementation plan
Parent: `docs/roadmap/p17-018-public-release-plan.md`
Input lock: `slice=R5C1, links=L1, licenses=P1, secrets=S1, docs=D1, architecture=A1, evidence=E1`

## Outcome

Make the exact public source candidate fail closed on broken internal documentation links,
unreviewed dependency licenses, credential material in manifest-authorized text, and stale release
notes. The resulting gates are deterministic, offline, cross-platform, and derived from the public
release manifest plus four committed lockfiles.

R5C1 is one source-readiness feature and one PR. It does not create or publish an SBOM or archive,
qualify a clean clone, change repository visibility, or publish a package. Versions remain
`3.25.0 / v3.25 / 0.5.0 / 1.3.0`.
This slice does not claim SBOM, final-archive, clean-clone, release-candidate, publication, or visibility readiness.

## Reconciled baseline

- Qualified base is merged `main` commit `fdade1bedf9ce4798d24ccc24537637d316bfd07`.
- The public manifest authorizes 187 Markdown files. A positive-controlled audit observes
  54 relative links and 41 positive controls, with exactly 13 unresolved links across
  `.claude/prompt-evolution.md`, `docs/claude-commands/README.md`, and
  `docs/claude-commands/README.vi.md`.
- The missing link targets are historical private or removed artifacts. Restoring them would
  violate the established private-history boundary; current public sources must link to retained
  public authority or describe the historical artifact as unavailable.
- A second positive-controlled audit covers 613 manifest text files and ten detector families. It
  currently finds zero credential hits, but the repository has no committed manifest-wide secret
  contract to keep that state true.
- Dependency authority comprises four package-lock authorities: root, `docs-site`,
  `.claude/mcp-server`, and `.claude/mcp-workflow`. Together they contain
  749 dependency occurrences and 616 unique name@version packages.
- Exact-version npm metadata resolves 612 license assertions. Four records omit the license field:
  `busboy@1.6.0`, `format@0.2.2`, `khroma@2.1.0`, and `streamsearch@1.1.0`. Inspection of their
  exact registry tarballs resolves all four to MIT through the packaged license or README.
- The resolved 616-package distribution is: MIT 520, ISC 51, Apache-2.0 22, BSD-3-Clause 12,
  BSD-2-Clause 5, MPL-2.0 2, and one each of 0BSD, CC-BY-4.0, Unlicense, and
  `(MPL-2.0 OR Apache-2.0)`.
- Five exact packages require an explicit policy decision outside the unconditional permissive
  allowlist: `@axe-core/playwright@4.11.3`, `axe-core@4.11.4`,
  `caniuse-lite@1.0.30001799`, `dompurify@3.4.11`, and `robust-predicates@3.0.3`.
- Root package metadata is already provider-neutral, private, and Apache-2.0. The docs site remains
  private but has a Claude-specific description and no license/engine declaration. Both MCP
  package roots lack private, description, license, and engine declarations.
- `docs/releasing/UNRELEASED.md` still describes resolved marker/nightly gaps and must not remain
  authoritative after R5C1.
- `dist/provider-bundles` contains no artifact. R5C1 cannot reuse or qualify a stale archive.

## A1 — Source-readiness architecture decision

Use one dependency-free TypeScript domain module with three independent adapters:

1. a manifest adapter that returns the exact included source paths and content kinds;
2. a Markdown link adapter that parses bounded link destinations without network access;
3. package-lock/catalog and text readers that provide deterministic normalized inputs.

The domain layer returns structured findings rather than printing or exiting. Thin CLI/test
adapters format those findings and choose the process exit code. Each gate can therefore be tested
with in-memory fixtures, while the current-tree assertion reuses the same implementation. File
ordering, package ordering, detector ordering, and finding ordering are ordinal and stable across
Windows and Linux.

Retain TypeScript and Node.js. The reconciled workload is 616 unique packages, 187 Markdown files,
and 613 text files; no measured native-language capability or performance gap exists. Reconsider a
Rust, Go, or Python implementation only if an archive exceeds 512 MiB, measured peak scanner
memory exceeds 256 MiB, or a representative scan exceeds 30 seconds. Introducing another runtime
before one of those thresholds would enlarge the public toolchain and license surface without a
proven benefit.

The source gate must not read `node_modules`, call the npm registry, traverse outside the repository,
or depend on GitHub/Supabase/provider credentials. External metadata is converted once into a
committed, reviewed catalog; every normal test and CI run is offline.

## L1 — Manifest-wide Markdown link integrity

Derive Markdown inputs only from include rows in `release/public-release-manifest.json`. Parse inline,
image, and reference-style Markdown destinations while ignoring fenced code, inline code, external
schemes, email links, and fragment-only references. Decode percent-encoded path segments exactly
once, remove query/fragment suffixes for file resolution, normalize separators, and reject malformed
encoding, NUL, absolute paths, drive/UNC paths, traversal, empty relative targets, and root escape.

Every file target must:

- exist as a regular tracked file;
- be present in the public manifest;
- match the exact on-disk and Git-index path casing;
- remain inside the repository after resolution.

Markdown fragment validation uses GitHub-style heading slugs with duplicate-heading suffixes and
explicit HTML IDs. Reject stale anchors, invalid percent encoding, case drift, ambiguous duplicate
references, and links whose target is excluded or absent. External availability is outside this
offline gate; an external timeout can never hide an internal-link failure.

Repair only the exact 13 baseline findings. Point the retained hardening history to root
`CHANGELOG.md`, point parity/evaluation history to retained `.claude/prompt-evolution.md`, and make
the prompt-evolution clean-room reference plain historical text. Do not recreate the removed
`HARDENING-CHANGELOG.md`, `PARITY_REPORT.md`, or `impl-from-confluence/EVALUATION.md` artifacts.

## P1 — Four-lock dependency and license policy

Create one deterministic dependency catalog whose exact key is normalized `name@version`, sorted
ordinally, with license expression, provenance class, and the lockfile authorities that reference
the package. The gate must prove all four lockfiles are present, valid lockfile v2/v3 JSON, registry
resolved, integrity-bound, and represented exactly once in the catalog. It rejects an unbound URL,
Git/file/workspace dependency, missing version, missing integrity, duplicate/conflicting package,
catalog extra/missing row, license drift, unrecognized expression, unknown provenance, or a package
outside policy.

Unconditional allowlist: `0BSD`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, and `MIT`.
Every other expression fails unless the exact package identity and expression appear in the reviewed
exception registry:

- `@axe-core/playwright@4.11.3` and `axe-core@4.11.4` — MPL-2.0, development/test tooling;
- `caniuse-lite@1.0.30001799` — CC-BY-4.0, browser-compatibility data;
- `dompurify@3.4.11` — choose Apache-2.0 from `(MPL-2.0 OR Apache-2.0)`;
- `robust-predicates@3.0.3` — Unlicense, transitive geometric utility.

The four metadata-omission overrides are exact package-version exceptions with packaged-tarball
provenance and resolved MIT text. Wildcards, name-only exceptions, version ranges, mutable URLs,
`NOASSERTION`, `UNLICENSED`, and missing license values are forbidden. GPL, AGPL, LGPL, SSPL, BUSL,
Elastic, Commons-Clause, unknown, or syntactically invalid expressions fail closed unless a future
source-reviewed exact exception changes the policy.

Normalize all four package roots as private Apache-2.0 workspace components with provider-neutral
descriptions and Node `>=20`. Use scoped, provider-neutral MCP package names and bind each lockfile
root record to the matching package name, version, and Node engine; npm does not serialize private,
license, or description metadata into those records. No dependency range or resolved dependency may
change. The root release package stays private. This slice prepares public source and does not
authorize npm publication.

Update `THIRD_PARTY_NOTICES.md` to name the catalog/policy authority and the five reviewed exception
families. Because provider bundles contain source owned by this repository and do not vendor
`node_modules`, R5C1 does not claim final artifact notice completeness; R5C2 must re-evaluate the
exact archive contents.

## S1 — Manifest-wide text-secret gate

Scan only manifest-included regular text files, but require every included non-binary path to decode
as strict UTF-8 with no NUL byte. Apply ten named detector families in stable order:

1. AWS access-key identifiers;
2. GitHub classic and fine-grained tokens;
3. Slack tokens;
4. Google API keys;
5. npm access tokens;
6. JWT-shaped bearer values;
7. PEM private-key boundaries;
8. credential-bearing database or network URIs;
9. live Stripe secret keys;
10. signed-cloud credential/query fields and high-confidence secret assignments.

Findings include only path, line, detector ID, and a redacted fingerprint; never echo a candidate
secret. The detector reads bounded files and caps findings per file and globally. It rejects a
malformed manifest, missing/untracked path, content-kind mismatch, invalid UTF-8, NUL, unreadable
file, oversize text input, or scan truncation. There is no path-wide or detector-wide allowlist.
Any unavoidable example requires a narrow exact path + detector + SHA-256 fingerprint review row.

Attack fixtures construct credential-shaped values from non-secret fragments in memory so the test
source never contains a contiguous credential. Positive controls must prove every detector fires;
negative fixtures cover placeholders, hashes, public IDs, documentation labels, and split markers.
The current-tree assertion requires zero findings over all manifest text files.

## D1 — Release-note reconciliation

Update `docs/releasing/UNRELEASED.md` to distinguish completed R4/R5A/R5B controls from active R5C1,
deferred R5C2/R5D work, and later release authorization. Remove stale claims that nightly CI or
internal-marker remediation is still absent. Record link/license/secret gates only after their
current-tree tests pass. Keep SBOM, final archive scanner, clean-clone, release candidate, tag,
publication, and visibility explicitly incomplete.

Document the new focused commands and their ownership without duplicating the policy JSON. Public
documentation may describe the four dependency roots and aggregate license counts but must not
claim legal approval; legal review remains an operator responsibility.

## Test and attack matrix

1. Plan contract: exact scope lock, base, counts, versions, architecture thresholds, deferred scope,
   and parent-roadmap ownership.
2. Expected RED before implementation: 13 unresolved links, missing license catalog/policy, missing
   source-readiness module, missing secret contract, stale package metadata, and stale release notes.
3. Link canonical tests: inline/image/reference links, query/fragment handling, percent decoding,
   GitHub heading slugs, duplicate headings, explicit IDs, code exclusion, and ordinal output.
4. Link attacks: traversal/root escape, drive/UNC/absolute target, malformed encoding, NUL, case-only
   drift, missing/excluded/untracked target, stale/ambiguous anchor, duplicate reference, symlink or
   non-regular target, and manifest/path-set drift.
5. License canonical tests: four lock roots, 749 occurrences, 616 unique rows, exact resolved counts,
   six unconditional license expressions, five reviewed exceptions, four MIT provenance overrides,
   and normalized private package metadata.
6. License attacks: missing/corrupt lock, non-registry dependency, missing integrity/version/license,
   catalog extra/missing/duplicate/conflict, wildcard exception, version drift, denied/copyleft or
   unknown expression, unreviewed special license, and package-root metadata drift.
7. Secret canonical/attack tests: all ten reconstructed positive controls, representative negatives,
   redaction, per-file/global bounds, invalid UTF-8, NUL, oversize/truncation, missing path,
   content-kind mismatch, and zero-hit current source.
8. Documentation tests: exact completion/defer statements and absence of the superseded nightly and
   marker gaps.
9. Integration: package route registration, predecessor R4A–R5B/R5A gates, public manifest and Node
   Git-index authority, current source-readiness assertion, and no network/provider/database action.
10. Strict TypeScript 5.9.3 compile over every changed TypeScript file using `strict`, `noEmit`, and
    `skipLibCheck=false`.
11. Complete `test:kit` with native exit, duration, stdout/stderr byte and SHA-256 receipts, exact
    staged tree/path manifest, diff check, and zero residue before each source/evidence commit.

## Evidence contract

Durable evidence belongs at
`docs/evidence/post-17-public-release-r5c1-source-readiness-2026-08-18.md` and binds:

- exact base, source commit, evidence commit, parent, Git trees, and path-manifest digests;
- plan RED/GREEN, implementation RED, focused canonical/attack/current-tree totals, strict compiler,
  predecessor/public gates, and complete-kit receipts;
- exact Markdown file/link/control/finding counts before and after the 13 repairs;
- four lockfile digests, occurrence/unique counts, catalog digest, resolved license distribution,
  exact special-license reviews, four provenance overrides, and package-root metadata result;
- text file count, ten detector families, positive/negative attack totals, bounded/redacted reporting,
  and zero current-tree findings;
- exact release-note statements, versions, retained branch/PR/head/base, Linux/Windows/aggregate CI,
  artifacts, rollback boundary, and explicit nonclaims.

## Rollback and stop conditions

- Stop if the manifest, Git index, link target set, or four lockfile authorities disagree.
- Stop if any package cannot be assigned an exact reviewed license, a dependency is not registry and
  integrity bound, a special license appears outside its exact exception, or package metadata would
  alter dependency resolution.
- Stop if a link repair requires restoring private content, weakening case/anchor checks, or adding
  a blanket ignore.
- Stop if a secret detector must expose candidate bytes, skip a manifest path, use a broad allowlist,
  or exceed its bound without failing.
- Stop if `UNRELEASED` would claim R5C2/R5D or actual release completion.
- Roll back with one feature-branch revert or the verified 2026-08-18 backup. Never use sync or edit
  a target `.Codex/` tree as a rollback path.

## Deferred beyond R5C1

R5C2 owns deterministic SPDX 2.3 and CycloneDX 1.6 sidecars, strict ZIP central-directory parsing,
archive traversal/collision/reparse/CRC/bounds checks, final-artifact secret/license/manifest scans,
and deterministic double-build inputs. R5D owns clean-clone Windows/Linux installs, isolated
double-build qualification, extracted runtime smokes, and quickstart proof. Sanitized public
repository creation, release-candidate/version decisions, dashboard release routing, tags, GitHub
Release, npm/marketplace/plugin publication, provenance signing, repository visibility, sync, and
target installation remain later separately gated work.
