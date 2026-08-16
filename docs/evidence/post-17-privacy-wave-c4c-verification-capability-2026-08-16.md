# P17-016 Wave C4C Verification Capability Evidence

**Date:** 2026-08-16
**Kit source commit:** `0549dba8f495f55ae8d51ee0dbd352c9295309f3`
**Kit source parent:** `64ac6dfad461e2001ad0560076eafae182ceef0a`
**C4 input lock:** `family=V1, storage=T1, boundary=B1, attestation=A1, retention=R1, idempotency=I1, cutover=C1, rollback=K1, evidence=E1`

## Result

Wave C4C is complete locally as an explicit, injected verification-writer capability path. The
new adapter projects only the verification allowlist into the canonical privacy writer core and
requires the caller to supply tenant context, an active `verification_record` grant, a clock,
an opaque-identifier port, and a sink capability.

The existing `record-verify` CLI remains fail-closed by default. Its two command branches still
emit the exact B2B blocked receipt and never discover a sink, tenant, grant, or provider from the
environment. The explicit bridge is exported for a later trusted server-side composition root;
it is not called implicitly.

## Exact source manifest

Source commit `0549dba8f495f55ae8d51ee0dbd352c9295309f3` contains exactly four files and reports
483 insertions and 1 deletion:

- `.claude/integrations/record-verify.ts`;
- `.claude/integrations/verification-writer-capability.ts`;
- `.claude/integrations/verification-writer-capability.test.ts`; and
- `package.json`.

The normal commit hook passed `spec-integrity`. No dashboard, registry-state, generated core,
migration, command prompt, target, or target `.Codex` file changed in the source commit.

## Boundary and attack evidence

The standalone readiness test first failed only on the four absent artifacts: capability source,
explicit bridge, focused package script, and aggregate registration. After implementation, review
found and closed three additional boundaries:

- an exact `verification_record` purpose check now runs before opaque or sink I/O;
- the sink remains `unknown` until canonical core validation, and every tier-exit member must be
  numeric before the adapter narrows the envelope; and
- malformed runtime bridge callers collapse to the canonical `invalid_writer_request` result
  instead of throwing before the fail-closed adapter.

Focused attacks also cover unknown and inherited fields, invalid and non-numeric tier exits,
wrong-tenant capabilities, purpose mismatch, sink exceptions, forged receipts, raw local-field
leakage, and prohibited environment/filesystem/process/network/provider dependencies.

## Test results

- Focused verification capability: 9/9 passed.
- Complete verification chain: adapter 8/8, capability 9/9, B2B 6/6, and record verifier 28/28.
- Privacy policy: 8 families, 10 contract groups, and 15 attack groups passed.
- Privacy writer: 4 contract groups, 7 attack groups, and 8 families passed.
- C4 execution-plan lock passed.
- Writer registry: 7 entries, 6 source files, and 8 attacks passed.
- Synced-core transactional tests: 4 assertions passed; all 5 generated mirrors are byte-identical.
- Strict TypeScript 5.9 passed in NodeNext mode with `skipLibCheck=false` for the capability,
  focused test, and `record-verify` bridge.
- Exact-SHA full kit at `0549dba8f495f55ae8d51ee0dbd352c9295309f3`: exit `0` in
  228.57 seconds with 1,633 output lines.
- Version stamps remain v3.25, prompt budget is `163,206/176,128` bytes, and lesson sync is 60/60.

## Review evidence

The staged source manifest, package JSON, cached whitespace, dependency state, and six
positive-controlled credential/live-project detectors passed. Positive-controlled source review
found zero environment, process, provider SDK, fetch, console, or filesystem tokens in the new
capability. `record-verify.ts` retains exactly two default blocked call sites and one explicit
capability bridge. Kit `node_modules/.ignored` contains zero files, and the dashboard user-owned
`.claude/settings.local.json` remained untracked and untouched.

## Non-claims

C4C does not apply or execute SQL, activate the C4B sink, create tenant/grant/key material, add a
server-side composition root, relabel the verification writer registry entry, or claim disposable
PostgreSQL or live Supabase proof. C4D owns the disposable PostgreSQL 17 execution and cutover
evidence. No live SQL, Supabase mutation, sync, push, merge, browser/provider action, target edit,
or target `.Codex` modification occurred.
