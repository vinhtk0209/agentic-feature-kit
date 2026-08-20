# P17-016 Wave C5B Connection-Material Capability Evidence

**Date:** 2026-08-20
**Scope:** Local connection-material qualification and explicit child-process environments only
**Roadmap task:** P17-016
**Source commit:** `3232d2d69770e14228978fe1c402ffcb22f3b064`
**Source parent:** `7f15c086282572046bf60b014b47fa4a46e9793e`
**Qualified source tree:** `001b0fb8b5026c5af78b35a00e73370c724fe825`
**Decision lock:** `qualification=A1`, `files=F1`, `services=S1`, `credentials=C1`, `encryption=E1`, `environment=N1`, `freshness=R1`, `integration=I1`, `result=M1`, `runtime=T1`

## Outcome

The C5B connection-material capability slice is source-qualified. It closes the local boundary that
previously allowed the logical-backup adapter to use named libpq services, pass-file lookup, age
recipient and identity files, and a protected destination while child processes could still inherit
ambient environment redirects.

The implementation now requires one short-lived, module-branded capability bound to exact canonical
service, pass, recipient, and identity files plus the destination directory. Qualification binds
file identities, non-empty bounded bytes, exact SHA-256 digests, permission modes, closed libpq
sections, exact credential tuples, age material syntax, runtime platform, and monotonic expiry. The
logical-backup adapter revalidates that capability before each backup or restore port and supplies
separate sanitized environments to PostgreSQL and age processes. Forged, stale, replaced, relinked,
permission-widened, cross-configuration, or expired capabilities perform zero pipeline calls.

This result does not authorize or perform live C5B. No real project, credential, secret manager,
provider, database, writer freeze, backup, restore, cleanup, migration, sync, target, release,
publication, or visibility operation occurred.

## Architecture and testing influence

The architecture review preserved Clean Architecture dependency direction:

1. provider-neutral preflight and operator contracts remain free of Node filesystem, environment,
   credential, database, and process dependencies;
2. the canonical Node qualification module owns bounded local parsing, hashing, path identity,
   permission, clock, and environment reconstruction only;
3. the logical-backup adapter consumes an opaque capability and metadata-only environments rather
   than reading ambient homes, registries, environment defaults, providers, or secret managers; and
4. generated provider surfaces continue to derive from one canonical shared core and are verified
   byte-identical.

TypeScript and Node remain selected. This path parses and hashes four bounded local text files before
an operator port. No measured latency, throughput, memory, security, or capability threshold
justified Rust, Go, Python, FFI, a native add-on, or a sidecar. A second runtime would enlarge
cross-platform packaging, signing, update, and supply-chain surfaces without a measured benefit.

The security and correctness review required bounded hardening before approval: raw pass/identity
buffers are discarded after parsing; libpq sections and keys are exact; TLS requires
`sslmode=verify-full` with `sslrootcert=system`; declared platform must equal the active runtime;
Windows system-directory variables must equal active runtime values; native-path de-duplication is
platform-correct; POSIX credential and identity modes are explicit currentness state; record
whitespace is exact; and destination identity uses stable object identity rather than child-content
timestamps. Direct attacks cover each correction.

## Contract implemented

### Exact files, services, and credentials

- Four absolute, already-resolved canonical regular files bind service, pass, recipient, and identity
  material to exact SHA-256 expectations and bounded non-zero sizes.
- Files must have distinct native paths and identities, cannot be symlinks or reparse aliases, and
  cannot reside within the protected destination.
- The service file contains exactly two distinct closed-name sections. Each section contains only
  `host`, `port`, `dbname`, `user`, `sslmode`, `sslrootcert`, and `connect_timeout`.
- TLS is exact `verify-full` with the system trust root. Password, passfile, client-key, certificate,
  options, recursive service, environment, and all other libpq keys are refused.
- The pass file contains exactly one non-wildcard five-field tuple for each selected service.
  Password bytes remain only in the file and never enter a capability, environment, receipt, error,
  assertion message, or durable evidence.
