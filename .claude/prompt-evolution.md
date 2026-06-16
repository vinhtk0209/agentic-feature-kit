# Prompt Evolution Log

> Changes to `.claude/commands/feature-from-confluence.md` and the integration toolchain derived from
> verified lessons. Each entry is paired with a `<!-- @lesson -->` annotation consumed by
> `lesson-registry.ts`. Run `npm run check:lessons-sync` to verify pairing integrity.

---

<!-- @lesson id="L-08-2026-06-15-001" classification="automated_gate" priority="high" root_cause="workflow_design_flaw" enforced_by="playwright-runner.ts:analyzeCascade" test_status="enforced" -->
### Change: playwright-runner — L-08 cascade detection

**Pattern**: A single wrong close-action selector failed silently, leaving a modal open and intercepting
all subsequent pointer events. 14/18 Round-1 failures cascaded from this single root cause.

**Section amended**: `runFeatureVerification` — v2 states loop.

**Change applied**: States and negative_states are now processed in one cascade-aware loop. When a step
action fails in state N, all subsequent states are marked `cascade-blocked` and skipped (not executed).
A `PLAYWRIGHT-CASCADE` check reports: `Root failure ("<state>") → N cascade-blocked state(s)`. Exported
`analyzeCascade` is tested in `playwright-runner.test.ts`.

---

<!-- @lesson id="L-05-2026-06-15-002" classification="automated_gate" priority="high" root_cause="hallucination" enforced_by="lint-feature.ts:checkLiteralChartValueZero" test_status="enforced" -->
### Change: lint-feature — L-05 checkLiteralChartValueZero

**Pattern**: Chart data mapper used `value: 0` unconditionally for one data mode. All bars rendered flat.
Masked in CI because the current seed never activated that mode.

**Section amended**: `lint()` code-quality section.

**Change applied**: `checkLiteralChartValueZero` scans non-test TS/TSX files for `value: 0` literals
within ±15 lines of a `.map(` call. Flags as `L05` error. Tests in `lint-feature.test.ts`.

---

<!-- @lesson id="L-03-2026-06-15-003" classification="validation_rule" priority="high" root_cause="ui_ambiguity" enforced_by="lint-feature.ts:checkModalCloseSelector" test_status="enforced" -->
### Change: lint-feature — L-03 checkModalCloseSelector

**Pattern**: A ux-states close step used `button:has-text('Cancel')` on a display modal (no Footer/ActionRow).
The click failed silently; the open modal cascaded to 14 downstream assertion failures.

**Section amended**: `lint()` spec-coupled section.

**Change applied**: `checkModalCloseSelector` warns when a footer-button selector appears in ux-states steps
AND the TSX file has a Modal without Footer/ActionRow. Tests in `lint-feature.test.ts`.

---

<!-- @lesson id="L-09-2026-06-15-004" classification="automated_gate" priority="high" root_cause="contract_drift" enforced_by="contract-probe.ts:detectFallbackMasking,detectSuspectValues" test_status="enforced" -->
### Change: contract-probe — L-09 fallback_masking + suspect_value

**Pattern (3 backend data issues that passed FE verification undetected)**:
1. A spec-required field absent from the response; the FE read it with `?? 0` → rendered 0, looked fine.
2. A field present but carrying another field's value (text === id) → UI appeared populated but was wrong.

**Section amended**: `probeContract` + `ContractFinding.kind` type.

**Change applied**: Two new drift classes: `fallback_masking` (error — `??` fallback hides absent field) and
`suspect_value` (warn — two string fields share same value). New exports: `extractNullishFields`,
`detectFallbackMasking`, `detectSuspectValues`. Tests in `contract-probe.test.ts`.

---

<!-- @lesson id="L-07-2026-06-15-005" classification="validation_rule" priority="medium" root_cause="missing_validation" enforced_by="checklist.template.md" test_status="enforced" -->
### Change: checklist.template.md — L-07 Seed Coverage section

**Pattern**: Multiple AC branches unexercisable because seed data only covered one side of conditionals
(boolean flags always false, all items with same status). Branches marked ✅ were actually seed-blocked.

**Section amended**: `.claude/templates/checklist.template.md`.

**Change applied**: Added `## 🌱 Seed Coverage` section. Enumerates boolean flags and conditional fields;
requires confirming both branches are covered by seed. Seed-blocked branches must be `needs-human`, not ✅.

---

<!-- @lesson id="L-02-2026-06-15-006" classification="validation_rule" priority="medium" root_cause="ui_ambiguity" enforced_by="lint-feature.ts:checkI18nCaseDrift" test_status="enforced" -->
### Change: lint-feature — L-02/W.2b checkI18nCaseDrift

**Pattern**: `text:` assertions used spec prose / title case instead of actual `defaultMessage` values.
Two failures from case mismatch; one from a missing `.toUpperCase()` transform at the render site.

**Section amended**: `lint()` spec-coupled section.

**Change applied**: `checkI18nCaseDrift` warns when a `text:` assertion in ux-states cannot be traced
to any `defaultMessage` value (after exact/trim/toUpperCase/toLowerCase variants). Tests in `lint-feature.test.ts`.

---

<!-- @lesson id="L-01-2026-06-15-007" classification="prompt_rule" priority="medium" root_cause="ui_ambiguity" enforced_by="none" test_status="exempt" -->
### Change: feature-from-confluence.md — L-01 AC-selector-chart guidance

**Pattern**: ux-states assertion used `.recharts-wrapper` on a tab that renders bars via CSS divs, not Recharts.
The selector silently fails because the element never exists on that tab.

**Section amended**: "UI library selector pitfalls" section.

**Change applied**: Added `AC-selector-chart` rule — grep the target component for `'recharts'` /
`ResponsiveContainer` before writing `.recharts-wrapper`. If absent, use the component's actual root class.

---

<!-- @lesson id="L-04-2026-06-15-008" classification="prompt_rule" priority="medium" root_cause="br_ambiguity" enforced_by="none" test_status="exempt" -->
### Change: feature-from-confluence.md + new-feature.md — L-04 precision pattern

**Pattern**: `toPrecision(n)` used for "1 decimal place" display rules. Gives sig-figs, not decimal places —
caused wrong rounding on values near thresholds and kept trailing `.0` on whole numbers.

**Section amended**: "Step 6.5 utils/ format utility" section.

**Change applied**: Added precision pattern: `Math.round(v*10)/10` then `toFixed(0/1)`, explicitly noting
`toPrecision(n)` is for sig-figs (wrong for decimal-place display).

---

<!-- @lesson id="L-06-2026-06-15-009" classification="prompt_rule" priority="medium" root_cause="missing_project_knowledge" enforced_by="none" test_status="exempt" -->
### Change: feature-from-confluence.md + new-feature.md — L-06 back-button + tab-from-URL

**Pattern**: `navigate(-1)` used for back buttons on drill-down pages; `useState('defaultTab')` used for
tabbed pages. Both fail when the user's entry path differs from the spec-expected flow.

**Section amended**: "UI library selector pitfalls" + "Navigation conventions" (new section in new-feature.md).

**Change applied**: Both commands now document: back buttons use `generatePath(ROUTE, params) + '?tab=<id>'`;
tabbed pages read `?tab=` from URL params to initialize state.
