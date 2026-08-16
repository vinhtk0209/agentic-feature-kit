# P17-016 Wave C4A Verification Sink Plan Evidence

**Date:** 2026-08-16
**Scope:** plan-only input lock for the first tenant-scoped central writer family
**Source commit:** `69b2a63493156ff004ecbf223a1d89e41bcff9c5`
**Source parent:** `a34a8b89225e5494728a0dde29894cd9a6274c55`
**Input lock:** `family=V1, storage=T1, boundary=B1, attestation=A1, retention=R1, idempotency=I1, cutover=C1, rollback=K1, evidence=E1`

## Outcome

C4A locks `verification` as the only first central family. The choice is evidence-based: B2B
already established the exact verification allowlist, caller-owned command UUID, retained local
git-note proof, dedicated fail-closed adapter, and explicit V1 operator scope. No UI, arbitrary
content, or bulk registry transition is required.

The plan defines four separately evidenced slices: C4A plan/input lock, C4B typed dashboard
storage and sink, C4C kit verification capability path, and C4D disposable cross-repository proof.
The production call remains blocked until C5 applies the live foundation/storage migrations and
proves tenant bootstrap, credentials, grants, keys, route authorization, and cutover.

## Reconciled starting truth

The canonical privacy policy contains eight central families. Current registries contain 22
dashboard and seven kit entries. Read-only source checks prove:

- no `0019_p17_016_verification_sink.sql` migration;
- no `privacy_verification_records` table;
- no `p17_016_persist_verification` RPC;
- no dashboard runtime attestation issue/verify composition;
- no dashboard runtime `CentralWriterSinkCapability`; and
- the kit verification call site uses only `createBlockedVerificationReceipt`.

Positive controls used the existing C3 tenant RPCs and B2B blocked adapter before accepting these
negative findings. No CodeGraph index exists in either repository, so exact source and fixed-string
inventories were used.

## Locked architecture

The dashboard remains the sole SQL ledger owner. C4B is limited to one typed per-family table and
one service-role-only, tenant-requiring security-definer RPC. The table has no JSON/JSONB, generic
payload, raw repository/feature/path/spec, message, prompt, log, URL, token, or secret field. RLS
is enabled and forced, application roles receive no direct table privilege, and no browser policy
or arbitrary RPC surface exists.

The dashboard transport is injected and server-only. It exposes one exact RPC name, validates
exact requests and receipts, collapses provider failures, and never exports the raw client. Kit,
browser, and worker code never receive a service-role client or credential. No HTTP route is part
of C4.

Attestation HMAC, nonce, and repository-opaque HMAC adapters use distinct injected versioned keys,
constant-time verification, and no env/file/global fallback. The runtime key/enrollment source is
deliberately not claimed ready. The trusted server must verify the attestation, consume the nonce,
recheck membership or worker binding, and resolve a current same-tenant
`essential_operations/verification_record` grant before constructing the sink capability.

Verification retention is exactly 30 days from core-computed `recordedAt`. The RPC rejects expiry
extension, future or already expired records, and rechecks credential/grant state at storage time.
Wave D remains the only owner of expiry purge and tenant deletion.

The exact idempotency key is `(tenant_id, writer_id, run_id)`. Same-key/same-hash retry returns the
original persistence identity and time with `replayed=true`; same-key/different-hash retry refuses
without update. Concurrent retries leave one row. The same run UUID may exist independently in two
tenants.

## Exact source manifest

The authoritative parent diff contains exactly three files, 381 insertions, and one deletion:

- `docs/roadmap/p17-016-wave-c4-verification-sink-plan.md`;
- `scripts/post-17-privacy-wave-c4-verification-sink-plan.test.ts`; and
- `package.json`.

The commit is local on `main`. The normal `spec-integrity` hook passed. Package parsing, cached and
parent whitespace, exact manifest/stat, branch, parent, and clean-worktree readbacks pass. No
dashboard, generated core, runtime writer, migration, target, or `.Codex` path is in the source
commit.

## RED and correction evidence

The first executable plan run exited nonzero only because the rollback paragraph used a pronoun
instead of the exact normative sentence `rollback refuses when the verification table is
non-empty`. The second run passed that boundary and stopped only because the non-claim did not
contain the exact phrase `no live SQL`. Both corrections changed wording only; no behavior,
runtime, SQL, or scope was added.

The final validator reports:

`P17-016 Wave C4 verification sink plan: PASS (V1/T1/B1/A1/R1/I1/C1/K1/E1 locked)`

## Focused and security evidence

The focused aggregate passes:

- C1, C2, C3, C3D, and the new C4A plan validators;
- B2B verification adapter/integration/historical suites at 8/8, 6/6, and 28/28;
- writer registry at seven entries, six source files, and eight attacks;
- privacy policy at eight families, ten contract groups, and 15 attack groups;
- tenant attestation at four contracts and eight attack groups; and
- privacy writer at four contract groups, seven attack groups, and eight families.

Eight positive-controlled staged detectors find zero GitHub-token, Supabase-key assignment,
Bearer, private-key, JWT, attestation-key assignment, long-base64, or live-project-reference hits.
The executable validator contains zero client-construction, fetch, environment, service-key, or raw
REST capability tokens.

## Exact-SHA full regression

The source-candidate full kit exits `0` in 229.9 seconds with 1,619 captured lines. The
authoritative rerun at exact source SHA `69b2a63493156ff004ecbf223a1d89e41bcff9c5` exits `0` in
231.9 seconds with the same 1,619-line count. The C4A gate runs in-chain, v3.25 version stamps and
the 163,206/176,128-byte prompt budget pass, and lesson sync is 60/60.

## Non-claims

C4A does not create or claim a central sink, capability-ready verification writer, migration,
table, RPC, route, deployed key ring, tenant, membership, grant, credential binding, nonce,
central row, live tenant safety, or migrated sync guard. It does not complete C4, Wave C, or
P17-016. No dashboard source change, live SQL, application-row access, browser/provider execution,
deploy, sync, push, merge, target command, or target `.Codex` edit occurred.