- On POSIX, pass and identity files have zero group/other mode bits at qualification and currentness.
  Windows DACL protection remains an external protected-credential capability and is not claimed.

### Age material and explicit environments

- The recipient file contains unique X25519 age recipients with no comments, options, whitespace,
  unsupported families, or injection.
- The identity file contains exactly one X25519 age secret identity, optional comments, and no PEM,
  OpenSSH, public-recipient substitution, unrelated key material, or control characters.
- PostgreSQL roles receive only `LANG=C`, `LC_ALL=C`, exact `PGSERVICEFILE`, exact `PGPASSFILE`, and
  bounded `PGCONNECT_TIMEOUT`.
- Age roles receive only the locale variables. They never receive libpq paths or identity bytes.
- On Windows, non-blank `SystemRoot` and `WINDIR` are admitted only when equal to active runtime
  values. `PATH`, home/profile, password, ambient PostgreSQL, token, Supabase, proxy, loader, and
  arbitrary caller variables are absent.
- Every source and sink spawn receives its explicit environment while retaining absolute qualified
  executables, fixed argv, `shell:false`, bounded timeout/output, and process-tree cleanup.

### Fresh unforgeable capability

- A module-local `WeakMap` brands the deeply frozen public capability by object identity.
- Raw file buffers exist only during bounded parsing and are removed before internal state is stored.
- Internal state retains metadata-only binding, identity, size, mode, digest, destination identity,
  qualified/expiry time, last-observed time, and sanitized frozen environments.
- Public metadata contains only schema/policy versions, counts, binding and destination hashes,
  qualification/expiry instants, and receipt hash.
- Currentness revalidates exact binding, monotonic time, TTL, file identity/size/mode/hash, and
  destination identity. There is no deserialize, refresh, warning-only, or grace path.

## RED and correction evidence

1. The registered plan validator first exited `1` with the sole missing-plan gap. The unchanged
   validator passed after the English decision-locked plan was added.
2. The complete runtime suite then exited `1` at the exact missing canonical connection-material
   module before any implementation existed.
3. The first qualifier implementation reached `6/8`; a `path.join` test normalized away its alias,
   and a static regex mistook RegExp `.exec()` for child-process execution. Test-only corrections
   reached the intended product boundary.
4. Parent integration first reached `6/11`, proving forged capabilities, absent role environments,
   and missing spawn `env`. Two containment cases used the wrong asynchronous fixture root and were
   corrected without changing product behavior.
5. Parent integration reached `10/11` because destination mtime/ctime invalidated restore after the
   adapter's own backup write. Stable destination object identity replaced content timestamps while
   all material-file identities remained strict.
6. A TypeScript 4.9.5 invocation could not parse current Node 24 typings. The established read-only
   TypeScript 5.9.3 profile with `strict`, `esModuleInterop`, and `skipLibCheck=false` produced the
   only valid compiler verdict: zero diagnostics.
7. Manual review found retained raw buffers, extra libpq keys, caller-platform spoofing, arbitrary
   Windows system-root values, and implicit mode currentness. Implementation and direct attacks were
   hardened before staging.
8. The first final hardening rerun reached `6/8` because the Windows test fixture still supplied an
   empty environment source. A fixture-only correction supplied active runtime values; the product
   remained fail-closed and returned to `8/8`.
9. The first post-commit tree verification let PowerShell interpret unquoted `HEAD^{tree}` as an
   encoded-command expression. The quoted literal command proved the exact tree below. No repository
   state changed during the invalid verification attempt.

No invalid harness run is counted as product qualification.

## GREEN evidence

### Focused, compiler, and parent integration

- Connection-material decision plan: all `A1/F1/S1/C1/E1/N1/R1/I1/M1/T1` locks passed.
- Connection-material qualification: `8/8` grouped attack sets passed on Windows.
- Logical-backup parent: `11/11` grouped checks passed, including zero-pipeline forged/stale cases.
- TypeScript 5.9.3 strict/no-emit with `skipLibCheck=false`: zero diagnostics.
- Exact 12-path audit: UTF-8, no BOM, final LF, no trailing whitespace, English-only feature content,
  positive-controlled negative scan, clean diff, and two byte-identical mirror pairs passed.

