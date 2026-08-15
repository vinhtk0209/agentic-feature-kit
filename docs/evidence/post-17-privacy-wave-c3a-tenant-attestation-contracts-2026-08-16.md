# P17-016 Wave C3A Tenant Attestation Contracts Evidence

**Date:** 2026-08-16
**Scope:** C3A canonical attestation/repository contracts and shared registry schema only
**Source commit:** `888796266ac88b320c5bd5cf479f6f310ddd9f33`
**Source parent:** `16b660709e826a9feb706f9441864c8c20c8336b`
**Dashboard peer source:** `6309346fb6d7a659e9c5c5bd51e5f06a17626911`

## Outcome

C3A adds the canonical pure tenant-attestation module and attack harness. The module owns the exact
attestation envelope, canonical proof input, bounded issuance/verification sequence, server-session
membership and worker-credential authorization, injected tenant foundation repository/proof/nonce
ports, atomic nonce replay denial, processing-grant resolution, and secret-safe closed results.

The shared writer-registry schema now represents the already-used `identity_control` transport and
the new `C3` target wave. This is a schema-truth correction, not a sink or migration enablement.

## Exact source manifest

The authoritative parent diff contains exactly seven files, 1,342 insertions, and 5 deletions:

- `docs/roadmap/p17-016-wave-c3-tenant-foundation-execution-plan.md`;
- `docs/schemas/privacy-writer-registry.schema.json`;
- `package.json`;
- `packages/core/src/tenant-attestation.ts`;
- `packages/core/test/tenant-attestation.test.ts`;
- `scripts/post-17-kit-writer-registry.test.ts`; and
- `scripts/post-17-privacy-wave-c3-tenant-foundation-execution.test.ts`.

Commit/readback checks proved the exact SHA, parent, file list, stat, parent whitespace, required
`main` branch, and a clean worktree after the source commit.

## RED evidence

The registered C3 execution-plan validator first exited `1` at exactly:

`missing accepted P17-016 Wave C3 tenant-foundation execution plan`

After the plan gate passed, `npm run test:tenant-attestation` exited `1` because
`packages/core/src/tenant-attestation.ts` did not exist. No fallback module, network, database,
browser, provider, sync, target, or live process was used.

## Focused GREEN evidence

`npm run test:tenant-attestation` passes:

- 4 positive contract groups; and
- 8 adversarial groups.

The attacks cover unknown/inherited/missing fields; malformed identifiers, purpose, nonce, and
proof; forged tenant and subject; wrong tenant/policy/key/source/proof; expired/future/overlong
windows; removed membership; revoked/expired credential; nonce replay; missing/denied/expired/
revoked/wrong-purpose/wrong-tenant grants; and repository/proof exceptions containing synthetic
raw secret text.

The proof confirms nonce consumption occurs only after shape, authenticated principal, time,
proof, tenant, binding, membership, and key-version checks. The second use of one attestation is
denied and the repository records exactly one consume.

## Companion and compiler evidence

The following registered gates pass on the source candidate:

- Wave C1 plan: `F1/M1/G1/A1/Q1/S1/X1/R1/E1`;
- Wave C2 design: `I1/O1/D1/F1/Q1/A1/H1/R1/X1/E1`;
- Wave C3 execution plan: C3A/C3B/C3C/C3D;
- privacy policy: 8 families, 10 contract groups, 15 attack groups;
- privacy writer: 8 families, 4 contract groups, 7 attack groups; and
- kit writer registry: 7 entries, 6 source files, 8 attacks.

TypeScript 5.9.3 compiles the exact C3A source/test graph with `strict` and
`skipLibCheck=false`. The repository-pinned TypeScript 4.9.5 command cannot parse the installed
Node 26 FFI declarations; that known toolchain mismatch was not treated as an implementation pass
or hidden by `skipLibCheck`.

## Source and credential gates

Two independent fixed/escaped source matchers first passed 8/8 synthetic controls, then found zero
environment, service-role key, global client, SDK client, table query, fetch, or HTTP transport
tokens in the three canonical/generated production files.

Five credential detectors first passed 5/5 synthetic controls, then found zero GitHub token,
Supabase secret/publishable key, Bearer credential, JWT, or private-key material across the combined
2,344 staged added lines. Cached and parent whitespace checks pass.

## Full regression

`npm run test:kit` exits `0` in 293.8 seconds with 1,599 captured output lines. The full chain
includes the newly registered C3 plan and tenant-attestation tests. Prompt budget is 163,206 of
176,128 bytes and the lesson sync is 60/60.

The peer dashboard candidate passes 81 files and 542 tests in 10.65 seconds after the registry
correction described in its evidence file.

## Corrections retained as evidence

- Plan validation exposed Markdown/case-only phrase mismatches; matching was made formatting-
  tolerant without removing any required contract.
- The first dashboard adapter GREEN treated a `null` nonce result as malformed. Only the two exact
  boolean nonce RPC results were changed so `null` is closed `false`; malformed record responses
  still reject.
- The first full dashboard run reached 80/81 files and 541/542 tests. Writer discovery correctly
  found the nonce-mutating adapter. One `migration_blocked` C3 registry entry and the shared schema
  enum correction resolved the omission without enabling a sink.

## Non-claims

This evidence does not claim that migration `0018` exists or ran, tenant data exists, attestation
keys are configured, an RPC is deployed, a central sink is available, a writer is enabled,
two-tenant database isolation is proven, C3/Wave C/P17-016 is complete, or a disposable/live
database test ran. No sync, push, merge, deploy, provider run, target command, or target `.Codex`
edit occurred.
