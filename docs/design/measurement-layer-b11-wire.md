# Measurement Layer v1 — wiring `record-verify` into B11 (design)

> ⚠️ **SUPERSEDED-OR-SHIPPED (target v3.21) → see tier-b §8 + HANDOFF. Retained for provenance.** Produced 2026-07-12 (sync-unblock session, Block 3).
> Companion to `docs/design/measurement-layer-v1.md`. This is the missing link the 2026-07-12
> HARD PREREQUISITE found: `record-verify.ts` is the single sanctioned `verify_records` writer but
> is **not called anywhere** in `feature-from-confluence.md`, so no `verified=true` row can ever be
> produced and `npm run sync` stays fail-closed forever. This doc decides HOW to wire it. It does
> **not** implement it — implementation is Block 4, gated on user approval of the capture-vs-record
> decision below.

All claims below are grounded in source read this session; `file:line` citations are literal.

---

## 0. Grounding — the current state (verified, not assumed)

- **Zero wire today.** `grep -nE 'record-verify|pushVerifyRecord|Tier A|Tier B|b11-runner|recordVerify'
  .claude/commands/feature-from-confluence.md` → **no matches**. Confirmed this session (re-run, not
  trusted from the 07-12 HANDOFF).
- **No exit code is captured into any variable in B11.** `grep -nE '\$\?|TIERA|TIERB|tierA_exit|
  tier_a|EXIT_CODE' .claude/commands/feature-from-confluence.md` → **none**. The coverage gate
  (`feature-from-confluence.md:2152`) prints "Exit 1 = a gate failed" as prose the model reads
  inline; the value is never stored.
- **`verify_records` is globally empty** — direct Supabase REST query this session: `content-range:
  */0` (0 rows total, 0 `verified=true`). Sync guard `assertVerifiedForSync` is correctly blocking.
- The two real runners that emit exit codes:
  - **Tier A** = `lint-feature.ts src/<feature> … --gate` — `feature-from-confluence.md:2152-2156`;
    "Exit 1 = a gate failed" (`:2159`).
  - **Tier B** = `b11-runner.ts <feature>` — `b11-runner.ts:442` `process.exit(gatesPass ? 0 : 1)`
    (runs playwright-runner per route + scoped types/lint, gates the exit).

---

## 1. `capture` vs `record` — DECISION: **`capture`** (`captureAndRecord`) ⛔ needs user sign-off

`record-verify.ts` exposes two entry points (`record-verify.ts:12-17`, CLI `record-verify.ts:376-421`):

| Path | What it does | Exit codes come from |
|------|--------------|----------------------|
| `record` (`recordVerify`, `record-verify.ts:210`) | Takes already-observed exit ints, computes `verified`, writes the git note | **the caller supplies them** (`--tierA <int> --tierB <int>`) |
| `capture` (`captureAndRecord`, `record-verify.ts:248`) | **Runs** the tier commands via `spawnSync` (`:260`, `:265-267`), observes their real exit codes, then calls `recordVerify` | **the wrapper observes them directly** — "No boolean crosses the boundary; only exit codes do" (`:16-17`) |

### Chosen: `capture`. Reasoning.

The entire load-bearing invariant of the layer is that `verified` is a **pure function of exit codes
the wrapper observed directly**, never a value any caller (least of all the model) hands in
(`record-verify.ts:6-10`, `:76-86`, `computeVerified` at `:84`). `capture` upholds this by
construction: you give it the two *commands*, it runs them, and the only thing that reaches
`recordVerify` is `spawnSync(...).status`.

`record` is rejected because **there is no captured Tier B exit code in existence to reuse**:

1. **Tier B is a subagent narrative, not an exit code.** In B11, Agent B (Playwright UI verification)
   is spawned per `.claude/_content/agent-verify.md` and *returns a report the model reads*
   (`feature-from-confluence.md:2141-2144`, `:2169` "Collect both reports"). It does not leave a
   numeric exit code anywhere. To call `record --tierB <int>` the model would have to **type a number
   it inferred from Agent B's prose** — which is exactly the "model supplies the verdict" hole the
   whole measurement layer exists to close (`record-verify.ts:8-10`). That is disqualifying on its own.
2. **The Tier A coverage-gate exit is observed but not stored** (`grep` proof in §0). `record` would
   also need new plumbing to capture `$?` after `:2156` into a threadable variable.
3. **Making `record` safe costs strictly more than `capture` already does.** To feed `record` real
   (non-model-invented) codes you would have to run a headless Tier B runner that emits an exit code
   (i.e. `b11-runner.ts`, `b11-runner.ts:442`) AND capture the gate `$?` — at which point you have
   done everything `capture` does, minus `capture`'s single-call guarantee that no verdict can be
   forged in between.

