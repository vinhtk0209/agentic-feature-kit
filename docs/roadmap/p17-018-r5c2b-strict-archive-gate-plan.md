# P17-018 R5C2B — Strict Final Archive Admission

Date: 2026-08-19
Status: approved implementation plan
Predecessor: `docs/roadmap/p17-018-r5c2a-deterministic-sbom-plan.md`
Input lock: `delivery=Q1, identity=I1, sbom=S1, archive=A1, gate=G1, architecture=T1, determinism=D1, evidence=E1`

## Outcome and delivery boundary

Add one fail-closed final admission boundary around the unpublished provider release candidate. Parse
each generated ZIP from its central directory, prove every local header and payload against that
authority, revalidate the complete release output set and all R5C2A SBOM contracts, scan the exact
decompressed contents, and promote the candidate only after every aggregate control passes.

R5C2B is one supply-chain feature and one PR. It preserves three ZIP archives, eight SBOM sidecars,
and one 11-row SHA256SUMS as the checksummed output authority. It does not change provider payloads,
provider runtime behavior, archive names, archive root, package privacy, or version identities.
Versions remain `3.25.0 / v3.25 / 0.5.0 / 1.3.0`.

This slice completes only the final archive-admission control planned by R5C2. It does not claim a
clean-clone build, a release candidate, publication readiness, provenance signing, package-manager
availability, provider endorsement, or repository visibility.

## Reconciled starting state

- Qualified base is PR #19 merge `76cbe150f364ca23c1c4749f910693c405f7c4e6` with exact tree
  `45baece1ade9d4ed9fb35c371645a20265e7f431`.
- R5C2A emits three deterministic Deflate ZIP archives, two source SBOM sidecars, six provider SBOM
  sidecars, and one exact ordinal 11-row checksum file. Both independently built output roots are
  byte-identical.
- Pinned official SPDX 2.3 and CycloneDX 1.6.1 schemas compile and validate offline. Source SBOMs bind
  four workspace roots plus 617 reviewed dependency components; each provider SBOM binds only its
  first-party artifact and embedded `typescript@4.9.5` runtime dependency.
- The provider bundle test still extracts through local headers for runtime smoke execution. That
  helper is not a final artifact parser and does not establish central-directory authority, CRC,
  alias, reparse, collision, or bounded expansion safety.
- `validateBuiltBundle` proves expanded-directory manifest and content integrity before archive
  creation. No production control reopens the completed ZIP, compares archive entries with the
  expanded bundle, rescans exact archive contents, or gates promotion on the complete set.
- Current archives are approximately 1.42 MiB each, provider build RSS growth is approximately
  20.5 MiB, and the distribution suite remains below 30 seconds. These measurements do not justify
  a new native-language component.
- R5C1 public source readiness and R5C2A SBOM validation are existing public contracts. R5C2B must
  call those contracts instead of reimplementing license, secret-pattern, or SBOM-format policy.

## Locked R5C2B decisions

### A1 — Parse ZIP structures from one bounded central-directory authority

The central directory is the sole entry authority. The parser reads one exact final EOCD, rejects
comments and trailing bytes, validates central offset/size/count, parses exactly that many central
headers, and then proves every referenced local header and compressed range. Local headers never
create entries and cannot override central metadata.

Reject multi-disk, ZIP64, encryption, data descriptors, and unsupported compression methods. Accept
only stored or raw Deflate payloads with the UTF-8 name flag and no other general-purpose bits. Reject
archive, central-entry, local-entry, or EOCD comments and extras; non-zero disk fields; unsupported
version requirements; non-zero external attributes; directory entries; duplicate records; gaps;
overlaps; prepended bytes; and bytes between the final payload, central directory, and EOCD.

Decode names with fatal UTF-8 and require NFC. Reject invalid UTF-8, non-NFC names, absolute paths,
traversal, backslashes, ADS, device names, trailing dots or spaces, empty, dot, or dot-dot segments,
control characters, drive/UNC forms, directory-only names, excessive byte length, and names outside
the exact `agentic-feature-kit/` archive root. Reject exact, case-folded or NFC collisions and reject
non-ordinal central-entry names.

