# Measurement Layer v1 — split `content_hash` into code-path + spec-name (W.3 fix, design)

> **Status: DESIGN ONLY — no code written. Targets kit v3.22.** Produced 2026-07-12 (session 2).
> Companion to `docs/design/measurement-layer-v1.md` and `docs/design/measurement-layer-b11-wire.md`.
> Fixes the CONFIRMED-UNIVERSAL W.3 bug (`prompt-evolution.md` Change W.3, lesson L-2026-07-12-002):
> `computeContentHash` derives BOTH the code tree and `ux-states.json` from a single `--feature`
> string, which cannot address any real feature in either target — every generated feature nests
> under an OpenedX/Paragon module dir (`src/studio-home/…`, `src/pages/…`) while its spec lives at a
> flat `docs/specs/<US-XX-Name>/`. A co-named depth-1 feature (the only shape the current signature
> can fully hash) exists in **neither** target, so a correctly-covered first `verified=true` row is
> impossible until this is fixed. **This is a prerequisite for Block 5, not a follow-up.**

All `file:line` citations are literal, read this session.

---

## 0. Grounding — current signature, callers, migration surface

**Current signature** (`record-verify.ts:167-203`): `computeContentHash(repoRoot: string, feature: string)`.
It (a) `walk`s `path.join(repoRoot, 'src', feature)` — the code + co-located tests (`:184`), and
(b) appends `docs/specs/<feature>/ux-states.json` if present (`:186-188`). Both use the SAME `feature`
string. `walk` **silently returns** on a nonexistent dir (`:173` `if (!fs.existsSync(dir)) return;`).

**Every caller (grep-confirmed this session):**
1. `record-verify.ts:214` — `recordVerify` (THE writer): `computeContentHash(repoRoot, input.feature)`.
   Fed from `RecordVerifyInput.feature` (`:45`) / `captureAndRecord.feature` (`:251`) / CLI `--feature`.
   Result hash + coverage stored in the git note (`VerifyNote.content_hash`/`coverage`, `:68-70`).
