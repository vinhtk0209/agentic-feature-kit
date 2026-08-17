# P17-018 R1 — Public Release Manifest and Internal Marker Classification Plan

**Status:** Plan-first implementation contract; production source has not started
**Date:** 2026-08-17
**Task:** P17-018, implementation step 2 only
**Decision lock:** `slice=R1, manifest=M1, classification=C1, naming=N1, privacy=P1, boundary=B1, evidence=E1`

## Reconciled starting state

P17-018 is dependency-unblocked and canonically `ready`, but public-release readiness is not proven.
The accepted parent plan requires a release-manifest contract and an internal/private-marker
classification before product metadata, governance, nightly CI, clean-clone qualification, or any
release action. R1 implements only that first production control.

The source checkpoint is `38d7d7d2adcc811ffa049a5baf38b1cd31eaa1f7`. At reconciliation time:

- the Git index contains 566 tracked paths and no mode-`120000` symlink entry;
- tracked files total 25,689,728 bytes and the largest file is 2,754,146 bytes, so a bounded Node
  scanner is sufficient;
- no public-release manifest or marker-classification registry exists;
- the package is still private and no npm, marketplace, tag, GitHub Release, or visibility action
  is authorized;
- provider bundle IDs remain `codex`, `claude`, and `copilot`;
- today's verified source backup and tag remain the rollback boundary.

The reconciled marker inventory uses opaque IDs below. Raw marker values are intentionally omitted
from this plan. Counts are fixed-string, case-sensitive occurrences in tracked text at the source
checkpoint, not an assertion that the tree contains no other confidential data.

| Marker ID | Occurrences | Paths | Initial disposition family |
|---|---:|---:|---|
| `workspace-target-learning` | 29 | 8 | genericize or move historical evidence to a private archive |
| `workspace-target-authoring` | 10 | 8 | genericize or move historical evidence to a private archive |
| `internal-hostname` | 21 | 4 | replace test/baseline values with a synthetic fixture |
| `live-supabase-project-ref` | 11 | 10 | genericize source defaults; replace fixtures; move or sanitize evidence |
| `local-user-path` | 1 | 1 | genericize the evidence path |
| `internal-company-token` | 0 | 0 | preserve a zero-occurrence regression guard |

The zero count was checked through a known-hit positive control and an independent tracked-file
search. A zero-hit result alone is not accepted as evidence. R1 records exact path/count bindings in
the registry; it does not copy the raw marker values into another public file.

## Functional and non-functional requirements

### Functional requirements

1. Define one exact, versioned manifest for the candidate public source tree.
2. Give every tracked path exactly one `include` or `exclude` decision. A new, missing, duplicated,
   or differently cased path is a contract change, not an implicit inclusion.
3. Define one exact, versioned marker registry with opaque marker IDs, detector metadata,
   SHA-256 fingerprints, path/count bindings, dispositions, and rationales.
4. Scan all tracked text, including excluded candidate files, so an archive exclusion cannot be
   mistaken for repository-visibility safety.
5. Produce structured deterministic diagnostics without printing raw matched values or file
   contents.
6. Distinguish contract validity from release readiness. R1 may prove complete classification while
   still returning a blocked candidate because remediation and later P17-018 gates are incomplete.
7. Preserve the canonical product/provider/version boundaries and the root publication guard.

### Non-functional requirements

- Deterministic: identical manifests, registry, Git-index snapshot, and bytes produce byte-identical
  sorted results on Windows and Linux.
- Bounded: reject more than 10,000 paths, a text file over 4 MiB, a binary file over 8 MiB, or a
  candidate tree over 256 MiB before unbounded allocation.
- Portable: repository paths use UTF-8 repository-relative POSIX form, independent of host
  separators, current user, locale, or checkout root.
- Fail-closed: parser errors, unknown fields, unsupported versions, unreadable files, ambiguous path
  identity, missing detector coverage, and adapter failures are blocking results.
- Side-effect free: validation performs only Git-index discovery and local reads. It has no network,
  credential, database, provider, sync, publish, or release side effect.
- Privacy preserving: diagnostics contain marker IDs, normalized repository paths, counts, and
  reason codes; they never echo the raw match.
- Maintainable: pure policy has no `fs`, process, Git, environment, or clock access. Node-specific
  discovery and byte loading stay behind explicit ports.

TypeScript and Node remain sufficient for R1. The reconciled tree is about 25.7 MB/566 files, the
work is bounded hashing and schema validation, and no measured latency or capability gap justifies
Rust, Go, Python, FFI, a sidecar, or another distribution/supply-chain surface. Revisit a native
scanner only after repeatable profiling on at least 10,000 paths or 1 GiB shows that the Node adapter
cannot meet an agreed CI budget.

## Locked R1 decisions

### M1 — One committed public-release manifest

