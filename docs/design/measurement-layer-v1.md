# Measurement Layer v1 — computed `verify_complete` + a real hook (design)

> **POINTER — live measurement-layer status is NOT cached here; see `measurement-layer-tier-b-environment.md` §8 + `HANDOFF.md` (live `verify_records` query). This doc is the FROZEN invariant, not a status snapshot.** Review-passed; no implementation until an approved session. This doc resolves the four open questions for the
> MVP and defines the one invariant every later phase must preserve. It does not contain code.
> Reviewed by a human before any implementation session (same posture as `self-training-loop.md`).

MVP scope is **two gaps only**: **gap#2** (a real hook that runs, instead of a narrative
"the model should run `npx tsx …`") and **gap#1** (a `verify_complete` that is *computed* from a
real test-runner exit code, not a string the model hands to `memory.ts`). **gap#3** (validating
`test_status="enforced"` labels against real tests) is **Phase 2, out of scope here.**

---

## 1. Problem (the self-report gap)

`verify_complete` is a self-written string: `memory.ts:230` `JSON.parse`s and persists whatever
literal the model supplies — including `testsPassed:true` — so a run can declare itself done with
tests broken or never run (this is how US-AD-095's `INDEX.md` reached `final_confirmed` on a
hybrid). No hook or CI forces the real gates to run: `.git/hooks` is empty, and `lint-feature.ts` /
`b11-runner.ts` — which *do* exit non-zero correctly — only execute if the model chooses to invoke
them. The north-star `correction==0` therefore rests entirely on self-report
(`b12-logger.ts:285` `manualCorrections:'self_reported'`), so every run-count and "proven" claim is
unfalsifiable.

---

## 2. Non-goals (explicit — do not build these here)

- **Option 2 / Option 3 verify signals** — AC-parsing of test output, or output-diffing against an
  expected shape. v1's signal is the runner **exit code only** (option 1). Richer signals are a
  future upgrade, not this MVP.
- **gap#3 — `test_status` label validation** against a real passing test. Phase 2.
- **CI beyond a local git hook** — no GitHub Actions / server pipeline in v1. The only automated
  trigger is a git hook + a command-flow wrapper. (A remote backstop is discussed in §6.3 as a
  *design hook point*, not a v1 deliverable.)
- **Grading lesson quality / promotion decisions** — that is the 6F measurement consumer, downstream
  of this layer. v1 only produces an *honest* verify signal for it to consume later.

---

## 3. Design (Q1–Q4)

### 3.1 — Q1: What does the hook run, given external deps?

Kit verification is **two populations of check** with opposite cost/reliability profiles, so a
single hook that runs everything is wrong — it would be slow and flaky, and a slow/flaky
pre-commit hook is a **design failure**: it trains the user to reach for `--no-verify`, which
silently defeats the whole layer. Split by cost:

- **Tier A — cheap, deterministic, no external deps → runs IN the git hook (`pre-commit`).**
  Candidate: `lint-feature.ts --gate` (static: HR33 blind-cast, HR34 business-rule→util+test,
  HR35 verified-ratio, HR36 AC-coverage + hollow-test rejection) plus `tsc`/lint. These already
  exit non-zero correctly, need no browser / dev server / Confluence token, and finish in seconds.
  A hook made of only Tier-A checks is fast and never flaky → no incentive to bypass.
- **Tier B — heavy, external deps (Playwright/browser, dev server, sometimes Confluence) → NOT run
  by the hook.** `b11-runner.ts` needs a live dev server and a browser; re-running it at commit
  time would be slow, order-dependent, and flaky. Instead: **Tier B runs once, during the command
  flow (at B11), through a wrapper that captures its exit code and writes a signed result record.
  The hook READS that record; it does not re-run Tier B.**

