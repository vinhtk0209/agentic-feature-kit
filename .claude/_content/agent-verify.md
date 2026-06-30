```
// Agent A — Static analysis
Agent({
  description: "B11-A: Static analysis — <FeatureName>",
  prompt: """
    Run static analysis on the <FeatureName> feature in this React/TypeScript project.
    Feature folder: src/<feature-folder>/

    ╔══════════════════════════════════════════════════════════════════════╗
    ║  SCOPED COMMANDS — YOU MUST USE THESE EXACT COMMANDS               ║
    ║  Do NOT run npm run lint / npm run stylelint (they scan the whole   ║
    ║  project and will show errors from other features — not your job).  ║
    ║                                                                      ║
    ║  Run ONLY these 3 scoped commands:                                  ║
    ║    1. npm run types                                                  ║
    ║       → only fix TS errors whose path starts with src/<feat-folder>/║
    ║    2. npx stylelint "src/<feature-folder>/**/*.scss"                ║
    ║           --config .stylelintrc.json                                ║
    ║    3. npx eslint --ext .js,.jsx,.ts,.tsx src/<feature-folder>/      ║
    ║                                                                      ║
    ║  Commands 2 and 3 already only report feature-folder errors.        ║
    ║  For command 1 (full-project): IGNORE any error whose path          ║
    ║  does NOT start with src/<feature-folder>/ — do not read, do not   ║
    ║  edit, do not mention as fixable. List as "Pre-existing".           ║
    ║                                                                      ║
    ║  NEVER run: npm run lint | npm run lint:fix | npm run stylelint     ║
    ║  (un-scoped). These modify the whole project.                       ║
    ╚══════════════════════════════════════════════════════════════════════╝

    For each error IN src/<feature-folder>/:
      - Report file:line, error message
      - Apply the fix using the Edit tool
      - Re-run the failing check to confirm it passes

    Self-Recovery (up to 3 attempts per error):
      Attempt 1: auto-fix with Edit
      Attempt 2: alternate approach (different type annotation, different import path)
      Attempt 3: minimal change to satisfy the linter without changing behavior
    After 3 failed attempts on the same error: stop and report it unresolved.

    Final report format:
      types:  PASS | FAIL (N errors in feature, N auto-fixed, N unresolved)
      scss:   PASS | FAIL (N errors, N auto-fixed, N unresolved)
      eslint: PASS | FAIL (N errors, N auto-fixed, N unresolved)
      Files modified: [list or "none"]
      Pre-existing (skipped): [file:line list or "none"]
  """
})

// Agent B — UI verification  ← run AFTER Agent A returns
// This agent calls run_b11 (phase orchestrator) then enhances with direct playwright
Agent({
  description: "B11-B: UI verification — <FeatureName>",
  prompt: """
    Verify the <FeatureName> feature renders correctly using Playwright interactions.
    Feature route: <feature-route>
    Feature folder: src/<feature-folder>/

    Step 0a — RESOLVE the route from the REAL router, NEVER from the spec title/heading.
      (Audit 2026-06-29: a run inferred `/class-management/1` → React-Router "404 Not Found",
      so every state cascade-failed on the opening navigate. The app actually routes
      `/class-management/edit/:id` — read from `<Link to=...>` in the parent list page.)
      Before using <feature-route> in ux-states.json states[].route:
        1. Grep how the parent page is reached, and read its router entry:
           grep -rnE "<Link to=|<Route |path:|generatePath\(|createBrowserRouter" src | grep -i "<route-keyword>"
        2. Take the router's path PATTERN (fill :params with a real id) as <feature-route>.
        3. If the dev server is up (B10.5), confirm it is NOT a 404 BEFORE running Playwright:
           curl -s -o /dev/null -w "%{http_code}" "${DEV_SERVER_URL:-http://localhost:3000}<PUBLIC_PATH><feature-route>"
           A 404 (or an "Unexpected Application Error" / "404 Not Found" render) = wrong route →
           fix it from the router first; do NOT run Playwright on a route that 404s.

    Step 0 — Phase-level MCP verification (primary path, v3.9):
      Call the MCP tool `run_b11` (from `feature-workflow` server) with:
        - featureName: <FeatureName>
        - featurePath: src/<feature-folder>
        - noPlaywright: false
      This runs ALL routes from ux-states.json in one call (reads top-level routes[] OR, if absent,
      derives routes from states[].route — the B5 LOCKED schema, audit F1).
      Returns: { b11_a, b11_b, typeErrors, lintErrors, coverageErrors, routeResults[], checklistUpdated, summary }
      `coverageErrors` is the HR33/34/35/36 gate result (lint-feature --gate) run inside run_b11 —
      if > 0, fix the uncovered ACT rows / blind casts before B12 (do NOT proceed on a coverage failure).

      If b11_a = fail: read typeErrors / lintErrors — these are scoped to featurePath, fix them,
        then call run_b11 again (up to 3 attempts).
      If b11_b = fail: read routeResults[].checks for per-route details.
        Pre-existing failures (CORS, migration banner, env-level) → note in checklist, do NOT block.
      If the tool returns `isError = true` OR the `feature-workflow` MCP server is unavailable:
        → Log: "[B11] MCP run_b11 unavailable — falling back to playwright-runner direct"
        → Fall through to Step 1 below.

    Step 1 — Ensure docs/specs/<FeatureName>/ux-states.json is present and consumable — do NOT clobber B5's file:
      ONE schema is authoritative: B5's LOCKED "File 4" FLAT shape, which BOTH readers depend on —
      b11-runner.ts reads routes via states[].route; lint-feature.ts reads AC coverage via
      states[].ac_assertions[] and unit_tests[]. Never replace it with a nested states[].states[]
      shape — that drops ac_assertions and makes the coverage gate read 0% (audit F1).

      Flat schema (authoritative):
      {
        "feature": "<FeatureName>",
        "version": "v2",
        "routes": ["<feature-route>"],            // optional convenience mirror of states[].route
        "states": [
          {
            "name": "<ScreenName-state>",
            "route": "<feature-route>",
            "steps": [ { "action": "waitForSelector", "selector": "[data-testid='...']", "label": "load" } ],
            "ui_rows": ["UI-001"],
            "ac_assertions": [ { "ac_id": "ACT-001", "selector": "[data-testid='...']", "expected": "visible" } ]
          }
        ],
        "negative_states": [ { "name": "...", "steps": [...], "ac_assertions": [ { "ac_id": "ACT-0XX", "selector": "[role='alert']", "expected": "i18n:errors.required" } ] } ],
        "unit_tests": [ { "ac_id": "ACT-AC5a", "test_file": "src/<feature-folder>/utils/x.test.ts", "grep": "..." } ]
      }

      InteractionStep action types (playwright-runner v3) — use these in states[].steps[]:
      | action           | Required fields                        | Behaviour |
      |------------------|----------------------------------------|-----------|
      | `mockRoute`      | urlPattern, responseStatus, responseBody | intercept API calls before navigate |
      | `navigate`       | url                                    | page.goto() |
      | `click`          | selector                               | page.click() |
      | `fill`           | selector, value                        | page.fill() — clears then sets; triggers React onChange |
      | `type`           | selector, value                        | page.type() — char-by-char keydown/keyup; use for debounced inputs |
      | `select`         | selector, value                        | page.selectOption() — selects <option> by value string |
      | `wait`           | timeout                                | page.waitForTimeout() |
      | `waitForSelector`| selector                               | page.waitForSelector() |
      | `waitForURL`     | pattern                                | page.waitForURL(glob) — waits for navigation |
      | `screenshot`     | —                                      | saves screenshot at this point in the step sequence |
      | `assertAttribute`| selector, attribute, expected          | inline assertion; expected="true"/"false" for boolean attrs (disabled etc.) — THROWS on failure |
      | `assertCount`    | selector, expected (number)            | inline assertion; counts matching elements — THROWS on failure |
      | `assertText`     | selector, expected (string)            | inline assertion; trimmed textContent of first match equals expected — THROWS on failure |
      | `dismissDialog`  | —                                      | registers one-shot dialog.dismiss() — place BEFORE the click that triggers the dialog |
      | `dragAndDrop`    | selector (source), targetSelector      | manual pointer drag (move→down→nudge→move→up). NOTE: drives HTML5 DnD; **@dnd-kit PointerSensor is NOT reliably drivable** via synthetic pointer — prefer a unit test for that lib and mark the AC `enforced-by: manual` |

      All steps also accept: `label` (required), `timeout` (optional, default 10_000ms), `screenshotAfter` (optional bool).
      Assertion steps (`assertAttribute`, `assertCount`, `assertText`) that throw will fail the enclosing state and trigger cascade detection.

      Case A — file EXISTS (B5 created it): preserve states[] / ac_assertions[] / unit_tests[] exactly.
        ONLY add a top-level "routes": [unique states[].route] if it is missing. Do NOT rewrite states[].
      Case B — file ABSENT: create it in the FLAT schema above from processed.md state descriptions
        + real selectors from the feature's TSX. One state per screen; each carries its own route,
        steps, and ac_assertions. Do NOT emit a nested states[].states[] shape.
      Rules:
      - Use real selectors extracted from the feature's TSX files
      - UI library selector rules (v3.14): Modal → use the library's root CSS class (e.g. `.modal`) NOT [data-testid="modal-*"];
        Toast/Notification → text=<exact message> NOT [data-testid="toast-*"]; avoid [role="alert"] for toast detection

    Step 2 — Initial screenshot (fallback / enhancement when run_b11 succeeded):
      MSYS_NO_PATHCONV=1 DEV_SERVER_URL=${DEV_SERVER_URL:-http://localhost:3000} \
        npx tsx .claude/integrations/playwright-runner.ts <feature-route> \
        --screenshot --feature-name <FeatureName>
      Parse the --- JSON --- block from output.

    Step 3 — Error state (mock API 500):
      MSYS_NO_PATHCONV=1 DEV_SERVER_URL=${DEV_SERVER_URL:-http://localhost:3000} \
        npx tsx .claude/integrations/playwright-runner.ts <feature-route> \
        --screenshot --feature-name <FeatureName> --mock-error
      Verify PLAYWRIGHT-006 passed (error alert rendered on 500 response).

    Step 4 — UX state interactions + per-row verification (v3.6 — Changes E/I/K/L/M/N):
      MSYS_NO_PATHCONV=1 DEV_SERVER_URL=${DEV_SERVER_URL:-http://localhost:3000} \
        npx tsx .claude/integrations/playwright-runner.ts <feature-route> \
        --screenshot --feature-name <FeatureName> \
        --interactions docs/specs/<FeatureName>/ux-states.json \
        --ac-checklist docs/specs/<FeatureName>/checklist.md \
        --messages-path src/<feature-folder>/messages.ts \
        --audit-a11y \
        --audit-css docs/specs/<FeatureName>/visual-properties.md \
        --visual-baseline-dir docs/specs/<FeatureName>/images \
        --visual-diff-threshold 5
      The runner detects v2 schema (states[] array) automatically and uses per-state baseline diff +
      ac_assertions + unit_tests. It also updates checklist.md Status + Evidence per row.

      Map check IDs:
        PLAYWRIGHT-007       → Visual regression vs spec baselines (per-state pixel diff)
        PLAYWRIGHT-008       → Per-AC assertion verification (states[].ac_assertions)
        PLAYWRIGHT-UI-ROWS   → UI Verification table verdicts (mapped from baseline diff)
        PLAYWRIGHT-UNIT      → Unit Test ACT rows (jest -t pattern)
        PLAYWRIGHT-009       → A11y audit (axe-core, critical+serious only)
        PLAYWRIGHT-010       → CSS computed-style audit vs visual-properties.md
        PLAYWRIGHT-STATE-*   → Per-state interaction success/failure (legacy v1 fallback)

      If visual-properties.md is missing → omit --audit-css.

      W.1 (MANDATORY visual diff — image-vs-screenshot, not testid-only):
        If image-annotations.md has ≥1 UI_SCREENSHOT entry, --visual-baseline-dir is REQUIRED, not
        optional. Each ux-states.json state that mirrors a design image MUST set states[].baseline to
        the matching docs/specs/<FeatureName>/images/<file>.png (B5 authoring rule). A UI_SCREENSHOT
        design image with NO executed PLAYWRIGHT-007 diff for some state is a B11 **incomplete**
        finding — list it under Unresolved and do NOT mark the corresponding UI rows ✅.
        Rationale: a per-AC testid/text pass (PLAYWRIGHT-008) cannot detect layout / styling /
        section-structure / label drift — those slipped through on AnalyzeData precisely
        because the design images in images/ were never diffed against screenshots/.
        Only skip --visual-baseline-dir when image-annotations.md has 0 UI_SCREENSHOT entries.

    Step 5 — browser-use (only for flows Playwright cannot verify):
      Pre-check before invoking (both conditions must pass):
        1. File exists:  test -f .claude/integrations/browser-use-wrapper.py
        2. Python exists: command -v python >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1
      If both pass:
        python .claude/integrations/browser-use-wrapper.py "<task>" <feature-route>
      If either fails:
        Skip silently — log "browser-use skipped — wrapper or python unavailable"
        Append "⚠️ complex flows not auto-verified (browser-use unavailable)" row to checklist
      Use for: modal chains, infinite scroll, multi-step interactions, polling.

    Step 6 — Unit tests (only for logic NOT reproducible via UI):
      npm test -- --testPathPattern=src/<feature-folder>/

    Step 7 — Checklist update (if docs/specs/<FeatureName>/checklist.md exists):
      W.1 verified-status rule (HR35 downgrade): a UI row may be set ✅ Pass ONLY if it is backed by
        a passed PLAYWRIGHT-007 visual diff OR an explicit structural assertion (section grouping /
        column header / exact label text). A row whose only evidence is testid/text presence
        (PLAYWRIGHT-008) is marked ⚠️ Partial (testid-only), NOT ✅ — so the Summary verified-ratio
        reflects true visual fidelity, not assertion presence.
      Read ## UI Verification table — for each row with empty `screenshot:`:
        Set Evidence: "screenshot: screenshots/<screenshotPath filename>"
        Set Status:   ⬜ → ✅ Pass (visual/structural backed) | ⚠️ Partial (testid-only) | ❌ Fail
      Read ## ACT table — for each row with tool=Playwright and Status=⬜ Pending:
        Set Status: ✅ Pass or ❌ Fail
        Set Evidence: screenshot filename
      Recount Summary section: update "X / Y passed" per section + Overall line.
      Edit tool to write back. Print: "📋 Checklist updated".
      If checklist missing: skip silently, note "checklist not found" in report.

    Self-Recovery on test fail (up to 3 attempts):
      Attempt 1: analyze error → auto-fix code → re-run
      Attempt 2: alternate implementation of same behavior → retest
      Attempt 3: isolate failing case → fix in isolation → retest full suite
    After 3 attempts, classify the failure:
      Bug/edge case → report unresolved
      Architecture mismatch → report: "Design cycle-back needed — return to B6.5"

    Final report format:
      Loading state: PASS | FAIL (screenshot path)
      Error state:   PASS | FAIL (error alert selector found/not found)
      Empty state:   PASS | FAIL | N/A
      Success state: PASS | FAIL (screenshot path)
      Interactions:  N steps across M states
      Screenshots:   docs/specs/<FeatureName>/screenshots/
      Unresolved:    [list or "none"]
      Design issue:  yes (describe) | no
  """
})
```
