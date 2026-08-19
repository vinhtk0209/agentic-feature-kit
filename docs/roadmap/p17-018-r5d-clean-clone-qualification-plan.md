# P17-018 R5D — Clean-Clone Cross-Platform Qualification

## Outcome and delivery boundary

R5D proves that the already-admitted public source candidate can be installed and built from exact
committed clones on the two supported release platforms. It executes the documented quickstart in
two physically isolated clones per platform, requires deterministic final outputs, re-runs strict
archive admission and extracted runtime smokes, and produces one fail-closed platform receipt plus
one aggregate Linux/Windows receipt.

The approved input lock is
`scope=R5D, source=C1, platforms=P1, install=I1, determinism=D1, runtime=R1, browser=B1, evidence=E1`.
R5D preserves package, prompt, provider, and shared-core versions at
`3.25.0 / v3.25 / 0.5.0 / 1.3.0`. It adds qualification and evidence only. It does not select a
release candidate, publish an artifact, or change package/repository visibility.

## Reconciled starting state

- Verified R5C2B merge `b35406978e581060eb4c240ea9272ac848878cc3` is the exact R5D base.
- R5C1 admits 647 public-manifest paths, four lockfiles, the reviewed dependency/license catalog,
  48/48 internal Markdown links, and ten secret-detector families.
- R5C2A creates deterministic source and provider CycloneDX 1.6/SPDX 2.3 sidecars from pinned
  offline schemas and reviewed dependency identities.
- R5C2B strictly admits one complete release directory: three ZIP archives, eight SBOM sidecars,
  one 11-row checksum file, exact archive/directory parity, and fail-clean promotion.
- The existing provider distribution test performs 15 clean extracted runtime smokes, but all
  current local qualification still inherits the developer checkout and its installed dependencies.
- Workflow Kit CI runs Node 24, `npm ci`, the complete kit, and a Linux/Windows matrix with a
  read-only aggregate gate. It does not yet execute two clean committed clones on each platform.
- The README quickstart is exactly `npm ci`, `npm run build:providers`, then
  `npm run test:provider-distribution`; its timing and final supported-OS claim remain deferred.

## Locked R5D decisions

### C1 — Bind every qualification to one committed source identity

The qualification CLI accepts one full 40-character source commit and rejects symbolic refs,
abbreviations, a dirty source worktree, a mismatched source HEAD/tree, or any source transition
during the run. It captures the commit, tree, commit timestamp used as `SOURCE_DATE_EPOCH`, platform,
Node/npm/Git versions, and the exact quickstart command identities before cloning.

Each candidate is created with `git clone --local --no-hardlinks` from the bound checkout and then
checked out detached at the exact full commit. The adapter proves clone HEAD/tree equality and clean
status before install and again before accepting outputs. It never copies the developer worktree,
uses a linked worktree, reuses ignored build output, or reads a target `.Codex/` directory.

### P1 — Qualify native Windows and GitHub-hosted Linux

The platform vocabulary is exactly `windows` and `linux`. The CLI maps `win32` only to `windows`
and `linux` only to `linux`; an asserted/actual platform mismatch fails before clone creation.
Local durable evidence comes from native Windows. Exact-head GitHub Actions must independently
produce both Linux and Windows receipts, upload both from the same head, and pass one aggregate gate.

The workflow checks out `${{ github.event.pull_request.head.sha || github.sha }}` explicitly so a PR
merge ref cannot be mistaken for the qualified source head. Permissions remain `contents: read`,
action versions stay immutable, and no secret, provider, database, deployment, or publication input
is introduced.

The npm route uses exact non-secret `CLEAN_CLONE_SOURCE`, `CLEAN_CLONE_COMMIT`,
`CLEAN_CLONE_PLATFORM`, and `CLEAN_CLONE_OUT` bindings. This avoids npm treating long qualifier
flags as npm configuration while keeping the direct Node CLI's explicit flagged-argument mode for
bounded diagnostics. Missing or partial environment bindings fail before temp allocation.
On Windows, the shell-free child boundary invokes an ordinary validated `npm-cli.js` through the
absolute Node executable; `.cmd` wrappers are not spawned and `shell: false` remains mandatory.
Every clone uses two distinct physical one-byte-LF npm configuration files for user and global
configuration so npm 11 cannot reject or merge a double-loaded config authority.
The admitted release root must also contain exactly the three expanded provider directories
(`claude`, `codex`, and `copilot`); they remain archive-comparison inputs and are not added to the
exact 12-file receipt output set.
The aggregate download merges both platform artifacts at `artifacts/` so retained cross-platform
receipts resolve at `artifacts/cross-platform/` and R5D receipts resolve independently at
`artifacts/public-release/r5d/`; nesting either subtree twice fails the workflow contract.
The npm aggregate route uses exact non-secret `CLEAN_CLONE_MATRIX_DIR` with no forwarded flags;
direct Node diagnostics retain explicit `matrix --dir <path>` mode.