**Why read-not-rerun for Tier B:** the expensive verification already happened at B11 with a real
browser; committing must not pay that cost again, and re-running invites nondeterminism. The hook's
job for Tier B is *freshness + provenance*: assert a Tier-B result record exists, was written by
the trusted wrapper (not the model), covers the files being committed, and is recent enough
(staleness rule in §3.4). If the record is missing/stale/forged → the hook fails the commit with a
message telling the user to run the B11 wrapper — never a silent pass.

**Net:** hook = *run Tier A live* + *verify a trusted Tier-B record exists*. Fast path stays fast;
heavy path is captured once and attested, not repeated.

### 3.2 — Q2: How does the script write `verify_complete` so the model can't forge it?

**Cut the model out of the trusted path (Architecture A).** Today any caller can do
`memory.ts save verify_complete '{"testsPassed":true}'`. Change:

- **`memory.ts` REFUSES externally-supplied verify state.** The `save` verb rejects any payload
  carrying the keys `testsPassed` / `verify_complete` / `verified`. The refusal is **key-based, in
  any phase** — *not* scoped to the `verify_complete` / `final_confirmed` phases. Key-based is
  required because `saveContext` **forward-merges** each payload onto the prior one: a verdict key
  slipped in at an earlier phase (e.g. `scope_confirmed`) would otherwise persist through the merge
  into `verify_complete`, defeating a phase-scoped guard. Those keys are therefore **non-writable
  via the general `save` path** — an attempt is an error, not a silent accept. (The narrative
  `finalConfirmed` flag is a *different* key and stays writable.) The model may still `save`
  *narrative* context (feature name, notes); it may **not** assert its own verification verdict.
- **One trusted writer.** A single entry point — the Tier-A/Tier-B **capture wrapper** — is the only
  code allowed to set `verify_complete`. It does so by passing the **captured exit code**, not a
  boolean. Intended call shape (shape, not implementation):

  ```
  # ONLY the wrapper calls this; it passes the real exit code it observed.
  recordVerify({
    phase: "verify_complete",
    feature: "<FeatureName>",
    tierA_exit: <int>,          # lint-feature --gate + tsc exit, captured by the wrapper
    tierB_exit: <int|null>,     # b11-runner exit, or null if Tier B legitimately skipped
    runner_run_id: "<id>",      # ties this to a specific command run (marker stream)
    kit_version: "<x.y.z>",
    at: "<iso8601>"
  })
  # verified == (tierA_exit === 0 && (tierB_exit === 0 || tierB_exit === null-with-reason))
  # `verified` is COMPUTED inside recordVerify from the exit codes — never accepted as input.
  ```

  `testsPassed`/`verified` is **derived here from exit codes**, never received. The distinction that
  makes forgery impossible: the trusted writer's input is *what the runner returned*, and the
  boolean is a pure function of that. There is no parameter through which the model can inject
  "true".

### 3.3 — Q3: What stops `--no-verify` / hook bypass?

A local hook is bypassable by construction (`git commit --no-verify`), so the hook **cannot be the
only line of defense** — it is a fast-feedback convenience. The real enforcement is **downstream, at
the sync boundary**, where nothing the model does can skip it:

- **Upgrade the existing sync guard** from "refuse if `.claude/` is dirty" (already shipped:
  `7a5f2b2`) to **"refuse unless the change being synced is backed by a script-written
  `verify_complete` for the current HEAD."** Concretely, the sync precondition validates the verify
  **git object** for HEAD by **recomputing, not by trusting a flag** — see §3.4 for the object shape
  and the three checks. Missing/mismatched/failing → refuse, with the same `--force-*`
  conscious-override posture as the dirty guard (a distinct `--force-unverified`, so overriding
  *dirtiness* and overriding *lack-of-verification* are separate conscious acts).
- **Why sync, not commit, is the true gate:** commit is local and personal; **sync is the act that
  ships to targets** — the only place a bad state escapes this repo. Putting the hard backstop there
  means `--no-verify` at commit time only forfeits *fast feedback*, never *safety*. This reuses the
  guard we already built and proved, so it is a small, low-risk extension rather than new
  infrastructure.
