# Changelog

All notable changes to **feature-from-confluence-kit** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version numbers track `PROMPT_VERSION` in `.claude/commands/feature-from-confluence.md`
(the source of truth). `npm run version:check` asserts consistency across all stamps.

---

## [3.18.0] — 2026-06-15

Nine lessons (L-01 – L-09) distilled from a full-feature verification pass and integrated
as machine-enforced gates or durable prompt guidance. `<!-- @lesson -->` annotations in
`.claude/prompt-evolution.md` pair with each Change section for sync-check enforcement.

### Added — Machine-enforced gates

- **`playwright-runner.ts` — cascade detection** (`<!-- @lesson id="L-08-..." -->`):
  A single root-cause failure now blocks all subsequent states from executing. Both
  `states[]` and `negative_states[]` are processed in one cascade-aware loop. A
  `PLAYWRIGHT-CASCADE` check reports `Root failure ("<state>") → N cascade-blocked
  state(s)`. New export `analyzeCascade(stateResults)` is pure-function tested in
  `playwright-runner.test.ts`.

- **`lint-feature.ts` — `checkLiteralChartValueZero`** (`<!-- @lesson id="L-05-..." -->`):
  Scans non-test TS/TSX files for `value: 0` literals within ±15 lines of a `.map(`
  call. Flags as `L05` error — chart values must be derived, not hardcoded. Always
  active (not gated behind `--code-only`).

- **`lint-feature.ts` — `checkModalCloseSelector`** (`<!-- @lesson id="L-03-..." -->`):
  When a ux-states step uses a footer-button selector (`button:has-text('Cancel')` etc.)
  but the TSX modal file has no `Footer` / `ActionRow`, emits a `L03` warning — wrong
  close selector cascades to all downstream assertions. Spec-coupled (requires
  `--ux-states`).

- **`contract-probe.ts` — `fallback_masking` + `suspect_value`** (`<!-- @lesson id="L-09-..." -->`):
  Two new `ContractFinding.kind` values:
  - `fallback_masking` (error): FE reads a type-modeled field with `??` literal fallback
    AND that field is absent from the contract response — the fallback silently masks the gap.
  - `suspect_value` (warn): two typed string fields at the same object level share the same
    non-empty value, suggesting wrong-field data from the backend.
  New exports: `extractNullishFields`, `detectFallbackMasking`, `detectSuspectValues`.

- **`lint-feature.ts` — `checkI18nCaseDrift`** (`<!-- @lesson id="L-02-..." -->`):
  Warns when a ux-states `text:` assertion value cannot be traced to any `defaultMessage`
  entry in the feature's `messages.ts` (after exact / trim / toUpperCase / toLowerCase
  variants). Spec-coupled. Pairs with existing `checkI18nStringSurgery` (W.2, v3.17).

- **`checklist.template.md` — `## 🌱 Seed Coverage`** (`<!-- @lesson id="L-07-..." -->`):
  New pre-Technical-Checks section. Enumerates every boolean flag and conditional field;
  requires confirming both branches are exercised by seed data. Seed-blocked branches
  must be marked `needs-human`, not ✅.

- **`package.json`** — new `test:playwright-runner` script; added to `test:kit` chain.
  `playwright-runner.test.ts` now covers `analyzeCascade` with 6 unit tests.

### Added — Prompt guidance

- **`feature-from-confluence.md` — AC-selector-chart rule** (`<!-- @lesson id="L-01-..." -->`):
  Before writing `.recharts-wrapper`, grep the target component for `'recharts'` /
  `ResponsiveContainer`. If absent, use the component's actual root CSS class.

- **`feature-from-confluence.md` + `new-feature.md` — precision pattern** (`<!-- @lesson id="L-04-..." -->`):
  "1 decimal place, drop trailing .0" → `Math.round(v*10)/10` then `toFixed(0/1)`.
  Explicitly notes that `toPrecision(n)` gives significant figures (wrong for
  decimal-place display).

- **`feature-from-confluence.md` + `new-feature.md` — back-button / tab-URL conventions**
  (`<!-- @lesson id="L-06-..." -->`):
  Drill-down back buttons must use `generatePath(ROUTE, params) + '?tab=<tabId>'`, never
  `navigate(-1)`. Tabbed parent pages must initialize tab state from `searchParams.get('tab')`
  rather than a hardcoded `useState('defaultTab')`. Added `## Navigation conventions (L-06)`
  section to `new-feature.md`.

### Documentation

- **`.claude/prompt-evolution.md`** (new file): audit log of all nine lessons, each entry
  annotated with `<!-- @lesson -->` paired within 5 lines of a `### Change` heading —
  consumed by `lesson-registry.ts --sync-check`.
- **`LESSONS-FOR-KIT.md`**: added L-09 section documenting the two contract-probe gap
  patterns (fallback masking + suspect field values).