### I1 — Use two physically isolated installs per platform

Each platform run creates clone A and clone B in separate bounded temporary directories. Every clone
starts without `node_modules` or `dist`, runs a fresh `npm ci`, and receives its own physical
`node_modules` tree. The adapter rejects missing trees, equal real paths, symbolic links, junctions,
or other reparse-backed dependency reuse. A shared npm download cache is acceptable; installed
trees and build outputs are not.

The G-WORKTREE-JUNCTION-DELETE rule is absolute: no junction may be created, and no cleanup command
may traverse a reparse point. Temp cleanup first proves each resolved clone path is a direct child
of the owned qualification root. The adapter uses no recursive delete against an unresolved path.

### D1 — Require byte-identical admitted outputs

Both clones receive the same explicit `SOURCE_DATE_EPOCH`, run `npm run build:providers`, then run
`npm run test:provider-distribution`. The resulting promoted directories must contain the same
complete output set. All eleven checksummed outputs and `SHA256SUMS` must be byte-identical across
clones. Each output is recaptured after the command sequence and before receipt creation.

Both outputs are independently passed through the R5C2B final archive admission adapter. Their
reports must have semantic parity: three ZIP archives, 71 entries, eight SBOM sidecars,
11 checksums, 79 text scans, the same provider/source identities, and zero issue. Timing and temp
paths are never part of deterministic identity.

### R1 — Re-run extracted runtime smokes from each clone

The committed quickstart test remains the runtime authority. Both clones must execute
`npm run test:provider-distribution` successfully and emit its exact version-bound completion
sentinel reporting 15 extracted runtime smokes. The adapter hashes bounded stdout/stderr but does
not persist raw logs, temp paths, environment variables, or credential-shaped text in the receipt.

The combined platform contract is three ZIP archives, 71 entries, eight SBOM sidecars, 11 checksums,
79 text scans, and 15 extracted runtime smokes.

An exit-zero build without the exact sentinel is not accepted. A sentinel without exit zero is not
accepted. Strict archive admission cannot replace runtime smokes, and runtime smokes cannot replace
archive/SBOM/license/secret admission.

### B1 — Prove the documented quickstart and browser surface honestly

The production CLI executes the same ordered commands shown under `Quickstart from a clean clone`:
`npm ci`, `npm run build:providers`, and `npm run test:provider-distribution`. Static contracts bind
that order, package-script existence, artifact location, provider selector links, limitations, and
the no-install/no-provider/no-publication boundary.

After the source commit is pushed to the retained feature branch, an in-app browser must inspect the
GitHub-rendered README at that exact commit. Evidence records the exact commit URL, visible quickstart
heading, three ordered commands, provider selector links, and limitations boundary. This is browser
corroboration of documentation only; it is not a provider execution or endorsement claim. If the
browser cannot bind to the exact commit or render those elements, B1 remains incomplete.

### E1 — Bind receipts, CI, evidence, and rollback

The source commit contains only the locked implementation manifest. Native Windows qualification
runs from that clean source commit and writes its bounded receipt outside the repository. The source
commit may then be pushed non-force to the retained feature branch solely so B1 can inspect an exact
GitHub commit. The evidence commit adds only the evidence document and its public-manifest row.

The final PR head must pass Linux, Windows, and `Release qualification gate` on the same exact SHA.
Each platform artifact contains the R5D receipt; the aggregate gate requires both, requires identical
source/tree/epoch/output identities, and rejects partial, duplicate, stale, or cross-head evidence.
Merge stays standard PR-only after exact-head GREEN and clean mergeability. The branch is retained.

## Committed-clone execution contract

The Node adapter is a bounded orchestration shell around one pure receipt contract and existing
R5C1/R5C2 archive admission. It adds no new dependency and exposes two explicit CLI modes:

1. `qualify` validates platform/source/out arguments, source identity, cleanliness, and tools;
2. it creates one owned temp root and two `git clone --local --no-hardlinks` clones;
3. each clone proves exact detached HEAD/tree and absence of inherited install/build directories;
4. each clone runs `npm ci`, `npm run build:providers`, and
   `npm run test:provider-distribution` with bounded timeout/output;