### The cost we are accepting, stated plainly

`capture` **re-runs** Tier A (cheap, seconds) and Tier B (Playwright — expensive) once more, *after*
Agent B already ran Playwright narratively in B11. So B11 pays for **one extra headless Playwright
pass**. This is the deliberate price of an authoritative, un-forgeable verdict that can unblock sync.
Tier B may be legitimately skipped (`--tierB-cmd` omitted → `tierB_exit = null`,
`record-verify.ts:266-267`, `computeVerified` treats `null` as non-failing, `:85`) for
opted-out/visual-N/A features — the SYNC backstop, not this writer, decides whether a `null` Tier B
is acceptable for a given feature (`record-verify.ts:80-82`).

> **This §1 decision is the STOP gate.** If you prefer `record` (accepting the plumbing + the
> narrower trust boundary), say so and I will redesign Block 4 around capturing real exit codes into
> B11 variables + a real Tier B runner. Default recommendation: **`capture`**.

---

## 2. Exact insertion point in B11 "After agents return"

Insert as a **new numbered step immediately after step 4** (the `memory.ts save verify_complete`
narrative bookkeeping) and **before** the B12 boundary — i.e. between
`feature-from-confluence.md:2176` and the BE-PENDING step at `:2177`, or as a new `### … verify
record` subsection right before `## B12 — Done` (`:2213`). Rationale for placement:

- It must be **after** the coverage gate (`:2147-2165`) and both agents have returned (`:2167`), so
  the feature code on disk is final — `capture` hashes the *current* bytes (`computeContentHash`,
  `record-verify.ts:167-203`) and re-runs the gates against them.
- It must be **before B12** because B12 is "Done" and the whole point is that B11 cannot be reported
  complete without a written verify record (see §5). B12 is only reached when the coverage gate
  passed anyway ("Do NOT proceed to B12 with `errors>0`", `:2165`).
- The existing `memory.ts save verify_complete` at `:2175` stays — it is *narrative* context for
  `context-summary.md` only, never the verify writer (confirmed 07-12; it was the misleadingly-named
  line that Commit 1 `92d7bb4` already cleaned of the forbidden `testsPassed` key). The new step is
  the *real* writer and lives next to it.

Confirmed there is nothing to displace: zero pre-existing `record-verify`/`Tier A`/`Tier B`/
`b11-runner` references in the whole file (§0).

---

## 3. `content_hash` scope — the TARGET repo's tested tree

`computeContentHash(repoRoot, feature)` (`record-verify.ts:167-203`) covers, in sorted
repo-relative order (rename-sensitive — path bytes mixed in, `:197-198`):

1. **every file under `src/<feature>/`** — feature code AND co-located `*.test.ts` (recursive walk,
   `:172-184`), and
2. **`docs/specs/<feature>/ux-states.json` if present** (`:186-188`) — target-side E2E test
   definition; editing it changes what was verified (A1.1).

This is the **target repo's tested tree**, per §7 A1.1 (superseding v1 §3.4's old `docs/specs` scope —
comment `:156-158`). It matches what the two readers expect **byte-for-byte**:

- **`pre-commit-target.ts`** imports the *same* `computeContentHash` from `record-verify`
  (`pre-commit-target.ts:22`) and recomputes over the staged feature to detect staleness
  (`:111-118`) — "a reimplementation could drift and never match" (`:10-12`). So the writer and the
  target-side hook are guaranteed identical by shared code, not by convention.
- The **sync guard** (`assertVerifiedForSync`) reads the `content_hash` column off the
  `verify_records` row pushed by `pushVerifyRecord` (`record-verify.ts:326`).

Because the hash scope is a **target** tree (`src/<feature>` — the kit has no `src/`), `capture` and
`recordVerify` **must run in the target repo**. `assertNotKitRepo` (`record-verify.ts:108-141`,
called at `:213` and `:257`) hard-errors if invoked in the kit (detects `sync.config.json` with
`targets[]` or `package.json name === feature-from-confluence-kit`). B11 in the flagship already runs
against the target (that is where `src/<feature>`, the dev server, and Playwright live), so this is
satisfied — but the wired command MUST be written to run from the target repo root, never the kit.

---

## 4. The phantom "B11 wrapper" — resolved: **B11-in-the-flagship IS the wrapper; no new script**

`pre-commit-target.ts` error strings tell a committer to "run the B11 wrapper to produce a fresh
verify record" (`pre-commit-target.ts:90`, `:96`, `:101`, `:107`, `:116`). That "wrapper" does not
exist as a script today — but it does not need to be a *separate* one. Two facts settle this:

