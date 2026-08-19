# P17-018 Public-Release Readiness Evidence

**Task:** P17-018
**Closeout slice:** R6 final readiness reconciliation
**Starting merge:** `c8e81bbe5ed5f21a166bae14a7849fe8dd57be3e`
**Date:** 2026-08-19
**Candidate status:** locally qualified; exact-head PR qualification pending

## Outcome

The Agentic Feature Kit public-release source is structurally complete but remains private. R1–R5D
established provider-neutral identity, governance, privacy, source admission, deterministic SBOM and
archives, clean-clone runtime qualification, and visible documentation proof. R6 reconciles those
authorities into the canonical P17-018 evidence path and dashboard state.

This document does not authorize or claim publication. Root package metadata remains private, no
repository visibility changed, and no tag, GitHub Release, package upload, marketplace submission,
signature, attestation, sync, provider-product call, target edit, or database mutation occurred.

## Evidence chain

All predecessor evidence is tracked and manifest-admitted:

1. `docs/evidence/post-17-public-release-r1-manifest-classification-2026-08-17.md`
2. `docs/evidence/post-17-public-release-r2-public-entry-2026-08-17.md`
3. `docs/evidence/post-17-public-release-r3a-governance-surface-2026-08-17.md`
4. `docs/evidence/post-17-public-release-r3b-release-history-2026-08-17.md`
5. `docs/evidence/post-17-public-release-r4a-legacy-backend-config-2026-08-18.md`
6. `docs/evidence/post-17-public-release-r4b-synthetic-fixtures-2026-08-18.md`
7. `docs/evidence/post-17-public-release-r4c-prompt-history-aliases-2026-08-18.md`
8. `docs/evidence/post-17-public-release-r4d-private-archive-boundary-2026-08-18.md`
9. `docs/evidence/post-17-public-release-r4e-operational-aliases-2026-08-18.md`
10. `docs/evidence/post-17-public-release-r4f-historical-identity-aliases-2026-08-18.md`
11. `docs/evidence/post-17-public-release-r5a-nightly-ci-safety-2026-08-18.md`
12. `docs/evidence/post-17-public-release-r5b-binary-privacy-2026-08-18.md`
13. `docs/evidence/post-17-public-release-r5c1-source-readiness-2026-08-19.md`
14. `docs/evidence/post-17-public-release-r5c2a-deterministic-sbom-2026-08-19.md`
15. `docs/evidence/post-17-public-release-r5c2b-strict-archive-gate-2026-08-19.md`
16. `docs/evidence/post-17-public-release-r5d-clean-clone-qualification-2026-08-19.md`

## Qualification receipts

R5D is the immutable remote and visible-documentation predecessor:

- merged main: `c8e81bbe5ed5f21a166bae14a7849fe8dd57be3e`;
- evidence head: `1185b9dd683a5307a2d6fd54d876bc582b538422`;
- qualified tree: `c8446375d63d923eaec8bff417c2c5a9a5d462fe`;
- Workflow Kit CI run `32257876893`;
- Linux job `96083785935`, Windows job `96083786167`, aggregate job `96086552834`;
- Linux/Windows common output set
  `d0912bd947a0acaa734627c4da704534b0d5b4aabf644dd0a0b49e39691c73af`;
- admission identity: three ZIPs, 71 entries, eight SBOM sidecars, 11 checksums, 79 text scans,
  15 extracted runtime smokes, and ten source detector families;
- browser receipts: three operator-supplied in-app GitHub renders with SHA-256
  `927843ebcd371a97bbf35abfc79cc03baf6388ec0523d6eeab43b144830772b6`,
  `8dfc52fae05fcda3fa3534d57eb18088efdd66553245ed834fcb7dde8a129f81`, and
  `baf5cb0f8027cd550e1a13be3870429b3b6928907f5ee4baccc8055afef946be`.

R6 candidate qualification is intentionally incomplete in this draft:

- Focused R6 plan and readiness contract: PASS
- Canonical roadmap and parent release plan: PASS
- Public release/source/provider/SBOM/archive/clean-clone/nightly gates: PASS
- Full native kit: PASS

Recorded affected-gate receipts:

- R6 plan: `C1/I1/S1/D1/E1/B1`; parent public-release plan: 18 sections; canonical roadmap:
  22 tasks/four initiatives, all GREEN.
- Public source: 659 manifest paths, 197 Markdown files, 48/48 relative links, four lockfiles,
  754 dependency occurrences, 617 unique dependencies, 656 text files, ten detector families,
  and zero issues/secret findings.
- Release contract: 18 pure and seven Node assertions; governance five; legacy backend seven;
  synthetic fixtures 11 attacks; prompt history 12; private archive 11; binary review 21;
  operational aliases ten; historical aliases 14.
- SBOM: two canonical pairs/22 mutations and two deterministic sidecars/four schemas; archive:
  three ZIPs/71 entries/eight sidecars/11 checksums/79 scans; clean clone: two canonical receipts,
  42 receipt attacks, nine matrix attacks, and the Node orchestration/CLI/config attack set.
- Provider distribution: three strict deterministic archives/15 runtime smokes/four attacks;
  nightly: canonical plus 17 attacks; version stamps all `v3.25`; npm audit: zero vulnerabilities.
- Hook portability: the kit pre-commit hook invokes the installed tsx module through direct Node and
  has no dependency on the POSIX `.bin/tsx` shim or `sed`/`dirname`/`uname` availability.

The `PASS` form of each line is required by the executable readiness contract. The final exact staged
manifest is qualified as one tree; any later byte change invalidates these receipts and requires a
fresh focused/full run.

## Dashboard reconciliation

- Dashboard roadmap/full/TypeScript: PASS
- Canonical dashboard evidence target:
  `docs/evidence/post-17-public-release-readiness-dashboard-2026-08-19.md`.
- Dashboard commit: `ae7c45f400344e8a5082efdeac8e79973c2ea704`; parent `1c5442a56e127ad5b35a684d47f9c40b787ee9ed`;
  tree `28df4ae2fdd3cd54b7996dbde26727a50e05b29d`.
- Focused reconciliation: four files/12 tests; TypeScript exit `0`; full dashboard: 86 files/558
  tests in 10.17 seconds; diff and bounded secret checks passed.
- The dashboard remains a fail-closed reader of the canonical kit catalog. No status row, Supabase
  table, or UI-only completion flag is introduced.

## Compatibility and publication boundary

- `package.json remains private: true`.
- Compatibility identities remain `3.25.0`, `v3.25`, provider bundle `0.5.0`, and core `1.3.0`.
- Provider IDs remain `codex`, `claude`, and `copilot`; archive names remain
  `agentic-feature-kit-<provider>-<bundleVersion>.zip`.
- The current private repository history remains outside any future sanitized public export.

No public artifact is required or authorized to prove readiness.

## Rollback and non-claims

Rollback restores P17-018 to ready together with the pre-R6 manifest and evidence tree. The verified
2026-08-19 kit backup is `_backups/claude-workflow-kit/2026-08-19/claude-workflow-kit-2026-08-19.zip`
(2,646,278 bytes; SHA-256
`4add6adc633cfc03c0c21e5ca1b7070ef95e13a3b70941ede66871ae3c445d11`), and tag
`backup/2026-08-19` resolves to `fdade1bedf9ce4798d24ccc24537637d316bfd07`.

P17-018 `done` will mean public-release readiness was proven at merge time. It will not mean the
repository became public or that a tag, release, package, plugin, bundle, marketplace listing,
signature, attestation, sync, or deployment exists.
