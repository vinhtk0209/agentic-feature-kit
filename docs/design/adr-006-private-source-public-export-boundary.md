# ADR-006: Keep private canonical history and publish historyless exports

**Status:** Accepted — R4D implementation in progress
**Date:** 2026-08-18
**Deciders:** Workflow-kit operator and maintainers
**Roadmap task:** P17-018 R4D

## Context

The current release contract scans every tracked file, including paths excluded from a candidate
archive. This is deliberate: manifest exclusion alone does not protect public Git history. Four
historical evidence files and the operational sync configuration still carry six private-boundary
occurrences. They are excluded from the candidate tree, but remain visible to a repository clone
and therefore remain unresolved release blockers.

The evidence must stay recoverable for internal audit and rollback. At the same time, operational
sync targets must remain usable without placing workspace identities in a tracked public default.
The current canonical repository and its historical commits already contain the private material,
so changing repository visibility would expose more than the release manifest permits.

## Decision

Adopt the private-canonical/historyless-export boundary:

1. The canonical repository remains private. It is the internal audit and development source of
   truth and is never made public as a shortcut to distribution.
2. Before a private current-tree artifact is removed or replaced, copy its exact bytes into a
   separately governed private archive outside the repository and verify a detailed private
   manifest plus one archive digest.
3. Canonical commits remain immutable. R4D removes private files only from the current tracked tree;
   the archive and private repository history preserve recovery without force-push or history
   surgery.
4. Keep a neutral tracked sync configuration for examples and fresh-clone validation. Prefer a
   fixed-name ignored local override for real operational targets. No environment-selected or
   arbitrary config path is introduced.
5. A later public source surface must be a deterministic historyless export of one eligible tree.
   It starts with no parent history and includes only manifest-approved bytes. Publication,
   repository creation, visibility, signing, and release remain separately authorized actions.
6. Commit a metadata-only public archive receipt. Exact source paths and per-file hashes remain in
   the private archive manifest; the public receipt exposes only bounded counts, source authority,
   format, byte total, archive digest, and closed status.

The operator accepted T1/A1/H1/S1/X1/E1 under the direct all-actions/no-repeat approval on
2026-08-18. This accepts the architecture and local implementation scope only; it does not
authorize sync, publication, a visibility change, or destructive remote-history work.

## Options considered

### Option A: Keep manifest exclusions only

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Evidence fidelity | High |
| Public repository safety | Unacceptable |
| Operational compatibility | High |

**Pros:** no source movement and no sync change.

**Cons:** excluded bytes remain cloneable; release blockers remain; a future visibility change
would expose the full historical content.

### Option B: Use in-place redaction for every private artifact

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Evidence fidelity | Low |
| Public repository safety | Incomplete without history isolation |
| Operational compatibility | Medium |

**Pros:** the current tree becomes easier to publish.

**Cons:** destroys exact evidence fidelity, can miss contextual private data, and still leaves the
old bytes in Git history.

### Option C: Private canonical repository plus deterministic historyless export — selected

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Evidence fidelity | High |
| Public repository safety | High when export gates pass |
| Operational compatibility | High with the local sync override |

**Pros:** preserves internal evidence, keeps current history private, creates a testable public
boundary, and avoids coupling release eligibility to destructive Git operations.

**Cons:** requires separate archive governance, a local sync override, and a later deterministic
export builder/clean-clone proof.

### Option D: Same-repository history rewrite

| Dimension | Assessment |
|---|---|
| Complexity | High |
| Evidence fidelity | Risky |
| Public repository safety | Potentially high but hard to prove |
| Operational compatibility | High disruption |

**Pros:** can remove historical bytes from one repository namespace.

**Cons:** rewrites commit identities, invalidates existing tags/PR evidence and rollback anchors,
requires force-push coordination, and creates unnecessary recovery risk.

## Trade-off analysis

The selected option adds an export boundary and private archive, but it is the only option that
preserves exact evidence while keeping public Git history clean without force-pushing the canonical
repository. The operational cost is bounded: one ignored fixed-name config and one later export
builder. The security benefit is structural rather than convention-based; a public artifact cannot
accidentally inherit canonical parents.

The archive digest proves byte preservation, not anonymity or publication safety. The private
manifest remains access-controlled because per-file hashes of low-entropy content can themselves
be sensitive equality signals.

## Consequences

- The canonical remote must stay private even after the public release contract becomes eligible.
- Public repository creation or visibility changes require a new destination-specific approval and
  must consume a historyless export, never the canonical remote.
- Four historical evidence paths leave current HEAD only after private archive verification.
- The tracked sync config becomes safe for a fresh clone; real targets live only in the ignored
  local override.
- The public-release manifest can reach zero excluded paths, but remaining genericization blockers
  continue to block release eligibility.
- Existing immutable PR, CI, tag, and evidence references remain valid because no history is
  rewritten.

## Action items

1. [ ] Create and verify the exact out-of-repository archive and detailed private manifest.
2. [ ] Add the metadata-only public archive receipt and adversarial archive contract.
3. [ ] Remove the four archived evidence files from current HEAD and update registry/manifest
       authority together.
4. [ ] Add the fixed-name local sync override loader, ignored operational file, neutral tracked
       defaults, and unit/integration gates.
5. [ ] Qualify source/evidence commits locally and through exact-head Linux/Windows/aggregate CI.
6. [ ] Implement the deterministic historyless export builder only in a later release slice; no
       export or publication occurs in R4D.
