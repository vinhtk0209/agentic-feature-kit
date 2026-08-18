# Measurement Layer v1 — b11-runner exit-gate honesty + version bootstrap (design)

> ⚠️ **SUPERSEDED-OR-SHIPPED (target v3.23) → see tier-b §8 + HANDOFF. Retained for provenance.** Produced 2026-07-12 (session 2).
> Companion to `measurement-layer-v1.md`, `…-b11-wire.md`, `…-content-hash-split.md`. Fixes the
> CRITICAL false-proof found this session: a capture on AssessmentGrading recorded `verified=true`
> while Playwright had failed (`verify_records` `run-1783868360863-827b5cdd`). Covers **Y.1** (the
> exit-gate defect — the actual proof engine), **Y.2** (version bootstrap), **Y.3** (phase audit).
> Lessons: L-2026-07-12-005/006/007. **Y.1 is a sync-unblock critical-path blocker — no valid v3.x
> verified row is trustworthy until it lands.**

All `file:line` citations are literal, read this session.

---

## 0. Grounding — the proven false row and the three defects

Landed row (read-only query): `runner_run_id=run-1783868360863-827b5cdd`, `repo=example-authoring-app`,
`feature=AssessmentGrading`, `verified=true`, `tier_a_exit=0`, **`tier_b_exit=0`**, `kit_version=3.18.0`
— while the same run's b11-runner block reported `b11_b="fail"` (Playwright 0/1 routes).

- **Y.1** — `b11-runner.ts:441` `gatesPass = b11_a === 'pass' && coverageErrors === 0` (Playwright
  `b11_b` excluded; `:439-440` says so explicitly) → `:442` `process.exit(gatesPass ? 0 : 1)`. So a
  Playwright-failing run exits 0. `record-verify.ts:354-362` (`runExit` → `spawnSync().status`) reads
  that 0 honestly → `computeVerified(0,0)=true` (`:100`). **The read is correct; b11-runner emits a
  dishonest exit code.**
- **Y.2** — `record-verify.ts:159-169` `resolveKitVersion` reads the TARGET's
  `.claude/commands/feature-from-confluence.md` `PROMPT_VERSION`; authoring's copy is Jul-3 stale v3.18
  (command file never synced — only `record-verify.ts`+`pre-commit-target.ts` were). Row tagged 3.18.0.
- **Y.3** — `record-verify.ts:365` `phase: opts.phase ?? 'verify_complete'` → `:309` written verbatim.
  Literal, not computed. **Zero consumers** read `VerifyNote.phase` (the `ctx.phase` reads in
  `feature-digest.ts:101` / `feature-index.ts:83` are the context-summary's phase, a different field;
  `pre-commit-target.ts` reads `verified`/`code_path`/`spec_name`/`content_hash`, never `phase`).

---

## 1. Fix Y.1 — b11-runner must gate its exit on `b11_b` (the critical fix)

