---
description: Run Playwright UI verification on any route — screenshot, map 4 UX states, auto-fix bugs (3 attempts)
---

Route: **$ARGUMENTS**

---

## ARG VALIDATION

**Run this check first — before any other step.**

If `$ARGUMENTS` is empty or blank:

```
❌ Missing input

Usage:
  /playwright-verify <route> [--feature-name <name>] [--folder <src/path>]

Arguments:
  <route>              Required. App route to verify (e.g. /your-app/feature-route)
  --feature-name       Optional. Feature name for screenshot folder (default: inferred from route)
  --folder             Optional. Source folder for auto-fix context (default: inferred from route)

Examples:
  /playwright-verify /your-app/feature-route
  /playwright-verify /your-app/feature-route --feature-name UserProfile
  /playwright-verify /your-app/feature-route --feature-name UserProfile --folder src/your-app/user-profile
```

**STOP immediately. Do not continue.**

Parse `$ARGUMENTS`:

```
ROUTE        = first token not starting with "--"
FEATURE_NAME = value after "--feature-name" flag, or infer from last segment of ROUTE
               e.g. /your-app/feature-route → "FeatureRoute"
FEATURE_FOLDER = value after "--folder" flag, or infer from ROUTE
               e.g. /your-app/feature-route → "src/your-app/feature-route"
```

---

## SETUP

### Step 1 — PKG_MANAGER detection

Check lockfiles in project root (in priority order):

| Lockfile | PKG_MANAGER |
|----------|-------------|
| `bun.lockb` or `bun.lock` | `bun` |
| `pnpm-lock.yaml` | `pnpm` |
| `yarn.lock` | `yarn` |
| `package-lock.json` | `npm` |
| None found | `npm` (default, log warning) |

Print: `📦 Package manager detected: [PKG_MANAGER]`

### Step 2 — Playwright check + install

```bash
npx --no -- playwright --version 2>&1
```

| Result | Action |
|--------|--------|
| Version printed | ✅ Playwright already installed — proceed |
| Not found / error | Install using PKG_MANAGER: |

Install commands by PKG_MANAGER:
```bash
# npm
npm install --save-dev playwright && npx playwright install chromium

# yarn
yarn add --dev playwright && npx playwright install chromium

# pnpm
pnpm add --save-dev playwright && npx playwright install chromium

# bun
bun add --dev playwright && npx playwright install chromium
```

If install fails → print error + STOP:
```
❌ Playwright install failed.
Run manually: npx playwright install chromium
Then re-run: /playwright-verify <route>
```

### Step 3 — Dev server check

Use `DEV_SERVER_URL` env var if set; otherwise default to `http://localhost:8000`.
`PUBLIC_PATH` is read from `.env.playwright` and auto-prepended to the route by `playwright-runner.ts` — no need to include it in the route argument.

```bash
curl -s --max-time 5 -o /dev/null -w "%{http_code}" "${DEV_SERVER_URL:-http://localhost:8000}"
```

| Response | Action |
|----------|--------|
| 200 / 302 / 304 | ✅ Server is up — proceed |
| Connection refused / timeout | Start it: `npm run dev` in a new terminal, wait ~15 s, re-check once |
| Still unreachable | Print `⚠️ Dev server not accessible. Start it manually then re-run.` and STOP |

Print: `🌐 Dev server: [DEV_SERVER_URL or http://localhost:8000]`

---

## VERIFICATION

### Step 1 — Playwright run

```bash
npx tsx .claude/integrations/playwright-runner.ts ROUTE --screenshot --feature-name FEATURE_NAME
```

Parse JSON output from `--- JSON ---` block.

Map results to 4 required UX states:

| UX State | What to check |
|----------|--------------|
| **Loading state** | Spinner or skeleton visible during initial load (PLAYWRIGHT-003) |
| **Error state** | Simulate API error: look for error alert or fallback UI (PLAYWRIGHT-004) |
| **Empty state** | Empty list or no-data state visible when no content |
| **Success state** | Data loaded and displayed, no errors (PLAYWRIGHT-001 + PLAYWRIGHT-005) |

Print intermediate status:
```
▶ Playwright checks (5/5):
  ✅ [PLAYWRIGHT-001] Route resolves
  ✅ [PLAYWRIGHT-002] No JS errors
  ✅ [PLAYWRIGHT-003] Loading state resolves
  ✅ [PLAYWRIGHT-004] No error alert
  ✅ [PLAYWRIGHT-005] Meaningful content rendered

📸 Screenshot: docs/specs/FEATURE_NAME/screenshots/...
```