- **`docs/claude-commands/INTEGRATIONS.md`**: added 6 new rows to enforcement/wiring map
  (L-05, L-03, L-02/W.2b, L-09 fallback_masking, L-09 suspect_value, L-08 cascade) and
  new `## 10. L-series checks` section.

---

## [3.17.0] — 2026-06-14

### Added

- **AUTONOMY opt-in unattended mode** (`--auto` / `--auto=scope,files,plan`): configures
  which confirmation gates (B4, B6, B6.5, B8) can be auto-advanced when the workflow's
  self-evaluation confidence reaches ≥ 95%. Hard-stop gates (scope conflict, override,
  Playwright failure) are never skipped. Enable per-invocation — no global config.

- **Step 1.5 — Extract flags**: new pre-B2 step that parses `--auto` (and future flags)
  from `$ARGUMENTS`, stores `AUTONOMY`, and persists it to `context-summary.md` as
  `autonomyGates`.

- **Check 3 — Repo / route ownership** (audit F9 / Issue E): deterministic script-backed
  guard (`check-ownership.ts`) that verifies the workflow is running in the correct
  MFE / repository before B5 generates any output. Prevents cross-repository spec
  misrouting without relying on prose judgement.

- **B11 Playwright token preflight**: `npm run check:playwright-token` now runs
  automatically at the start of B11. Reads `PLAYWRIGHT_TOKEN_EXPIRES_AT` from
  `.env.playwright` and pauses with a renewal prompt if the token is expired or
  expiring within 24 hours (exit code 3). Avoids silent auth failures mid-visual-diff.

- **B12.5 Step 3 — lint-derivation scan**: non-blocking post-B12 step that re-runs
  `lint-feature.ts` over the completed feature and emits `.amendments/` proposal files
  for any static patterns the implementation missed. Surfaces rework before the PR,
  not after review.

- **New scripts** in `package.json`:
  - `check:playwright-token` — token expiry check (exit 0 ok / 3 expired or soon)
  - `check:lessons-sync` — verifies every `<!-- @lesson -->` annotation is paired
    with a `### Change` heading within 5 lines; part of `test:kit`

- **`lesson-registry.ts`**: new `syncCheck()` export and `--sync-check` CLI flag.
  Exits 0 gracefully when `prompt-evolution.md` is absent (fresh clone with no
  local audit log). `test:kit` now chains `check:lessons-sync` as its final gate.

- **`version-check.ts`**: new `checkPlaywrightToken()` export and `--playwright`
  CLI flag. Exit codes: 0 ok, 1 general failure, 2 config error, 3 expired/expiring.

- **`lint-feature.ts`** — three new static-analysis checks derived from
  AnalyzeData root-cause lessons W.2, W.3, W.7:
  - `checkI18nStringSurgery` (W.2) — detects raw string literals inside JSX that
    should use `intl.formatMessage`
  - `checkHandRolledModal` (W.3) — flags `position:fixed` / `z-index` overlay patterns
    that bypass the UI library's Modal/Dialog primitive
  - `checkDuplicateDataRender` (W.7) — detects data fetched in a parent that is also
    fetched independently in a child, causing double-render or stale-data bugs

### Changed

- **W.1 — `--visual-baseline-dir` is now mandatory** in the B11 Step 4 runner
  invocation (was optional / "omit if no baseline"). Omitting it is a prompt
  integrity CI failure (grep gate in `.github/workflows/workflow-kit-ci.yml`).

- **W.1 — Step 7 status enum extended**: `⚠️ Partial (testid-only)` is now a valid
  row status alongside `✅ Pass` and `❌ Fail`. A UI row backed only by a CSS selector
  / test-id assertion (no visual pixel diff) MUST be downgraded to `Partial`; it cannot
  be marked `Pass` (HR35). Enforced by the same CI prompt-integrity grep gate.

### Infrastructure

- CI (`workflow-kit-ci.yml`) gains two new steps in the `kit-verify` job:
  - **Verify B11 prompt integrity** — three `grep` assertions: `--visual-baseline-dir`
    present, stale optionality text absent, `Partial (testid-only)` present in enum.
  - **Lesson annotation sync check** — `npx tsx .claude/integrations/lesson-registry.ts
    --sync-check` enforces annotation ↔ Change-section pairing.

---

## [3.16.0] — 2026-06 *(prior release — not shipped in this kit)*

> v3.16 was developed and released inside the host repository before this kit was
> extracted. Key changes for reference: PORTABILITY layer (repo-specific CLAUDE.md
> knobs), S.1 contract-provenance gate, S.2 explicit mapping layer (no blind casts),
> S.3 business rules as code + test, S.4 done = verified (40% floor), S.10 full AC
> coverage gate. See the host repo's `prompt-evolution.md` for the full audit log.