### The change (exact)
`b11-runner.ts:441`:
```
-  const gatesPass = b11_a === 'pass' && coverageErrors === 0;
+  const gatesPass = b11_a === 'pass' && coverageErrors === 0 && b11_b !== 'fail';
```
`b11_b` is one of `'pass' | 'fail' | 'skip'` (`:385-394`). Only `'fail'` gates; **`'skip'` stays
valid** (a Tier-B-less / opt-out feature legitimately has no Playwright — its `tier_b_exit` is `null`
via `record-verify.ts:361-362`, and `computeVerified` treats `null` as non-failing, `:100`). Update
the `:439-440` comment, which currently *documents the bug* ("reported in the JSON but does not gate
the exit code").

### Testability — extract the gate into a pure function (no `b11-runner.test.ts` exists today)
b11-runner runs real Playwright, so the exit decision must be unit-testable without it. Extract:
```
export function computeGatesPass(b11_a: 'pass'|'fail', coverageErrors: number, b11_b: 'pass'|'fail'|'skip'): boolean
```
and have `:441` call it. New `b11-runner.test.ts` (add to `test:kit`) — **attack tests**:
- `computeGatesPass('pass', 0, 'fail') === false` → the false-proof case; MUST be false.
- `computeGatesPass('pass', 0, 'skip') === true` → Tier-B-less stays valid.
- `computeGatesPass('pass', 0, 'pass') === true`; `computeGatesPass('fail', 0, 'pass') === false`;
  `computeGatesPass('pass', 1, 'pass') === false` (coverage still gates).
- An end-to-end assertion (mock `routeResults` with a `passed:false`) that `b11_b` resolves to
  `'fail'` (`:392`) so the wired `gatesPass` is false → the process would `exit(1)`.

### §5 re-prove + target reach
After the fix, re-run `record-verify.test.ts` §5(a/b/c): a Tier-B-failing capture must now yield
`tier_b_exit=1 → verified=false` (add that case). **`b11-runner.ts` must reach BOTH targets
byte-identical** (it already lives in each target's `.claude/integrations/` — it's the `--tierB-cmd`
runner). sha256 parity kit↔targets after copy, same pattern as record-verify.ts this session.

---

## 2. Fix Y.2 — bootstrap the target to the version it actually runs (sync the command file; NOT `--kit-version`)

### The correct framing
`resolveKitVersion` is **not** wrong — it honestly reports the version the TARGET actually runs (the
target's own command-file stamp). The defect is that the target was never updated to the kit version
whose code it's running: this session hand-copied the integration `.ts` files but not
`commands/feature-from-confluence.md` (sync is blocked). So the target runs v3.22 `record-verify.ts`
against a v3.18 command file — an inconsistent install. **Fix the install, not the reader.**

**Rejected: adding `--kit-version` to `capture`.** `record` has it for a deliberate offline/CI use,
but letting `capture` accept a version = a model-supplied value crossing the trust boundary — the
exact self-report hole the layer closes. `capture` must DERIVE the version from the installed target,
never accept it.

### File trace — everything that must reach the target for a correct-version, honest capture
| File | Why it must reach the target | Reaches how |
|------|------------------------------|-------------|
| `commands/feature-from-confluence.md` | carries `PROMPT_VERSION` that `resolveKitVersion` reads (Y.2 root) | in `syncPaths` (`sync.config.json:4` `commands/`) — currently STALE in targets |
| `integrations/b11-runner.ts` | the Y.1-fixed Tier-B runner whose exit now gates on `b11_b` | in `syncPaths` (`integrations/`) |
| `integrations/record-verify.ts` | v3.22 split writer (already copied this session) | already parity ✅ |
| `integrations/pre-commit-target.ts` | v3.22 hook (already copied) | already parity ✅ |
| `integrations/lint-feature.ts` | Tier A gate (unchanged) | already parity ✅ |

**Because `npm run sync` is fail-closed** (that's the whole point), the bootstrap copy is manual +
sha256-verified, exactly like this session: for each of `feature-from-confluence.md` and (post-Y.1)
`b11-runner.ts`, copy kit→target, then assert `sha256sum` identical BEFORE trusting a capture; learning
commits on its feature branch, authoring on-disk only (staged work untouched). Only after the target's
command file reads the new version (v3.23) will a capture tag `kit_version=3.23.0` and match the guard.

### Consequence for the bootstrap order
Bump kit → **v3.23** (Y.1 + Y.2 fixes) → sync `feature-from-confluence.md` + `b11-runner.ts` to targets
(sha256 parity) → THEN a real capture on a genuinely-verified feature produces the first honest,
correctly-tagged `verified=true` row → guard for 3.23.0 flips → sync unblocks.

---

## 3. Fix Y.3 — `phase` audit (cosmetic; no consumer trusts it)

Confirmed: `VerifyNote.phase` has **zero** downstream readers (§0). Decision options:
- **(a) Document-only (recommended):** annotate `phase` as a cosmetic label in `record-verify.ts` and
  move on — it is never read, so deriving it buys nothing and risks churn.
- (b) Derive from `verified` (e.g. `verified ? 'verify_complete' : 'verify_failed'`) only if trivial;
  but this invents a new enum value and still nobody reads it — not worth the risk.

Recommend (a). No behavior change; the value stays honest because nothing depends on it.

---

## 4. Ordering, version, and the new critical path

1. **Action 0 (user, done outside this doc):** delete the false row in the Supabase SQL editor
   (`DELETE FROM verify_records WHERE runner_run_id='run-1783868360863-827b5cdd';`) — anon has no
   delete policy (0003), so it requires service-role/SQL editor. Keep the US-AD-095 `verified=false`
   row (honest).
2. **Y.1** (b11-runner exit gate) — highest priority; the proof engine. Extract `computeGatesPass`,
   fix `:441`, new `b11-runner.test.ts`, re-prove §5.
3. **Y.2** (version bootstrap) — same or immediately after: bump v3.23, sync command file + b11-runner
   to targets (sha256 parity), no `--kit-version`.
4. **Y.3** — document-only.
5. Only THEN is a trustworthy v3.23 capture possible → the resumed Block 5.

**New critical-path statement:** "run a clean B11" is no longer the blocker — **Y.1 + Y.2 are**. Until
both land, every capture either false-proves (Y.1) or mis-tags the version (Y.2), so no valid v3.23
`verified=true` row can exist.

---

## 5. Open decisions for review (this is the STOP)

1. **Y.1 gate:** `b11_b !== 'fail'` (recommended) — confirm `'skip'` must stay valid (Tier-B-less
   features). Any case where a `'fail'` should NOT gate? (design says no.)
2. **Y.2 target reach:** manual sha256-verified copy of `feature-from-confluence.md` + `b11-runner.ts`
   (recommended, mirrors this session) vs. waiting for the first sync. Confirm authoring stays on-disk.
3. **Y.3:** document-only (recommended) vs. derive from `verified`.
4. **Version:** bump to v3.23 for Y.1+Y.2 (recommended) — confirm.

**No code written. Awaiting review before the v3.23 implementation session. Backup applies when
implementation starts. design-to-ui untouched. No sync.**