- **Server-side backstop = design hook point, not v1.** A remote check (dashboard/sync-report
  rejecting an install whose run has no computed verify) is the eventual belt-and-suspenders; v1
  leaves the seam for it (the record carries `runner_run_id` + provenance) but does not build it.

**RULE — visual/overlay features MAY NOT sync on a `tierB_exit=null` verify.** Playwright is opt-out
at B10.5, so `tierB_exit=null` (Tier B legitimately skipped) is allowed to satisfy the sync backstop
**only for features with no visual/overlay surface.** For a visual/overlay feature — the exact class
HR38 exists for — a `null` Tier B means the positioning/visual net never ran, so `null` does **NOT**
satisfy the backstop: the guard refuses (override only via the conscious `--force-unverified`). This
closes the "null door" through which US-AD-095's mispositioned-popover bug would otherwise reopen.

- **Classifier (how the guard knows a feature is visual/overlay):** reuse HR38's own signal, not a
  new label. A feature is visual/overlay if **either** (a) the HR38 overlay grep fires — its
  components contain host-lib overlay primitives (`overlays_found > 0`), **or** (b) its
  `ux-states.json` carries ≥1 open-state entry with a `baseline` (the HR38 artifact). If either
  holds, `tierB_exit` MUST be `0` (a real `--visual-diff` result), never `null`, for the sync
  backstop to pass. This keeps the classifier consistent with HR38's B5/B11 self-eval gate rather
  than inventing a second, forgeable "is-visual" flag.

### 3.4 — Provenance by git-object hash-pin (referenced by §3.1 and §3.3)

Provenance must **not** be a self-declarable flag (a "written by the wrapper" boolean is exactly the
gap#3 failure mode — a label the model can set). Replace it with a recomputed hash-pin carried in a
**git object attached to the commit**.

- **Where the record lives — a `git note` on HEAD** (namespace `refs/notes/verify`), not a tag.
  Justification: a note is *attached to* an existing commit (it references the exact HEAD being
  synced, which is what we want to attest), it can be added after the commit exists without
  rewriting history, it's overwritable per-commit if a re-verify happens, and it doesn't pollute the
  tag namespace that deploy/rollback already uses (`self-training-loop.md`, `backup/*`, `vX.Y`). A
  tag would either need rewriting on re-verify or leak a tag per run.
- **What the wrapper writes** (after observing the real exit codes), as the note body on HEAD:

  ```
  { tierA_exit, tierB_exit, content_hash, runner_run_id, kit_version, at }
  # content_hash = hash over the verified feature files' current bytes (the load-bearing field)
  ```

- **How the sync guard validates — by RECOMPUTING, never by trusting a stored flag:**
  1. **(a) exists + attached** — a `refs/notes/verify` note exists on the exact HEAD being synced.
  2. **(b) hash matches** — `content_hash` in the note **==** the hash recomputed from the current
     feature files *now*. **This is the load-bearing check:** a stale verify (files changed since),
     or a verify copied from an unrelated feature, will not match and is rejected.
  3. **(c) verified** — `verified == true`, computed from `tierA_exit`/`tierB_exit` stored in the
     note (§3.2 rule), not read as a boolean.
- **Why stronger than a file flag:** the model *can* create a git note — but it cannot make
  `content_hash` match unless the feature files are actually in the verified state. Forgery shifts
  from "edit one flag" to "make three things simultaneously consistent (exit codes + content_hash +
  the real tree)," which a lazy or accidental forge cannot produce. (For the deliberate-forge case,
  see the trust boundary in §3.6.)
- **Coverage** — "the verified feature files" is the file set the wrapper actually ran against,
  recorded alongside `content_hash`; the guard hashes that same set. A verify does not license files
  outside its recorded set. Clock time (`at`) is metadata only — never a validity input; the
  hash-pin, not the clock, defines freshness.

