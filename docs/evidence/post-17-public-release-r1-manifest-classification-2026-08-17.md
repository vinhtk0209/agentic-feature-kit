# P17-018 R1 Public Release Manifest and Marker Classification Evidence

**Date:** 2026-08-17
**Task:** P17-018, release-manifest and internal-marker classification slice R1
**Decision lock:** `slice=R1, manifest=M1, classification=C1, naming=N1, privacy=P1, boundary=B1, evidence=E1`
**Source commit:** `0f3319d35faabb8977d3e866697c387ff7ed56ad`
**Source parent:** `38d7d7d2adcc811ffa049a5baf38b1cd31eaa1f7`

## Result

R1 implements a versioned, fail-closed public-release tree contract and an exhaustive disposition
registry for the declared internal-marker detector set. The source commit is locally qualified and
ready for a stacked feature PR.

R1 deliberately does **not** make the candidate public-release eligible. The production result is:

```text
contractValid=true
candidateStatus=blocked
includedPaths=570
excludedPaths=5
classifiedOccurrences=73
blockers=31 unresolved-marker-disposition
```

The included count is 569 at the source commit and 570 after this public-safe evidence path is added.
The five explicit excludes and all marker counts are unchanged. A valid classification is not a
claim that remediation, later release gates, or publication has completed.

## Delivered contracts

- `release/public-release-manifest.json` owns the exact tracked candidate tree, public identity,
  package visibility, provider IDs, required paths, bounded limits, binary digests, registry digest,
  include/exclude decisions, and no-external-write boundary.
- `release/internal-marker-classification.json` contains no plaintext marker values. It stores six
  opaque marker IDs, domain-separated SHA-256 fingerprints, exact path/count bindings, dispositions,
  and reason codes.
- `scripts/public-release-contract.ts` is the pure domain layer. It owns exact-key parsing, canonical
  path identity, bounds, digest checks, detector grammars, exhaustive binding, deterministic results,
  and raw-free diagnostics without filesystem, Git, process, environment, network, or clock access.
- `scripts/public-release-contract-node.ts` is the read-only Node adapter. It uses NUL-delimited
  `git ls-files --stage` identity and one bounded binary-safe `git cat-file --batch` read so candidate
  bytes come from exact Git-index objects rather than mutable worktree content.
- The adapter still checks the worktree path and every ancestor for missing, non-file,
  symlink/reparse, or unsupported entries before accepting a candidate.
- Package scripts register the R1 plan, pure domain, and Node adapter suites in `test:kit`. The
  standalone contract command exits successfully for a valid-but-blocked classification and can
  separately require later-gate eligibility.

## Exact source manifest

The source commit contains exactly nine changed paths:

1. `docs/roadmap/p17-018-r1-release-manifest-plan.md`
2. `package.json`
3. `release/internal-marker-classification.json`
4. `release/public-release-manifest.json`
5. `scripts/post-17-public-release-r1-plan.test.ts`
6. `scripts/public-release-contract-node.test.ts`
7. `scripts/public-release-contract-node.ts`
8. `scripts/public-release-contract.test.ts`
9. `scripts/public-release-contract.ts`

The source diff is 6,276 insertions and one deletion. The evidence-phase metadata adds this evidence
path to the exact tree and adjusts only the current-tree fixture transition; it does not alter R1
domain or adapter behavior.

## Manifest and classification facts

At the source commit:

- 574 exact candidate entries;
- 569 includes and five explicit excludes;
- 22 included binary paths bound to SHA-256 content digests;
- six opaque marker IDs;
- 73 classified occurrences;
- one zero-occurrence regression guard;
- 31 path dispositions still requiring remediation;
- zero unclassified detector results;
- zero stale, wrong-path, duplicate, plaintext-registry, digest, schema, or path-identity blockers.

After adding this evidence path, the exact tree has 575 entries and 570 includes. All other facts
remain identical.

The unresolved disposition families are `genericize`, `move-to-private-archive`, and
`replace-with-synthetic-fixture`. No occurrence is marked reviewed-retained merely to obtain a green
candidate. Raw marker values are absent from the plan, registry, source, tests, and this evidence.

## RED evidence

The implementation did not begin from an already-green test:

1. The registered readiness validator exited `1` with exactly the missing R1 plan.
2. After the plan was accepted, the pure suite exited `1` with `MODULE_NOT_FOUND` for the absent
   domain source.
3. The first domain implementation reached all groups with 15 pass and three fail. Two failures were
   over-specific test messages; the remaining detector fixture was isolated before any source
   change. The corrected semantic tests then passed 18/18.
4. The registered Node suite exited `1` with `MODULE_NOT_FOUND` for the absent adapter.
5. The first real-tree evaluation rejected all known fingerprints because the one-time inventory
   helper encoded the domain separator incorrectly. Correct NUL-domain fingerprints exposed a
   separate real undercount: an earlier line-count inventory missed a second occurrence on one
   matching line. Exact scanning corrected the total from 72 to 73.
6. Security review added attacks for mutable-worktree/index divergence, Windows path aliases, and
   more than 10,000 index records. They failed before hardening: pure 17/18 and Node 5/7.
7. Production hardening changed the byte source to staged Git objects, added bounded batch parsing,
   and rejected alternate-data-stream, trailing-dot/space, reserved-device, and record-overflow
   inputs. The same attacks then passed.

Harness-only failures were not reported as product evidence: CommonJS top-level await, an outdated
local TypeScript compiler unable to parse current Node declarations, a substring registration audit,
and wording-only plan assertions were corrected without weakening production behavior.

## GREEN evidence

### Focused domain and adapter