- `record-verify.ts:285` states outright: **"Called by the CLI right after the git note is written
  (the CLI IS the B11-wrapper entry point)."** The `capture` CLI command already: runs the tiers →
  writes the note → calls `pushVerifyRecord` (`record-verify.ts:405-420`). That *is* the wrapper.
- Therefore the "B11 wrapper" the target hook names = **the `record-verify.ts capture …` invocation
  that the flagship's B11 step (§2) issues**. Decision: **B11-in-the-flagship becomes that wrapper**
  by calling `record-verify.ts capture`. No separate thin wrapper script is added — a second script
  would just duplicate the CLI's run→note→push sequence and create a drift surface.

Consequence for humans committing *outside* a flagship run (the hook's own audience): the actionable
fix in the hook message is literally `npx tsx .claude/integrations/record-verify.ts capture --feature
<F> --tierA-cmd "…" --tierB-cmd "…"`. Block 4 should make the hook message name that command
concretely (currently it says the abstract "B11 wrapper"), so a developer who hits the gate can
reproduce it by hand.

---

## 5. Fail-closed behavior if the record write itself fails

There are **two** writes with **deliberately opposite** failure postures — the design must not
conflate them:

- **The git note** (`recordVerify` → `git notes add`, `record-verify.ts:232-239`) is the
  **authoritative local record**. If it fails, `recordVerify` **throws** (`:237-238`). B11 MUST treat
  a throw here as "verify did not complete" and **STOP — not proceed to B12, not report success.**
  This is the fail-closed anchor: no note = no verified state, full stop.
- **Central persistence** is superseded by P17-016 B2B. `record-verify.ts` no longer contains the
  legacy `verify_records` REST writer. It creates or validates one command-boundary UUID and emits
  one closed in-process receipt with `outcome=blocked` and
  `reasonCode=tenant_attestation_unavailable`; the receipt contains no raw note, repository,
  feature, or path fields. The local git note may be valid while **sync stays blocked**, because no
  trusted v2 tenant attestation or Wave C central sink exists.

**Specification for B11 (to implement in Block 4):**

1. B11 issues `record-verify.ts capture …`. If the process **exits non-zero** (note write failed, or
   `assertNotKitRepo` fired, or a tier command could not even be spawned — `spawnSync … status===null
   → 1`, `:262`), B11 **must not** advance to B12 and must surface the failure. No success banner on a
   missing note.
2. `verified` itself may legitimately be `false` (a real test failure → `computeVerified` returns
   false, `:84-86`). That is a *successful* record of a *failing* verify — it routes into the existing
   B11 failure/rollback options (`feature-from-confluence.md:2195-2209`), NOT to B12. B11 must key
   "proceed" on `verified === true`, never merely on "the record wrote".
3. If the note wrote, B11 validates the safe success banner and exact closed privacy receipt. A
   locally true verdict may proceed to B12, but B11 must **tell the user sync is still blocked**
   because central verification persistence is unavailable. Repeating capture cannot create a
   central row; a later separately approved tenant-attested sink is required.

---

## 6. Consequent Block-4 work items (for reference — not part of this design's approval)

1. Add the `capture` invocation as a new B11 step (§2), running from the **target** repo, with
   `--tierA-cmd "npx tsx .claude/integrations/lint-feature.ts src/<F> … --gate"` and `--tierB-cmd
   "npx tsx .claude/integrations/b11-runner.ts <F>"` (Tier B omittable when opted out → `null`).
2. Enforce the §5 fail-closed contract in the B11 prose (STOP on non-zero; gate B12 on
   `verified===true`; warn-not-imply on push failure).
3. Make `pre-commit-target.ts`'s "B11 wrapper" messages name the concrete `record-verify.ts capture`
   command (§4).
4. Install the target-side hooks via `install-hooks.ts` (both targets currently missing them, per
   07-12) — `example-learning-app/.git/hooks/pre-commit` and
   `tempp/example-authoring-app/.git/hooks/pre-commit`.
5. Bump v3.20 → v3.21 (all 4 stamps + package.json) and add tests proving the wire fires and fails
   closed on a write failure.

## 7. P17-016 B2B supersession (2026-08-15)

Section 5's central-persistence behavior above supersedes the original fail-open REST design. The
local git-note authority, real tier-exit derivation, content-hash coverage, and pre-commit scope
guard remain. The legacy central writer, hardcoded client credential, raw repository/feature/path
payload, and environment-owned run-ID fallback are removed. This amendment does not claim a
central record, tenant isolation, migration, sync unlock, target distribution, or Wave C sink.
