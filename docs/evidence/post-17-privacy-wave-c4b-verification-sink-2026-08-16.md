# P17-016 Wave C4B Verification Sink Evidence

**Date:** 2026-08-16
**Kit source commit:** `f7c477824cd13fa09c380b79face138c8cbc79c4`
**Kit source parent:** `3f5c5930561f6c2be85503903ecfc3ac705c57fd`
**Dashboard peer source commit:** `3e6c387ea7f570b44c32044c99e48a7ce4c72d5e`
**Input lock:** `family=V1, storage=T1, boundary=B1, attestation=A1, retention=R1, idempotency=I1, cutover=C1, rollback=K1, evidence=E1`

## Result

Wave C4B is complete locally as an offline verification-family storage and injected RPC contract.
The dashboard owns the typed migration, rollback, synthetic cryptographic ports, exact sink
capability, and runtime/static tests. The kit change extends only the shared writer-registry schema
and its executable validator so target Wave `C4` is a closed canonical value.

The new dashboard registry entry remains `contract_validated` and `migration_blocked`. The B2B kit
verification writer remains blocked and is not relabeled by association.

## Exact kit source manifest

The kit source commit contains exactly two files and reports 2 insertions and 2 deletions:

- `docs/schemas/privacy-writer-registry.schema.json`; and
- `scripts/post-17-kit-writer-registry.test.ts`.

The normal commit hook passed `spec-integrity`. No command, integration, generated core, migration,
runtime writer, target, or `.Codex` file changed in the kit source commit.

## Cross-repository contract evidence

The kit registry validator accepts the sorted dashboard registry with 7 entries across 6 source
files and retains all 8 mutation attacks. It validates the new exact RPC adapter as target Wave
`C4` without accepting an unknown wave, transport, family, privacy state, disposition, path,
anchor, prohibited-field value, or unsorted/duplicate entry.

The dashboard peer source at `3e6c387ea7f570b44c32044c99e48a7ce4c72d5e` proves:

- one typed tenant-scoped verification table and one service-role-only RPC;
- exact 30-day retention and tenant/writer/run idempotency;
- fail-closed non-empty/drift-aware rollback;
- separated versioned HMAC/nonce/opaque-identifier adapters;
- an injected exact RPC sink with per-write grant re-evaluation; and
- static/runtime attacks for key reuse, stale authority, provider leakage, multidimensional arrays,
  overload collision, privilege drift, and raw repository transmission.

## Test results

- Kit focused companions passed B2A, B4A, C1, C2, C3A-C3D, C4A, verifier-consumer,
  service-role-denial, disposable-contract, writer-registry, privacy-policy, tenant-attestation,
  and privacy-writer gates.
- Registry result: 7 entries, 6 source files, 8 attacks.
- Dashboard focused C4B plus registry: 2 files, 12 tests passed.
- Dashboard predecessor aggregate: 10 files, 56 tests passed.
- Exact-dashboard full suite: 85 files, 550 tests passed in 7.89 seconds.
- Exact-kit full suite at `f7c477824cd13fa09c380b79face138c8cbc79c4`: exit `0` in 227.2
  seconds with 1,619 output lines.
- Version stamps remain v3.25, prompt budget is `163,206/176,128` bytes, and lesson sync is 60/60.

## Review and environment evidence

Exact source manifests, cached whitespace, JSON parsing, positive-controlled credential/live-project
scans, production fallback denials, and the positive-controlled top-level SQL-DML scan passed. The
dashboard user-owned `.claude/settings.local.json` remained untracked and unstaged.

A generic `pnpm run` probe was rejected after it moved nine npm-managed dependency leaves into
`node_modules/.ignored` and attempted blocked registry access. All nine exact target-absent leaves
were restored with native PowerShell, their versions were verified, and `.ignored` contains zero
files. No install, deletion, junction, source rollback, or network retry was used.

## Non-claims

C4B does not apply migration `0018` or `0019`, execute the new SQL on PostgreSQL, create tenant or
key material, wire the kit verification call site, or claim live/capability-ready status. C4C owns
the kit capability path and C4D owns disposable cross-repository execution proof. No live SQL,
Supabase mutation, sync, push, merge, target `.Codex` edit, or direct target change occurred.