Require local and central name bytes, flags, compression method, DOS timestamp, CRC-32, compressed
size, uncompressed size, and offsets to agree. Verify CRC-32, compressed size, uncompressed size, and
local-header parity after bounded decompression. Stored entries require equal compressed and
uncompressed lengths. Any inflate error, output-limit error, integer overflow, or ratio violation is
a fail-closed result with no candidate byte echoed in diagnostics.

Hard parser limits are 512 MiB per archive, 20,000 entries, 512 UTF-8 bytes per name, 128 MiB
compressed per entry, 256 MiB uncompressed per entry, 512 MiB aggregate uncompressed output, and a
200:1 per-entry expansion ratio. These caps are checked before allocation/inflate and again against
observed output. Reconsider the implementation language only if a real archive exceeds 512 MiB,
measured peak scanner memory exceeds 256 MiB, or a representative scan exceeds 30 seconds.

### G1 — Admit only one complete release candidate

The stage root must contain exactly the provider directories `codex`, `claude`, and `copilot`, the
three ZIP archives, the eight exact R5C2A sidecars, and `SHA256SUMS`. The checksum file has exactly 11
LF-final ordinal rows, never names itself, contains no path separator or absolute path, and binds the
exact bytes of every distributable file. Missing, duplicate, extra, renamed, stale, or partially
written output blocks admission.

For each provider, the aggregate gate must:

1. parse the raw ZIP through A1 and require the exact `agentic-feature-kit/` root;
2. parse the archived `bundle-manifest.json` under strict size/key/type/order bounds;
3. recompute its manifest hash and verify exact provider/bundle/core/capability identities;
4. compare every archive entry byte count and SHA-256 with the manifest and reject undeclared or
   missing entries;
5. compare every parsed archive entry byte-for-byte with the regular, non-reparse expanded bundle;
6. require root `LICENSE`, root `THIRD_PARTY_NOTICES.md`, and the reviewed TypeScript license payload
   to be exact byte copies of their source authorities;
7. reconstruct the provider R5C2A input from the archive hash, manifest hash, source date, provider
   registry, and exact catalog-backed `typescript@4.9.5` component;
8. revalidate SPDX and CycloneDX against pinned offline schemas and the existing semantic parity
   contract; and
9. scan every decompressed manifest-declared text entry and both provider sidecars through the
   existing ten-family bounded secret scanner with digest-only findings.

The source pair is revalidated from a fresh R5C2A source-input capture at the same source date. The
current Git-index public-source candidate must still return `eligible-for-r5c2`, including exact
manifest, link, dependency-license, documentation, and ten-family secret authority. All eight
sidecars are strict UTF-8 JSON, schema-valid, semantically exact, and secret-clean.

The current provider distribution is text-only. A future binary provider entry requires an explicit
manifest content-kind extension and separately reviewed binary policy; it cannot silently bypass
the text scanner in this gate.

### T1 — Keep a pure contract and a thin Node adapter

Use TypeScript and Node.js with no new dependency:

1. `scripts/release-archive-contract.ts` owns byte-grammar parsing, ZIP limits, path/collision rules,
   CRC-32, checksum grammar, output-set semantics, and distribution-manifest parity. It accepts
   bounded inflate and SHA-256 ports and imports no filesystem, process, child process, network,
   zlib, crypto, Ajv, SBOM adapter, source-readiness adapter, or builder.
2. `scripts/release-archive-node.ts` owns bounded regular-file reads, realpath/reparse containment,
   Node raw-Deflate and SHA-256 ports, expanded-directory parity, license/notice byte authority,
   existing source-readiness and R5C2A schema/semantic calls, secret scanning, structured reporting,
   and fail-clean promotion.
3. `scripts/build-provider-bundles.ts` remains the orchestrator. It writes checksums last under the
   stage root, invokes the Node aggregate gate, and delegates stage promotion only after admission.