5. each clone proves two physically distinct node_modules trees and clean tracked status;
6. each promoted output is strict-admitted and recaptured;
7. the pure contract compares both clones and constructs one redacted platform receipt;
8. `matrix` reads exactly `linux.json` and `windows.json`, validates both, proves common identity,
   and emits one aggregate sentinel without writing an external system.

Commands run without a shell. Environment inheritance is allowlisted to the minimum required for
Git/npm/Node plus the explicit epoch; credential-shaped environment names are not copied into child
processes. Process output is bounded, hashed, and discarded after validation. Per command timeout,
aggregate timeout, output-byte ceiling, and temp-root ownership are mandatory.

## Qualification receipt and aggregation

Each platform receipt is canonical JSON with a final LF and contains only:

- schema/status/platform and full source commit/tree/epoch;
- Node/npm/Git versions and exact quickstart command IDs;
- two clone results with detached/clean/install/build/runtime/admission booleans, bounded durations,
  stdout/stderr hashes and sizes, and output digests;
- common deterministic output set and semantic admission counts;
- explicit `physicalInstalls=true`, `quickstartMatched=true`, and `rawLogsPersisted=false` claims.

It must not contain an absolute path, repository URL, username, host-specific temp identifier,
environment value, raw process output, token, secret, or credential fingerprint. The pure validator
checks exact keys, types, bounds, hashes, platform mapping, clone ordinals, output filenames, and the
R5C2B count contract. Unknown keys fail closed.

The aggregate contract reads exactly two receipts named `linux.json` and `windows.json`. It requires
both status `pass`, distinct platforms, the same source commit/tree/epoch, the same quickstart IDs,
and byte-identical output digests. It reports only common identity, ordered platforms, output digest,
and failures. `MATRIX_RESULT` must be exact `success`; skipped or partial matrix state fails.

## Quickstart and browser evidence boundary

R5D may claim that the documented source quickstart completed on the supported qualification
platforms only after local committed-clone proof, exact-head CI receipts, and aggregate GREEN. It may
not claim that a real user installed a plugin, that a provider executed a task, or that package or
marketplace installation exists.

The browser inspection is read-only and bound to the exact source commit page. No account setting,
repository visibility, PR state, branch, package, release, dashboard, database, provider, or target
is changed by the browser step. A text/API read is supporting evidence but does not replace the
required visible in-app browser corroboration.

## Threat model and attack matrix

The pure and Node suites must reject at least these classes:

| Boundary | Required attacks |
| --- | --- |
| Source | abbreviated/non-hex commit, HEAD/tree mismatch, dirty source, source change during run |
| Platform | unknown platform, asserted/native mismatch, duplicate or missing OS receipt |
| Clone | failed clone, wrong detached commit, inherited dist/node_modules, hardlink flag omitted |
| Install | failed/timeout `npm ci`, missing node_modules, same realpath, symlink/junction/reparse |
| Commands | wrong order/argv, shell execution, nonzero build/test, missing or forged smoke sentinel |
| Outputs | missing/extra file, digest drift, checksum drift, semantic admission drift, partial set |
| Receipt | unknown/missing key, absolute/temp path, URL/raw log/env/credential leakage, bad bounds |
| Matrix | stale/mismatched head/tree/epoch, cross-platform output drift, partial matrix result |
| Workflow | implicit merge-ref checkout, writable permission, unpinned action, secret/publication step |
| Cleanup | unresolved/broad target, path outside owned temp root, reparse target, leftover clone/output |

Tests construct credential-shaped attacks from fragments so the source manifest does not contain a
live detector hit. Errors and receipts use stable redacted reason IDs, never child-process output.

## TDD and verification ladder

1. Register the plan, pure, Node, qualification, and matrix routes. Prove readiness RED only because
   this plan is absent, then make the unchanged plan test GREEN.
2. Add pure receipt/matrix fixtures and mutation attacks before the contract module. Prove expected
   `MODULE_NOT_FOUND`, implement exact schemas/parity/redaction, and keep the suite unchanged.
3. Add Node adapter tests with fake Git/npm/process/filesystem ports before implementation. Cover
   command order, clone identity, physical-install proof, output recapture, cleanup, and all failures.
4. Implement the thin adapter over argument-array process spawning, bounded capture, owned temp
   directories, existing strict admission, and the pure receipt contract.
