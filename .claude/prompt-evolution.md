# Prompt Evolution Log — feature-from-confluence

A chronological log of changes applied to `.claude/commands/feature-from-confluence.md` (and related files) via ★6 LEARN Level 9 or skill-test feedback. Each entry: when, why, what, where.

---

## 2026-05-16 — Skill-test improvements from US-AD-037 comparison

**Source**: structural comparison of skill output (B0–B8.6) vs ground truth `src/class-member-grade-detail/` for feature `EvaluateAndReleaseResults` (US-AD-037). Full report at `.claude/skill-test-output/gap-report.md`.

<!-- @lesson id="L-2026-05-16-001" classification="prompt_rule" priority="low" root_cause="hallucination" enforced_by="none" test_status="exempt" -->
### Improvement 1 — Tighten B8.6 self-eval to catch easy-to-miss response fields

**Where**: `.claude/commands/feature-from-confluence.md`, B8.6 ★3 SELF-EVALUATE bullets.

**Trigger**: in the test run the generated `.full.http` missed 4 fields that ground truth had: `overallScores` (aggregate), `learnerName` + `nextEventLabel` (header singletons from cross-ref US-AD-090), `questionCount` (final exam summary). All four sit in categories the existing "reverse-trace from UI → API" instruction did not call out explicitly.

**Change**: added a new bullet that enumerates three field categories the reviewer must check before B8.6 self-eval passes:
1. Aggregate / "overall" / "average" / "total" fields → require parent-level rolled-up fields
2. Visible labels and singletons (names, dates, IDs shown on screen) — easy to miss when focusing only on list items
3. Fields from cross-referenced common-component specs (US-AD-XXX) — open the page or document the dependency

<!-- @lesson id="L-2026-05-16-002" classification="prompt_rule" priority="low" root_cause="workflow_design_flaw" enforced_by="none" test_status="exempt" -->
### Improvement 2 — Add B12 Step 1.5: optional ARTIFACTS.md

**Where**: `.claude/commands/feature-from-confluence.md`, B12 — Done.

**Trigger**: ground truth `docs/components/EvaluateAndReleaseResults/ARTIFACTS.md` (committed 52312db) is a team-added artifact map that explains every file the workflow produces. The skill did not previously emit one, so future readers must guess artifact roles or grep the command file.

**Change**: inserted a new `### Step 1.5 — Generate Artifact Map (ARTIFACTS.md)` between Step 1 (ACCESS_GUIDE) and Step 2 (dev server). Spec calls out two tables (planning artifacts under `docs/specs/`, runtime artifacts under `docs/components/`), a dependency-flow ASCII diagram, and a Current Status block. References ground truth as the canonical example. Also appended `🗂️  Artifacts : docs/components/<FeatureName>/ARTIFACTS.md` to the final "remind user" box in Step 3.

---

<!-- @lesson id="L-2026-05-16-003" classification="automated_gate" priority="medium" root_cause="missing_project_knowledge" enforced_by="none" test_status="exempt" -->
### Improvement 3 — Fix BASELINE detection for page-named impl folders (Signal 4)

**Where**: `.claude/commands/feature-from-confluence.md`, B0 Step 3 — Check BASELINE.

**Source**: REAL run via `Skill(feature-from-confluence, args=URL)`. The skill executed B0 Step 1-3 against the live spec and live `src/` tree. BASELINE detector returned a combined score of **30**, below the 60 threshold, classifying the feature as **NEW** — even though the implementation is fully present at `src/class-member-grade-detail/` (32 files, 9 endpoints).

**Trigger**:

- Signal 1 (endpoint overlap): 0/40 — spec has no explicit `GET /api/...` URLs to grep
- Signal 2 (folder name variants of spec title `evaluate-and-release-results` / `evaluateAndReleaseResults` / `EvaluateAndReleaseResults`): **all three folders are absent** — the real folder is named after the PAGE (`class-member-grade-detail`), not the spec title
- Signal 3 (component grep — `ModuleCard`, `FinalExamCard`, `SubjectiveAnswerPopup`, `ObjectiveDetailPopup`, `GradedAssignmentCard`, etc.): **10 matches**, all clustered in `src/class-member-grade-detail/`. +30 pts.
- Combined: 30 < 60 → misclassified NEW. If the user typed Yes at B9, B10 would write to a brand-new `src/EvaluateAndReleaseResults/` folder while the real implementation rotted at `src/class-member-grade-detail/`.

**Change**: added Signal 4 ("Component clustering") with weight +50. When Signal 3 hits are concentrated (≥3 matches) in a single top-level `src/<folder>/`, that folder is recorded as `IMPL_FOLDER` and full +50 pts are added on top of Signal 3. Threshold (≥60) is reached when component clustering is observed. Also added an instruction that all downstream steps (B7 plan, B10, ACCESS_GUIDE) must use `IMPL_FOLDER` instead of inventing a new spec-title-named folder.

**Verified by**: same data — recomputing with Signal 4: Signal 3 (+30) + Signal 4 (+50) = **80 ≥ 60** → would now correctly classify BASELINE.

---

---

## 2026-05-16 — Round 2 improvements from US-AD-037 full B0→B12 run

**Source**: full B0→B12 skill-test run for `EvaluateAndReleaseResults` (US-AD-037). Ground truth: `src/class-member-grade-detail/` (32 files) + `EvaluateAndReleaseResults.ground-truth.http`. Skill output: `src/evaluate-and-release-results/` (29 files) + `EvaluateAndReleaseResults.full.http`. Comparison report in conversation context (2026-05-16 session).

**Accuracy before fix**: A=87.5% file structure / B=100% endpoints / B=72% response fields / C=75% implementation patterns

<!-- @lesson id="L-2026-05-16-004" classification="validation_rule" priority="high" root_cause="br_ambiguity" enforced_by="lint-feature.ts:HR34" test_status="enforced" -->
### Improvement 4 — B5 File 2: add `utils/` guidance for display/format rules

**Where**: `.claude/commands/feature-from-confluence.md`, B5 File 2 steps.md template, between Step 6 and Step 7.

**Trigger**: ground truth has `src/class-member-grade-detail/utils/formatScore.ts` implementing AC5 business rule ("max 3 significant chars, 1 decimal place"). Skill output had NO `utils/` folder and NO `formatScore` function. Score display in components used ad-hoc `.toFixed(1)` without the full business rule (e.g. max 3 sig chars was missing). This breaks AC5 validation.

**Change**: added Step 6.5 in steps.md template: when Business Rules or AC items contain a display/format rule, create `utils/<utilName>.ts` with a pure function. Trigger phrase list: "display as X.0", "round to N decimal places", "max N significant characters", "format score", "rounding rule".

<!-- @lesson id="L-2026-05-16-005" classification="prompt_rule" priority="low" root_cause="ui_ambiguity" enforced_by="none" test_status="exempt" -->
### Improvement 5 — B5 File 2: add named section wrapper component guidance

**Where**: `.claude/commands/feature-from-confluence.md`, B5 File 2 steps.md template, after Step 4.

**Trigger**: ground truth has `RequiredAssessmentsSection.tsx` — a section wrapper that groups `AssessmentModuleCard` children. The spec explicitly calls it "Required assessments section". Skill output had no wrapper and put the module cards directly in `FinalAssessmentTab.tsx`, which diverges from ground truth component decomposition.

**Change**: added Step 4.5: when spec names a section distinct from individual cards (e.g. "Required assessments section", "Score statistics section"), create one wrapper component per named section. Cards/rows are children of section wrapper, not children of the page.

<!-- @lesson id="L-2026-05-16-006" classification="prompt_rule" priority="low" root_cause="hallucination" enforced_by="none" test_status="exempt" -->
### Improvement 6 — B8.6 SELF-EVALUATE: add navigation URL and weighted score component checks

**Where**: `.claude/commands/feature-from-confluence.md`, B8.6 ★3 SELF-EVALUATE bullets (after existing bullets 1–3).

**Trigger**:

- `unfinishedItemUrl` field missing from skill GET /final-assessment response. Ground truth includes it for the "Keep Going" button. Spec says: "Keep going button: navigates to uncompleted module/assignment/exam" — the URL must come from API, not be hardcoded.
- `scoreComponents[]` with `weight` field missing from skill GET /grades response. Ground truth includes it. Spec explicitly states "Component score card (Component 6): component score + weight" and "Average score formula: Σ(Score × Weight) / 100". Without `weight` in the response, the weighted average UI card cannot function.

**Change**: added bullets 4 and 5 to the SELF-EVALUATE checklist:
4. Navigation URL fields tied to action buttons → must be in response shape
5. Weighted score component arrays → both the array (with `weight`) AND top-level `averageScore` required

<!-- @lesson id="L-2026-05-16-007" classification="prompt_rule" priority="low" root_cause="missing_project_knowledge" enforced_by="none" test_status="exempt" -->
### Improvement 7 — B10 agent brief: require `snakeCaseObject()` for request bodies

**Where**: `.claude/commands/feature-from-confluence.md`, B10 `REQUESTS:` line in agent brief + `CHECKLIST PER FILE` → `data/api.ts` bullet.

**Trigger**: ground truth `api.ts` imports `snakeCaseObject` from `@edx/frontend-platform` and uses it on all PUT/POST bodies. Skill output used plain snake_case object literals — functionally equivalent but diverges from project convention and CLAUDE.md pattern. Over time this divergence causes inconsistency when non-snake fields are added.

**Change**: updated `REQUESTS:` line to explicitly require `snakeCaseObject(payload)` from `@edx/frontend-platform` (not plain literals). Added reminder to `data/api.ts` bullet in CHECKLIST PER FILE.

---

## Notes on out-of-scope items

Three known skill bugs from the older plan `~/.claude/plans/c-l-i-feature-from-confluence-v-twinkly-lollipop.md` (legacy content lines 1–81, `nohup` Windows incompat at B12, missing `browser-use-wrapper.py` existence check at B11) were NOT addressed in this run because the test exercised only B0–B8.6. Apply that earlier plan separately.

---

## 2026-05-17 — v3.4 Claude Code correctness fixes

**Source**: full file review after B0→B12 skill-test run for US-AD-037. Three execution-correctness issues identified from observing how Claude Code actually runs the skill.

### Fix 1 — B11: dev server check before spawning Agent B

**Where**: `.claude/commands/feature-from-confluence.md`, B11 section — `### If PLAYWRIGHT_OPTED_IN = true` block.

**Trigger**: Agent B runs `playwright-runner.ts` which requires a live dev server, but the skill previously had no step to verify/start it before spawning. If the server wasn't running, Agent B would fail silently with connection errors. B12 Step 2 ("Start dev server") came *after* B11, so ordering was wrong.

**Change**: Added a dev server reachability check (via `curl`) after the Playwright install block and before the Agent tool calls. If unreachable: start with `npm run dev &` and re-check. If still unreachable: print warning and give user option to skip Agent B instead of hard-failing.

<!-- @lesson id="L-2026-05-17-001" classification="prompt_rule" priority="low" root_cause="workflow_design_flaw" enforced_by="none" test_status="exempt" -->
### Fix 2 — B12 Step 2: reframe from "Start" to "Ensure running"

**Where**: `.claude/commands/feature-from-confluence.md`, B12 `### Step 2 — Start dev server`.

**Trigger**: Dev server is started at B11 (new Fix 1 above), so B12 "starting" it again is misleading and causes duplicate startup attempts. The step should confirm it's still accessible, starting only if it went down.

**Change**: Renamed to "Ensure dev server is running". Added `curl` check first; only runs `npm run dev &` if the server is unreachable.

<!-- @lesson id="L-2026-05-17-002" classification="prompt_rule" priority="low" root_cause="missing_project_knowledge" enforced_by="none" test_status="exempt" -->
### Fix 3 — B10 agent brief: make snakeCaseObject package project-context-aware

**Where**: `.claude/commands/feature-from-confluence.md`, B10 agent brief `REQUESTS:` line.

**Trigger**: Hardcoded `@edx/frontend-platform` is project-specific. Other projects may source `snakeCaseObject` from a different package. The `REQUESTS:` line was not referencing `PROJECT_CTX` like the adjacent `RESPONSES:` line does.

**Change**: Updated to `import from the same package as PROJECT_CTX.response_transform (default: @edx/frontend-platform)` — consistent with how `RESPONSES:` already references `{{PROJECT_CTX.response_transform}}`.

---

## 2026-05-18 — v3.5 sync: tsx check, Hard Rule 15, B5 trigger completeness, B12.6 cross-sync

**Source**: Manual sync between Claude Code v3.4 and Copilot v3.5. Claude Code promoted to canonical (primary) version. Claude Code → v3.5, Copilot → v3.6.

### Change 1 — SESSION BOOTSTRAP: tsx availability check (Claude Code ← Copilot)

**Where**: `.claude/commands/feature-from-confluence.md`, Step 0.B — after PKG_MANAGER detection, before "Print summary once"
**Change**: Added `npx tsx --version` pre-flight check. Non-blocking — prints warning and continues if tsx is missing.

### Change 2 — Hard Rule 15: BASELINE scan scoping (Copilot ← Claude Code)