2. `pre-commit-target.ts:131` — the TARGET hook's staleness recompute: `computeContentHash(root,
   note.feature)`, compared to `note.content_hash` (`:131-133`). Imports the SAME fn (`:22`) so writer
   and hook are byte-identical by construction (`:10-12`).
3. `record-verify.test.ts` — 3 direct calls (`:222/:226/:230`) + structural no-drift assertion (`:312`).

**Migration surface — EMPTY (confirmed on disk this session):**
- `verify_records` REST query → `content-range: */0` → **0 rows total**. Zero legacy DB rows to migrate.
- Zero legacy git notes: no `verified=true` run has ever happened, so no `refs/notes/verify` note with
  the old single-`feature` shape exists in any repo. The note-schema change (§2) has nothing to migrate.

---

## 1. New signature + param shape (DECISION, grounded in `:167-203`)

**Chosen:** an explicit options object separating the two independent locations —

```ts
export function computeContentHash(
  repoRoot: string,
  scope: { codePath: string; specName: string | null }
): { hash: string; coverage: string[] }
```

- **`codePath`** — repo-relative path to the feature's code dir, e.g.
  `src/studio-home/tabs-section/class-management/tabs/ProgressReports` (the LEAF feature dir, not the
  `src/studio-home` module dir). The walk hashes everything under it (code + co-located `*.test.ts`),
  exactly as `:184` does today but rooted at an arbitrary-depth path instead of `src/<feature>`.
- **`specName`** — the flat `docs/specs/<specName>/` folder name, e.g. `US-AD-095-ProgressReports`,
  used only to locate `docs/specs/<specName>/ux-states.json` (`:187`). `null` when the feature has no
  spec dir (rare; see §7 fail-closed rules for when `null` is legal).

Determinism, sorted-path order, path-bytes-mixed-in rename sensitivity (`:190-201`) are **unchanged** —
only the two roots are now supplied independently instead of derived from one string.

**Why an options object, not two positional strings** (`computeContentHash(repoRoot, codePath, specName)`):
the two are related-but-distinct and easy to transpose; a named object makes every call site
self-documenting and lets `specName` be optional without positional ambiguity. **Why not keep one
`--feature` and "smart-derive"** the code path (walk to find the leaf): there is no reliable
path-only rule for where a feature root begins inside `src/studio-home/tabs-section/class-management/
tabs/…` — that ambiguity is precisely `featureFromStaged`'s `parts[1]` bug (`pre-commit-target.ts:39`,
returns `studio-home`). The writer KNOWS the exact code dir (B10 wrote it); make it pass that, don't
guess. This mirrors the existing precedent `b11-runner --feature-path` (`b11-runner.ts:66-67`).

---

## 2. `VerifyNote` schema change — store BOTH so the hook recompute stays byte-identical

`VerifyNote` (`record-verify.ts:59-74`) currently carries `feature: string`. Add two fields and keep
`feature` as a human/DB label:

```ts
interface VerifyNote {
  feature: string;      // RETAINED: human label + DB display; set = specName (or codePath basename if specName null)
  code_path: string;    // NEW: exact repo-relative code dir the hash walked
  spec_name: string | null; // NEW: exact docs/specs folder whose ux-states.json was hashed (or null)
  content_hash: string; // unchanged meaning; now computed over {code_path, spec_name}
  coverage: string[];   // unchanged: the exact file set hashed
  … (phase, tierA_exit, tierB_exit, verified, runner_run_id, kit_version, at unchanged)
}
```

The hook recompute (§3, `pre-commit-target.ts:131`) then calls `computeContentHash(root, { codePath:
note.code_path, specName: note.spec_name })` — reading the note's OWN stored paths, so it feeds the
writer's exact inputs and the hash matches byte-for-byte. `coverage` remains the authoritative file
list; a reviewer can eyeball it to confirm the intended tree was covered.

---

## 3. Blast radius — every call site that must change (writer/hook byte-identical)

| Site | Change |
|------|--------|
| `record-verify.ts:167` signature | `feature: string` → `scope: { codePath; specName }`; `walk(codePath)`; fail-closed if `codePath` missing (§7). |
| `RecordVerifyInput` (`:42-57`) | replace `feature` with `codePath` + `specName`; keep a derived `feature` label. |
| `recordVerify` (`:210-241`) | call `computeContentHash(repoRoot, { codePath, specName })`; write `code_path`/`spec_name` into the note. |
| `captureAndRecord` (`:248-276`) | thread `codePath`/`specName` through to `recordVerify`. |
| CLI `record`/`capture` (`:376-421`) | add `--feature-path <codePath>` + `--spec-name <specName>`; keep `--feature <X>` as a **co-named shorthand** (sets `codePath=src/X`, `specName=X`) for back-compat + the flat case. Require `--feature-path` when `--feature` absent. |
| `pushVerifyRecord` (`:295-339`) | include `code_path`/`spec_name` in the POST body (see §8 for the DB column decision). |
| `pre-commit-target.ts:131` | `computeContentHash(root, { codePath: note.code_path, specName: note.spec_name })`. |
| `pre-commit-target.ts` staged-match (`:36-43`, `:104-109`) | **rewrite** `featureFromStaged` → verify staged `src/*` files are UNDER `note.code_path` (prefix) and any staged `docs/specs/*/ux-states.json` equals `docs/specs/<note.spec_name>/ux-states.json` (exact). See §4. |
| `record-verify.test.ts` | update the 3 `computeContentHash` calls + hash-scope/rename tests to the new shape; add the §7 attack tests; keep the no-drift structural assertion. |
| `feature-from-confluence.md` B11 step 6 (v3.21 wire) | thread `--feature-path` + `--spec-name` (see §5). |

**The byte-identical guarantee is preserved** because both the writer and the hook call the *same
imported* `computeContentHash` (`pre-commit-target.ts:22`) with the *same* `{codePath, specName}` —
the writer from CLI flags, the hook from the note's stored `code_path`/`spec_name`. Neither re-derives
the paths from the filesystem, so they cannot drift.

---

## 4. The hook's staged-feature detection (the `parts[1]` root cause)

Today `featureFromStaged` (`pre-commit-target.ts:37-43`) returns `parts[1]` for `src/<F>/…` — for
`src/studio-home/…/ProgressReports` that is `studio-home`, which then mismatches `note.feature`
(`:104-108`). The fix removes the "guess the feature name from the path" step entirely:

- **Recompute** uses `note.code_path`/`note.spec_name` (authoritative) — no guessing.
- **Staged-scope validation** (the "is this commit actually about the attested feature?" check)
  becomes: every staged `src/**` file MUST be under `note.code_path` (string prefix on the
  repo-relative path); every staged `docs/specs/**/ux-states.json` MUST equal
  `docs/specs/<note.spec_name>/ux-states.json`. Any staged feature file outside that scope → block
  (the note attests one feature/HEAD, `:103`). This is robust to arbitrary nesting because it never
  needs to locate a "feature root" — it only asks "is the staged path inside the attested code dir?"

---

## 5. B11 wire (v3.21 step 6) threads both paths for a REAL feature

The v3.21 wire (`feature-from-confluence.md` B11 "After agents return" step 6) currently passes
`--feature <FeatureName>` and lints `src/<feature-folder>`. Under v3.22 it derives the two paths it
already knows:

- **`--feature-path`** = the actual src dir B10 wrote the code into — the same `<feature-folder>` the
  Tier A `lint-feature.ts src/<feature-folder>` and Tier B `b11-runner … --feature-path` already use
  (`b11-runner.ts:66`). For US-AD-095 that is `src/studio-home/tabs-section/class-management/tabs/
  ProgressReports`.
- **`--spec-name`** = the `docs/specs/<FeatureName>` folder set at B0 — `US-AD-095-ProgressReports`.

Resulting capture call shape:
```bash
npx tsx .claude/integrations/record-verify.ts capture \
  --feature-path src/studio-home/tabs-section/class-management/tabs/ProgressReports \
  --spec-name US-AD-095-ProgressReports \
  --tierA-cmd "npx tsx .claude/integrations/lint-feature.ts src/studio-home/.../ProgressReports … --gate" \
  --tierB-cmd "npx tsx .claude/integrations/b11-runner.ts US-AD-095-ProgressReports --feature-path src/studio-home/.../ProgressReports"
