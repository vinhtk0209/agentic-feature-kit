# P17-018 Public Release Input Readiness Evidence — 2026-08-14

## Outcome

P17-018's audience/license input is complete and fail-closed. The locked `A1/L1` policy targets
external software-delivery engineers, evaluators, maintainers, contributors, and security
researchers, and retains Apache-2.0 for repository source and provider bundles.

P17-018 remains `backlog`: dependency P17-009 has not produced accepted remote Windows/Linux CI
evidence, and no P17-018 implementation or final release-readiness evidence exists. This checkpoint
does not add governance files, nightly CI, public metadata, release manifests, publishing, or any
external action.

## Authority and reconciliation

- The durable operator objective requires the developing kit to be usable by public users with
  mature naming and documentation.
- Root `LICENSE` is Apache License 2.0.
- `docs/roadmap/post-17-provider-packaging.json` already declares Apache-2.0 public-ready source
  artifacts while reserving publication and visibility changes for separate authorization.
- Codex and Claude manifests plus provider documentation use product slug `agentic-feature-kit`,
  versioned provider bundles, and Apache-2.0.

The plan records current release gaps instead of masking them:

- root identity/description remains Claude-first while provider packages are multi-provider;
- root package metadata is `private: true` and lacks license/repository/homepage/bugs/keywords;
- `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, Code of Conduct, issue forms, and PR template are
  absent;
- changelog and ordinary release tags stop at 3.18 while current kit authority is 3.25;
- CI has Linux/Windows PR/push qualification but no schedule/nightly/manual-nightly contract;
- a bounded internal-marker scan found eight tracked files containing workspace target/customer
  identifiers, one evidence file with a local user temp path, and four files with a project-specific
  Supabase reference/URL. These are not secrets by themselves, but they require classification,
  genericization, exclusion, or explicit review before public source release.

The implementation plan also locks stable product/provider/archive naming, independent kit/bundle/
core versions, clean-clone and deterministic double-build evidence, documentation ownership,
security reporting, no-SLA support, action pinning, SBOM/license/provenance checks, internal-marker
and secret gates, compatibility/deprecation rules, and negative release cases.

## Canonical state

- Total tasks: 22.
- Done: 11.
- In progress: P17-009 and P17-015.
- Ready status: 0.
- Input-complete: 14/22.
- P17-018: `backlog`, `readiness.complete=true`, `missing=[]`.
- P17-016: still `backlog`, `readiness.complete=false`; its proposed privacy policy is unaffected.

## Verification

1. `npm run test:post-17-public-release-plan`
   - PASS — 18 sections, `A1/L1` locked, P17-018 input-complete and dependency-blocked.
2. `npm run test:post-17-roadmap`
   - PASS — 22 tasks, four initiatives.
3. `npm run test:post-17-privacy-decision`
   - PASS — P17-016 remains explicitly input-blocked.
4. Pre-evidence kit/dashboard `git diff --check`
   - PASS.
5. Exact changed-file secret scan
   - PASS — seven files, one positive control, zero hits before evidence files were added.
6. `npm run test:kit`
   - PASS — exit `0` in 223.1 seconds with the new P17-018 plan gate registered in the full chain.
7. Dashboard focused roadmap reconciliation
   - PASS — three files, nine tests.
8. Dashboard `npx tsc --noEmit`
   - PASS — exit `0`.
9. Dashboard full `npx vitest run`
   - PASS — 64 files, 452 tests in 7.11 seconds.

Final diff and exact changed-file secret scans are required after both evidence files are written
and before separate local kit/dashboard commits.

## Authenticity and limitations

- No in-app browser run was needed because production UI/rendering code did not change; the same
  tested dashboard summary derives directly from the canonical catalog.
- No clean-clone, nightly, remote GitHub Actions, release, tag, provenance, or public visibility
  claim is made. Those are implementation/evidence tiers after P17-009.
- No target `.Codex` directory was touched.
- No sync, push, provider execution, database write, publication, or visibility change occurred.