**Where**: `.github/agents/feature-from-confluence.agent.md`, Hard Rules — after Rule 14
**Change**: Added Rule 15: never scan full `src/` at B0 — scope BASELINE detection to `src/**/api.ts`, `src/<feature-name>/`, and `src/**/*.tsx` grep limited to feature-name patterns. Prevents context bloat on large repos.

### Change 3 — B5 Step 4.5/6.5: trigger phrase completeness (Copilot ← Claude Code)

**Where**: `.github/agents/feature-from-confluence.agent.md`, B5 File 2 steps.md template
**Change**: Step 4.5 — added "Learning progress section" and "Overview panel" to trigger examples. Step 6.5 — added "display rule" and "rounding rule" to trigger phrase list; updated note to "REQUIRED, not optional" (matching Claude Code wording).

### Change 4 — B12.6 cross-sync (both files)

**Where**: Both `.claude/commands/feature-from-confluence.md` and `.github/agents/feature-from-confluence.agent.md`, B12.6 Step 2
**Change**: When an improvement is approved, each file now applies the same structural change to the OTHER file (with platform adaptation if needed). Claude Code B12.6 updates Copilot; Copilot B12.6 updates Claude Code. Ensures both editions stay in sync after every self-improvement cycle without requiring manual intervention.

---

## 2026-05-18 — v3.6/v3.7: Visual regression, per-AC verifier, image-spec ambiguity, a11y, design tokens, parity locks

**Source**: Big-update plan `c-l-i-feature-from-confluence-v-snazzy-cake.md`. Closes 5 accuracy gaps from spec image → implementation → verification + adds cross-edition parity locks.

### Change A — `compare_images` MCP tool (Gap #1)

**Where**: `.claude/mcp-server/index.ts` + `.claude/mcp-server/package.json`
**Change**: New tool `compare_images(imagePathA, imagePathB, threshold?)` using `pixelmatch` + `pngjs`. Returns `{ diffPercent, diffPixels, totalPixels, match, diffImagePath }`. Resizes baseline to actual dimensions via nearest-neighbor before diff. Writes diff PNG next to imagePathA.

### Change B — playwright-runner.ts flags (Gap #1/#2/#4)

**Where**: `.claude/integrations/playwright-runner.ts`
**Change**: Added flags `--visual-baseline <png>`, `--visual-baseline-dir <dir>`, `--ac-checklist <md>`, `--audit-a11y`, `--audit-css <visual-properties.md>`, `--messages-path <messages.ts>`, `--visual-diff-threshold <%>`. New check IDs: PLAYWRIGHT-007 (visual diff), PLAYWRIGHT-008 (per-AC), PLAYWRIGHT-009 (a11y axe), PLAYWRIGHT-UI-ROWS, PLAYWRIGHT-UNIT.

### Change C — B4 image-spec ambiguity scan (Gap #3)

**Where**: Both workflow .md files, B4 — Confirm Scope
**Change**: Step 2.5 added. If image-annotations.md exists, scan for (a) region/component mismatch ≥2, (b) untranslated labels, (c) state references not in spec. Append to questions under "Image-spec gaps" group. Triggers B4 STOP even if Clarify lens found 0 questions.

### Change D — B2.5 Design Token Extraction (Gap #5)

**Where**: Both workflow .md files, new step between B2 and B3
**Change**: For each UI_SCREENSHOT, agent uses Read(image) to extract palette/typography/spacing, writes `docs/specs/<FeatureName>/visual-properties.md` using LOCKED schema (4 H2 sections, exactly 5 palette colors, lowercase 6-char hex, spacing px ascending, 5 typography roles).

### Change E — B11 invoke new flags

**Where**: Both workflow .md files, B11 Step 4
**Change**: playwright-runner invocation extended with `--ac-checklist`, `--audit-a11y`, `--audit-css`, `--messages-path`, `--visual-diff-threshold`. Runner detects v2 ux-states.json schema automatically.

### Change F — ux-states.json v2 schema (Gap #2)

**Where**: Both workflow .md files, B5 File 4 (new)
**Change**: B5 now emits `ux-states.json` with v2 LOCKED schema: `feature`, `states[]` (each with route/steps/baseline/ui_rows/ac_assertions), `negative_states[]`, `unit_tests[]`. `expected` enum locked (visible/hidden/text:/i18n:/count:/attr:). B5 validation rule: setEquals UI-checklist ↔ states[].ui_rows[]; Playwright ACT ↔ ac_assertions[]; Unit Test ACT ↔ unit_tests[]. STOP B5 on mismatch.

### Change G — Version bump v3.5→v3.6 / v3.6→v3.7

### Change H — B10 HARD CONSTRAINTS visual-properties.md (Gap #1 prevention)

**Where**: Both workflow .md files, B10 agent brief
**Change**: HARD CONSTRAINTS block added: design tokens authoritative, NO invented values (no `#4a90e2` if not in palette, no `padding: 13px` if not in scale), use SCSS variables. Self-eval grep verification before reporting done: hex/spacing/typography compliance + no `any`, no deep imports, no console.log, React Query key convention.

### Change I — B11 CSS computed-style audit (Gap #1 verification)

**Where**: `.claude/integrations/playwright-runner.ts`
**Change**: `--audit-css <visual-properties.md>` flag added. Per selector (from ac_assertions or defaults: body, h1, h2, button, a), get computed style → validate color/background-color in palette, padding/margin/gap in spacing scale. PLAYWRIGHT-010 check.

### Change J — Cross-edition parity locks

**Where**: Both workflow .md files (HARD RULES) + `.claude/integrations/parity-check.ts` (new)
**Change**:

- J.1 Hard Rule: verification logic MUST live in shared scripts, NEVER inline in prompt → both editions invoke same binary.
- J.2 Hard Rule: output schemas LOCKED (visual-properties.md 4 sections, ux-states.json v2 fields, expected enum, checklist summary).
- J.3 Hard Rule: B2.5 determinism (5 colors, lowercase hex, px sorted, 5 typography roles).
- J.4 new script `parity-check.ts` — compares 2 feature dirs (Claude Code vs Copilot output), reports palette/checklist/visual-diff drift to `parity-report.md`. Exit 0 if parity within tolerance.

### Net impact

- 5 accuracy gaps closed (visual regression, per-AC verify, image-spec ambiguity, a11y, design tokens)
- Cross-edition parity locked (LLM sampling divergence ≤ 5% for text, ~0% for deterministic outputs)
- Total Playwright checks: 6 (legacy) → 10+ (PLAYWRIGHT-001..010 + PLAYWRIGHT-UI-ROWS + PLAYWRIGHT-UNIT + PLAYWRIGHT-STATE-*)
- New MCP tool: `compare_images` (3rd tool in fsoft-confluence server)
- New integration script: `parity-check.ts`

---

## 2026-05-18 — v3.7 parity sync (Claude ← Copilot v3.7) + B12.7 parity-check integration

**Source**: manual cross-edition parity audit. Plan file: `~/.claude/plans/rippling-hatching-brooks.md`. User: VinhNQ39.

**Trigger**: side-by-side diff of `.claude/commands/feature-from-confluence.md` (Claude v3.6) vs `.github/agents/feature-from-confluence.agent.md` (Copilot v3.7) surfaced 4 missing items in Claude + a missing workflow step in both editions to auto-monitor cross-edition drift.

### Change K.1 — Claude Hard Rules sync to Copilot 18-rule structure

**Where**: `.claude/commands/feature-from-confluence.md`, HARD RULES section
**Change**: Added rule 7 (`NEVER skip B8.6 API contract generation`) and rule 9 (`NEVER start B10 before B9.6 package install completes (or no new packages required)`). Updated rule 1 to include B10.5 in the confirm-gate list. Updated rule 10 to enumerate 5 breaking-change categories (was 4 — added scss-outside-feature). Renumbered downstream rules to match Copilot 1–18 ordering. Dropped legacy Claude rule "ALWAYS check for context-summary.md at session start" — already covered by SESSION BOOTSTRAP Step 1 resume check. Both editions now 18 rules, identical numbering.

### Change K.2 — Claude B0.5 Check 2: Playwright install warning

**Where**: `.claude/commands/feature-from-confluence.md`, B0.5 — Pre-flight Check
**Change**: Added `### Check 2 — Playwright / browser-use installation` as non-blocking informational warning (single-line `ℹ️` print). Removes prior note "Playwright/browser-use đã được chuyển sang B10.5 — không check ở đây" and replaces with a quote clarifying B10.5 still owns the actual install — Check 2 is informational only.

### Change K.3 — Claude B11 Agent B: MCP verify_feature_route primary path

**Where**: `.claude/commands/feature-from-confluence.md`, B11 Agent B brief
**Change**: Inserted new "Step 0 — MCP verification (primary path, v3.7)" at start of Agent B brief, calling `verify_feature_route` MCP tool from `feature-workflow` server. Existing Steps 1–6 (Playwright direct via `playwright-runner.ts`) downgraded to enhancement / fallback. If MCP returns `isError` or server unavailable → falls back to Steps 1–6. Aligns with Copilot edition's B11 Step 2 (MCP primary, Playwright fallback).

### Change K.4 — Both editions: B12.7 cross-edition parity check

**Where**: both workflow files, inserted between B12.6 and "Seven Core Behaviors" / "Core Behaviors" section.
**Change**: New step `B12.7 — Cross-Edition Parity Check (automatic, non-blocking)`:

- Step 1: detect sibling edition output at `docs/components/<FeatureName>-claude/` or `-copilot/`. If absent → print info and exit silently.
- Step 2: invoke `npx tsx .claude/integrations/parity-check.ts <claude-dir> <copilot-dir> --tolerance 2 --out docs/components/<FeatureName>/parity-report.md`.
- Step 3: report per exit code — `[parity-ok]` to feedback.log, `[parity-drift]` to feedback.log + global history; missing script → log + continue.
- Step 4: append row to `ARTIFACTS.md` Table 2 (Runtime Artifacts) referencing `parity-report.md`.

Also updated PROGRESS DISPLAY ASCII boxes (both editions) + the step list (Claude `Print at the start of every step …`) to include `B12.7`. Updated ARTIFACTS.md Table 2 row list in B12 Step 1.5 (both editions) to mention `parity-report.md`.

### Change K.5 — parity-check.ts `--out` flag support

**Where**: `.claude/integrations/parity-check.ts`
**Change**: Added `--out <path>` CLI flag so B12.7 can write the report into the feature's runtime dir (`docs/components/<FeatureName>/parity-report.md`) instead of cwd. Auto-creates parent directory if missing. Default unchanged (`parity-report.md` in cwd) for backwards compatibility with existing manual invocations.

### Net impact

- **Claude v3.6 → v3.7**: 18 Hard Rules identical to Copilot; B0.5 Check 2 added; B11 MCP primary path; B12.7 added.
- **Copilot v3.7**: B12.7 added (Claude / Copilot both gain the new step in the same release).
- **Cross-edition drift now auto-monitored** after every feature run when both editions have run on the same spec.
- No breaking changes — all existing flows continue to work; B12.7 is non-blocking and skips silently when sibling absent.

---

## 2026-05-19 — v3.7 → v3.8 Parity hardening (Change L series)

**Source**: cross-edition audit triggered by user request to compare Claude vs Copilot output and propose synchronisation. Full report committed at `docs/claude-commands/PARITY_REPORT.md`.

**Premise**: HARD RULES 15–18 lock artifact schemas, but real drift sources are (a) silent capability assumptions (no explicit edition flags), (b) lossy 5-color palette rule, (c) Vietnamese-only image-classification regex, (d) parity-check covers metrics only — not semantic names, (e) no golden fixture to anchor "correct" output, (f) Copilot references `browser-use-wrapper.py` without pre-check, (g) Claude BASELINE backups can accumulate indefinitely.

### Change L.1 — parity-check-semantic.ts

**Where**: new file `.claude/integrations/parity-check-semantic.ts`.
**Change**: Standalone semantic parity tool. Compares `.full.http` endpoint set (method+path), `ACCESS_GUIDE.md` H2 section set, and optionally `data/types.ts` interface names / `data/api.ts` function names / `data/apiHooks.ts` hook names / `messages.ts` keys. Default tolerance: case-insensitive + snake↔camel equivalence (`--name-strict` to disable). Output `parity-semantic.md`; exit 0 on full match, 1 otherwise.

### Change L.2 — Golden fixture committed

**Where**: `docs/specs/_parity-golden/EvaluateAndReleaseResults/` (snapshot of v3.7 baseline output for US-AD-037).
**Change**: Spec dir snapshot + components dir snapshot + `README.md` documenting how to add fixtures, invalidate, and version. Images / screenshots / visual-diff PNGs intentionally excluded (run-specific, noisy).

### Change L.3 — Image classification heading regex i18n

**Where**: both prompts §B2 Step 3 — Classify content type table.
**Change**: Heading keyword list expanded from VI-only (`Màn hình`, `Luồng`, ...) to triplets `EN | VI | JP` for each `CONTENT_TYPE` row. Note `> (v3.8 — Change L.3 i18n classification)` appended under the table requiring Unicode-aware regex (`\p{L}`) and case-insensitive matching, locked across editions.

### Change L.4 — HARD RULE 19: palette 3–7 colors