### Generation, providers, roadmap, and public index

- Synced-core attack harness: `4` assertions passed.
- Synced-core parity: `11` byte-identical files.
- Canonical roadmap: `22` tasks and `4` initiatives.
- Provider bundles: `3` providers, `2` byte-identical skills, and `5` shared runtimes.
- Provider distribution: `71` entries, `8` sidecars, `11` checksums, `79` text scans, `15` runtime
  smokes, and `4` attacks passed.
- Public readiness: one canonical case plus `40` attacks passed.
- Public release contract: `18/18` tests passed.
- Markdown links: `206` Markdown files and `48/48` valid relative links.
- Dependency policy: `4` lockfiles, `754` occurrences, and `617` unique dependencies.
- Secret scan: `686` text files, `10` detector families, and zero findings.
- Public Git-index Node adapter: `7/7` tests passed.
- Candidate status: `eligible-for-r5c2` at `689` manifest paths with zero issues.

### Complete native kit

The unchanged complete native source-tree run exited `0` in `386.5` seconds with `2,284` output
lines. It retained package and prompt version `v3.25`, prompt size `163,206` bytes within budget,
and lesson registry parity `60/60`. Only the known malformed lesson-fixture normalization warnings
appeared; every registered gate passed.

## Exact source manifest

The source commit contains exactly 12 paths:

- `.claude/integrations/core/live-cutover-connection-material-qualification-node.ts`;
- `.claude/integrations/core/live-cutover-logical-backup-node.ts`;
- `docs/roadmap/p17-016-wave-c5b-connection-material-capability-plan.md`;
- `package.json`;
- `packages/core/src/live-cutover-connection-material-qualification-node.ts`;
- `packages/core/src/live-cutover-logical-backup-node.ts`;
- `packages/core/test/live-cutover-connection-material-qualification-node.test.ts`;
- `packages/core/test/live-cutover-logical-backup-node.test.ts`;
- `release/public-release-manifest.json`;
- `scripts/build-synced-core.ts`;
- `scripts/post-17-privacy-wave-c5b-connection-material-capability-plan.test.ts`; and
- `scripts/post-17-privacy-wave-c5b-logical-backup-adapter-plan.test.ts`.

The canonical and generated connection-material modules are byte-identical with SHA-256
`5b4a289cb88c04b81e6fe429b47cea966b5761ca5dbbab8c8b557693202e525f`. The logical-backup canonical
and generated modules are byte-identical with SHA-256
`58f1d924652a86e31a4b336a28e23b218859d18adad52d14d1398739886e2b11`.

## Rollback

Source rollback reverts exact source commit `3232d2d69770e14228978fe1c402ffcb22f3b064` and reruns the
canonical synced-core builder from the reverted source. No broad reset, recursive workspace
deletion, target edit, or worktree junction is required. The verified 2026-08-20 workspace backup
and `backup/2026-08-20` tag remain the disaster-recovery boundary.

The adapter has no live rollback in this slice because it reached no live capability. Test cleanup
removed only exact temporary directories created below the canonical system temp root.

## Remaining external boundary and nonclaims

Live C5B still requires a concrete named project and proof capability, bounded writer-freeze window,
provider recovery point, protected destination, real source and isolated database services,
protected recipient/identity custody, isolated lifecycle and cleanup authority, restored-state
verifier, project/catalog/ACL capabilities, trusted clock, approved executable and provenance
expectations, live PostgreSQL/archive compatibility, and metadata-only evidence sink.

This evidence does not claim Windows DACL proof, key ownership, secret-manager policy, vendor
authenticity, production executable availability, live server compatibility, project match, writer
freeze, provider snapshot, live backup, isolated live restore, database read/write, route enablement,
legacy cutover, sync eligibility, live C5B completion, Wave C completion, or P17-016 completion.