Do not import or modify the older `.claude/integrations/zip-min.ts`; it remains a bounded office-file
adapter with a different compatibility contract and is not promoted into a release-security gate.
Do not duplicate SPDX, CycloneDX, dependency-license, or secret detector rules in the archive module.

### D1 — Preserve deterministic output and fail-clean promotion

R5C2B reads and validates existing outputs without rewriting their bytes. The R5C2A double-build
requirement remains exact for all 11 checksummed outputs and `SHA256SUMS`; admission reports must also
have semantic parity across both roots.

Admission completes before the existing release directory is touched. A rejected stage is deleted
and an existing qualified release remains byte-for-byte unchanged. For a successful replacement,
rename an existing release to one bounded rollback sibling, rename the admitted stage into place,
restore the prior release if the second rename fails, and remove the rollback sibling only after
success. No partial stage, rollback sibling, or promoted output may remain after a failed operation.

The stage/output/release/rollback paths are resolved and proven within one explicit output root.
Symlink, junction, reparse, cross-root, existing non-directory, and ambiguous-path states fail before
any recursive removal or rename. The implementation never creates a `node_modules` junction and
never uses a target `.Codex/` tree for rollback.

### E1 — Bind source, evidence, and remote qualification

Require plan/readiness RED then GREEN, pure-contract RED before implementation, Node-adapter RED
before adapter code, canonical archives, mutation attacks for every A1/G1 class, current provider
integration, formal-schema negative controls, fail-clean promotion attacks, predecessor/source
readiness gates, TypeScript 5.9.3 strict compilation, and one complete native kit suite.

Record test/attack/archive/entry/sidecar/checksum counts, native exit codes and durations, full-suite
stdout/stderr byte counts and digests, exact source/evidence manifests, Git trees/commits, and exact
remote run/job identities. Create one source commit and one evidence commit. Push only the retained
feature branch, create one draft PR into `main`, bind CI to the immutable evidence head, and merge
only through the standard PR flow after Linux, Windows, aggregate, and no-conflict gates pass.

## ZIP grammar and filesystem boundary

The parser uses little-endian fixed-width reads guarded by explicit range checks. It rejects any
numeric field whose addition or multiplication is unsafe, any ZIP64 sentinel, any central directory
that does not end exactly at the final EOCD, and any local-file range not fully contained before the
central directory. Sorted local offsets must form one gap-free, overlap-free interval from byte zero
to the central-directory offset.

Entry names are decoded once. The exact decoded name, NFC-normalized name, and deterministic
lowercase collision key are retained for comparison, but normalization never repairs input. A name
that changes under normalization is rejected. Windows device checks use the final path segment's
stem and cover `CON`, `PRN`, `AUX`, `NUL`, `CLOCK$`, `COM1` through `COM9`, and `LPT1` through `LPT9`.

The Node adapter reads a complete archive into one bounded buffer because the maximum accepted size
is fixed at 512 MiB. Raw Deflate uses Node's `maxOutputLength` bound. Every extracted entry remains
in memory only for validation; the security gate never writes attacker-controlled paths to disk.

Expanded bundle traversal is ordinal and lstat/realpath based. Every visited item must be a regular
file or an ordinary directory whose resolved path remains below the explicit bundle root. Symlinks,
junctions, other reparse aliases, sockets, devices, and special files fail closed. Archive-vs-directory
comparison uses normalized relative paths and exact bytes, not extraction.

## Final artifact aggregate gate

The report schema is stable, JSON-serializable, and contains only bounded metadata: schema version,
status, archive/entry/sidecar/checksum/text-file counts, detector-family count, provider IDs, elapsed
milliseconds, and finding codes/paths. It never includes decompressed content, sidecar text, secret
matches, credentials, hostnames, absolute paths, temporary paths, or environment values.

Admission order is fail-fast but deterministic:

1. validate arguments, containment, top-level lstat kinds, and exact output names;
2. parse and verify `SHA256SUMS` against every distributable byte sequence;
3. load the pinned schema registry and fresh source/provider R5C2A inputs;
4. parse each archive and validate manifest, expanded-directory, license, and notice parity;
5. validate all four SPDX/CycloneDX pairs against schemas and semantic contracts;
6. scan all decompressed text entries and all eight sidecars for secrets;
7. run current Git-index public-source readiness;
8. recapture source input and rehash every checksummed file to detect admission-time drift; and
9. return `admitted` only when the finding set is empty and every count is exact.

Builder promotion consumes only an `admitted` report returned for the same stage identity. A cached,
serialized, or earlier report cannot authorize a later path. Any file change between first capture
and final recapture blocks promotion and deletes the stage.

## Threat model and attack matrix

1. EOCD: missing, truncated, duplicated, comment, trailing bytes, prepended bytes, multi-disk fields,
   count mismatch, ZIP64 sentinel, central offset/size overflow, or central-to-EOCD gap.
2. Central headers: bad/truncated signature, extra/comment, disk start, unsupported version, encrypted
   or descriptor flag, unsupported flag/method, external attributes, count drift, or non-ordinal row.
3. Names: empty/oversized/invalid UTF-8/non-NFC, absolute/drive/UNC, backslash, ADS, traversal, empty or
   dot segment, trailing slash/dot/space, control byte, Windows device, duplicate, case collision, or
   NFC collision.
4. Local headers: bad/truncated signature, central/local name, flag, method, time, CRC, size, or extra
   drift; offset outside payload area; reordered ranges; gap; overlap; or undeclared local record.
5. Payload: stored-size drift, Deflate failure, output beyond cap, CRC mismatch, uncompressed-size
   mismatch, per-entry/aggregate byte overflow, expansion-ratio overflow, or decompressor exception.
6. Output set: missing/extra/duplicate/renamed file, wrong row count/order/newline, checksum self-row,
   absolute/path-bearing name, hash drift, partial sidecar, stale archive, stage noise, or missing
   provider directory.
7. Manifest/directory: malformed or oversized JSON, extra/missing keys, unsafe/duplicate path, wrong
   provider/version/core/capability, manifest-hash drift, archive entry mismatch, directory byte drift,
   symlink/reparse/special file, realpath escape, or undeclared file.
8. License/SBOM: root license or notice drift, TypeScript license drift, absent/wrong sidecar, schema
   failure, source/provider identity drift, archive/manifest hash drift, component/license/purl or
   relationship mismatch, wrong epoch, or source-catalog drift.
9. Confidentiality: reconstructed secret in an archive entry or sidecar, invalid UTF-8/NUL, detector
   overflow, candidate bytes in diagnostics, absolute/temp/user/host/process leakage, or network import.
10. Promotion: validation failure with existing release, source/checksum drift after validation,
    rollback sibling collision, stage/release cross-root, rename failure, restore failure, or residue.

## TDD and verification ladder

1. Register the focused plan command, future contract/Node commands, and full-kit routes. Prove
   expected RED is exactly the absent R5C2B plan.
2. Add this plan only and rerun the unchanged readiness harness GREEN.
3. Add the pure archive contract test first. Use a test-only deterministic writer to build canonical
   stored/Deflate fixtures and prove RED only because `release-archive-contract` is absent.
4. Implement the pure parser/checksum/manifest contract until canonical fixtures and every structural,
   name, collision, local-central, CRC, size, ratio, bounds, output-set, and manifest mutation pass.
5. Add the Node adapter test before production adapter code and prove expected RED. Validate bounded
   inflation/hash ports, current provider output, existing public/SBOM contracts, content secret
   controls, top-level/checksum/schema/directory attacks, and fail-clean promotion rollback.
6. Integrate admission into the builder after checksums and before promotion. Require the existing
   three-archive/eight-sidecar/11-checksum/15-smoke double-build suite plus exact admission counts in
   both roots. Replace the test-only local-header extractor with parsed entries from the strict gate.