**Where**: both prompts §HARD RULES (after RULE 18).
**Change**: Old RULE 18 (force exactly 5 colors, pad/round to 5) reduced to formatting rule. New RULE 19 accepts 3–7 colors reflecting actual design. Section header in `visual-properties.md` must include `count=<n>` when n ≠ 5. If >7, emit 7 dominant + `<!-- omitted: ... -->` comment listing dropped hexes. `parity-check.ts` palette set-equality already tolerates any count.

### Change L.5 — Copilot B11 Step 4: browser-use pre-check

**Where**: `.github/agents/feature-from-confluence.agent.md` §B11 Step 4.
**Change**: Before invoking `python .claude/integrations/browser-use-wrapper.py`, run a PowerShell pre-check using `Test-Path` + `Get-Command python`. If either missing, skip step with `ℹ️ B11 Step 4 skipped — browser-use unavailable`, append `⚠️ complex flows not auto-verified` row to checklist, proceed to Step 5. Aligned with `EDITION CONFIG.PYTHON_AVAILABLE=false`.

### Change L.6 — Claude SESSION BOOTSTRAP: BASELINE backup 24h timeout

**Where**: `.claude/commands/feature-from-confluence.md` SESSION BOOTSTRAP — restore stale BASELINE backup.
**Change**: Added age check (`date +%s` minus `stat -c %Y`/`stat -f %m`). If backup older than 86400 seconds, prompt user `Restore (y/N)?` and skip on anything other than `y`/`Y`. Prevents indefinite accumulation of `src/.<folder>-bak` after crashed sessions.

### Change L.7 — EDITION CONFIG block

**Where**: top of both prompt files, after copyright comment.
**Change**: New `## EDITION CONFIG` section declares architectural capability flags as YAML: `EDITION`, `PARALLEL_MODE`, `SHELL_PERSISTENT`, `PYTHON_AVAILABLE`, `AUTOLINT_HOOK`, `PROMPT_VERSION`. Claude variant has all `true`; Copilot has all `false` plus `EDITION: copilot`. Block is the **only** part allowed to diverge between editions — all downstream prompt text reads these flags via `if FLAG_NAME` conditionals when behavior depends on capability.

### Change L.8 — npm scripts

**Where**: `package.json` scripts section.
**Change**: Added `parity-check` (delegates to `tsx .claude/integrations/parity-check.ts`) and `parity-check:semantic` (delegates to `parity-check-semantic.ts`). Both accept positional args via `--` for cross-platform shell-independent invocation.

### Change L.9 — settings.local.json allowlist

**Where**: `.claude/settings.local.json` permissions.allow.
**Change**: Added `Bash(npm run parity-check *)`, `Bash(npm run parity-check:semantic *)`, `Bash(npx tsx .claude/integrations/parity-check-semantic.ts *)` so the new commands run without permission prompts.

### Change L.10 — PARITY_REPORT.md as single source of truth

**Where**: `docs/claude-commands/PARITY_REPORT.md` (new file).
**Change**: 9-section report: executive summary, per-edition status, behaviour comparison, drift list with fix mapping, unified config (shared + edition-override + determinism rules), 17-scenario test checklist with golden fixture references, prioritized improvements (P0 done / P1 next / P2 backlog), changelog mapping back to this file, usage guidelines for future maintainers.

### Net impact

- **Claude v3.7 → v3.8**: EDITION CONFIG block, HARD RULE 19 (palette relaxation), image-classification i18n, BASELINE backup 24h timeout.
- **Copilot v3.7 → v3.8**: EDITION CONFIG block (inverse flags), HARD RULE 19, image-classification i18n, B11 Step 4 pre-check.
- **Infra**: parity-check-semantic.ts, golden fixture, npm scripts, settings allowlist.
- **Docs**: PARITY_REPORT.md is now the canonical source for cross-edition parity status — review before any prompt change that could affect parity.
- **No breaking changes**: existing flows continue. Old `visual-properties.md` files with exactly 5 colors still pass v3.8 rules.

---

## 2026-05-19 — v3.8 → v3.9 Determinism guardrails (Change M series)

**Source**: clean-room re-run of `/feature-from-confluence` on golden spec US-AD-037 (EvaluateAndReleaseResults). Reference output already existed unstaged in working tree (`src/class-member-grade-detail/` + `docs/components/EvaluateAndReleaseResults/`); ran v3.8 skill fresh in `.claude/worktrees/clean-room-us-ad-037` worktree off HEAD and compared. Results in [`impl-from-confluence/EVALUATION.md`](../impl-from-confluence/EVALUATION.md), drift reports in `impl-from-confluence/parity-*-vs-reference.md` and `parity-*-vs-golden.md`.

**Premise**: HARD RULES 15–19 lock artifact **schemas** but not artifact **content**. Within identical schemas, the model picks different URL conventions, decomposes spec requirements with different granularity, and disagrees on UI/ACT row count between runs. v3.8 parity infra (parity-check + parity-check-semantic + golden fixture) detects this drift but cannot prevent it. v3.9 adds content-level determinism rules.

**Measured drift (v3.8 same-spec re-run)**:

| Drift | Reference / Golden | Clean-room re-run | Class |
|---|---|---|---|
| `.full.http` endpoint paths | `/api/v1/class-sessions/{class_id}/members/{learner_id}/...` (9 endpoints) | `/api/admin/classes/{class_id}/members/{member_id}/...` (9 endpoints, 0/9 path match) | [C] Model creative |
| `checklist.md` REQ rows | 3 (literal spec Section 2.1) | 6 (decomposed UI controls into REQs) | [C] Model creative |
| `checklist.md` UI/ACT rows | 14 UI / 15 ACT | 11 UI / 10 ACT | [C] Model creative |

Net: 2/10 parity categories passed = **80% drift**. Reference and golden both pass against each other; the re-run drifts from both → confirms skill non-determinism, not reference rot.

### Change M.1 — HARD RULE 20: URL convention lock

**Where**: both workflow files, §HARD RULES (after RULE 19).
**Change**: New RULE 20. Before B8.6 writes `.full.http`, grep existing `src/**/api.ts` for `/api/v[0-9]+/...` prefixes; adopt the canonical prefix + nesting from the host repo. Specifies `{learner_id}` (not `{member_id}`) for learner-scoped routes; specifies versioned `/api/v1/` family must NOT be replaced by a new `/api/admin/` family if v1 exists. Log adopted prefix to `recovery.log`.
**Fixes drift**: 9/9 endpoint paths now adopt the same convention as the rest of the repo, eliminating same-spec divergence.

### Change M.2 — HARD RULE 21: REQ row literalness

**Where**: both workflow files, §HARD RULES (after new RULE 20).
**Change**: New RULE 21. `checklist.md` Requirements section MUST be 1-to-1 with spec Section 2.1 Objective (or Requirements) table — same count, same order, light paraphrase only, NO decomposition. UI controls (tab nav, save buttons, format rules) belong in UI Verification or ACT, never in REQ. Logs assert equality between `req_rows` and `spec_objective_count`; mismatch STOPs B6 with the diff.
**Fixes drift**: REQ row count becomes deterministic — output mirrors spec input table size, not the model's expansion preference.

### Change M.3 — HARD RULE 22: UI/ACT row granularity

**Where**: both workflow files, §HARD RULES (after new RULE 21).
**Change**: New RULE 22. UI Verification = exactly one row per top-level entry in spec Section 2.3.3 Component description (header, tab bar, each named card, each named section, each popup). Sub-elements (badges, icons, sub-fields) roll into parent row, never separate. ACT = one row per spec Section 2.3.4 AC item; display/format rules in spec get an additional unit-test row. Log records `ui_rows`, `act_rows`, and the spec-side counts they derive from.
**Fixes drift**: UI/ACT row counts become deterministic via fixed projection rules from spec sections to checklist rows.

### Change M.4 — PROMPT_VERSION bump v3.8 → v3.9

**Where**: EDITION CONFIG block in both workflow files.
**Change**: `PROMPT_VERSION: v3.9`. Bump signals the new HARD RULES 20–22 are active.

### Net impact

- **Determinism level**: artifact content (not just schema) now constrained for the 3 highest-volatility categories from v3.8 re-runs. Same-spec re-run should achieve ≥95% parity in `parity-check` (metric) and `parity-check:semantic` (endpoint names + ACCESS_GUIDE H2 names).
- **No breaking changes**: rules only constrain output shape, not workflow phases. Existing v3.8 outputs that already match the spec's table sizes pass unchanged.
- **Verification pending**: full B0–B12.7 re-run on golden spec, with v2 output extracted to `impl-from-confluence-v2/` and diffed against reference. Limited by Anthropic usage limit reset 6pm Asia/Bangkok on the day of the v1 measurement.
- **Out of scope this round**: code-generation parity (B9–B11). The v1 clean-room run could not reach those phases. To be measured on v2 re-run.

---

## 2026-06-11 — v3.9 → v3.14 Self-evolution from AnalyzeExamPerformance run (★6 LEARN Level 8+9)

**Source**: Level 8 pattern clustering across 3 runs (PaymentConfig / AdminRefundProcessing / AnalyzeExamPerformance). Analyzer output: 2 HIGH patterns detected (`design_cycleback` 33%, `low_reflection_score` 33%). 5 additional proposals derived manually from AnalyzeExamPerformance B8 gate correction notes (all 33% failure rate = HIGH priority given 1/3 runs).

**Analyzer fix**: `feedback-analyzer.ts` — added `.replace(/\r\n/g, '\n')` before split to handle Windows CRLF line endings. Previous runs returned `totalRuns=0` due to this bug.

**Feedback log fix**: appended machine-readable `[timestamp] [Feature] [auto]` entries to `docs/specs/.feedback-history.md` below the HTML comment section. Future runs should append in the same format.

<!-- @lesson id="L-2026-06-11-001" classification="validation_rule" priority="medium" root_cause="ui_ambiguity" enforced_by="none" test_status="pending" -->
### Change P1 — B5 File 1 (diagram.md): enforce multi-diagram LR layout + 15-node cap

**Where**: `.claude/commands/feature-from-confluence.md`, B5 `### File 1: diagram.md` instruction block.

**Trigger**: AnalyzeExamPerformance B8 gate correction — diagram was a single large `flowchart TD` with 40+ nodes, unrenderable in VS Code Mermaid preview. Required full regeneration at B8.

**Change**: Added mandatory rules block before the template: ALWAYS `flowchart LR`, NEVER `flowchart TD`; MAX 15 nodes per section; NEVER monolithic diagram ≥40 nodes; aim 4–7 focused diagrams ≤12 nodes each. Updated template to use `flowchart LR`. Reference: `AdminRefundProcessing/diagram.md` (6 separate LR diagrams).

<!-- @lesson id="L-2026-06-11-002" classification="validation_rule" priority="medium" root_cause="req_ambiguity" enforced_by="none" test_status="pending" -->
### Change P2 — B1 Step 1.5: create raw-spec.md in feature folder

**Where**: `.claude/commands/feature-from-confluence.md`, B1 Quy trình — after Step 1.

**Trigger**: AnalyzeExamPerformance B8 gate correction — `raw-spec.md` was a 40-line stub (metadata pointer) instead of the full Confluence content. Required correction at B8. The feature folder was not self-contained.

**Change**: Added Step 1.5: copy full B0 source verbatim to `docs/specs/<FeatureName>/raw-spec.md`. Minimum length check: if < 80 lines → SELF-RECOVER. Log line count to `recovery.log`.

<!-- @lesson id="L-2026-06-11-003" classification="automated_gate" priority="high" root_cause="workflow_design_flaw" enforced_by="eval-feature.ts:artifacts" test_status="enforced" -->
### Change P3 — B3: write speckit-lenses.md to disk

**Where**: `.claude/commands/feature-from-confluence.md`, B3 — after lens feed table.

**Trigger**: AnalyzeExamPerformance B8 gate correction — `speckit-lenses.md` was absent from the feature folder. It is listed in ARTIFACTS.md Table 1 but B3 only stored lenses in working memory, never persisted them.

**Change**: Added step to write all 4 lens outputs to `docs/specs/<FeatureName>/speckit-lenses.md` with one H2 per lens. Log to `recovery.log`.

<!-- @lesson id="L-2026-06-11-004" classification="validation_rule" priority="medium" root_cause="workflow_design_flaw" enforced_by="none" test_status="pending" -->
### Change P4 — task-type.md: use AdminRefundProcessing structured format

**Where**: `.claude/commands/feature-from-confluence.md`, B0 Step 3 — `task-type.md` format block.

**Trigger**: AnalyzeExamPerformance B8 gate correction — task-type.md used the minimal 3-line format (`Task type / Evidence / Detected`) with no evidence trail. Not auditable without the signal breakdown.

**Change**: Replaced 3-line format with structured evidence table format: `## Classification`, `## Evidence` (4-row signal table), `## Decision`, `## Scope`. Reference: `docs/specs/AdminRefundProcessing/task-type.md`.

<!-- @lesson id="L-2026-06-11-005" classification="automated_gate" priority="high" root_cause="workflow_design_flaw" enforced_by="eval-feature.ts:checklist" test_status="enforced" -->
### Change P5 — checklist.md: require all 5 sections (REQ+UI+ACT+UX+Playwright)

**Where**: `.claude/commands/feature-from-confluence.md`, B5 `### File 3: checklist.md` — template block.

**Trigger**: AnalyzeExamPerformance B8 gate correction — checklist was missing UX States and Playwright Verify sections entirely. Only had REQ + UI + ACT. Required full regeneration at B8.

