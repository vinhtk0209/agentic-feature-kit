# Lessons for Kit — Post-Verification Findings

Distilled from a full B11 verification cycle (2 rounds, 27→45/45).  
**All names, paths, and feature details are generic — no project-specific data.**

---

## L-01 — Test Assertion: Wrong Chart Library Selector on Tab Without That Library

**Pattern observed:** A ux-states assertion used `.recharts-wrapper` to verify a tab that renders bar content via CSS divs, not Recharts. The assertion silently fails because the DOM element never exists on that tab (conditional rendering unmounts other tabs). Upstream passes on the same selector only if tested before the tab switch. The symptom is misleading: the spec says "bar chart" — but bar chart can be CSS or Recharts.

**Root cause:** Assertion was written assuming Recharts universally, without inspecting the component's actual rendering strategy.

**Kit improvement:**  
When generating ux-states assertions for "chart" or "graph" requirements:
1. First grep for `recharts` / `ResponsiveContainer` in the target component file.
2. If absent, fall back to the component's primary container class (e.g., `.objective-question-card`) or a structural element (e.g., row/bar div).
3. Never assume recharts is used just because the spec says "chart" or "bar chart".

**Selector calibration rule to add:**  
`AC-selector-chart`: Before writing `.recharts-wrapper`, confirm the component imports from `'recharts'`. If not, use the component's actual root class.

---

## L-02 — Test Assertion: Case-Sensitive Text Checks Against `formatMessage` Output

**Pattern observed:** Two text assertions failed due to case mismatch:
1. A label key's `defaultMessage` used sentence case ("Best answers") but the assertion checked title case ("Best Answers").
2. A status message used `.toUpperCase()` on the i18n output ("Pass" → "PASS") but the assertion checked the original case ("Pass").

**Root cause:** Assertion author read the spec (which often uses title case) rather than reading `messages.ts` `defaultMessage` values and any `.toUpperCase()` / `.toLowerCase()` transforms applied before rendering.

**Kit improvement:**  
When generating ux-states `text:` assertions for i18n strings:
1. Read `messages.ts` `defaultMessage` values directly — do not infer from spec prose.
2. Check the render site for any `.toUpperCase()` / `.toLowerCase()` / `.trim()` applied to `intl.formatMessage(...)` output.
3. The assertion must match the final rendered string, not the raw message key or spec description.

**Rule to add:**  
`W.2 — i18n case drift`: `text:` assertions that cannot be traced to a verbatim `defaultMessage` value (after transforms) get ⚠️ Partial, not ✅.

---

## L-03 — Test Assertion: Modal Close Selector Must Match Actual Modal Type

**Pattern observed (high impact):** A ux-states state used `button:has-text('Cancel')` to close a modal. The modal was a UI-library modal (`ModalDialog` with `hasCloseButton`) that only renders an X icon button — no "Cancel" button. The click action failed silently (no exception), the modal stayed open, and the `modal-backdrop` intercepted all subsequent pointer events, cascading to 14 downstream assertion failures across 7 states.

**Root cause:** Two modal types existed in the feature: (A) confirmation modals with `<Button>Cancel</Button>` in a `Footer/ActionRow`, and (B) read-only display modals with only an X close button from the UI library. The assertion treated both as type A.

**Kit improvement:**
1. Distinguish modal type when generating close actions:
   - **Confirmation modals** (with Cancel/Yes/No footer buttons): use `button:has-text('Cancel')` or `button:has-text('Close')`.
   - **Display/info modals** (content-only, X button): use `.pgn__modal-close-button` (Paragon) or `[aria-label="Close"]`.
2. Before generating a close step, check the component for `<ModalDialog.Footer>` / `ActionRow`. If absent, use the X button selector.
3. Treat a close-action failure as a **blocking cascade risk** — annotate it in the ux-states with a `_cascade_risk: true` marker so the runner reports it prominently.

**Rule to add:**  
`W.3 — close-action type`: Close action on a display modal using a footer-button selector = ⚠️ Partial (wrong selector). Mark as blocking cascade risk.

---

## L-04 — Code Bug: Numeric Formatting with Wrong Precision Function

**Pattern observed:** A utility function used `toPrecision(n)` (significant figures) where the spec required `toFixed(1)` semantics (1 decimal place, trailing zero dropped). This caused:
- Whole-number-after-rounding values to keep their decimal (`8.0` instead of `8`).
- Values just above a threshold to round to 2 decimals instead of 1 (`1.23K` instead of `1.2K`).

**Root cause:** `toPrecision(3)` gives 3 significant figures — correct for scientific notation, wrong for display formatting that specifies "1 decimal place."

**Kit guidance:**  
When generating numeric display utilities matching spec rule "1 decimal, drop trailing .0":
```ts
// Correct pattern:
const oneDecimal = Math.round(value * 10) / 10;
return oneDecimal % 1 === 0 ? oneDecimal.toFixed(0) : oneDecimal.toFixed(1);
// Wrong: toPrecision(3) — gives sig figs, not decimal places
```
Add this pattern to the kit's format utility template.

---

## L-05 — Code Bug: Chart Data Mapping Hardcoded Constant Instead of Derived Value