### 3.5 — Q4: Migration of the 3 existing B12 runs

The 3 historical runs (US-AD-093 clean, US-AD-094 clean, US-AD-095 hybrid) have **no
computed-exit-code verify** — they predate this layer. Rule:

- **Mark them `unverified` (do NOT grandfather to `verified`).** The whole point of the layer is
  that `verified` means "a script saw exit 0"; back-dating that claim onto runs where no script did
  would reintroduce the exact self-report we are removing.
- Record them as `verify_source = "legacy/uncomputed"` with the honest narrative status preserved
  (093/094 = clean-per-completion-box; 095 = hybrid). They remain **usable as history**, but they
  do **not** count as computed-verified fuel for 6F, and they do **not** satisfy the sync backstop.
- **Consequence (accept, don't fix):** immediately after rollout there are **zero**
  computed-verified runs. That is correct — it makes the real state legible. The first
  computed-verified run is produced by the next real feature run through the wrapper (ties to
  `self-training-loop.md` §5: real marker-emitting fuel starts accruing only from here).

### 3.6 — Trust boundary (what v1 does and does NOT defend)

An anti-self-report doc must not itself make an unqualified self-report about its own strength.
State the limit plainly:

- **v1 DEFEATS accidental / lazy forgery.** A model that declares `testsPassed:true` without running
  anything, or reuses an unrelated feature's verify, is killed by two independent things: the
  `memory.ts` refusal (§3.2 — the self-report path no longer exists) and the hash-pin (§3.4 — a
  fabricated verdict won't match the real tree). This covers **~the entire real-world failure
  surface**, including the exact mechanism by which US-AD-095 reached `final_confirmed` (a hand-set
  `testsPassed:true` on a run whose tests weren't computed).
- **v1 does NOT defend against deliberate forgery by a model that controls the shell.** Such a model
  could run the real tests, observe a failure, then hand-craft a `git note` with `exit=0` and the
  correct `content_hash` for the current files. This is **architecturally impossible to fully
  prevent LOCALLY**: the model orchestrates every command, so the exit code always passes through a
  host it controls, and any local writer it can invoke it can also impersonate.
- **The fix is the REMOTE backstop (the §3.3 seam).** Move exit-code capture off the
  model-orchestrated host — CI, or a runner that writes the verify telemetry to Supabase via a token
  the model never holds — so `verified` is asserted by a party the model cannot speak for. v1 leaves
  the seam (`runner_run_id` ties a local note to a would-be remote record) but **does not build it.**
- **Label:** local deliberate-forge resistance is a **KNOWN, ACCEPTED v1 limit.** v1's goal is to
  make the honest path the easy path and to kill the accidental/lazy gap that actually bit us — not
  to be adversarially unforgeable on a host the model owns.

---

## 4. Trusted-writer contract (the one invariant)

> **`verify_complete` (and `final_confirmed`) is only ever written by the capture wrapper, and its
> `verified` boolean is computed inside that writer as a pure function of a test-runner exit code it
> observed directly. It is never accepted as an input from any caller, and the general `memory.ts
> save` path refuses to set it.**

Every later phase (richer signals, gap#3, remote backstop) must preserve this invariant. If any
future change lets a caller supply the verdict, the layer is defeated regardless of how good the
signal is.

---

## 5. Rollout (what lands first, how each step is proven)

1. **Trusted path — `memory.ts` refusal + capture wrapper (gap#1), ONE ATOMIC change.** These MUST
   land together, never as two sequential steps: refusing the old `save verify_complete` path *before*
   the wrapper exists opens a window in which a real run can record verify by **neither** path (old
   path refused, new path absent) — an even worse hole than the one we're closing. So in a single
   merge: (a) `memory.ts` rejects any externally-supplied `verify_complete`/`testsPassed`; (b) the
   capture wrapper + `recordVerify` (the single trusted writer) exists and computes `verified` from
   `tierA_exit`/`tierB_exit` into the §3.4 git note. *Proven — both halves green before merge:*
   `save verify_complete '{"testsPassed":true}'` now errors AND narrative saves still pass (half a);
   feed the wrapper exit 0 → note `verified=true`, exit 1 → `verified=false`, and no input path sets
   the boolean directly (half b).
2. **`pre-commit` hook — Tier A live + Tier-B note check (gap#2).** *Proven by:* commit with a
   passing tree succeeds fast; commit with an injected lint/type failure is blocked; commit with a
   missing/stale Tier-B note is blocked with an actionable message. Measure hook wall-time to
   confirm it's fast enough not to invite `--no-verify`.
3. **Sync backstop upgrade (Q3).** Extend the shipped dirty-guard to also require a valid computed
   verify (§3.4 recompute) for HEAD, incl. the §3.3 visual/overlay `tierB_exit=null` rule. *Proven
   by:* dry-run sync refuses when the verify is legacy/mismatched/missing (and when a visual feature
   has `tierB_exit=null`); passes on a genuine computed-verified run; `--force-unverified` overrides
   consciously.
4. **Migration pass (Q4) — ✅ DONE 2026-07-07 (Option C: doc annotation, no migration).**
   The 3 pre-layer runs are recorded here as `verify_source = "legacy/uncomputed"`, NOT migrated
   into any verify table:
   - **Attendance (US-AD-093)** — authoring, 2026-06-29, `verify_complete` (self-reported).
     `verify_source = "legacy/uncomputed"`.
   - **AssessmentGrading (US-AD-094)** — authoring, 2026-06-29, `verify_complete` (self-reported).
     `verify_source = "legacy/uncomputed"`.
   - **US-AD-095-ProgressReports** — authoring, 2026-07-03, `final_confirmed` (self-reported;
     hybrid run — agent B0→B10, then manual verify B10.5→B12). `verify_source = "legacy/uncomputed"`.

   All three **predate the trusted-writer path** (§4): no script observed an exit code for them, so
   none carries a computed `verified`. They remain usable as narrative history but **never satisfy
   the sync backstop** (A1.3 counts only `verified === true` rows in `verify_records`, of which they
   have none) and **never count as 6F self-training fuel**. That is **correct as-is, not a gap** —
   per §3.5, back-dating `verified` onto uncomputed runs would reintroduce the exact self-report this
   layer removes.

   **Why Option C (no DB write, no target-repo file touched):**
   - **A — stamp rows into `verify_records`:** rejected. It would need a new `verify_source` column
     plus sentinel values for the `NOT NULL` computed columns (`tier_a_exit`, `content_hash`,
     `verified`), contaminating a table whose entire meaning is "a script saw exit 0" with rows no
     script produced.
   - **B — separate `legacy_runs` table:** rejected. Table + RLS + migration overhead for 3 static
     historical rows that never join with the guard's query (the guard counts `verified` rows; legacy
     rows are `verified=false`/absent and are excluded regardless of where they live).
   - **C-ctx — a `verifySource` key in each `context-summary.md`:** rejected. Safe (unknown keys are
     tolerated, INDEX bytes unchanged) but **invisible to any actual reader** — INDEX.md would still
     show `verify_complete ✅` with no caveat — while dirtying 3 more target-repo files for no
     functional gain. Also `INDEX.md` is auto-generated + byte-checked by `feature-index.ts --check`
     (wired into `test:kit` in both repos), so it is **not** a hand-annotation surface.
   - **C-doc — annotate here only (CHOSEN):** zero parsed/generated files touched, cannot be wiped by
     regeneration, and the design doc is the canonical record for exactly this kind of decision.

   *Proven by:* `verify_records` holds **0** rows (independently re-confirmed via anon SELECT,
   `content-range: */0`) → kit_version 3.18.0 has zero computed-verified runs → the honest zero. The
   first computed-verified run will come from the next real feature run through the wrapper.

Land step 1 as the atomic trusted path, then 2, then 3; 4 (done — Option C doc annotation) required no code.

---

## 6. Open risks

- **Deliberate local forge (the residual, by design).** Per the §3.6 trust boundary, a model that
  controls the shell can hand-craft a `git note` with `exit=0` and a matching `content_hash`. The
  hash-pin (§3.4) defeats accidental/lazy forgery but **not** this; the accepted v1 answer is the
  remote backstop seam (`runner_run_id`), not a local mechanism. Known, accepted — restated here so
  it isn't mistaken for an oversight.
- **`content_hash` coverage definition.** The load-bearing check is only as good as "which files
  count" as the verified feature set. Needs a concrete, per-feature rule at implementation
  (feature folder + its `ux-states.json` + any shared util it added), so a change to an in-scope
  file invalidates the note (§3.4) and an unrelated verify can never match.
- **`--force-unverified` / `--force-dirty` erosion.** Two override flags now exist.
  If either becomes routine, the layer rots. Consider logging every override to the run record so
  overrides are visible/auditable, not silent.
- **Self-reference.** This layer's own code (`memory.ts`, the wrapper, the hook) is verified by the
  same Tier-A checks it installs — fine for static checks, but there is no computed-verify of the
  measurement layer itself until it runs on a real feature. Accept for v1; note it.

---

## 7. Amendment A1 (2026-07-06) — split-repo correction

> **STATUS: AMENDMENT to a FROZEN doc — conscious, dated, review-required.** This section
> SUPERSEDES the specific points of §3.1, §3.3, §3.4, and §3.6 called out below. The frozen
> §1–§6 text is left intact as the review-passed record; where A1 conflicts with it, A1 wins.
> Trigger: the **split-repo finding** surfaced while starting Rollout step 2 (the pre-commit
> hook) — see A1.0.

### A1.0 — The finding (why the frozen §3 was wrong)

§3 (all of Q1–Q4) implicitly assumed **one repo** holds the spec, the code, the tests, the hook,
and the verify note. It does not. The workspace splits them:

- **`docs/specs/<Feature>/`** (spec artifacts: `checklist.md`, `ux-states.json`, context) lives in
  the **kit repo** (source of truth). This is what the frozen §3.4 chose to hash.
- **`src/<Feature>/`** (the generated feature code + its `*.test.ts`) lives in a **target repo**
  (`example-learning-app` / `example-authoring-app`). The kit repo has **no `src/` at all.**
- **Tier A/B actually EXECUTE in the target repo** during the B0–B12 command flow (dev server,
  browser, `src/<Feature>` are all there). **The real exit codes are born target-side**, so the
  trusted verdict is a target-repo fact, not a kit-repo fact.

Consequence: a single pre-commit hook in one repo cannot see both trees, and a `content_hash` over
the kit's `docs/specs` cannot honestly pin a verdict about target-repo tests. §3.1/§3.3/§3.4/§3.6
are corrected accordingly. (Rollout step 1 — the `memory.ts` refusal — is **unaffected**: it is
repo-agnostic and correct either way. Only steps 2–4 rested on the collapsed-repo assumption.)

### A1.1 — Supersedes §3.4: hash the tested tree, on target HEAD, with a repo-role guard

- **`content_hash` scope moves from `docs/specs/<feature>/` to the TARGET repo's *tested tree*:**
  `src/<Feature>/` code **+ its test files** (`*.test.ts`) **+ `ux-states.json` if it is target-side.**
  Rationale: the pin must bind the verdict to *the bytes that were verified*. Hashing the spec
  markdown produces a **false PASS** when `src/<Feature>` is edited after verify (hash unchanged →
  stale code drift, the exact thing the pin exists to catch, slips through) and a **false FAIL**
  when `checklist.md` is reworded with code untouched. The frozen §3.4 open-risk already gestured at
  "feature folder + its `ux-states.json` + any shared util it added" — A1 makes that the rule and
  removes `docs/specs` as the hash target.
- **The note attaches to TARGET HEAD** (the feature-implementation commit), never kit HEAD. Today
  `record-verify.ts` is repo-agnostic (`resolveRepoRoot()` = `git rev-parse --show-toplevel` of cwd;
  `git notes add … HEAD` in that root) — it attaches wherever it happens to run.
- **Add an explicit repo-role guard (do NOT rely on "the wrapper happens to run in the target").**
  `recordVerify` MUST **refuse to write a verify note when cwd resolves to the kit source-of-truth
  repo** — detected by a kit identity marker (e.g. `package.json` `name === "feature-from-confluence-kit"`,
  or presence of `sync.config.json`), not by heuristics. Writing a code-verify note against kit HEAD
  is a category error and must be a hard error, not a silent misattachment.

### A1.2 — Supersedes §3.1: TWO non-equivalent hooks, not one

The single hook of frozen §3.1 splits into two hooks in two repos with **different, non-equivalent
jobs**. The doc states plainly: **these are not the same gate and neither pretends to be the other.**

- **Kit-repo pre-commit hook = spec-integrity gate ONLY (Tier-A-*lite*).** Trigger: staged
  `docs/specs/<Feature>/**`. Runs only checks that are real kit-side with no target state and no
  external deps: `checklist.md` header-lock (v3.10/3.11 exact headers), `ux-states.json` schema,
  ACT-row / AC-coverage *format*, `INDEX.md` projection consistency. It **explicitly does NOT**
  validate a Tier-B verify note and **does NOT claim code-verify** — it cannot see target state, and
  asserting a check it cannot perform would reintroduce the self-report this layer removes. Honest
  scope: *"the spec artifacts I am committing are well-formed."* Nothing about whether tests passed.
- **Target-repo pre-commit hook = the real Tier A/B gate.** Installed in target repos. Tier A =
  `lint-feature --gate` on `src/<Feature>` (impossible kit-side); Tier B = validate the **target**
  note (exists on target HEAD + `hash(src/<Feature> + tests)` matches + `verified === true`).
  **Distribution:** `.githooks/` is NOT in the sync allowlist, so a hook committed in the kit does
  not propagate. The target-repo hook must be distributed deliberately — either add its path to the
  sync allowlist, or install it during the feature-run flow — TBD at implementation.

### A1.3 — Supersedes §3.3: the sync backstop is REMOTE-dependent (fail-closed)

Because the kit repo cannot read a target repo's local git note, the kit-side sync guard has **no
local source for the target verdict.** The backstop therefore consults Supabase:

- **Historical A1.3 design:** table `verify_records` (Supabase), keyed by `runner_run_id` (and
  carrying `repo` + `head_sha`), was designed for the same best-effort anonymous REST pattern then
  used by telemetry's `repo_runs` upsert. Columns (shape, not DDL):
  `{ runner_run_id (pk), repo, head_sha, feature, verified, tierA_exit, tierB_exit, content_hash,
  kit_version, created_at }`. Written target-side by the B11 wrapper right after it writes the local
  note — closest to where the exit codes are real.
- **P17-016 B2B/B2C supersession (2026-08-15):** neither verification nor successful-token
  run-version reporting performs that raw central REST mutation now. Each path retains local proof
  and emits a closed in-process privacy receipt while trusted v2 tenant attestation and a Wave C
  sink are unavailable. The sync guard's `verify_records` read remains fail-closed; therefore sync
  does not become eligible merely because the legacy write was removed. This amendment changes
  current runtime truth, not the historical A1.3 schema rationale below.
- **Sync guard validates by querying `verify_records` for the kit version being shipped** —
  `kit_version = <PROMPT_VERSION>` AND `verified === true`, with **no repo and no head_sha filter
  (GLOBAL count)**. Rationale: `npm run sync` ships the kit **infrastructure** (`commands/`,
  `integrations/`, `templates/`, evolutions) to *all* targets at once, not one feature to one
  target — so there is no single "feature/run being shipped" or "current target HEAD" to pin
  against. The correct gate is: *has this kit version produced ≥1 computed-verified run anywhere?*
  (≥1 real `verified` row for that `kit_version`). A per-target/per-HEAD requirement would be both
  wrong (nothing target-specific is being shipped) and unsatisfiable (the first sync of a version
  necessarily precedes any per-target run of it). This is a recompute-or-refuse posture in the same
  conscious-override family as the shipped dirty-guard (`--force-unverified`). *(Implemented:
  `countVerifiedRuns()` / `assertVerifiedForSync()` in `scripts/sync-to-targets.ts`.)*
- **Supabase unreachable → FAIL-CLOSED.** Sync is the true backstop, not fast feedback, and it is
  low-frequency/deliberate, so blocking on an outage is a small cost; fail-**open** would put a
  trivially-triggerable silent hole in the one gate that must not have one, reintroducing the
  accidental/lazy pass v1 claims to defeat (§3.6). A genuine outage is handled by a **deliberate,
  logged `--force-unverified <reason>`**, never a silent pass. Block messages distinguish
  "unreachable — retry or force" from "queried OK, no record — run the B11 wrapper."

### A1.4 — Supersedes §3.6: the remote seam is LOAD-BEARING in v1, not future work

Frozen §3.6 framed the remote backstop as a future "seam left, not built," with v1 defended purely
locally. A1.3 changes that: **the kit-side sync backstop cannot function without the remote
`verify_records` record**, so the remote path is a v1 dependency, not an optional upgrade. Honest
restatement:

- v1 still **DEFEATS accidental/lazy forgery** (the `memory.ts` refusal + the hash-pin on the tested
  tree), unchanged.
- **Against a DELIBERATE adversarial model, A1.3's remote table adds ~no resistance.** The anon key
  needed to write `verify_records` is the **same credential `telemetry.ts` already exposes
  target-side**, so a model controlling the target shell can forge the remote row for no more cost
  than forging the local note — writing both artifacts is not meaningfully harder than writing one.
  A1.3 is therefore **not** an adversarial-forgery defense, and must not be described as one.
- **A1.3's real value is elsewhere, and is real:** (1) it gives the kit-side sync guard **verify
  visibility it currently has ZERO of** — today the kit cannot see any target verdict at all; and
  (2) it defeats **non-adversarial self-report** — the actual common failure mode (a run that
  declares itself done without a computed exit code), which is exactly what bit US-AD-095. Those are
  the wins; adversarial unforgeability is not.
- **KNOWN, ACCEPTED v1 limit.** True adversarial resistance needs exit-code capture on a host the
  model does not control, writing with a **secret the model never holds off-host** (CI, or a runner
  token issued out-of-band) — a **v2** requirement. A1.3 builds the *transport* (the table +
  `runner_run_id` linkage) that a v2 trusted writer will use, but does **not** itself constitute one.

### A1.5 — Rollout impact (amends §5)

- **Step 1** (`memory.ts` refusal + `record-verify.ts` writer) — DONE and unaffected, **except** the
  A1.1 repo-role guard + hash-scope change are now pending edits to `record-verify.ts` before it is
  wired into a run.
- **Step 2** (pre-commit hook) — becomes **two** hooks (A1.2). Kit-repo spec-integrity hook can be
  built and tested now; target-repo Tier A/B hook depends on the A1.1 writer changes + a
  distribution mechanism.
- **Step 3** (sync backstop) — now depends on the `verify_records` table + the fail-closed rule
  (A1.3), not a purely local recompute.
- **Step 4** (legacy migration) — unchanged.