- R1 readiness plan: PASS, `M1/C1/N1/P1/B1/E1` locked.
- Pure domain: 18/18 groups.
- Node/Git/filesystem adapter and current-tree authority: 7/7 groups.
- Current production command: exact candidate is contract-valid and blocked only by 31 unresolved
  dispositions.

The focused suites cover:

- unknown, missing, duplicated, reordered, differently cased, non-NFC, absolute, traversal,
  backslash, empty/dot, NUL, Windows ADS, trailing-dot/space, and reserved-device paths;
- Git symlink, reparse ancestor, unsafe mode, malformed/unmerged/NUL index data, record overflow,
  malformed/truncated/trailing/type/object-mismatched Git batch output, missing files and blobs;
- unsupported schema/identity/provider/package-visibility/limit fields and unknown fields;
- binary digest mismatch, invalid UTF-8, file/tree size bounds, and contract-file byte mismatch;
- unknown/ambiguous detector bindings, stale totals/counts/paths, duplicate dispositions,
  fingerprint mismatch, and reviewed-retained rationale misuse;
- generic unknown service/user-path values, plaintext registry leakage, raw-free errors/sentinels,
  and contract-versus-eligibility exit behavior;
- a staged-safe candidate with hostile dirty worktree content, proving exact Git-index blob binding;
- paths with spaces and Unicode on a real disposable Git index.

### TypeScript

TypeScript 5.9.3 strict checking with `skipLibCheck=false` reports zero diagnostics across the four
domain/adapter source and test files. The repository-local 4.9.5 compiler was not accepted as
evidence because it cannot parse the installed Node 26 declarations.

### Focused and companion matrix

Fourteen registered commands pass in 41.4 seconds:

- canonical post-17 roadmap and repository-boundary refresh;
- parent public-release plan and R1 plan;
- pure and Node R1 suites;
- provider bundle and deterministic distribution suites;
- Project Intelligence and Workflow Orchestrator;
- claim-runtime audit and Windows cross-platform qualification;
- version agreement and synced-core drift check.

The provider distribution proof remains three deterministic archives and 15 clean runtime smokes.
Cross-platform local qualification remains 11/11. Version stamps remain v3.25 and the five synced
core files remain byte-identical.

### Authoritative full kit

Two full source-candidate runs pass:

| Candidate | Exit | Time | Captured lines |
|---|---:|---:|---:|
| Exact uncommitted source candidate | 0 | 246.3 s | 1,831 |
| Immutable source commit `0f3319d…` | 0 | 245.6 s | 1,831 |

Both runs execute the repository-boundary prehook, R1 gates, all predecessor/neighbor suites,
provider distribution, cross-platform release qualification, version/index checks, prompt budget,
and lesson synchronization. Stable end-state values are:

- package and prompt version: v3.25;
- prompt budget: 163,206 / 176,128 bytes;
- lesson annotations: 60/60 paired;
- repository-boundary guard: PASS.

## Security and privacy audit

- Exact changed-file manifest: PASS.
- Cached and worktree whitespace checks: PASS.
- JSON parsing and registry digest: PASS.
- UTF-8 without BOM, final LF, and zero trailing whitespace: PASS.
- English feature content: zero Latin-Extended code points in all R1 files.
- Six private-marker detectors: all positive controls PASS; zero raw-value hits in R1 files.
- Four secret-pattern detectors: all synthetic positive controls PASS; zero hits in R1 files.
- Root package remains `private: true`.
- Pure domain imports no filesystem, path, child process, environment, network, or clock authority.
- Structured errors and sentinels do not echo source lines, raw marker candidates, Git stderr, or
  adapter exception text.
- The package contains no release, publish, sync, installation, provider, database, or dashboard
  side effect reachable from R1 validation.

## Backup and preservation

- The verified daily kit backup SHA-256 remains
  `d175cad9f64b9e02ac4a037151a27adbace3e0d76d6e9eb21ecf56c0844df196`.
- The verified daily dashboard backup SHA-256 remains
  `5770c0b30ec09bbf58e082c3a9ff6cc3cca28f9646657e9c0e8f653085879b7e`.
- Dashboard tracked/cached/untracked state was checked with the forbidden local-settings path
  explicitly excluded and remained unchanged.
- No target repository, target workflow directory, database, provider runtime, package registry,
  repository visibility, tag, release, or sync state was changed.
- The temporary manifest generator was deleted; test logs remain ignored under the workspace
  scratch boundary.

## Rollback

- Revert source commit `0f3319d35faabb8977d3e866697c387ff7ed56ad` and this metadata commit
  together to return to parent `38d7d7d2adcc811ffa049a5baf38b1cd31eaa1f7`.
- Before any commit-level rollback, the verified daily snapshot remains available for worktree
  recovery.
- Do not keep a manifest without its digest-bound registry and adapter.

## Non-claims and next step

- P17-018 is not complete.
- Agentic Feature Kit is not yet public-release eligible.
- The repository is not claimed public and the package is not published.
- Classification has not remediated any marker.
- R1 is not a secret scanner, license review, SBOM, provenance, governance package, clean-clone
  qualification, nightly CI result, remote Linux/Windows proof for this change, or release approval.
- No push, PR, merge, tag, release, visibility change, npm publish, marketplace submission, sync,
  installation, provider execution, database write, target edit, or dashboard mutation is performed
  by this evidence step.

The next action is a stacked feature PR for the source/evidence pair, followed by remote
Linux/Windows/aggregate CI. Later P17-018 slices must resolve every disposition and implement the
remaining metadata, documentation, governance, nightly, supply-chain, clean-clone, and release
qualification gates before any public-ready claim.