**Pattern observed:** A bar chart component mapped data items to `{ value: 0 }` unconditionally for one of two data modes. All bars rendered at height 0 (visually identical / flat). The bug was masked in CI/testing because the current seed data never activated that mode.

**Root cause:** Likely a copy-paste from a placeholder; the second `labelKey` branch was never filled in.

**Kit guidance:**  
When generating chart data mappers with multiple `labelKey` modes, add a lint/type check: the `value` field must be derived from the data, never a literal number constant unless it's a documented sentinel. Consider adding a kit ESLint rule: `no-literal-chart-value-zero` (flag `value: 0` inside chart `data.map` transforms).

---

## L-06 — Code Bug: Navigation Back Button Must Target Spec-Specified Tab, Not Browser History

**Pattern observed:** A drill-down detail page used `navigate(-1)` for its back button. The spec required "navigate to [parent screen] → [specific tab]". `navigate(-1)` is unreliable: it uses browser history (depends on user's entry path) and on remount, the parent page defaults to its first tab, not the spec-required tab. This violated the spec-specified UX flow.

**Root cause:** `navigate(-1)` conflated "go back in history" with "go to the spec-defined target." Tab state was also not URL-persisted, so even a correct back navigation would reset the tab.

**Kit guidance — two-part pattern:**
1. Back buttons on drill-down pages must use an explicit path (`generatePath(ROUTE, params) + '?tab=<tabId>'`), never `navigate(-1)`.
2. Parent pages with tabs must read `?tab=` from URL to initialize tab state — not `useState('defaultTab')`. This makes tab state shareable via URL and resilient to navigation.

**Rule to add to `new-feature` template:**  
Any page with a `?tab=` selector should initialize: `useState(validTabs.includes(searchParams.get('tab')) ? searchParams.get('tab') : defaultTab)`.

---

## L-07 — Infra: Backend Seed Gaps Block Code-Path Coverage

**Pattern observed:** Multiple AC branches could not be exercised because the staging seed data only covered one side of a conditional:
- A `time_available` flag was always `false` — the "time column visible" branch was never activated.
- All participants had `passed: true` — the "Not Passed" filter branch was only testable via its empty-state path, not its populated path.
- A `total` field was always `0` — the FE had to apply a workaround denominator, but the nominal code path (using `total`) was never exercised.

**Root cause:** Seed data was set up for the "happy path" (everyone passes, no time limit) without adversarial branches.

**Kit guidance:**  
When generating a verification plan, enumerate all boolean flags and conditional fields in the API response types. For each, check whether the current seed covers both `true` and `false` values. If not, classify the branch as `seed-blocked` in the checklist and note it as `needs-human` in the verification report. Do not mark an AC as ✅ if its branch is seed-blocked.

**Checklist addition:**  
Add a `## Seed Coverage` section to `checklist.md` template listing each flag and its seed state.

---

## L-09 — Contract Gap: Fallback Masking + Suspect Field Values

**Pattern observed (3 independent backend data issues that passed FE verification undetected):**

1. **Fallback masking**: A spec-required field was absent from the API response. The FE read it with a `?? fallback` (e.g. `item.score ?? 0`). The rendered output showed `0`, visually indistinguishable from a real zero — so the UI looked correct. The contract-probe's existing `missing` check only flags **non-optional** type fields; once the developer added `?` to avoid a TS error, the absence was silently hidden.

2. **Suspect value**: A field was present in the response but carried the wrong data — its value equalled another field's value (e.g. `text === id`). The UI appeared populated (non-empty), but the displayed label was semantically wrong. Shape matching and type checking both passed because the field existed and was the right primitive type.

**Root cause:** The contract-probe checked field **names** and **types**, but not **presence under ?? cover** or **value plausibility**.

**Kit improvement — two new `contract-probe` drift classes:**
- `fallback_masking` (error): FE accesses a type-modeled field with `??` fallback, AND that field is absent from the contract response. The fallback silently renders the default, hiding the contract gap.
- `suspect_value` (warn): Two string fields in the contract response share the same non-empty value (suggesting wrong-field data, e.g. `text` carrying `id`'s value). Flag for human review.

---

## L-08 — Process: Cascade Failure Identification Priority

**Pattern observed:** A single wrong close-action selector (L-03) caused 14/18 Round-1 failures. Without correct cascade analysis, these would appear as 14 separate bugs requiring 14 fixes, wasting 2–3 analysis hours.

**Kit guidance:**  
When analyzing a failed Playwright run:
1. **First pass:** identify states where a step action failed (not just an assertion failed). A step failure means all subsequent states running on the same page are invalidated.
2. Treat a step failure in state N as the root cause for all failures in states N+1..M that share the same page session.
3. Fix the step failure before analyzing any downstream assertion failure.

**Runner improvement:**  
When a step action fails (e.g., element not found for click), the runner should:
1. Mark ALL subsequent states in the same page session as `"cascade-blocked"` rather than running them (which produces misleading "assertion failed" evidence).
2. Report the total cascade count alongside the root failure: `"Root failure (state 04 step 1) → 14 cascade-blocked assertions"`.