**Change**: Added mandatory completeness rule (all 5 sections required before B6 gate). Updated template to include `## UX States` (4 standard rows: loading/error/empty/mutation) and `## Playwright Verify` (6 rows). Reference: `docs/specs/AdminRefundProcessing/checklist.md`.

### Net impact

- **Prompt version**: v3.9 → v3.14 (5 changes, all from AnalyzeExamPerformance gate corrections)
- **Artifact completeness**: raw-spec.md, speckit-lenses.md now explicitly produced by B1/B3
- **Diagram quality**: LR layout + node cap prevents unrenderable Mermaid output
- **Checklist completeness**: 5-section requirement prevents missing UX/Playwright sections
- **task-type auditability**: structured evidence table replaces 3-line stub
- **Analyzer fix**: CRLF normalization — analyzer now correctly parses all 3 runs

---

## 2026-06-11 — v3.15: playwright-runner PUBLIC_PATH and React Router 6 state patterns

**Source**: AnalyzeExamPerformance B11b interaction run — full 24-state suite (54 assertions). First run produced 14/54 (ViewAnalysis states timed out); second run produced 54/54 after fixing the initial route.

<!-- @lesson id="L-2026-06-11-006" classification="automated_gate" priority="high" root_cause="missing_validation" enforced_by="playwright-runner.ts:PUBLIC_PATH" test_status="enforced" -->
### Change P6 — playwright-runner: PUBLIC_PATH env var auto-prepend (replaces manual prefix in route)

**Where**: `.claude/integrations/playwright-runner.ts` line ~619; `.env.playwright` — new `PUBLIC_PATH` key.

**Trigger**: AnalyzeExamPerformance B11b first run — passing route `/course-dashboard/...` produced HTTP 200 (webpack serves SPA shell) but React body text = 0 chars and all `waitForSelector` calls timed out at 15s. Root cause: baseUrl is `http://localhost:1999` (no suffix); without the PUBLIC_PATH prefix, React Router could not match any routes and rendered nothing. Evidence: state 19 `navigate` (absolute URL with prefix) passed immediately — confirming router mismatch not auth or timing.

**Initial fix (discarded)**: hardcode prefix in each invocation (`"/isu-elearner-learning/course-dashboard/..."`). Rejected because PUBLIC_PATH is app-specific (e.g. `/isu-elearner-learning/` for this MFE, `/authoring/` for Studio MFE) — callers shouldn't need to know or remember it.

**Final fix**: runner reads `process.env.PUBLIC_PATH` from `.env.playwright` and prepends it automatically. Guard prevents double-prefix if caller already included it. Users configure once per project, invocations use bare feature routes: `npx tsx .claude/integrations/playwright-runner.ts "/course-dashboard/..."`. `.env.playwright` template comment explains how to change for other MFEs.

**Diagnostic rule**: if PLAYWRIGHT-005 body text = 0 after 5s, first check `PUBLIC_PATH` in `.env.playwright` matches the app's webpack `PUBLIC_PATH` before investigating auth or timing.

<!-- @lesson id="L-2026-06-11-007" classification="validation_rule" priority="medium" root_cause="ui_ambiguity" enforced_by="none" test_status="pending" -->
### Change P7 — ux-states.json: navigate steps must use full absolute URL (not path-relative)

**Where**: `docs/specs/.feedback-history.md` pattern note; B11 ux-states.json authoring guide.

**Trigger**: Same run — `navigate` action steps that used absolute URL (e.g. `http://localhost:1999/isu-elearner-learning/...`) worked; the initial route (path-only, no PUBLIC_PATH) did not. Consistent pattern: playwright `page.goto()` with a path-only string that starts with `/` resolves to `baseUrl + path` without the PUBLIC_PATH; only absolute URLs carry the full prefix reliably.

**Change**: ux-states.json authoring rule: `navigate` action `url` MUST be absolute (`http://...`) and MUST include the full PUBLIC_PATH. Path-only values are prohibited because the runner cannot reliably reconstruct the correct base.

<!-- @lesson id="L-2026-06-11-008" classification="prompt_rule" priority="medium" root_cause="hallucination" enforced_by="none" test_status="exempt" -->
### Change P8 — code review: flag setActiveTab inside navigate handlers (React Router 6)

**Where**: B10 code-review checklist in agent brief; PR description template.

**Trigger**: AnalyzeExamPerformance B10 — `ViewAnalysisPage.handleCardSelect` called `setActiveTab('summary')` immediately before `navigate(...)`. In React Router 6, when navigating to the same route component with different params, the component instance stays mounted and `useState` persists. The `setActiveTab` call therefore reset the active tab — violating ACT-04 ("active tab does NOT reset"). This is a subtle spec-compliance bug; the code compiled and rendered correctly but violated the spec requirement.

**Change**: added to B10 agent brief review checklist: "Flag any `setState(default)` call inside a handler that also calls `navigate()` to the same route family. In React Router 6, same-component navigation preserves local state; reset calls are almost always spec-violating unless the spec explicitly says the state should reset on navigation."

### Net impact

- **Prompt version**: v3.14 → v3.15 (3 changes from AnalyzeExamPerformance B11b)
- **B11 reliability**: PUBLIC_PATH prefix rule prevents blank-page timeouts in any SPA with non-root deployment
- **ux-states.json correctness**: absolute URL requirement prevents path-resolution ambiguity in navigate steps
- **Code quality**: React Router 6 state-reset pattern now caught at B10 review stage before B11

---

## 2026-06-11 — v3.15 → v3.16 Output-quality / anti-rework (Change S series)

**Source**: post-completion audit of AnalyzeExamPerformance. The implemented feature (`src/instructor-dashboard/analyze-exam/`) was built entirely against the workflow's *inferred* contract (`AnalyzeExamPerformance.full.http`). A SA-approved backend contract (`analyzefrombe.http`, US-AD-038) arrived a day later and diverged on nearly every axis: URL family (`/api/instructor/v2/...` vs `/api/exam-analytics/v1/...`), delete semantics (participant vs answer), export (sync Blob vs async POST + download metadata), server-side pagination/filter, and most response field names. 3 implemented endpoints don't exist in the BE contract. Net: ~100% of the data layer would need rewriting on `/drop-mock`. Root cause: workflow infers a contract and treats it as final, casts responses blindly (`camelCaseObject(data) as Type`), drops business rules into checklist prose without code, and prints "Complete" without true verification (UI 9/31, ACT 3/28, UX 0/8 verified).

**Goal**: maximize first-pass output quality so little/no rework is needed after "completed" — and where the BE contract genuinely lands late (parallel FE/BE), make that rework localized and self-documenting rather than a hunt.

<!-- @lesson id="L-2026-06-11-009" classification="automated_gate" priority="high" root_cause="missing_validation" enforced_by="lint-feature.ts:HR32-36" test_status="enforced" -->
### Change S.1 — HARD RULE 32: Contract provenance / Contract-first

**Where**: HARD RULES (new rule 32); B4 question groups (new "Backend contract" group); B8.6 new "Step 0 — Branch on contractStatus".
**Change**: B4 asks backend-contract status, persisted as `contractStatus` in context-summary. **REAL** → adopt user-provided contract as golden, copy paths+shapes verbatim at B8.6, skip inference. **PROVISIONAL** → infer as today but stamp `// CONTRACT: PROVISIONAL` on types.ts/api.ts and emit RECONCILE.md. **FE_ONLY** → as today. Stops the silent "inferred = final" assumption that caused the AnalyzeExamPerformance divergence.

### Change S.2 — HARD RULE 33: Mapping layer (no blind casts)

**Where**: HARD RULES (new rule 33); FILE_STRUCTURE (built-in fallback + Step 0.B React default) add `data/transform.ts`; B5 steps.md new Step 2.5; B10 CHECKLIST PER FILE + grep self-eval.
**Change**: Ban `camelCaseObject(data) as <Type>` on HTTP responses. Every response routes through an explicit `mapXxx(raw): Xxx` in `data/transform.ts` (or zod parse). Grep gate `camelCaseObject(...)\s+as ` → 0. Rationale: when the real contract differs, only transform.ts changes — types/hooks/components untouched. This is the single biggest rework-reducer and the mechanism that makes B12.8 reconciliation a one-file edit.

### Change S.3 — HARD RULE 34: Business rules are code+test, not prose

**Where**: HARD RULES (new rule 34); B10 CHECKLIST PER FILE (utils/ bullet). Reinforces existing B5 Step 6.5.
**Change**: Every Business-Rule / display-format checklist row must map to either a pure fn in `utils/` + co-located `.test.ts` wired into `ux-states.json unit_tests[]`, OR an explicit `<!-- enforced-by: BE -->` marker. Step 6.5 is now REQUIRED when ≥1 BR row exists. B11 must run the unit tests. Prevents rules (last-attempt-only, K/M, rounding, rank immutability, N/A fallback) silently vanishing from code as they did in AnalyzeExamPerformance.

### Change S.4 — HARD RULE 35: Done = verified

**Where**: HARD RULES (new rule 35); B12 completion box.
**Change**: B12 must not print "✅ Implementation Complete" while >40% of (UI+ACT) rows remain `⬜` unless the user explicitly acknowledges. Box shows true per-section verified ratio and a `⚠️ browser-unverified: N rows` line when Playwright was opted out. Stops "completed" from masking unverified work.

### Change S.5 — B12.8 Contract Reconciliation (new step)

**Where**: new `## B12.8 — Contract Reconciliation` after B12.7; PROGRESS DISPLAY enumeration + box art updated.
**Change**: Non-blocking. Trigger is **tightened** (both required): `contractStatus == PROVISIONAL` AND a real contract file present in `docs/components/<FeatureName>/` — does NOT fire on unrelated `.http` files or REAL/FE_ONLY runs. Diffs generated ↔ real contract (path family, method, fields), writes RECONCILE.md drift table, reports + points at transform.ts. Report-only, never auto-edits code.

### Change S.6 — PROMPT_VERSION bump v3.15 → v3.16

### Change S.7 — Sibling skills aligned to transform.ts

**Where**: `.claude/commands/drop-mock.md`, `.claude/commands/api-contract.md`.
**Change**: `/drop-mock` now (a) keeps `data/transform.ts` + every `mapXxx()` call (real-path mapping, not mock), (b) pre-checks for a `// CONTRACT: PROVISIONAL` stamp and warns to reconcile mappers against RECONCILE.md before going live (removing the stamp after), (c) runs the HARD RULE 33 blind-cast grep gate post-removal. `/api-contract` now reads `transform.ts` (when present) and derives `### EXPECTED RESPONSE SHAPES` from the mapper's `raw` (wire) input, not only the camelCase domain types — capturing true on-the-wire field names. Closes the gap where these two skills operated only on `api.ts` and would have broken the v3.16 mapping-layer pattern on first use.

### Change S.8 — Portability generalization of the S series

**Where**: HARD RULE 33 (framework-agnostic note), HARD RULE 28 (HR32 cross-reference), Step 0.B FILE_STRUCTURE (Vue/Angular/Unknown now include transform.ts), B12 Step 1 ACCESS_GUIDE "Switching to Real API".
**Change**: The v3.16 additions were audited for repo-specific coupling. Generalized: (a) HR33's grep gate and wording now state `camelCaseObject` is a stand-in for `PROJECT_CTX.response_transform` — the invariant is "no raw response cast straight to a type; route through an explicit mapper" (holds for React/Vue/Angular, repos with no transform helper, or zod-based repos); (b) `data/transform.ts` (or service-level mapping for Angular) added to all FILE_STRUCTURE branches, not just React; (c) HR28 ↔ HR32 cross-referenced so the golden-file rule and the contract-first question never appear to conflict; (d) ACCESS_GUIDE documents the PROVISIONAL → RECONCILE.md → transform.ts reconcile path for the human reader. Net: the S series is now framework- and domain-agnostic; it does not add to the repo-specific coupling already present in HR20/23/29.

### Change S.9 — Domain-rule extraction to CLAUDE.md (portability layer)

**Where**: new `## PORTABILITY — Repo-Specific Knobs` section; SESSION BOOTSTRAP Step 0 optional-key extraction; inline annotations on HR20/21/22/23/29 + the Paragon selector table; `CLAUDE.md` new `### Workflow Overrides` block; SETUP.md project-specific table.
**Trigger**: portability audit scored the kit ~6.5/10 overall — mechanism highly portable, but HR23 (`/api/v1/class-sessions/...`), HR29 (`src/class-member-grade-detail/`), HR20 (`{learner_id}`), HR21/22 (FPT spec section numbering 2.1/2.3.3/2.3.4), and the Paragon selector table were hardcoded to isu-elearner, dragging "other React repo" portability to ~6/10 and Vue/Angular to ~4.5/10.
**Change**: those five rules now read repo-specific values from optional CLAUDE.md keys (`reference_feature`, `endpoint_base_override`, `api_url_convention`, `spec_section_map`, `ui_library`), each falling back to the isu-elearner default when absent — so THIS repo's behavior is unchanged. HR21/22 gained a semantic-section fallback (detect Objective/Component/AC sections by heading keywords) for specs that don't use FPT numbering. A `### Workflow Overrides` block was added to this repo's CLAUDE.md as documentation (values = existing defaults, zero behavior change) so the override pattern is demonstrated. Also generalized in S.8: FILE_STRUCTURE transform.ts across Vue/Angular, HR33 framework-agnostic wording.
**Net**: the repo-coupling that limited portability is now configuration, not hardcode. Estimated portability lift — "other React repo" ~6 → ~8, with no change to isu-elearner runs.