5. Update the workflow and nightly static contract: explicit exact-head checkout, per-platform R5D
   qualification/receipt upload, aggregate R5D matrix gate, read-only permissions, no secrets.
6. Reconcile README/provider/release notes and public source-readiness/history assertions only after
   the qualification path is executable. Add the six new R5D files to the public manifest.
7. Run focused attacks, strict TypeScript 5.9.3, all R4/R5/source/SBOM/archive predecessors, npm
   audit, exact staged authority, and the complete native kit before the source commit.
8. From the clean source commit, run native Windows `qualify` with an explicit bounded output path,
   verify/capture the receipt, and clean both clones. Push the exact source commit non-force only to
   the retained feature branch and perform exact-commit in-app browser corroboration.
9. Add only the evidence document and public-manifest row, self-scan the evidence tree, commit, push
   the exact evidence SHA, open a Draft PR, and wait for exact-head Linux/Windows/aggregate GREEN.
10. Re-read remote refs, PR identity, receipt artifacts, check IDs, and mergeability; only then mark
    Ready and merge through the PR. Retain the branch and verify merge parents/tree/live main.

## Exact source and evidence manifests

The source commit is exactly these 19 ordinal paths:

- `.github/workflows/workflow-kit-ci.yml`
- `.gitignore`
- `README.md`
- `docs/releasing/UNRELEASED.md`
- `docs/roadmap/p17-018-r5d-clean-clone-qualification-plan.md`
- `package.json`
- `providers/README.md`
- `release/public-release-manifest.json`
- `scripts/nightly-workflow-contract.test.ts`
- `scripts/nightly-workflow-contract.ts`
- `scripts/post-17-public-release-r5d-plan.test.ts`
- `scripts/public-release-history-contract.test.ts`
- `scripts/public-release-operational-alias-contract.test.ts`
- `scripts/public-source-readiness-contract.ts`
- `scripts/public-source-readiness-docs.test.ts`
- `scripts/release-clean-clone-contract.test.ts`
- `scripts/release-clean-clone-contract.ts`
- `scripts/release-clean-clone-node.test.ts`
- `scripts/release-clean-clone-node.ts`

LF path-manifest SHA-256:
`acccc9e7996524db324961c89860b50503ac526a8ba7c92bc6d3b5f4ae4733d8`.

The evidence commit is exactly:

- `docs/evidence/post-17-public-release-r5d-clean-clone-qualification-2026-08-19.md`
- `release/public-release-manifest.json`

LF evidence path-manifest SHA-256:
`e5b63c3822408fb128353f788a7a3aca37df957c2b609e337c2133c004c821c2`.

Generated `dist/`, `/artifacts/`, temp clones, install trees, logs, browser caches, and CI artifacts
are evidence inputs or ignored outputs, never committed source paths.

## Rollback and stop conditions

- Stop on any source/head/tree transition, dirty clone, unbounded command, command timeout, raw-log
  leak, cleanup uncertainty, reparse/junction install, or unresolved temp target.
- Stop if either clone does not independently install, build, strict-admit, and run all 15 smokes.
- Stop if any of the eleven checksummed outputs, `SHA256SUMS`, source identity, or semantic admission
  count differs across clones or platforms.
- Stop if CI checks a merge ref instead of the exact PR head, produces only one platform receipt, or
  lets aggregate GREEN without both valid platform receipts.
- Stop if browser evidence cannot bind the rendered README to the exact source commit or if it would
  require a provider/login/credential/repository-setting mutation.
- Stop if the scope needs a new dependency, package/version change, sync, target edit, dashboard or
  database mutation, provider execution, tag, release, publication, signing, or visibility change.
- Roll back with one feature-branch revert or the verified 2026-08-19 kit snapshot/tag. Never use a
  target `.Codex/` tree, shared worktree dependency junction, or real sync as rollback.

R5D does not authorize a tag, release, publication, package upload, marketplace submission, sync,
target edit, or visibility change.

## Deferred beyond R5D

Release-candidate and version selection, final sanitized-public-repository review, dashboard release
routing, provenance/attestation signing, tags, GitHub Release, npm/pnpm/marketplace/plugin
publication, repository visibility, sync, and any provider endorsement remain separately gated.

The final P17-018 readiness reconciliation may cite R5D only after its committed-clone receipts,
browser corroboration, exact-head Linux/Windows/aggregate CI, and verified PR merge are durable. It
still cannot describe any artifact as published or available through a package/marketplace channel.