`release/public-release-manifest.json` is the sole R1 tree authority. It binds schema version,
product identity, package visibility, license, provider IDs, source kind, limits, every tracked path,
required public roots, the marker registry digest, and the no-publication boundary. A generated
draft may assist review, but production validation never silently rewrites or accepts the manifest.

### C1 — Exhaustive marker disposition registry

`release/internal-marker-classification.json` owns marker fingerprints and exact occurrence
bindings. Every detected occurrence has exactly one disposition: **genericize,
move-to-private-archive, replace-with-synthetic-fixture, or reviewed-retained**. Missing,
duplicated, stale, or ambiguous bindings fail. The registry is exhaustive for its declared detector
set, not a substitute for later secret, dependency, license, binary, or human privacy review.
Unclassified additions fail closed whenever they are emitted by that declared detector set.

### N1 — Canonical public naming remains centralized

The manifest repeats only locked public identity anchors: display name **Agentic Feature Kit**,
slug `agentic-feature-kit`, Apache-2.0, and providers **codex, claude, and copilot**. It does not
rename the legacy internal npm package, shared capabilities, provider bundle roots, or version
authorities. Drift from the accepted parent plan fails validation.

### P1 — Classification precedes remediation

R1 inventories and classifies; it does not scrub history ad hoc. Marker values are never stored in
plaintext in the registry. Each value is represented by a domain-separated SHA-256 fingerprint and
matched through a declared detector grammar. A fingerprint is an identity check, not encryption;
low-entropy values may remain guessable, so the repository stays private until remediation and the
whole-tree privacy gate pass.

### B1 — The candidate tree is an explicit fail-closed allowlist

The tracked Git tree is the only candidate source universe. Every path appears once in the manifest
with an `include` or `exclude` decision. Unknown paths fail closed. Deny decisions never become
implicit deletes: excluded tracked files remain visible to the repository-level privacy assessment.
Path matching uses normalized repository-relative POSIX paths. Absolute paths, dot segments,
backslashes, NULs, empty segments, Unicode-normalization aliases, and case-colliding paths fail
closed before file reads. Symlink and reparse-point entries fail closed.

### E1 — Evidence and release authorization remain separate

R1 evidence proves the plan, contracts, attack fixtures, exact current classification, regression
suite, and immutable commit. Classification success does not imply release readiness. Source and
evidence commits remain separate, and a feature PR may be proposed only after local gates pass.
Push, PR creation, merge, tag, release, publication, visibility, sync, installation, or external
execution remains a separate action under its applicable authorization boundary.

## Exact data contracts

### Public release manifest

The JSON object has exact keys; unknown or missing keys fail:

```text
schemaVersion: "1.0.0"
artifactId: "agentic-feature-kit-public-release"
product:
  displayName: "Agentic Feature Kit"
  slug: "agentic-feature-kit"
  license: "Apache-2.0"
  packageVisibility: "private"
  providers: ["codex", "claude", "copilot"]
candidateSource:
  kind: "git-index"
  unknownPathPolicy: "deny"
  pathNormalization: "repo-relative-posix-nfc"
limits:
  maxPaths: 10000
  maxTextFileBytes: 4194304
  maxBinaryFileBytes: 8388608
  maxCandidateBytes: 268435456
markerRegistry:
  path: "release/internal-marker-classification.json"
  sha256: <64 lowercase hexadecimal characters>
requiredPaths: <sorted unique repository-relative paths>
entries:
  - path: <normalized exact tracked path>
    decision: "include" | "exclude"
    contentKind: "text" | "binary"
    reasonCode: <closed kebab-case reason>
    sha256: <required for binary include; absent otherwise>
publicationBoundary:
  packagePrivate: true
  externalWrites: "forbidden"
```

The entry list is sorted by Unicode code point after NFC normalization. The adapter compares it to
the complete NUL-delimited Git-index list. Required paths must be included exactly once. The
manifest and registry must include themselves. Binary includes require an immutable content digest;
text is decoded with a fatal UTF-8 decoder. An excluded file is still counted and marker-scanned when
textual so its repository visibility cannot disappear from diagnostics.

### Internal marker classification registry

The registry also rejects unknown or missing keys:

```text
schemaVersion: "1.0.0"
artifactId: "agentic-feature-kit-internal-marker-classification"
fingerprint:
  algorithm: "sha256"
  domain: "agentic-feature-kit/public-marker/v1"
detectors:
  - id: <stable kebab-case ID>
    kind: "token" | "hostname" | "supabase-project-ref" | "windows-user-path"
markers:
  - id: <stable opaque ID>
    detectorId: <declared detector ID>
    fingerprintSha256: <domain-separated fingerprint>
    expectedTotal: <non-negative safe integer>
    occurrences:
      - path: <normalized tracked text path>
        expectedCount: <positive safe integer>
        disposition: "genericize" | "move-to-private-archive" |
                     "replace-with-synthetic-fixture" | "reviewed-retained"
        reasonCode: <closed kebab-case reason>
        publicSafeRationale: <required non-empty text only for reviewed-retained>
```