### Change S.10 — Machine-enforced coverage gate + HARD RULE 36 (test coverage of AC + description)

**Where**: new `.claude/integrations/lint-feature.ts`; HARD RULE 36; B11 "Coverage gate" step; B5 steps.md Step 8; B12 completion box (`AC tests` line); `package.json` (`lint:feature` script); SETUP.md + README integration lists.
**Trigger**: self-critique — the v3.16 rules were prose-only (only HR33 had a grep gate), and "done" was still LLM-trusted. User also required: always generate test cases and run E2E + unit tests covering all AC + description of the US.
**Change**: (1) `lint-feature.ts` — a pure-Node checker that verifies HR33 (no `<responseTransform>(data) as Type` blind cast), HR34 (business/display checklist rows → `utils/*.test.ts`), HR35 (verified-ratio from the checklist `## Summary`, not a naive row scan), HR36 (every ACT row maps to a `ux-states.json` `ac_assertions[]`/`unit_tests[]` or a `*.test.ts` referencing the id), and quality (`any`/`console`). Outputs findings + exit code; `--gate` makes errors fail the build. (2) **HARD RULE 36** mandates full AC + described-behavior coverage by unit (Jest) + E2E (Playwright) tests, generated **up front at B5** (new Step 8), implemented at B10, gated at B11, reported at B12. Backend-only ACs carry `<!-- enforced-by: BE -->` to leave the FE denominator. (3) B11 runs `lint-feature.ts --gate`; B12 box shows `AC tests <covered>/<total>`.

**Dogfood (empirical — the validation step prior rounds lacked):** ran `lint-feature.ts` against the existing `src/instructor-dashboard/analyze-exam/` (pre-v3.16). Results: HR33 = 8 blind casts in `data/api.ts`; transform.ts missing; HR34 = 5 BR rows with no util test; **HR36 AC coverage 75% (7/28 ACT rows untested: ACT-01/02/10/11/24/25/26)**; HR35 verified 12/59 = 20%; 1 `any`. This correctly shows the pre-v3.16 feature fails the new gates. The dogfood **also caught a bug in the linter itself** — the first HR35 pass reported 81% by counting ✅ in any row cell (evidence columns); fixed to read the authoritative `## Summary` counts (`Total UI rows: **31** — ✅ 9/31`), re-verified at 20%. (Exactly the "unverified claim" failure mode the audit flagged — caught here because this round was actually run, not just reasoned.)

### Change S.11 — Anti-fake-test, dormant Copilot machinery, conditional HR33

