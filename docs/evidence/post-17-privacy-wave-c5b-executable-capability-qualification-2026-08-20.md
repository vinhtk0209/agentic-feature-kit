# P17-016 Wave C5B Executable Capability Qualification Evidence

**Date:** 2026-08-20
**Scope:** Local executable-byte, provenance-receipt, version, and freshness qualification only
**Roadmap task:** P17-016
**Source commit:** `a4f21cc68abf06129121f2e4f6835b54099f83eb`
**Source parent:** `f86f27f51c7b0dc4591b676d4f65a9b9bc75cf3d`
**Qualified source tree:** `a12e1f7e530a4581ad45207a5c7ab89588b86990`
**Decision lock:** `qualification=A1`, `bytes=B1`, `versions=V1`, `paths=P1`, `probes=E1`, `freshness=F1`, `integration=I1`, `result=M1`, `runtime=T1`

## Outcome

The C5B executable-capability qualification slice is source-qualified. It closes the local gap that
previously allowed the logical-backup adapter to accept absolute `pg_dump`, `pg_restore`, and `age`
paths without proving exact executable bytes, approved provenance-receipt bytes, accepted versions,
or freshness immediately before use.

The implementation now requires a short-lived, module-branded capability. Qualification hashes each
canonical regular executable and its externally verified provenance receipt, executes only a bounded
`--version` probe, rehashes both files, and returns metadata only. The logical-backup adapter binds
the capability to its exact three executable paths at construction and revalidates file identity,
hashes, receipt hashes, and time before both backup and restore ports. A forged, stale, replaced,
deleted, relinked, or cross-configuration capability performs zero pipeline calls.

This result does not authorize or perform live C5B. No provider, database, project, backup, restore,
writer-freeze, cleanup, migration, sync, target, release, publication, or visibility action occurred.

## Architecture and testing influence

The architecture review preserved Clean Architecture dependency direction:

1. the provider-neutral C5B core and operator contracts remain unchanged;
2. the new Node module owns only local filesystem, hash, clock, and single-process probe concerns;
3. the logical-backup adapter depends on an opaque qualification capability, not on package-manager,
   network, provider, database, or secret discovery; and
4. generated provider surfaces are produced from the canonical shared core and remain byte-identical.

TypeScript and Node remain selected. No measured latency, throughput, memory, security, or capability
threshold justified Rust, Go, Python, FFI, a native add-on, or a sidecar. The operator path hashes a
small, bounded set of local files and is not a high-frequency data plane. Adding another runtime
would increase release, cross-platform, and supply-chain surfaces without measured benefit.

The pre-commit security/correctness review found no critical issue after hardening. It required three
bounded corrections before approval: zero-byte executable and receipt refusal, module-brand lookup
before caller-path inspection, and no timeout arming after synchronous child completion. Direct
attacks cover the first correction; strict and full qualification cover all three.

## Contract implemented

### Exact bytes and provenance binding

- Three explicit expectations bind absolute executable paths to exact SHA-256 values.
- Each tool also binds an absolute, externally verified provenance receipt to its exact SHA-256.
- The module does not claim to verify a vendor signature, code-signing chain, package registry, or
  Sigsum proof; the external authority owns authenticity, while this module proves local byte parity.
- Executable and receipt reads are size-bounded, non-empty, and repeated before and after probes.
- Canonical path, regular-file, symlink/reparse, duplicate identity, executable/receipt collision,
  size, identity, and hash checks fail closed.

### Strict non-mutating probes

- Probe order is exactly `pg_dump`, `pg_restore`, then `age`.
- Argv is exactly `['--version']`; every child uses `shell:false`, an absolute executable, a canonical
  parent working directory, hidden Windows UI, bounded output, and a bounded timeout.
- Child environments are rebuilt from a small allowlist. Database, service-role, proxy, path, home,
  and profile variables are not inherited. The Windows `taskkill` helper receives the same sanitized
  environment.
- `pg_dump` and `pg_restore` must identify their correct tool role and report the same exact approved
  PostgreSQL release. `age` must report the exact approved stable semantic version.
- Non-zero exit, signal, timeout, output cap, stderr, multi-line/control output, spawn failure, and
  cleanup error collapse to `executable_qualification_invalid` without raw detail.

### Fresh unforgeable capability

- A module-local `WeakMap` brands the deeply frozen capability and retains canonical internal state.
- Public metadata contains only policy/schema versions, qualification/expiry instants, closed tool
  roles, normalized versions, executable hashes, and provenance-receipt hashes.
- A clone or structurally similar object is refused.
- Time rollback, expiry, wrong path binding, post-qualification replacement, deletion, relink, size
  drift, identity drift, and digest drift refuse currentness.
- Both parent ports return their existing closed reason and perform zero pipeline calls when the
  capability is invalid.

## RED evidence

1. The registered plan validator first exited `1` with exactly one gap:
   `C5B executable-capability qualification plan`.
2. After the plan passed, the complete runtime suite exited `1` with exact `MODULE_NOT_FOUND` for
   `../src/live-cutover-executable-qualification-node`.