7. Reconcile provider/release documentation only after integration is GREEN. State R5C2 complete as a
   local candidate control while leaving R5D and every release/publication boundary deferred.
8. Add the six new source paths to the include-only public manifest, stage the exact source manifest,
   and run Git-index source readiness, all R4/R5 predecessor gates, R5C2A gates, strict TypeScript
   5.9.3 with `noEmit` and `skipLibCheck=false`, npm audit, diff checks, and generated artifact scans.
9. Run one complete native `test:kit`; capture exit, duration, log sizes/digests, lesson-sync terminal
   state, exact staged tree, and zero unstaged/untracked residue before the source commit.
10. Add only the evidence document plus its one public-manifest row, requalify the evidence tree,
    create the evidence commit, then execute retained-branch push/draft-PR/exact-head CI/PR-only merge.

## Exact source and evidence manifests

The source-stage path manifest is exactly 15 ordinal paths with LF-final SHA-256
`93909b7b5f1eefda453d214ef57e70ccde5e227a32d5da95b3b85908ce25c128`:

- `docs/releasing/UNRELEASED.md`
- `docs/roadmap/p17-018-r5c2b-strict-archive-gate-plan.md`
- `package.json`
- `providers/README.md`
- `release/public-release-manifest.json`
- `scripts/build-provider-bundles.test.ts`
- `scripts/build-provider-bundles.ts`
- `scripts/post-17-public-release-r5c2b-plan.test.ts`
- `scripts/public-release-history-contract.test.ts`
- `scripts/public-source-readiness-contract.ts`
- `scripts/public-source-readiness-docs.test.ts`
- `scripts/release-archive-contract.test.ts`
- `scripts/release-archive-contract.ts`
- `scripts/release-archive-node.test.ts`
- `scripts/release-archive-node.ts`

Any predecessor repair must be reported, added ordinally, rebound to a new path-manifest digest, and
requalified from its affected gate. Do not silently expand the manifest or weaken a stale assertion.

The evidence-stage path manifest is exactly two ordinal paths with LF-final SHA-256
`d6d36eaf143ee0b56552abd73e9b916fc655d9e405a4fa5a8f115cde3fc2f003`:

- `docs/evidence/post-17-public-release-r5c2b-strict-archive-gate-2026-08-19.md`
- `release/public-release-manifest.json`

## Rollback and stop conditions

- Stop if the parser must trust local headers, extract candidate paths, accept an unsupported ZIP
  feature, or allocate/inflate before its controlling bounds are proved.
- Stop if a current archive violates a locked A1 invariant. Report the exact producer/parser conflict
  and change the writer only through a reviewed scope correction; do not weaken the gate silently.
- Stop if final admission duplicates or diverges from R5C1 license/secret rules or R5C2A SBOM rules.
- Stop if a provider binary requires a silent text-scan bypass, a new dependency, or an unreviewed
  license/notice authority.
- Stop if admission can touch an existing release before validation completes, if rollback cannot
  restore it, or if any failed path leaves stage/rollback/promoted residue.
- Stop if source, checksum, manifest, archive, sidecar, or expanded-directory identity drifts between
  capture and promotion.
- Stop if R5C2B would claim clean-clone qualification, release-candidate approval, signing,
  publication, marketplace/package availability, provider endorsement, sync, or visibility.
- Roll back with one feature-branch revert or the verified 2026-08-19 kit snapshot/tag. Never sync or
  edit a target `.Codex/` tree as a rollback mechanism.

## Deferred beyond R5C2B

R5D owns clean-clone Windows and Linux qualification, isolated installs and double builds, extracted
runtime smokes from committed clones, provider quickstart/browser proof, and the final supported-OS
qualification receipt.

Release-candidate/version selection, dashboard release routing, sanitized public-repository review,
provenance/attestation signing, tags, GitHub Release, npm/pnpm/marketplace/plugin publication,
repository visibility, sync, and target installation remain later separately gated work.