**Where**: `lint-feature.ts` (`checkTestQuality` + substance-aware `collectTestedAcIds`); EDITION CONFIG "Edition status"; HR33 (#4 conditional pass-through); HR36 (anti-fake-test clause); B12.6 cross-sync guard.
**Change**: (a) **Anti-fake-test** — the linter no longer credits hollow coverage: a `*.test.ts` with no `expect(`, an `ac_assertions[]` with no `expected`, or a `unit_tests[]` with no `grep`/`test_file` is reported as an error and excluded from AC coverage. Closes the "write an empty test to pass the gate" loophole. (b) **#3 Copilot decided (non-destructive)** — rather than delete HR16/B12.7 and renumber 36 cross-referenced rules (high risk), the Copilot sibling is declared **absent → all cross-edition machinery dormant** in EDITION CONFIG; B12.6 cross-sync now guards on file existence (skips + logs when absent). Stops the "sync pending" churn without renumber hazard. (c) **#4 HR33 conditional** — a mapper may be a thin pass-through when wire shape == domain shape, reducing ceremony on trivial features while keeping the cast ban. (d) **#5 prompt trim — deferred, with reason**: the command is cross-referenced by rule number across ~36 rules; a heavy trim is high-risk for low immediate value. The new `lint-feature.ts` *enables* a future safe trim (the B10 inline grep self-evals can move into the script once the gate is trusted) — logged as the next safe consolidation, not done blind this round.
**Dogfood**: re-ran `lint-feature.ts` on `analyze-exam` after the anti-fake changes — no crash, no false positives (that feature's `ac_assertions` all carry `expected`; AC coverage still correctly 75%).

### Change S.12 — Safe prompt trim (#5): B10 self-eval greps → lint-feature.ts --code-only

**Where**: `lint-feature.ts` (new `--code-only` mode + deep-import check folded into `checkQuality`); B10 agent brief SELF-EVAL block.
**Trigger**: #5 from the self-critique — the command duplicated quality checks as a long inline grep list in the B10 brief, and the prompt was bloating. Now that `lint-feature.ts` is tested, the generic greps can move into it (deferred-with-reason in S.11, done here safely).
**Change**: added `--code-only` to the linter (runs blind-cast + transform-layer + test-quality + quality only; skips checklist/ux-states/coverage so it works in the B10 worktree with no spec files). Added the deep-import (`../../../`) check to `checkQuality`. The B10 SELF-EVAL grep list (no `any`, no deep imports, no blind cast, no console) collapsed to a single `lint-feature.ts --code-only` call that MUST report 0 errors; only the design-token greps (hex/spacing/typography vs visual-properties.md — not covered by the script) and the React-Query-key convention remain inline. Net: fewer lines in the most-executed agent brief, and the quality bar is now the *same tested binary* at B10 (code-only) and B11 (full), eliminating drift between the two.
**Why this trim is safe**: it removes duplicated *instructions*, not behavior — the checks still run, now via a binary that was dogfooded. No rule renumbering, no step removal.

### Change S.13 — Tests for the gate itself (lint-feature.test.ts)

**Where**: refactor in `lint-feature.ts` (exported `lint(args): Finding[]` + exported `Args`; CLI now guarded by `process.argv[1]` so importing it doesn't run main); new `lint-feature.test.ts`; `package.json` `test:lint-feature`.
**Trigger**: the irony flagged in the S.11/S.12 self-critique — the tool that enforces "every feature has tests" had none.
**Change**: extracted a pure `lint()` entry point (resets state, returns findings) so the checker is unit-testable without spawning a process. Added `lint-feature.test.ts` — standalone (no jest; the project's jest scopes to `src/`) — that builds throwaway fixture features in a temp dir and asserts: (1) a clean feature → 0 code-only errors; (2) a dirty feature → HR33 blind cast, `any`, `console`, deep-import, placeholder-test all caught, transform-missing is a warning (no crash); (3) coverage fixture → HR36 flags an uncovered + a hollow (`expected: ""`) ACT row, HR35 reads 50% from the `## Summary`, and HR35/HR36 are skipped under `--code-only`. Run via `npm run test:lint-feature` (8 tests).
**Dogfood of the test**: first run failed 2/8 — and both were **fixture bugs the test correctly exposed**: the "clean" fixture's transform used `: any` (linter rightly flagged it), and the "dirty" fixture made no HTTP call so the transform-missing warning legitimately didn't fire. Fixed the fixtures → 8/8. Confirmed the CLI still runs after the refactor (import-guard matches direct invocation only).

### Change S.14 — Deeper anti-fake, parseArgs/exit-code tests, test integration

**Where**: `lint-feature.ts` (tautology detection in `analyzeTest`/`tautologicalLine`; exported `parseArgs` + new pure `gateExitCode`); `lint-feature.test.ts` (+6 tests → 14); `package.json` (`test:kit` + `posttest`); SETUP.md.
**Trigger**: the three remaining limitations from the S.13 self-critique.
**Change**: (a) **Anti-fake deeper** — `expect(true).toBe(true)`, `expect(<lit>).toBe(<same lit>)`, `expect(true).toBeTruthy()` etc. are detected as *tautological*; a test whose only assertions are tautological is a `test-quality` error AND does not credit AC coverage (collectTestedAcIds now requires a *meaningful* assertion). (b) **CLI tests** — exported `parseArgs` and extracted a pure `gateExitCode(args, errorCount)`; added tests for flag parsing, defaults, and the exit decision. (Dropped the child_process spawn approach: the repo path contains a space — `DEV AZURE` — which broke `npx.cmd` shell spawn; testing the pure decision is more robust anyway.) (c) **Integration** — `npm run test:kit` (cross-platform) + a `posttest` hook so the gate's self-test runs after `npm test`.
**Findings surfaced (both pre-existing, honestly logged):** the "clean" fixture's `expect(1).toBe(1)` was itself tautological → the new check correctly flagged it (fixed to `expect(Math.round(1.4)).toBe(1)`); and **the project's `npm test` script uses a Unix-style `NODE_ENV=test` prefix that fails on Windows** — so `posttest` only enforces in CI/Linux; on Windows run `npm run test:kit` directly.
**Remaining limitation (acknowledged, not solved):** anti-fake is heuristic (line-based, literal tautologies) — it does not catch a test that asserts confidently on the *wrong* value, nor semantic mismatch between an AC and its test. True semantic coverage is out of reach for a regex linter.

### Change S.15 — Fix inverted portability defaults (generic-safe fallbacks, not isu-elearner)

**Where**: PORTABILITY section (intro + table restructured to `key | portable fallback | this-repo value`); SESSION BOOTSTRAP optional-key bullets; HR23 + HR29 annotations; `CLAUDE.md` `### Workflow Overrides` intro; SETUP project-specific row.
**Trigger**: the user noticed the `### Workflow Overrides` block in `CLAUDE.md` hardcodes isu-elearner values and that `CLAUDE.md` is **per-repo — it does not travel with the kit**. Investigation found a worse problem the S.8/S.9 design got backwards: the *fallbacks* (when a key is absent) in the **portable command** were isu-elearner-specific — `reference_feature` → `src/class-member-grade-detail/`, HR23 → the class-sessions base. So any repo copying `.claude/` inherited isu-elearner coupling even though CLAUDE.md (the override location) didn't travel.
**Change**: flipped the architecture so the portable artifact carries only **generic-safe fallbacks** — HR23 is **INACTIVE** unless `endpoint_base_override` is defined; HR29 uses the **dominant convention in `src/`** (no fixed folder); HR21/22 use **semantic heading detection**; HR20 uses grep. The isu-elearner values now live ONLY in this repo's `CLAUDE.md` → `### Workflow Overrides` (correctly per-repo). **This repo's behavior is unchanged** (its CLAUDE.md supplies the values); **other repos now get safe-generic behavior** instead of inheriting isu-elearner specifics. Corrects the earlier S.8/S.9 wording ("absent key → isu-elearner default → repo behaves identically"), which was the inverted logic.
**Lesson**: a "default" baked into a portable artifact IS coupling. Repo-specific values belong in the per-repo `CLAUDE.md`; portable fallbacks must be safe for *any* repo (prefer "rule inactive" / "detect from repo" over a concrete foreign value).

### Change S.16 — Eval / regression harness (eval-feature.ts)

**Where**: new `.claude/integrations/eval-feature.ts` + `eval-feature.test.ts`; `package.json` (`eval:feature`, `test:eval-feature`, chained into `test:kit`); SETUP.md + README integration lists.
**Trigger**: the user chose "eval harness first" — to make prompt changes *measurable*, not just reasoned (the recurring self-critique). Builds on the lesson from S.10–S.15 that every change this session was validated by running, not asserting.
**Change**: `eval-feature.ts` aggregates the existing gates into ONE scorecard with 5 categories — **Artifacts** (required spec-folder files present & non-trivial), **Checklist** (5 sections + row-count sanity), **Code quality** (reuses `lint()`: HR33/HR34/quality/test-quality), **AC coverage** (HR36 %), **Verification** (HR35 %) — plus an overall %. Regression mode: `--write-baseline <f>` snapshots, `--baseline <f>` flags any category that dropped (via exported `compareBaseline`), `--gate` exits 1 on regression or overall < `--min` (default 80). Reuses `lint()` (no duplication). `eval-feature.test.ts` (7 tests) covers `evalArtifacts` (all/missing/trivial), `evalChecklist` (sections + counts), and `compareBaseline` (drop / no-drop); chained into `npm run test:kit` (→ `posttest`).
**Dogfood**: ran on `src/instructor-dashboard/analyze-exam` → **Overall 58%** (Artifacts 100, Checklist 95, Code 0, AC 75, Verification 20) — a correct, single-number picture of a pre-v3.16 feature. Verified `--write-baseline` + `--baseline` (no regression on identical re-run) + `--gate` exit 1 (58 < 80).
**Honest scope**: this is a **static scorecard of artifacts/code that already exist** — it does NOT re-run the B0–B12 workflow (that needs Confluence + interactive gates). It measures *output quality* of a generated feature and tracks regression across prompt edits when run on a fixed reference feature. The golden-fixtures dir referenced in S.8 (`docs/specs/_parity-golden/`) does **not** actually exist in this workspace — so golden snapshot comparison is left to the generic `--baseline` mechanism. A deeper RAG-based contract retrieval (the other option discussed) is deferred: it needs an authoritative BE OpenAPI/contract corpus to retrieve from.

### Change S.17 — Automated regression guard (committed baseline)

**Where**: exported `scoreFeature()` from `eval-feature.ts`; committed `docs/specs/AnalyzeExamPerformance/eval-baseline.json`; new `eval-regression.test.ts`; `package.json` (`test:eval-regression`, chained into `test:kit`).
**Trigger**: user chose "đo regression first" (RAG dropped — BE has no OpenAPI). Made the regression check **automated**, not a manual procedure.
**Change**: extracted a pure `scoreFeature(opts): Scorecard` (reused by both the CLI and the test). Snapshotted the reference feature `analyze-exam` (overall **58%**) to a committed baseline. `eval-regression.test.ts` re-scores it and fails (via `compareBaseline`) if any category or the overall dropped — chained into `npm run test:kit` (→ `posttest`, so CI catches it). Baseline is updated only on an intentional change via `--write-baseline`.
**Proof it bites** (not a no-op): temporarily inflated the committed baseline to 90 → guard correctly reported `❌ overall did not drop` + 2 regressions; restored to 58.
**Honest scope**: this guards (a) the harness/gate tooling and (b) accidental degradation of the committed reference feature. It is **NOT** prompt-regression — measuring whether a *prompt edit* generates better/worse features still requires re-running B0–B12 (Confluence + interactive gates), then `eval:feature --baseline`. The committed baseline reflects the **pre-v3.16** quality of analyze-exam (58%); when that feature is regenerated/fixed under v3.16, its score should rise — a positive delta vs this baseline is the measurable signal that v3.16 helped.

### Change S.18 — Regeneration demo measures v3.16 + fixes a linter false positive

**Where**: `lint-feature.ts` (`checkBlindCast` skips comment lines); `lint-feature.test.ts` (+1 → 15); throwaway demo `docs/specs/_demo-v316-data/`.
**Trigger**: user asked to "regenerate a feature" to measure v3.16 against the baseline. The full B0–B12 can't be driven non-interactively (Confluence + STOP gates + Playwright), so this regenerates the **data layer** — exactly where the real defect was (8 blind casts) — the v3.16 way: `transform.ts` mappers (wire shape = real BE contract), `api.ts` returning `mapXxx(camelCaseObject(data))` (no `as`), `utils/formatScore.ts` + a meaningful Jest test.
**Measured (lint code-only, same binary):** old `analyze-exam` data layer = **9–10 errors → Code quality 0%**; regenerated = **0 errors → Code quality 100%**. Concrete, machine-measured delta — not synthetic.
**Bug caught (again by running):** the regeneration's first lint flagged a false HR33 at `api.ts:1` — a *comment* that literally documents `camelCaseObject(data) as Type`. Fixed `checkBlindCast` to skip comment lines (`//`, `*`, `/*`); added a test locking it. This is the 4th real bug this session caught by running rather than asserting (after: linter over-count, fixture tautology, `npm test` Windows break).
**Honest scope:** AC coverage + Verification categories were NOT regenerated here — they need the interactive workflow + Playwright. The demo proves the *Code quality* category jump (the actual defect). The demo folder is a throwaway under `docs/specs/_demo-v316-data/` — safe to delete.

### Change S.19 — Regenerate AdminRefundProcessing + PaymentConfig; fix 2 more eval bugs

**Where**: throwaway demos `docs/specs/_demo-v316-refund/` + `_demo-v316-payment/`; bug fixes in `eval-feature.ts` (`evalChecklist` unique-id count) and `lint-feature.ts` (`parseChecklist` dedupe + `checkVerifiedRatio` consistent Summary numerator/denominator + ≤100% clamp); `lint-feature.test.ts` (+1 → 16).
**Trigger**: user asked to regenerate two more features. Both have full spec artifacts + `.full.http` contracts in this repo but no `src/` code (their implementations live in the authoring repo) — so the data layer was regenerated v3.16-style from each contract: literal-union types, `transform.ts` mappers (no `as`), `snakeCaseObject` request bodies, and a real **unit-tested business rule** each (`formatRefund` DD/MM/YYYY + 2-decimal money; `computePricing` VAT/surcharge/voucher/deposit). `computePricing` was *executed* (not just lint-checked): 1000 base → gross 1150, 20% voucher → finalFee 950 ✅.
**Measured (eval-feature, real spec + v3.16 code):** AnalyzeExam **58%** (Code 0 — old), AdminRefundProcessing **77%** (Code 0→**100**; AC coverage **0** — its `ux-states.json` has no matching `ac_assertions`; ui=34 over the [12,22] ceiling), PaymentConfig **90%** (Code **100**, AC **100**, Verification **100**; Artifacts 89 — missing `raw-spec.md`; Checklist 60 — missing UX States + Playwright sections). The harness produced **differentiated, actionable** findings per feature — not a rubber stamp.
**2 more bugs caught by running (5th & 6th this session):** (5) checklist row counts were `match`-occurrence counts, not unique IDs → PaymentConfig showed `act=83`; fixed to unique-set count in both tools. (6) After the dedupe, `checkVerifiedRatio` took the verified *numerator* from the Summary but the *denominator* from the deduped id count → PaymentConfig scored an impossible **107%**; fixed so both numerator and denominator come from the same `✅ X/Y` Summary, plus a `Math.min` clamp and a regression test.
**Note**: no committed baselines for the two demos (throwaway code); the regression guard stays on analyze-exam. Demos under `docs/specs/_demo-v316-*` are safe to delete.

### Copilot edition sync

**N/A this run** — see EDITION CONFIG "Edition status": the Copilot edition file is absent; cross-edition machinery is dormant by design. Re-apply Changes S.1–S.11 if it is reintroduced. — `.github/agents/feature-from-confluence.agent.md` does not exist in this workspace (only the Claude Code `.claude/` edition is present here). When the Copilot edition is re-introduced, apply Changes S.1–S.6 verbatim (Agent/worktree references → Copilot `editFiles`/MCP equivalents) per HARD RULE 16 parity policy.

### Net impact

- **Prompt version**: v3.15 → v3.16 (4 new HARD RULES 32–35 + B12.8 + transform.ts file layout).
- **Anti-rework**: contract provenance + mapping layer collapse late-contract rework to a single `transform.ts` edit guided by an auto-generated RECONCILE diff.
- **Honesty**: B12 can no longer claim "done" while the checklist is mostly unverified.
- **No breaking changes**: existing flows continue; FE_ONLY features behave exactly as before. transform.ts is additive.

## 2026-06-13 — v3.16 → v3.17 Release hardening (external audit + extraction)

**Trigger**: a 12-phase external audit + action pass. This is the commit-time bump that promotes the
working-tree Phase H (feature-index / feature-digest / section-overlap / AUTONOMY / ownership Check 3)
from "unreleased" to **released**, bundled with the hardening below. (Pre-agreed in the audit:
"bump only when v3.17 is committed + tagged" — that condition is now met.)

**Changes:**
- **PROMPT_VERSION v3.16 → v3.17.** All three stamps (copyright header, `PROMPT_VERSION`, progress
  banner) reconciled and bumped together; new `version-check.ts` gates their consistency in `test:kit`.
- **Cross-edition machinery removed** (the kit is now Claude Code only): deleted `parity-check.ts` +
  `parity-check-semantic.ts`, the **B12.7** step, the EDITION CONFIG cross-edition block, the B12.6
  Copilot cross-sync; repaired HR16/17/18/24/25/26 rationale. Command file −5.7 KB (budget headroom 0.7 → ~6 KB).
- **CI + tests**: first `.github/workflows` (kit `test:kit` on PR); `tsx`/`typescript` declared;
  new `memory.test.ts` (resume core + CRLF regression) and `regression-corpus.test.ts`; `memory.ts`
  parser deduped (imports `parseContextJson`).
- **Docs single-sourced**: new `http-contract.template.md` (`.http` no longer triplicated); new
  `INTEGRATIONS.md`; README archive-links fixed; `README.vi.md` marked secondary/may-lag; SETUP stale refs removed.
- **Security**: `.claude/mcp-server/.env` untracked (credential rotation handled out-of-band).
- **Standalone extraction**: `kit-standalone/` (self-contained repo; Confluence connector decoupled in the copy).

**Verified**: `test:kit` green (all suites + version-check + INDEX --check + budget gate) in the main repo
and in `kit-standalone/`. Detail: `docs/claude-commands/HARDENING-CHANGELOG.md` §9b/§9c + `AUDIT-ACTION-LIST.md`.

### Net impact

- **Prompt version**: v3.16 → v3.17.
- **Breaking change**: B12.7 (cross-edition parity) removed — was already a dormant no-op (no Copilot edition), so no functional loss.

---

## 2026-06-13 — Visual-fidelity audit (AnalyzeExamPerformance: images/ vs screenshots/) — Change W series

**Source**: manual side-by-side of `docs/specs/AnalyzeExamPerformance/images/mcp-image-0{4,5}.png` (design) vs the latest authenticated run `screenshots/state-0{1,2,10}-*-2026-06-12T15-33-*.png` (rendered). Root-cause-traced to `src/instructor-dashboard/analyze-exam/` source.

**Meta root-cause (the important one)**: the kit has had visual-diff infra since v3.6–v3.8 — `compare_images` MCP (Change A), `playwright-runner --visual-baseline`/`--audit-css` (Change B/I), `visual-properties.md` design tokens (Change D), checks PLAYWRIGHT-007/010 — **but none of it was executed for this feature**. The design images in `images/` were never diffed against `screenshots/`. The "75% verified" headline was **45/45 per-AC DOM assertions** (testid present + text present), which by construction cannot detect layout / styling / structural / label drift. So every gap below passed the gate. **Lesson: an assertion-based pass is NOT a visual-fidelity pass, and "verified%" must not count a UI row as done unless a visual diff (or an explicit structural check) backs it.**

**Gaps found (design → rendered), with code root cause:**

| # | Gap | Root cause |
|---|---|---|
| W-a | "Score distribution" heading missing | `SummaryTab.tsx:119` renders `<BarChart>` with no section label |
| W-b | Stat value wraps (`9.2` ⏎ `/10`), "points" suffix dropped, cards squeezed left not full-width | `SummaryTab.tsx:90-116` value + `/ X` in separate divs; `.score-stats-block` scss uses fixed cards; spec wants inline `X / Y points` full-width |
| W-c | Y-axis "Number of students" truncated | `SummaryTab.tsx:123` — i18n string-surgery hack `formatMessage(noResultsFound).replace('No results found.','Number of students')` + fixed `width={500}` clips the label |
| W-d | Distribution % shows 500% | `SummaryTab.tsx:77,133` — `total = scoreDistribution.total \|\| 1`; BE-05 returns `total:0` → `5/1*100`. No sum-of-categories denominator, no clamp ≤100 |
| W-e | (i) info icon missing before "Frequently Incorrect…" | `SummaryTab.tsx:142` plain `<h4>` |
| W-f | `2/35` not styled (numerator red) | `SummaryTab.tsx:156` plain text, no color span |
| W-g | One "Frequently Incorrect Questions" section became two headers; "Objective/Subjective" sub-labels + "Correct answer"/"Average score" column headers missing | `SummaryTab.tsx:141-211` two `<div><h4>` blocks, no `<thead>` |
| W-h | "Show all" is a bottom bordered button, not a top-right inline link | `ExamDetailsTab.tsx:184` |
| W-i | Delete modal renders top-left, transparent, overlapping header | `IndividualTab.tsx:73-74` — hand-rolled `pgn__modal-backdrop`/`pgn__modal` classnames in a plain `<div>`, no Paragon `<ModalDialog>` → no portal, no fixed positioning |
| W-j | Header subtitle "Exam Performance Analysis" vs spec "Content" | `messages.ts:194` invented label, ignored Component-2 spec |
| W-k | Chart category labels r-rounded; "Best/Lower Answers" hardcoded EN (spec "Lower-score answers"); subjective score shows extra "/ N pts" | `ExamDetailsTab.tsx:140,166,178` |

**Cross-cutting smell**: every component styles layout with inline `style={{…}}` instead of the co-located `.scss` + `visual-properties.md` design tokens (the HR added in v3.8 Change D/H was never runtime-enforced). This is the direct cause of the squeezed/ wrapping / off-palette rendering.

<!-- @lesson id="L-2026-06-13-001" classification="automated_gate" priority="high" root_cause="missing_validation" enforced_by="playwright-runner.ts:--visual-baseline-dir" test_status="enforced" -->
### Change W.1 — B11 mandatory visual-diff per UI_SCREENSHOT (not optional)

**Where**: B11 Step 4 invocation + B5 ux-states.json authoring + checklist `## Summary` verified-ratio rule.
**Change**: For every image-annotations.md entry typed `UI_SCREENSHOT`, B11 MUST run `compare_images(design_image, rendered_state_screenshot)` (or `playwright-runner --visual-baseline-dir`) with the state→image mapping declared in ux-states.json (each `states[]` gains an optional `baseline: <images/mcp-image-NN.png>`). A `UI_SCREENSHOT` with no executed visual diff is a B11 **incomplete** finding. HR35 verified-ratio may count a UI row as ✅ only if either a visual diff passed OR an explicit structural assertion (section grouping / column header / label text) passed — testid-presence alone is downgraded to ⚠️. Closes the gap that let W-a…W-k through a "75% verified" pass.

<!-- @lesson id="L-2026-06-13-002" classification="validation_rule" priority="high" root_cause="ui_ambiguity" enforced_by="lint-feature.ts:W2" test_status="enforced" -->
### Change W.2 — Ban i18n string-surgery + layout inline-style; require scss/design-tokens

**Where**: `lint-feature.ts` checkQuality (new greps); B10 SELF-EVAL.
**Change**: error on `formatMessage(...)\.replace(` (W-c — reusing a wrong message key and patching the text is always a smell; add the real message descriptor instead). Warn when a component exceeds N inline `style={{` carrying layout props (`display/flex/width/grid/padding/margin`) — section layout must live in the co-located `.scss` using `visual-properties.md` tokens (W-b cross-cutting smell). Reinforces v3.8 Change D/H which was prose-only.

<!-- @lesson id="L-2026-06-13-003" classification="validation_rule" priority="high" root_cause="missing_validation" enforced_by="lint-feature.ts:W3" test_status="enforced" -->
### Change W.3 — Use the UI library's real modal component; ban hand-rolled modal classnames

**Where**: `lint-feature.ts` checkQuality; B10 brief HARD CONSTRAINTS.
**Change**: error on literal `pgn__modal` / `<UI_LIB>__modal*` className strings in feature components (W-i). Popups MUST use the library's actual portal component (`<ModalDialog>` / `<AlertModal>` for Paragon; generalize via `PROJECT_CTX.ui_library`). Hand-applying the framework's modal CSS classes without its portal yields the broken in-flow top-left overlay seen here.

<!-- @lesson id="L-2026-06-13-004" classification="validation_rule" priority="medium" root_cause="br_ambiguity" enforced_by="none" test_status="pending" -->
### Change W.4 — Ratio/percentage business rule: derive denominator from data, clamp to [0,100]

**Where**: HR34 business-rule code guidance; B5 steps.md Step 6.5 trigger list.
**Change**: any `count/total*100` display where `total` can be 0/absent must compute the denominator from the data (e.g. sum of the distribution categories), never `total || 1`, and clamp the result to `[0,100]` (W-d → the 500% bug). Add "percentage of total / distribution %" to the Step 6.5 trigger phrases so it becomes a tested `utils/` pure fn, not an inline expression.

<!-- @lesson id="L-2026-06-13-005" classification="prompt_rule" priority="medium" root_cause="hallucination" enforced_by="none" test_status="pending" -->
### Change W.5 — Spec-literal labels & section structure from image-annotations.md

**Where**: B10 agent brief (reproduce structure from image-annotations.md) + B8.6/B4 label check.
**Change**: B10 must reproduce, verbatim from image-annotations.md / spec Component descriptions: (a) exact visible labels (subtitle "Content" not invented "Exam Performance Analysis" — W-j; "Lower-score answers" not "Lower Answers" — W-k), (b) section grouping (one "Frequently Incorrect Questions" with Objective/Subjective sub-sections, not two sibling headers — W-g), (c) column headers and inline-vs-block control placement ("Show all" inline top-right link — W-h), (d) the (i) info-icon and colored-numerator styling the annotation calls out (W-e/W-f). These are precisely the drifts a visual diff (W.1) catches; W.5 stops them at generation time.

### Net impact

- **No version bump / no stamp change** — `version-check.ts`/`test:kit` stay green; PROMPT_VERSION remains v3.17.
- **The single highest-leverage fix is W.1**: had the existing `compare_images` infra been run against `images/` for this feature, W-a…W-k would all have surfaced before "complete".

### Implementation (2026-06-13, same session — both requested)

**Enforcement wired (W.1/W.2/W.3 now `test_status=enforced`):**
- W.2/W.3 — `lint-feature.ts` gained `checkI18nStringSurgery` (errors on `formatMessage(...).replace(`), `checkInlineLayoutStyle` (warns >6 inline layout-style blocks per .tsx), `checkHandRolledModal` (errors on literal `pgn__modal`/`__modal-backdrop` classnames). 3 new fixture tests in `lint-feature.test.ts` (26 pass). Dogfood on `src/instructor-dashboard/analyze-exam --code-only` → **0 errors** (W2/W3 clean post-fix; 3 inline-style warnings remain on legacy components as non-blocking tech debt).
- W.1 — `feature-from-confluence.md` B11 Step 4 now passes `--visual-baseline-dir docs/specs/<FeatureName>/images` (was absent → why the diff never ran); the trailing note flipped from "optional" to MANDATORY when ≥1 UI_SCREENSHOT; B5 ux-states validation gained `ui_screenshots ⊆ states[].baseline`; Step 7 HR35 downgrade — a testid-only row is ⚠️ Partial, not ✅.

**Feature code fixed (W-a…W-k) in `src/instructor-dashboard/analyze-exam/`:**
- W-a/W-c — added "Score distribution" heading; replaced the `formatMessage(noResultsFound).replace(...)` Y-axis hack with `messages.numberOfStudents` + ResponsiveContainer (no clip).
- W-b — stat value now inline `X / Y points` on one row, cards `flex:1` full-width (scss `.score-stat-*`).
- W-d — new tested util `distributionPercent(count, categories)`: denominator = Σcategories, clamped [0,100] (kills the 500%). 3 unit tests.
- W-e/W-f/W-g — single "Frequently Incorrect Questions" section + (i) `InfoOutline` icon; Objective/Subjective sub-sections with "Correct answer"/"Average score" column headers; colored numerator (`.fi-numerator`).
- W-h/W-k — "Show all" moved to top-right inline link; Best/Lower-score answers i18n; dropped extra "/ N pts"; score via plural `answerScorePoints`.
- W-l (caught on browser re-verify) — Exam Details objective question rendered a heavy recharts vertical BarChart (0–100% axis + gridlines) **plus a duplicate ✓/✗ answer list**, diverging from the design's compact `[label] [✓/✗] [horizontal bar] [X (P%)]` rows. Rewrote `ObjectiveQuestionCard` to HTML answer-rows (data-driven bar width, green=correct / orange=wrong), dropped recharts + the duplicate list; `correctAnswers` → lowercase "correct answers" per design; QuestionListModal header → `correctAnswerColumn`. Reinforces the W.5 lesson: a per-AC testid pass hid a whole-component structural divergence that only an image-vs-screenshot look surfaced.

### Why W-l happened (deeper root cause — beyond "image never diffed")

Three compounding causes, each a generalizable lesson:

1. **Charting-library over-reach.** The design draws each answer as a *single proportional bar* (`label + ✓/✗ + bar + value` in one row). The implementation reached for recharts `<BarChart>` (the same lib used for the distribution / Top-5 charts) because the cue "horizontal bar with %" reads as "chart". recharts then forced axes, gridlines and category Y-axis labels the design never had — and because recharts can't place the ✓/✗ icon inline, a **second** `.map` rendered every answer label again as a separate list. One design row became a chart + a duplicate list.
2. **Text/testid assertions are structure-blind.** ACT-09 ("renders all Objective questions") asserted only `text="What is the time complexity" visible`. That passes whether each answer is a compact row OR a chart-plus-duplicate-list. "Right content, wrong structure" is invisible to text/testid checks — the exact blind spot W.1 (visual diff) exists to cover.
3. **No component-structure fidelity gate.** image-annotations described the objective block as "answer list with ✓/✗ + bar + value" (one row per answer). Nothing checked that the rendered DOM matched that structure, or that the same data array wasn't rendered twice. Component-level fidelity lived only in the design image, which went un-diffed.

<!-- @lesson id="L-2026-06-13-006" classification="prompt_rule" priority="high" root_cause="ui_ambiguity" enforced_by="playwright-runner.ts:--visual-baseline-dir" test_status="enforced" -->
### Change W.6 — Simple proportional bar → CSS element, NOT a charting library

**Where**: B10 agent brief HARD CONSTRAINTS; B2.5 design-token notes.
**Change**: Only reach for a charting library (recharts/chart.js) when the design actually shows chart furniture — value axis, gridlines, multiple series, or a legend. A *per-row proportional bar* (one bar that fills `value/total %`, label on one side, value on the other) MUST be a lightweight CSS element (a track `<div>` + a fill `<div>` with `width: <pct>%`), so it carries no unwanted axes and lets an inline icon/label sit in the same row. The W-l smell — a chart whose category labels are *also* re-rendered as a sibling list — is the tell that a chart was used where a row was wanted.

<!-- @lesson id="L-2026-06-13-007" classification="validation_rule" priority="medium" root_cause="ui_ambiguity" enforced_by="lint-feature.ts:W7" test_status="enforced" -->
### Change W.7 — Flag duplicate render of the same data array (no double-list smell)

**Where**: `lint-feature.ts` new `checkDuplicateDataRender`.
**Change**: Warn when one component `.map()`s over the **same array identifier ≥2 times** to emit JSX (e.g. `question.answers.map(...)` appears twice — once to feed a chart, once for a sibling list). This is the static fingerprint of the W-l duplication. A warn (not error): legitimate double-maps exist (recharts `<Cell>` + `<LabelList>` over `chartData`), but a repeated map over a *domain* array in a `.tsx` is worth a human look. Dogfooded on the **old** `ExamDetailsTab` (pre-W-l-fix) → fires; on the rewritten version → silent.

### LearnerExamPage gaps (W-m…W-o) — image mcp-09 vs screenshot state-12

**Why they happened:** same meta root-cause (the design image was never diffed), but the specific failure mode is **state conveyed by a styled container was implemented as a minimal variant**:
- **W-m** — spec 9.4 "Passed → green / Not passed → red" was rendered as a thin 2px **border tint** on a white card; the design fills the whole card green/red and colors the value. The `points` unit was also dropped (design "95.0 points" → impl bare "75"). Fix: filled `.score-card--pass/--fail` background + colored `.score-card__value` + `pointsSuffix`.
- **W-n** — spec Components 9.5/9.6 name "Objective"/"Subjective" sections, but the impl rendered the controls with **no section heading**; the "Progress X/Y" line was **plain text**, not the design's styled blue card. Fix: `learner-section-title` headings + `.progress-card`.
- **W-o** — the Final Result card omitted the design's leading **status ✓/✗ icon** and showed "Pass" where the design shows "PASS". Fix: `<Icon CheckCircle/Error>` + `.toUpperCase()`.
- Also: user-info labels were hardcoded inline English ("Name:", "Class:"…) and used "Name" where the spec says "Learner name", in a 2-col grid vs the design's 3-col. Fix: i18n descriptors (`learnerNameLabel`…), 3-col grid, blue `current lesson` link. (Reinforces W.5 — spec-literal labels.)

### LearnerExamPage Objective popup (W-p) — image mcp-11 vs ObjectiveModal

**The deepest gap of the series — the data model was under-modeled, locking the divergence in at the type layer.** Spec Component 9.8 + mcp-11 show the Objective popup as, per question: a `Question N` / `Score: x/total` header, the question text, then **every answer option** as a full-width row — the correct answer green+✓ (even if unselected), the learner's wrong pick red+✗, the rest neutral. The implementation instead rendered a **generic table** (`# | Full Name | Correct answers | ✓/✗`) — and even mislabeled the learner's answer with `fullNameLabel` ("Full Name"), the tell of a table template copy-pasted without reading the spec. Crucially, `ObjectiveExamItem` only carried `learnerAnswer/correctAnswer/isCorrect` (scalars) — **no `options[]`, no per-question `score/maxScore`** — so the design was literally **unrenderable** from the type, not just unrendered. Fix: extended the type (`options: string[]`, `score`, `maxScore`), enriched the mock, rewrote `ObjectiveModal` to per-question option blocks (`optionsFor()` falls back to `[correctAnswer, learnerAnswer]` if BE omits `options`), added `questionLabel`/`scoreOutOf` messages + scss.

<!-- @lesson id="L-2026-06-13-009" classification="prompt_rule" priority="high" root_cause="missing_validation" enforced_by="none" test_status="pending" -->
### Change W.9 — The data model must carry every field the design renders (reverse-trace UI→type)

**Where**: B8.6 SELF-EVALUATE (reverse-trace UI → API fields); B5 types.ts authoring; B10 brief.
**Change**: Before B8.6 closes, reverse-trace **every visual element** in each UI_SCREENSHOT to a field on the response type. If the design shows a *list of options* per item → the type needs an `options: T[]` array, NOT two scalars (`learnerAnswer`/`correctAnswer`); if it shows a *per-item score* → the item type needs `score`/`maxScore`. A type that drops these makes the design **unrenderable** — the gap is then invisible (the component silently degrades to whatever the thin type allows, e.g. a table) until someone opens the screen. Add to the B8.6 field-category checklist: "(d) per-item collections & per-item scores the design lists — an array/score field, not a flattened scalar." This is the type-layer sibling of W.5 (labels) and W.8 (styled containers): all three are design facts that must survive into code, and all three are caught at runtime only by the W.1 visual diff.

<!-- @lesson id="L-2026-06-13-008" classification="prompt_rule" priority="high" root_cause="ui_ambiguity" enforced_by="playwright-runner.ts:--visual-baseline-dir" test_status="enforced" -->
### Change W.8 — State shown via a styled container must BE that container, not a minimal proxy

**Where**: B10 agent brief HARD CONSTRAINTS; B2.5 design-token notes.
**Change**: When the design conveys a status/state through a **styled container** — a filled colored card (pass=green / fail=red), a status icon (✓/✗), a tinted "progress" panel, a badge — reproduce that container, NOT a cheaper proxy (a thin border instead of a fill, plain text instead of a card, a missing icon). A pass/fail rule like "Passed → green" means the **card background + value color**, not just a 1px border. Likewise: render every named section heading from the spec Component list (don't drop "Objective"/"Subjective" headings just because the control beneath them is self-evident), and never hardcode a user-facing label inline — use an i18n descriptor with the spec's exact wording ("Learner name", not "Name"). These are fidelity misses invisible to testid/text assertions and only caught by the W.1 visual diff — W.8 stops them at generation time.
- W-i — `DeleteConfirmModal` rebuilt on Paragon `<ModalDialog>`/`<ActionRow>` (portal, backdrop, centered) — no more top-left in-flow overlay.
- W-j — `contentSubtitle` "Exam Performance Analysis" → "Content" (spec Component 2).
- **Verified**: `npm run types` clean for analyze-exam (remaining tsc errors are pre-existing, unrelated files); `jest src/instructor-dashboard/analyze-exam` 17/17; `lint-feature --code-only` 0 errors.

---

## 2026-06-23 — v3.17 B11 quality (Change T series)

**Source**: BulkEnrollment (ISUITE2026-408) post-B11 review. Two workflow gaps surfaced during the first real B11 run: (1) the command lacked an explicit hard rule blocking auto-commit, allowing the workflow to commit code without user instruction; (2) B11 "After agents return" left BE-gated ACs as unmarked loose ends with no tracking artifact — when the real API is ready, there is no machine-readable record of what to re-verify.

<!-- @lesson id="L-2026-06-23-001" classification="prompt_rule" priority="high" root_cause="workflow_design_flaw" enforced_by="feature-from-confluence.md:HR37" test_status="exempt" -->
### Change T.1 — HARD RULE 37: Never auto-commit / auto-push

**Where**: `.claude/commands/feature-from-confluence.md`, HARD RULES (new rule 37).

**Trigger**: during BulkEnrollment B10 the workflow committed code to git without the user typing an explicit commit instruction. User caught it ("tại sao commit hết lên v back lại đi") and ran `git reset HEAD~1`. The mistake: answering "yes" to a B9 workflow gate was interpreted as commit authorization.

**Change**: New HARD RULE 37 — `NEVER run git commit or git push at any workflow phase (B0–B12) unless the user has typed an explicit commit instruction in their most recent message. Answering "yes" to a gate question does NOT constitute commit authorization. Only a direct instruction ("commit", "push", "tạo commit đi") counts.`

**Why the rule is needed**: the B9 gate question is "Shall I start implementing?" — a yes authorizes implementation, not a commit. Without an explicit rule, the workflow implicitly treats B12 completion as a natural commit point and may auto-commit.

<!-- @lesson id="L-2026-06-23-002" classification="validation_rule" priority="medium" root_cause="workflow_design_flaw" enforced_by="feature-from-confluence.md:B11-After-agents-return-step5" test_status="exempt" -->
### Change T.2 — B11 "After agents return": BE-PENDING tracking file + parallel checklist clarification

**Where**: `.claude/commands/feature-from-confluence.md`, B11 `### After agents return` — new step 5.

**Trigger**: BulkEnrollment checklist had 7 ACT rows marked `<!-- enforced-by: BE -->` (ACT-007–013). After B11 completed, these rows had no tracking artifact — no record of which endpoint, what to verify, or when to revisit. The user asked for a file so BE-gated items can be re-verified once the API is ready.

**Change**: Added step 5 to "After agents return":
- Scan `checklist.md` for any ACT rows with `<!-- enforced-by: BE -->`.
- If any exist, write `docs/specs/<FeatureName>/BE-PENDING.md` with a table: AC ID | Test Description | Required Endpoint | What to Verify.
- Log `[B11-be-pending] count=N` to `recovery.log`.
- Also clarified step 3: Agent B updates the checklist **during its own run** (parallel to Playwright execution), not as a sequential step after both agents finish.

**Applied immediately**: created `docs/specs/BulkEnrollment/BE-PENDING.md` with 7 rows (ACT-007–013), each with the matching POST endpoint and assertion.

<!-- @lesson id="L-2026-06-23-003" classification="validation_rule" priority="medium" root_cause="workflow_design_flaw" enforced_by="none" test_status="pending" -->
### Change T.3 — context-summary.md pendingSteps must be cleared as steps complete, not only at confirm gates

**Where**: `.claude/commands/feature-from-confluence.md`, all post-B9 steps (B9.5, B9.6, B10, B10.5, B11, B12).

**Trigger**: BulkEnrollment session resumed at B11 but `context-summary.md` still showed `pendingSteps: ["B8.5","B8.6","B9","B9.5","B9.6","B10","B10.5","B11","B12"]` — identical to the state saved at B9 (`final_confirmed`). Steps B8.5 through B10.5 had all completed in the previous session but `memory.ts save` was never called again after the B9 gate. The resume signal was therefore stale: any tool or human reading the context couldn't tell which steps were actually done.

**Root cause**: the workflow spec only mandates `memory.ts save` at confirm gates (B4, B6, B8, B9). Post-B9 execution steps (B9.5 git sync, B9.6 packages, B10 implement, B10.5 playwright opt-in) have no corresponding memory write, so `pendingSteps` is never reduced during the BUILD phase.

**Change**: after each post-B9 step completes, call `memory.ts save` with the updated `pendingSteps` (remove the step just finished). Minimal payload — only `pendingSteps` needs to change:

```bash
# After B9.5
npx tsx .claude/integrations/memory.ts save b9_5_done '{"featureName":"<Name>","pendingSteps":["B9.6","B10","B10.5","B11","B12"]}'
# After B10 implements
npx tsx .claude/integrations/memory.ts save b10_done '{"featureName":"<Name>","pendingSteps":["B10.5","B11","B12"]}'
# After B11
npx tsx .claude/integrations/memory.ts save b11_done '{"featureName":"<Name>","pendingSteps":["B12"]}'
```

**Why it matters**: a stale `pendingSteps` causes confusion at session resume — the next session cannot distinguish "B10 pending" from "B10 done, now at B11". It also makes the workflow's PROGRESS DISPLAY inaccurate if re-printed.

<!-- @lesson id="L-2026-06-23-004" classification="prompt_rule" priority="medium" root_cause="workflow_design_flaw" enforced_by="none" test_status="pending" -->
### Change T.4 — B11 dev server check: verify only, never auto-start; ask user if not running

**Where**: `.claude/commands/feature-from-confluence.md`, B11 `### Step 3 — Dev server check`; `playwright-verify` skill SETUP Step 3.

**Trigger**: the existing B11 spec (and the `/playwright-verify` skill) says: if server unreachable → start with `npm run dev &`, wait 15s, re-check. During BulkEnrollment B11, the user explicitly rejected this approach — the dev server may require environment variables, specific terminal setup, or the user prefers to start it themselves. Auto-starting silently in the background is unsafe and surprising.

**Change**: replace the auto-start branch with an explicit ask:

```
curl check → if NOT 200/302:
  ⚠️ Dev server not reachable at <DEV_SERVER_URL>.

  Please start it (e.g. `npm run dev`) and confirm when ready.
  STOP — wait for user confirmation before continuing.
```

**Never** run `npm run dev &` (or any variant) automatically. The user may need to set env vars, authenticate, or start the server in a specific terminal. The cost of pausing to ask is near-zero; the cost of a background process that fails silently or uses the wrong env is high.

**Why the distinction from prior fix (T.2 `npm run dev &` was added at v3.4 Change Fix 1)**: Fix 1 was solving "Agent B fails silently when the server isn't running." The correct fix is to *stop and ask*, not to silently spawn. The check remains mandatory; the auto-start is what's removed.

<!-- @lesson id="L-2026-06-23-005" classification="validation_rule" priority="medium" root_cause="workflow_design_flaw" enforced_by="none" test_status="pending" -->
### Change T.5 — ux-states.json: `_skip` field is not honored by playwright-runner; use `deferred_states[]`

**Where**: `docs/specs/<FeatureName>/ux-states.json` authoring convention; B11 ux-states.json authoring guide.

**Trigger**: BulkEnrollment `membership-tab` state was given `_skip: true` because it requires real admin auth (ACT-001). But `playwright-runner.ts` processes `allStates = [...states[], ...negative_states[]]` and does not read `_skip`. The state still ran, timed out, and caused PLAYWRIGHT-CASCADE + a failing AC assertion — even though the state was explicitly marked to skip.

**Root cause**: `_skip` is a documentation field (intended as a human hint) but has no runner semantics. The runner iterates every entry in `states[]` unconditionally.

**Change**: when a state cannot be verified in the current environment (requires real auth, specific data, or backend not yet available):
- **Correct**: move the state from `states[]` to a `deferred_states[]` array. The runner only processes `states[]` and `negative_states[]` — any other key is ignored.
- **Incorrect**: adding `_skip: true` to a state still inside `states[]` — the runner runs it anyway.

```json
{
  "states": [ /* only runnable states */ ],
  "deferred_states": [
    {
      "name": "membership-tab",
      "_reason": "requires real admin auth — see BE-PENDING.md ACT-001",
      "steps": [...]
    }
  ],
  "negative_states": [...]
}
```

**Why it matters**: a state in `states[]` with `_skip: true` appears correctly annotated but still causes cascade failures and inflates the failing-check count, masking real results. Moving to `deferred_states[]` cleanly removes it from the run while preserving the state definition for when the environment is ready.

### Net impact

- **Prompt version**: no bump (T series = workflow-behavior patch on v3.17, no schema change).
- **Commit safety**: HR37 makes explicit what was implicit. The user must authorize commits; workflow answers do not count.
- **BE traceability**: every B11 run now produces a `BE-PENDING.md` when backend-gated ACs exist, giving a clear re-verification checklist once the API is ready.
- **context-summary accuracy**: T.3 ensures `pendingSteps` reflects actual completion state across sessions, not just gate-confirm state.
- **Dev server safety**: T.4 stops silent background `npm run dev` spawns; the workflow pauses and asks the user to start the server.
- **ux-states.json deferral**: T.5 — use `deferred_states[]` (not `_skip: true`) to exclude states the runner should not process.

---

## 2026-06-22 — L-21: DEV_SERVER_URL trailing-slash fix in playwright-runner

**Source**: ISUITE2026-504 SessionList (kit, 2026-06-22).

### Change L-21 — Strip trailing slash from DEV_SERVER_URL

**Where**: `.claude/integrations/playwright-runner.ts` — `runFeatureVerification()` baseUrl read.

**Trigger**: a `DEV_SERVER_URL` with a trailing slash (e.g. `http://localhost:3000/`) produced double-slash URLs
(`http://localhost:3000//isu-elearner-learning/...`) that caused navigation failures with no obvious error.

**Change**: `const baseUrl = (process.env.DEV_SERVER_URL ?? 'http://localhost:1999').replace(/\/$/, '');`

---

## 2026-06-22 — L-22: workflow:kpis timestamp column lacks HH:mm (documentation-only)

**Source**: kit, 2026-06-22. Proposed fix, not yet implemented.

**Trigger**: `workflow:kpis` report prints run timestamps as date-only — impossible to distinguish same-day runs.

**Proposed change**: include `HH:mm` in timestamp column (e.g. `2026-06-22 14:37`). No impact on stored KPI data.

---

## 2026-06-24 — L-23: playwright-runner auto-update ## Summary section

**Source**: ISUITE2026-408 BulkEnrollment post-API verification run (2026-06-24). User noted that `## Summary` in `checklist.md` was updated manually after each Playwright run.

<!-- @lesson id="L-2026-06-24-001" classification="automated_gate" priority="medium" root_cause="workflow_design_flaw" enforced_by="playwright-runner.ts:updateChecklistSummary" test_status="enforced" -->
### Change L-23 — Add `updateChecklistSummary()` to playwright-runner.ts

**Where**: `.claude/integrations/playwright-runner.ts` — new function `updateChecklistSummary()` + call site in `runFeatureVerification()`.

**Trigger**: The runner's `updateChecklistRows()` only updates individual table rows (ACT/UI/REQ). The `## Summary` section is free-form text with aggregate counts (`Total REQ rows: N — ✅ M/N`) that had to be edited manually after every Playwright run. This created a maintenance gap where the Summary could be stale or incorrect.

**Change**: Added `updateChecklistSummary(checklistPath, playwrightChecks, acResults, unitTestResults, runTimestamp)`. It:
1. Calls `countSection(title)` — scans each `## Section` block, filters table rows (skips separators + header row), counts ✅/❌/⬜ per section
2. Covers four sections: Requirements Coverage, UI Verification, ACT, UX States
3. Builds summary lines with `overallIcon()`: ✅ if all pass, ❌ if any fail, ⚠️ if mixed, ⬜ if empty
4. Appends Playwright run stats (passPw/totalPw, date, AC assertion count) and unit test count
5. Replaces `## Summary[\s\S]*$` regex — always regenerates from the last `## Summary` heading to EOF
6. Called immediately after `updateChecklistRows()` in the `cfg.acChecklistPath` block so the Summary reflects the just-written row statuses

**Legend line** (`⬜ = not yet verified | ✅ = verified | ...`) is preserved as the last line of the new Summary block.