```
Now `content_hash` covers the FULL tested tree — the nested code AND the flat `ux-states.json` — so
this is the correctly-covered first `verified=true` row Block 5 needs, on the REAL US-AD-095 feature.

---

## 6. §5 two-posture fail-closed survives the refactor UNTOUCHED

The refactor changes only the *inputs* to the hash walk. It does **not** touch:
- `computeVerified` (`record-verify.ts:84-86`) — still `tierA===0 && (tierB===0||null)`. Verdict logic unchanged.
- The git-note write throw (`:237-238`) → B11 STOP posture (`b11-wire §5`, wire step 6 "wrapper exit ≠ 0 → STOP"). Unchanged.
- `pushVerifyRecord` best-effort/fail-open (`:295-339`) + the kit-side fail-CLOSED sync guard (`sync-to-targets.ts:624-635`). Unchanged.
- B12 gating on `verified === true`. Unchanged.

The design MUST re-run `record-verify.test.ts` §5(a)/(b)/(c) after the refactor to prove these still hold.

---

## 7. Attack-test plan — a bad code-path/spec-name pair must FAIL CLOSED, never silently hash a partial tree

New fail-closed rules (the current `walk` silently tolerates a missing dir — that is the hole):

1. **`codePath` missing/empty → THROW** (do not hash spec-only). Change `walk`/`computeContentHash`
   so a nonexistent `codePath` dir, or a walk that yields ZERO code files, raises — `recordVerify`
   propagates it → wrapper exit ≠ 0 → B11 STOP. *Test:* `--feature-path src/does-not-exist` → throws;
   CLI exits ≠ 0; no note written.
2. **Tier B ran but `ux-states.json` absent → THROW** (in `recordVerify`, which has `tierB_exit`): if
   `tierB_exit !== null` then `docs/specs/<specName>/ux-states.json` MUST exist (Tier B tested E2E
   states that must be pinned). `specName === null` or a missing ux-states.json is legal ONLY when
   `tierB_exit === null` (Tier B skipped). *Test:* Tier B exit 0 + missing ux-states.json → throws.
3. **Mismatched pair (codePath of feature A + specName of feature B)** → the note hashes deterministically,
   but the hook's staged-scope validation (§4) blocks: A's staged src files are not under the note's
   `code_path`, or B's staged ux-states.json ≠ `docs/specs/<note.spec_name>/ux-states.json`. *Test:*
   craft a note for A, stage B's files → hook exit 1.
4. **Over-broad codePath (a module dir, e.g. `src/studio-home`)** → hashes sibling features (correctness
   hole, not security). *Mitigation:* the wire (§5) always passes the LEAF dir; add a lint/assert that
   `codePath` is not one of the known framework module dirs, or warn if it contains >1 feature marker.
   *Test:* `--feature-path src/studio-home` → coverage includes sibling features → assert the warning/refusal.

Every attack test lands in `record-verify.test.ts` alongside the existing §5 suite; all must be green
before v3.22 ships.

---

## 8. Migration + DB column decision

- **Data migration: none** — `verify_records` is `*/0` and there are zero legacy git notes (§0).
- **DB columns:** add nullable `code_path text` + `spec_name text` to `verify_records` (new
  `migrations/0004_verify_records_paths.sql`) for observability/debuggability. They are **not**
  load-bearing for the sync guard (`countVerifiedRuns` reads only `kit_version` + `verified`,
  `sync-to-targets.ts:571-572`), so the migration is additive and safe on the empty table. Decision
  point for review: add the columns now (recommended, trivial while empty) vs. keep them only in the
  git note and defer the DB columns. `pushVerifyRecord` posts them only if the columns exist.

---

## 9. Versioning, backup, test plan (for the IMPLEMENTATION session, not now)

- Bump kit → **v3.22** (all 4 stamps + `package.json`), `version:check` green, `prompt-budget --gate`
  exit 0.
- `record-verify.test.ts`: update existing calls to the new shape + add §7 attack tests; re-prove §5.
- `test:kit` must show only the 2 known pre-existing failures + the updated record-verify suite green.
- Backup before the first edit (reuse today's `backup/<date>` tag + zip if same day).
- After it lands: sync remains blocked until a real v3.22 B11 run on US-AD-095 produces the first
  correctly-covered `verified=true` row — THAT is the resumed Block 5.

---

## 10. Open decisions for user review (this is the STOP)

1. **Param shape:** options object `{ codePath, specName }` (recommended) vs. two positional args.
2. **`--feature` back-compat shorthand:** keep it as a co-named alias (recommended) or remove it and
   require `--feature-path` + `--spec-name` always.
3. **DB columns:** add `code_path`/`spec_name` to `verify_records` now (recommended) or note-only.
4. **Over-broad codePath guard (§7.4):** hard refusal vs. warning.

**No code written. Awaiting review before the v3.22 implementation session. design-to-ui untouched.
No sync.**
