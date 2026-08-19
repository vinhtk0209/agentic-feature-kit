# Unreleased Candidate Notes

**Status:** Not a release announcement

## Candidate snapshot

The repository remains private. The root npm package remains `private: true`.
v3.25 has no numeric Git tag and no GitHub Release. The current source tree contains substantial
work after the v3.25 source milestone, but source presence and passing tests do not authorize
publication.

These notes describe the current candidate for evaluators and maintainers. They do not select a
release number, promise availability, or replace immutable evidence attached to each implementation
slice.

This candidate does not authorize publication.

## Version authorities

| Domain | Current authority | Scope |
|---|---|---|
| Root package | `3.25.0` | Flagship prompt and repository toolchain |
| Provider bundle | `0.5.0` | Deterministic provider archives and manifests |
| Shared core | `1.3.0` | Provider-neutral capability contract |

These authorities are independent. A change to one domain does not imply a bump, compatibility
claim, or qualification result for another.

## Changes after v3.25

- Added provider-neutral shared capabilities and deterministic distributions for Codex, Claude
  Code, and GitHub Copilot while preserving the legacy Claude Code flagship.
- Added typed provider routing, multi-agent orchestration, evidence transport, control-plane state,
  privacy policy, tenant attestation, and compatibility writer boundaries.
- Added Linux and Windows qualification artifacts plus a fail-closed aggregate pull request gate.
- Added an explicit public-entry surface, package metadata, provider selection, clean-clone
  quickstart, limitations, and architecture links.
- Added contribution, security, support, conduct, issue, and pull request governance owners.
- Added a Git-index-bound release manifest and a digest-bound, no-plaintext marker disposition
  registry. The candidate remains intentionally blocked rather than silently omitting known gaps.
- Internal-marker and private-binary remediation are complete for the current source candidate;
  private canonical history remains private and excluded material was not recreated.
- Nightly and manual qualification use the same read-only Linux/Windows matrix, immutable action
  pins, bounded artifacts, and a fail-closed aggregate gate.
- Manifest-wide internal Markdown links: 48/48 valid after replacing 13 references to removed
  private or historical files with retained public authority or non-link historical prose.
- Dependency license catalog: 617 unique packages and 754 occurrences across four lockfiles, with six unconditional
  permissive expressions, five exact reviewed exceptions, and four exact metadata overrides.
- Manifest text secret scan: ten detector families, zero findings, strict UTF-8/NUL handling, bounded
  output, and digest-only redaction.
- Deterministic SPDX 2.3 and CycloneDX 1.6 SBOM sidecars now cover the exact source and provider candidates,
  validate offline against pinned official schemas, and bind the 617-package source
  catalog or exact embedded `typescript@4.9.5` provider runtime as appropriate.
- Strict final archive admission now validates all three ZIP archives from their central directories,
  proves 71 archived entries against local headers, CRC-32, bundle manifests, expanded directories,
  licenses, notices, SBOMs, checksums, bounds, and the ten-family secret policy, then promotes only
  one complete fail-clean candidate.

## Evidence boundaries

- A merged source change proves only that the reviewed source reached the default branch.
- A local test receipt proves only the exact commit, environment, inputs, and command it records.
- Remote CI proves only the exact pull request head and jobs named by its immutable run receipt.
- A version string, changelog heading, branch, tag, or archive name is not publication evidence.
- Detailed source and verification receipts remain under `docs/evidence/`; this note summarizes them
  without converting them into release claims.

## Remaining release gates

- Complete clean-clone qualification for supported operating systems and provider packages, including
  isolated double builds, extracted runtime smokes, and quickstart proof.
- Bind checksums, final SBOMs, and provenance/attestation boundaries to an exact release candidate.
- Select and validate a public version only after compatibility and migration policy are approved.
- Separately authorize any tag, GitHub Release, package/plugin publication, or visibility change.

## Compatibility and upgrade notes

No version bump is selected by this note. Existing source consumers should continue to use the
version authorities declared in their owning manifests. Provider bundles expose the shared-core
contract documented by their package READMEs; they do not imply complete parity with the legacy
flagship. No database, sync, target-repository, or hosted-service migration is part of this note.

## Non-claims

This candidate is not declared public-release ready, generally available, provider-endorsed, or
covered by a service-level agreement. It does not claim that deferred release gates passed, that a
package is installable from a public registry, or that historical untagged milestones were releases.

See the [changelog](../../CHANGELOG.md) for source history and the
[public-release readiness plan](../roadmap/p17-018-public-release-plan.md) for the complete release
boundary.
