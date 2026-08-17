# Changelog

All notable changes to **Agentic Feature Kit** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version numbers track `PROMPT_VERSION` in `.claude/commands/feature-from-confluence.md`
(the source of truth). `npm run version:check` asserts consistency across all stamps.

Source version authority, Git tags, and GitHub Releases are separate facts.
Numeric Git tags exist for v3.17 and v3.18 only. No GitHub Releases exist as of 2026-08-17.
Entries from 3.19.0 through 3.25.0 document source milestones; they do not claim that an artifact
was published.

---

## [Unreleased]

Changes after the v3.25 source milestone are collected here until a later release decision.

### Added

- Provider-neutral shared capabilities and deterministic bundles for Codex, Claude Code, and
  GitHub Copilot, with explicit bundle and shared-core version authorities.
- Typed multi-provider routing, orchestration, transport, evidence, control-plane, privacy, tenant,
  and writer-adapter contracts with fail-closed tests.
- A public-entry and governance surface covering provider selection, contribution, support,
  security reporting, community conduct, issue forms, and pull request evidence.
- A Git-index-bound public-release manifest and no-plaintext internal-marker disposition registry.

### Changed

- Cross-platform Linux and Windows qualification now emits digest-bound artifacts and a fail-closed
  aggregate verdict for qualified pull request heads.
- Post-17 roadmap decisions, inputs, implementation slices, and evidence are tracked as distinct
  authorities rather than being inferred from version strings.

### Security

- Public-release eligibility remains blocked by 31 unresolved marker dispositions plus deferred
  supply-chain, nightly, and clean-clone gates. This section is not a release-readiness claim.

## [3.25.0] — 2026-07-16

**Status:** Untagged version milestone; no GitHub Release.
**Source commit:** `a6d118d1b95962ff41c6db035d76f49136649d77`

### Changed

- Reduced the AA.4 Playwright token warning threshold from 24 hours to 6 hours and locked the
  measurement-layer environment design, stamps, and regression lesson to the same authority.

## [3.24.0] — 2026-07-13

**Status:** Untagged version milestone; no GitHub Release.
**Source commit:** `a52260be905dd72089b9ee7e9b707e6c44b29f67`

### Added

- Added Tier B measurement-layer token preflight, data-reached evidence, and bounded wait behavior
  so environment readiness fails closed instead of relying on elapsed time alone.

## [3.23.0] — 2026-07-12

**Status:** Untagged version milestone; no GitHub Release.
**Source commit:** `c324caf5feb8e4137c2493b319ef5e6bf37abb5f`

### Fixed

- Made the B11 runner exit gate include the Playwright verdict, preventing a downstream record from
  reporting success when browser verification failed.

## [3.22.0] — 2026-07-12

**Status:** Untagged version milestone; no GitHub Release.
**Source commit:** `e853b41c8ae754e1e6d29948061143ebdd2e1527`

### Fixed

- Split content-hash inputs into code-path and specification-name authorities so verification binds
  the intended source without conflating two identities.

## [3.21.0] — 2026-07-12

**Status:** Untagged version milestone; no GitHub Release.
**Source commit:** `9a72054f4388590ffcbb27fd7721f4fc51087b42`

### Added

- Wired `record-verify` capture into B11 and added the concrete pre-commit verification command so a
  successful workflow can produce an auditable verification record.

## [3.20.0] — 2026-07-12

**Status:** Untagged version milestone; no GitHub Release.
**Source commit:** `3e55521ced24e1b72a2d49484929366a67a2084c`

### Changed

- Consolidated D-cross-2 U.1, the forbidden B11 verify-key correction, Figma V.1/V.4 integration,
  HR40 context finalization, and the package-version correction from 3.18.0 to 3.20.0.

## [3.19.0] — 2026-07-11

**Status:** Untagged version milestone; no GitHub Release.
**Source commit:** `f5fb28187b1d4249c3afbb06b7319a6c35fcc53c`

### Changed

- Completed the D-cross-2 ENHANCE reconciliation and HR39 coverage, with all 19 reconciliation
  checks passing at the source milestone.

## [3.18.0] — 2026-06-30

Confluence output consolidation (single-writer) + per-run telemetry markers. `PROMPT_VERSION`
advanced to v3.18; the marker additions (2026-07-01) landed within v3.18 without a further bump.

### Changed — Confluence output structure (single canonical folder)

- **One root per feature** — all artifacts now live under `docs/specs/<usId>-<FeatureName>/`
  (raw-spec.md, processed.md, images/, …). Killed the previous 3-way scatter caused by two
  competing naming systems (MCP `safeTitle` vs orchestrator `FeatureName`) and the duplicate
  `images/` folder. `<!-- @lesson id="L-27" -->`.
- **Two-phase MCP (single-writer)** — `fetch_confluence_page` returns spec text only (no disk
  write, no image fetch); B1 is the sole writer of `raw-spec.md`; new `save_confluence_images(url,
  targetDir)` tool writes images directly into the canonical folder.
  (`.claude/mcp-server/index.ts`, `commands/feature-from-confluence.md` B0/B1/B2, `_content/images.md`.)

### Changed — Visual diff is now opt-in

- Visual diff in `playwright-runner.ts` gated behind `--visual-diff` (default off); `runVisualDiff`
  code kept intact. Reverted Change W.1 from mandatory to opt-in (with a "do not re-enable as
  required" note). `PLAYWRIGHT-007` reports "skipped — opt-in" when off.

### Added — Per-run telemetry markers (2026-07-01, within v3.18)

- `telemetry.ts` emits `@@KIT_EVENT@@` **meta** (kit version + runner, at verify/step0) and **error**
  markers; `feature-from-confluence.md` PROGRESS DISPLAY emits a **state/phase** marker per step —
  consumed by the dashboard sidecar for per-run metrics.
- Half-sync fix: added `mcp-server/index.ts` to the sync allowlist so the two-phase MCP ships with
  the v3.18 prompt; added a B2 loud-but-graceful fallback when `save_confluence_images` is absent.

### Documentation

- Ported **L-28** + **L-29** and added **L-30** to `.claude/prompt-evolution.md` (L-27…L-30 present).

## [3.17.1] — 2026-06-15

> **Note (reclassified 2026-07-02):** this entry was originally labeled `[3.18.0]`. Reclassified to
> 3.17.1 because the content shipped while `PROMPT_VERSION` was still v3.17 (dated one day after
> [3.17.0]) and is **not** the Session-1 v3.18 work above. Whether a 3.18.0 was *intended* at the
> time is unverifiable from the squashed baseline history — this is a correction by inference, not a
> recorded fact.

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