### Step 2 — Error state (mock API 500)

```bash
npx tsx .claude/integrations/playwright-runner.ts ROUTE --screenshot --feature-name FEATURE_NAME --mock-error
```

Verify `PLAYWRIGHT-006` passed (error alert rendered on 500 response).

### Step 3 — browser-use (only for flows Playwright cannot verify)

Use `python .claude/integrations/browser-use-wrapper.py "<task>" ROUTE` **only** for:
- Modal chains (open modal → fill → submit → confirm)
- Infinite scroll / pagination interactions
- Multi-step form flows
- Real-time polling / WebSocket updates

Skip Step 3 if all 4 UX states are covered by Steps 1–2 results.

### Step 4 — Unit tests (only for logic not verifiable via UI)

```bash
npm test -- --testPathPattern=src/FEATURE_FOLDER/
```

Use **only** for:
- Data transformation logic
- Utility functions
- Complex state transitions not visible in browser

Skip Step 4 if feature has no dedicated test file or if UI verification already covers the behavior.

### Step 5 — Checklist Update

If `docs/specs/<FEATURE_NAME>/checklist.md` exists:

1. Read the `## UI Verification` table. For each row where `Evidence` = `screenshot:` (empty):
   - Replace with: `screenshot: screenshots/<screenshotPath-filename>`
     (use filename only, not full path — `screenshotPath` is from playwright-runner JSON)
   - Update `Status`: ⬜ Pending → ✅ Pass (if overall `passed = true`) or ❌ Fail

2. Read the `## ACT — Acceptance Test Cases` table. For each row where `Tool` = `Playwright` and `Status` = ⬜ Pending:
   - Update `Status`: ✅ Pass or ❌ Fail (same overall result)
   - Fill `Evidence` with screenshot filename

3. Recalculate `## Summary` section:
   - Count ✅ rows in each section (Requirements / UI / ACT)
   - Update "X / Y passed" lines
   - Set Overall: `✅ READY` if all ✅, `⚠️ N issues` if any ❌

4. Use Edit tool to write all changes back to `checklist.md`.
5. Print: `📋 Checklist updated: docs/specs/<FEATURE_NAME>/checklist.md`

If checklist does not exist: skip this step silently.

---

## SELF-RECOVERY (if any check fails)

Apply up to **3 attempts** per failure before escalating:

| Attempt | Action |
|---------|--------|
| 1 | Analyze error message → identify root cause → auto-fix using Edit tool → re-run failing check |
| 2 | Try alternate implementation of the same behavior → retest |
| 3 | Isolate failing case → fix in isolation → retest full suite |

After 3 failed attempts, classify the failure:

| Classification | Action |
|---------------|--------|
| **Bug / edge case** | Report as unresolved — no further auto-fix |
| **Architecture mismatch** | Warn: "This failure suggests a design issue. Review component structure or API contract." |

---

## FINAL REPORT

Print after all steps complete:

```
╔══════════════════════════════════════════════════════════╗
║  /playwright-verify — FEATURE_NAME                       ║
╠══════════════════════════════════════════════════════════╣
║  Route  : ROUTE                                          ║
║  Folder : src/FEATURE_FOLDER                             ║
╚══════════════════════════════════════════════════════════╝

UX States:
  Loading state : ✅ PASS | ❌ FAIL
  Error state   : ✅ PASS | ❌ FAIL
  Empty state   : ✅ PASS | ❌ FAIL
  Success state : ✅ PASS | ❌ FAIL

Static checks  : [ran / skipped]
Screenshots    : docs/specs/FEATURE_NAME/screenshots/
Checklist      : docs/specs/FEATURE_NAME/checklist.md [updated | not found]
Auto-fixed     : N file(s) modified
Unresolved     : [list of issues] | none

Overall: ✅ ALL PASS | ⚠️ N issue(s) unresolved
```

If any issue is unresolved — print actionable next steps:
```
Next steps:
  1. Review docs/specs/FEATURE_NAME/screenshots/ for visual evidence
  2. [specific fix suggestion per unresolved item]
  3. Re-run: /playwright-verify ROUTE --feature-name FEATURE_NAME
```