Detector grammars extract bounded lexical candidates, normalize only as declared, apply the domain
separator, and hash candidates before lookup. Raw candidates are discarded immediately. Generic
grammars such as a Windows user path or project-specific service reference also report an unknown
candidate fingerprint as `unclassified-marker`; diagnostics still do not echo it. Token-fingerprint
guards detect known low-entropy identifiers but do not claim to discover an arbitrary unknown
internal name.

For every marker, the sum of occurrence bindings equals `expectedTotal`. A path binding must point
to tracked text, and its observed count must equal `expectedCount`; changed occurrence counts fail
closed. A detector cannot map one fingerprint to two marker IDs. An occurrence cannot receive two
dispositions. `reviewed-retained` requires an explicit public-safe rationale; other dispositions
must not use that field.

### Evaluation result

Pure evaluation returns a sorted structure and never throws raw source content across the port:

```text
contractValid: boolean
candidateStatus: "blocked" | "eligible-for-later-gates"
includedPaths: number
excludedPaths: number
classifiedOccurrences: number
blockers: [{ code, path?, markerId?, count? }]
```

Contract errors always set `contractValid=false`. Unresolved `genericize`,
`move-to-private-archive`, and `replace-with-synthetic-fixture` dispositions keep the candidate
blocked even when classification is exhaustive. `reviewed-retained` is eligible only with its
rationale and does not waive later secret, license, governance, clean-clone, or remote CI gates.

## Clean Architecture and ownership

```text
Git index + local bytes
        |
        v
public-release-contract-node.ts   (Node adapter; read-only Git/fs ports)
        |
        v
public-release-contract.ts        (pure parsing, path policy, hashing, classification)
        |
        +--> deterministic structured result
        +--> CLI formatter prints IDs/reason codes only
```

- `scripts/public-release-contract.ts` owns closed schemas, pure normalization, exact-key parsing,
  bounded detector grammars, hashing through an injected port, classification, and result sorting.
  It imports no filesystem, process, child-process, network, environment, or clock module.
- `scripts/public-release-contract-node.ts` owns `git ls-files --stage -z`, exact staged-blob reads
  through one bounded `git cat-file --batch`, `lstat` reparse checks, fatal UTF-8 decode, SHA-256,
  and CLI exit mapping. It never substitutes mutable worktree bytes for the Git-index candidate.
  Commands use argument arrays, never a shell-built command.
- JSON files own data, not executable policy. They cannot select a command, environment variable,
  network endpoint, or arbitrary path outside the Git index.
- Tests inject in-memory manifests, registries, candidate snapshots, hash ports, and controlled temp
  repositories. Production source never contains test-only bypasses.
- The Node adapter may depend on the pure domain. The pure domain cannot import the adapter.

## Marker inventory and disposition policy

The production registry must bind all current occurrences by exact normalized path and count. The
following rules decide disposition; they do not perform the later edit:

- Workspace target identifiers in current configuration/runtime examples are `genericize` unless
  the entire artifact is historical evidence explicitly assigned to `move-to-private-archive`.
- Internal hostnames in fixtures, tests, or captured baselines are
  `replace-with-synthetic-fixture`; no production default may retain them.
- Live service project references in runtime defaults are `genericize`; test expectations are
  `replace-with-synthetic-fixture`; historical evidence is either sanitized or
  `move-to-private-archive` after a separate evidence-preservation review.
- A local user path is `genericize` without deleting the evidence narrative.
- The zero-occurrence internal company token remains registered so reintroduction is detected.
- `reviewed-retained` is exceptional. It is allowed only when the literal is already intended public
  data, has a written public-safe rationale, and creates no customer, employee, host, project,
  credential, or private-repository disclosure.

If one marker occurrence needs a different disposition from another occurrence, the registry stores
separate path bindings under the same marker ID. R1 completion requires complete classification,
not a zero-marker tree. Later remediation must update source and registry together and must preserve
historical evidence through reviewed genericization or a separately governed private archive.

## Threat model and attack matrix

The focused suites must start with passing controls, then prove rejection of at least:

| Boundary | Required attack |
|---|---|
| Candidate paths | unknown tracked path; missing tracked path; duplicate manifest entry; allowlisted directory with a denied descendant |
| Canonical paths | path traversal; absolute path; backslash alias; empty/dot segment; case collision; Unicode normalization collision; NUL; Windows ADS; trailing dot/space; reserved device name |
| Filesystem type | Git symlink; Windows junction/reparse point; special file; unreadable file |
| Manifest schema | unsupported version; missing field; unknown manifest field; wrong product/provider/private/license anchor; unsorted entry |
| Registry schema | unsupported version; missing field; unknown field; duplicate ID; unknown detector; unknown disposition; plaintext marker value |
| Binding | unclassified marker; stale occurrence count; wrong path binding; fingerprint mismatch; duplicate disposition; total mismatch |
| Review exception | reviewed-retained without rationale; rationale on an unresolved disposition; whitespace-only rationale |
| Content | binary file declared text; text declared binary without digest; binary digest mismatch; oversized file; invalid UTF-8 |
| Detector safety | secret-like value is never echoed; source line is never echoed; domain separation mismatch; collision/ambiguous marker mapping |
| Adapter | Git failure; malformed NUL record; more than 10,000 records; dirty worktree differs from the staged blob; file disappears after index read; staged-blob read/hash error; stdout/stderr contains a raw synthetic marker |
| Side effects | no network/API/database/provider/sync/publish command is reachable from focused tests or CLI |

Positive fixtures prove one safe included text file, one digest-bound binary, one excluded but scanned
text file, all four dispositions, a zero-occurrence guard, and deterministic Windows/Linux ordering.
The secret-like value fixture is synthetic and must appear only in the in-memory attack input, never
in committed evidence output.

## Implementation and verification sequence

1. Commit the readiness validator registration and prove the missing-plan RED.
2. Add this plan only; run the unchanged readiness validator to GREEN before production source.
3. Implement the pure contract and its attack fixtures. Register
   `test:public-release-contract` in `test:kit`; require focused GREEN and strict TypeScript.
4. Implement the disposable Node adapter and adapter fixtures. Register
   `test:public-release-contract-node` in `test:kit`; prove Git/fs failures and no raw diagnostic
   leakage before reading the real tree.
5. Create both exact JSON contracts from the reconciled Git index. The current-tree evaluation must
   report exhaustive classification and an expected `blocked` candidate, not public readiness.
6. Run the parent P17-018 plan gate, provider packaging/distribution gates, package/version checks,
   TypeScript, focused suites, and authoritative full kit.
7. Audit exact diff, JSON, LF/whitespace, English feature content, raw marker absence from the new
   registry/plan/evidence, synthetic positive controls, backup integrity, and dashboard/target
   preservation.
8. Create one source commit. Re-run immutable-SHA focused/full proof. Then add one metadata-only R1
   evidence file and commit it separately.
9. Propose one stacked feature PR with exact base/head, tests, blockers, rollback, security boundary,
   and explicit non-claims. Creating or merging that PR remains an external representational action.

R1 does not change the P17-018 roadmap status to done. Later slices own provider-neutral root
metadata/README, governance/community docs, link/license/secret/SBOM/archive gates, nightly CI,
clean-clone qualification, deterministic release artifacts, authorized remote proof, and final
roadmap completion.

## R1 source manifest

Expected source-phase files:

- `docs/roadmap/p17-018-r1-release-manifest-plan.md`
- `scripts/post-17-public-release-r1-plan.test.ts`
- `release/public-release-manifest.json`
- `release/internal-marker-classification.json`
- `scripts/public-release-contract.ts`
- `scripts/public-release-contract-node.ts`
- `scripts/public-release-contract.test.ts`
- `scripts/public-release-contract-node.test.ts`
- `package.json`

Expected evidence-phase file:

- `docs/evidence/post-17-public-release-r1-manifest-classification-2026-08-17.md`

Any additional source path requires a plan update and a new readiness checkpoint before it is
edited or staged. Generated logs, npm caches, temp repositories, and archives stay ignored outside
the source manifest.

## Rollback

- Before a source commit, restore only the exact R1 paths from the verified 2026-08-17 backup or
  remove newly added R1 paths; preserve every unrelated worktree change.
- After a source commit, revert the R1 source commit as one unit. Do not partially keep a manifest
  without its digest-bound registry or adapter.
- A failed generation, scan, test, or bulk classification must restore the pre-R1 snapshot before
  retrying if it leaves partial output.
- Rollback does not delete or rewrite historical evidence, target repositories, provider bundles,
  tags, branches, releases, packages, or remote state.

## Non-claims

- P17-018 is not complete.
- Agentic Feature Kit is not yet public-ready and the repository is not public.
- The package is not published; the root package remains `private: true`.
- No marker has been remediated merely because it is classified.
- Excluding a file from a candidate archive does not hide it in a public Git repository.
- A SHA-256 marker fingerprint is not a secret-protection mechanism or proof of anonymity.
- R1 is not a secret scanner, malware scanner, license review, SBOM, provenance, legal review,
  governance package, clean-clone qualification, or remote release proof.
- No sync, push, merge, tag, release, visibility change, npm publish, marketplace submission,
  provider execution, database write, target edit, or dashboard mutation is performed by R1.