3. The first implementation run reached `8/9`; the remaining failure was initially a test helper
   hashing a receipt after deleting it. Capturing configuration before deletion exposed the intended
   qualifier boundary.
4. The first path-alias construction used `path.join`, which normalized away `..`. The corrected
   literal alias reached the boundary and proved the textual resolved-path guard.
5. The first strict TypeScript invocation omitted the established `--esModuleInterop` profile and
   produced only import-profile diagnostics across old and new files. The corrected TypeScript 5.9.3
   invocation retained `strict`, `skipLibCheck=false`, and reported zero diagnostics.
6. Exact staging detected four Markdown hard-break trailing spaces in the new plan. Removing only
   those spaces returned cached diff-check to GREEN before any commit.

No invalid harness run is counted as product qualification.

## GREEN evidence

### Focused and integration

- Executable qualification: `9/9` grouped checks passed.
- Logical-backup parent: `10` grouped checks passed, including forged/stale zero-pipeline behavior.
- C5B preflight core: `9` tests passed.
- C5B operator application: `9` tests passed.
- C5A plan and executable-capability plan validators passed every locked decision and nonclaim.
- TypeScript 5.9.3 strict/no-emit with `skipLibCheck=false`: zero diagnostics.

### Generation, providers, and roadmap

- Synced-core attacks: `4` assertions passed.
- Synced-core parity: `10` byte-identical files.
- Canonical roadmap: `22` tasks and `4` initiatives.
- Provider bundles: `3` providers, `2` byte-identical skills, and `5` shared runtimes.
- Provider distribution: `3` deterministic archives, `71` entries, `8` sidecars, `11` checksums,
  `79` text scans, `15` runtime smokes, and `4` attacks.
- Public readiness contract: one canonical case plus `40` attacks passed.

### Exact Git-index public qualification

On the exact 12-path source index:

- public release contract: `18` tests passed;
- Markdown links: `204` Markdown files and `48/48` valid relative links;
- dependency policy: `4` lockfiles, `754` occurrences, and `617` unique dependencies;
- secret scan: `680` text files, `10` detector families, and zero findings;
- public Git-index Node adapter: `7/7` tests passed; and
- final status: `eligible-for-r5c2` at `683` manifest paths with zero issues.

### Complete native kit

The first complete native source-tree run exited `0` in `361.0` seconds with `2,265` output lines.
After code-review hardening and exact-index public requalification, the final complete source-tree run
exited `0` in `363.7` seconds with `2,265` output lines. Both runs retained:

- package and prompt version `v3.25`;
- prompt size `163,206` bytes within budget; and
- lesson registry parity `60/60`.

Only the known malformed lesson-fixture normalization warnings appeared; all registered gates passed.

## Exact source manifest

The source commit contains exactly 12 paths:

- `.claude/integrations/core/live-cutover-executable-qualification-node.ts`;
- `.claude/integrations/core/live-cutover-logical-backup-node.ts`;
- `docs/roadmap/p17-016-wave-c5b-executable-capability-qualification-plan.md`;
- `package.json`;
- `packages/core/src/live-cutover-executable-qualification-node.ts`;
- `packages/core/src/live-cutover-logical-backup-node.ts`;
- `packages/core/test/live-cutover-executable-qualification-node.test.ts`;
- `packages/core/test/live-cutover-logical-backup-node.test.ts`;
- `release/public-release-manifest.json`;
- `scripts/build-synced-core.ts`;
- `scripts/post-17-privacy-wave-c5b-executable-capability-plan.test.ts`; and
- `scripts/post-17-privacy-wave-c5b-logical-backup-adapter-plan.test.ts`.

The final canonical and generated qualification modules are byte-identical with SHA-256
`c95130691e54586f3d1df4b7087a90e34ecb42944a090d6a04fd48584999ec50`. The source commit/tree
identities above remain the immutable final authority.

## Rollback

Source rollback reverts exact source commit `a4f21cc68abf06129121f2e4f6835b54099f83eb` and reruns the
canonical synced-core builder from the reverted source. No broad reset, recursive workspace deletion,
target edit, or worktree junction is required. Today's verified workspace backup and tag remain the
disaster-recovery boundary.

The adapter has no live rollback in this slice because it reached no live capability. Test cleanup
removed only exact temporary directories created under the canonical system temp root.

## Remaining external boundary and nonclaims

Live C5B still requires a concrete named project, writer-freeze window, provider recovery point,
protected destination, source and isolated database service capabilities, recipient and identity
references, isolated lifecycle and cleanup authority, restored-state verifier, project/catalog/ACL
capabilities, trusted clock, approved executable/provenance expectations, live PostgreSQL/archive
compatibility, and metadata-only evidence sink.

This evidence does not claim vendor or supply-chain authenticity, production executable availability,
live server compatibility, project match, writer freeze, provider snapshot, live backup, isolated
live restore, database read/write, route enablement, legacy cutover, sync eligibility, live C5B
completion, Wave C completion, or P17-016 completion.
