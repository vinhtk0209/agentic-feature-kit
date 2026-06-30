# Feature-from-Confluence Workflow Kit — Setup Guide

> Copy this `.claude/` folder to any project and run `/feature-from-confluence` in Claude Code.
> The workflow auto-detects your tech stack, package manager, and conventions from `CLAUDE.md`.

---

## What is this?

A Claude Code workflow that converts a Confluence page (or PDF/Word spec) into a
fully implemented feature — with human-in-the-loop confirm gates, self-evaluation,
optional Playwright verification, and a self-improving feedback loop.

Works with **React, Vue, Angular**, or any framework — stack is read from `CLAUDE.md`,
not hardcoded.

---

## Files in this kit

| Path | Purpose |
|------|---------|
| `.claude/commands/feature-from-confluence.md` | Main workflow (B0–B12) — Claude Code edition |
| `.claude/commands/playwright-verify.md` | Standalone Playwright UI verification — run independently outside the workflow |
| `.claude/commands/drop-mock.md` | Remove USE_MOCK flag after real API is ready |
| `.claude/commands/api-contract.md` | Generate `.http` API contract from existing code |
| `.claude/commands/codex-review.md` | Review branch against CLAUDE.md conventions |
| `.claude/integrations/memory.ts` | Session persistence between confirm gates |
| `.claude/integrations/feedback-analyzer.ts` | Pattern clustering from past runs (★6 LEARN) |
| `.claude/integrations/playwright-runner.ts` | Headless UI screenshot verification (opt-in) |
| `.claude/integrations/lint-feature.ts` | **Compliance + AC-coverage gate** (v3.16) — machine-checks HR33/34/35/36 on a feature folder; run at B11 (`npm run lint:feature -- <folder> --checklist <md> --ux-states <json> --gate`) and at B10 (`--code-only`) |
| `.claude/integrations/lint-feature.test.ts` | **Self-test for the gate** (v3.16) — fixture-based tests of lint-feature.ts; run `npm run test:lint-feature` |
| `.claude/integrations/eval-feature.ts` | **Eval / regression harness** (v3.16) — 5-category quality scorecard (Artifacts / Checklist / Code / AC coverage / Verification) for a feature; `--write-baseline`/`--baseline` for regression, `--gate` for CI. `npm run eval:feature -- <src-folder> --spec docs/specs/<F>` |
| `.claude/integrations/eval-feature.test.ts` | Self-test for the harness; run `npm run test:eval-feature` (also chained into `npm run test:kit`) |
| `.claude/integrations/eval-regression.test.ts` | **Regression guard** — scores the reference feature vs a committed baseline (`docs/specs/AnalyzeData/eval-baseline.json`); fails if any category drops. Chained into `npm run test:kit`. Update the baseline only on an intentional change: `npm run eval:feature -- <src> --spec <specDir> --write-baseline <baseline.json>` |
| `.claude/integrations/b11-runner.ts` | **Phase orchestrator** — runs all B11 checks (types + lint + Playwright for all routes) in one call |
| `.claude/integrations/b12-logger.ts` | **Feedback logger** — appends B12.5 metrics to feedback-history.md, trims to 10 entries |
| `.claude/integrations/contract-probe.ts` | **Contract drift probe** (v3.16) — structurally diffs the `.http` mock responses against `data/types.ts` (via the TS compiler API) and `data/api.ts` return types; surfaces missing/renamed/mistyped fields before `USE_MOCK` flips off. `npx tsx .claude/integrations/contract-probe.ts --http <f> --types <f> --api <f> [--gate]` |
| `.claude/integrations/learned-config.ts` | **Deterministic "Act" store** (v3.16, Step 0.D) — strengthen-only knobs (`selfEvalThreshold`, `maxRecoveries`, `manualCorrectionBudget`, `requireLoadingState/ErrorState`) promoted from verified amendments. `npx tsx .claude/integrations/learned-config.ts --json` |
| `.claude/integrations/regression-corpus.ts` | **Toolchain regression guard** (v3.16, Step 0.E) — replays the golden `corpus/*.case.json` cases so a learned rule / gate edit can't silently change behavior. Halts the workflow on any ❌. |
| `.claude/integrations/corpus/` + `corpus/README.md` | Golden `*.case.json` fixtures for `regression-corpus.ts` (gate + detector + budget cases) and how to add new ones |
| `.claude/integrations/prompt-budget.ts` | **Prompt size ratchet** (v3.16, Step 0.E) — measures the command file by `##` section and, under `--gate`, fails if it exceeds `prompt-budget.json`. Stops unbounded "apply verbatim" growth. |
| `.claude/integrations/improve-trigger.ts` | **Amendment advisory** (v3.16, Step 0.C) — at bootstrap, surfaces ≤1 soft-constraint amendment from past patterns (`--bootstrap` / `--mark-applied <id>` / `--status`). Can only ADD constraints, never relax a hard rule. |
| `.claude/integrations/lesson-registry.ts` | **Lesson store** (v3.16) — records/queries verified lessons feeding `improve-trigger`. `npm run check:lessons` |
| `.claude/integrations/friction-meter.ts` | **Friction scorer** (v3.16) — derives a per-run friction score (clarification cycles, gate revisions, manual corrections, retries) appended to the B12.5 feedback entry |
| `.claude/integrations/check-ownership.ts` | **Ownership gate** (v3.16) — checks a feature folder stays within its own boundary (no foreign `src/generic/` or cross-feature edits). `npm run check:ownership` |
| `.claude/integrations/kpi-report.ts` | **KPI dashboard** (v3.16) — aggregates feedback history into KPIs. `npm run workflow:kpis` / `npm run workflow:dashboard` |
| `.claude/integrations/feature-index.ts` | **Feature index** (v3.17) — projects every feature folder's `context-summary.md` (+ `eval-baseline.json`) into one flat `docs/specs/INDEX.md` table (feature · phase · eval · finalConfirmed · last updated). Cheap multi-feature overview that avoids directory fan-out as feature count grows. Auto-refreshed by `memory.ts` on every save. `npm run workflow:index` (regenerate) / `-- --check` (CI drift) / `-- --json` (cheap resume read). No duplicated truth — delete and it regenerates identically. |
| `.claude/integrations/feature-digest.ts` | **Completed-feature digest** (v3.17) — when a feature is `finalConfirmed`, emits a compact `feature-digest.md` (final eval · gate results · AC/browser coverage · BE findings · major fixes · known limitations) projected from the raw artifacts. Auto-generated by `memory.ts` at final confirmation. Derived state only — never a gate input, safe to delete. `npm run workflow:digest -- <FeatureName>`. |
| `.claude/integrations/ux-states.ts` | Shared parser for `ux-states.json` (used by `lint-feature.ts`); not a CLI |
| `.claude/integrations/integration.test.ts` | End-to-end self-test wiring the gates together; part of `npm run test:kit` |
| `.claude/integrations/browser-use-wrapper.py` | Multi-step flow verification (opt-in) |
| `.claude/mcp-server/` | Confluence MCP server (Node.js) — fetches spec pages |
| `.claude/mcp-workflow/` | Feature-workflow MCP server — exposes `run_b11`, `run_feedback_append`, `verify_feature_route`, `save/load_workflow_context`, `analyze_feedback_patterns` |
| `.claude/templates/diagram.template.md` | Mermaid flow diagram template |
| `.claude/templates/steps.template.md` | Implementation steps template |
| `.claude/templates/checklist.template.md` | ACP verification checklist template |
| `.claude/SETUP.md` | This file |

**Not committed (project-specific):**

| Path | Contents |
|------|---------|
| `.claude/mcp-server/.env` | Confluence credentials |
| `.claude/mcp-server/node_modules/` | MCP server dependencies |
| `.claude/speckit/` | Cached GitHub docs (auto-refreshed) |
| `docs/specs/` | Generated spec artifacts |
| `CLAUDE.md` | Project conventions (generated by `/init`) |

---

## Setup Steps

### Step 1 — Copy the kit

Copy the entire `.claude/` folder (plus `setup.sh`, `setup.ps1`, `scripts/`, and `package.json` entries)
to your new project root:

```bash
cp -r /source-project/.claude  /your-new-project/.claude
cp    /source-project/setup.sh  /your-new-project/setup.sh
cp    /source-project/setup.ps1 /your-new-project/setup.ps1
cp -r /source-project/scripts   /your-new-project/scripts
```

Files that are project-specific (`.env`, `node_modules/`, `speckit/`) are gitignored
and will not be copied if you clone from git.

### Step 2 — Run setup

Run **once** from the project root. This installs all npm dependencies (root + both MCP servers),
creates all required env files, registers MCP servers in `.mcp.json`, and patches
`.claude/settings.local.json`.

```bash
# bash (Linux / macOS / Git Bash on Windows)
bash setup.sh
# or: npm run setup
```

```powershell
# PowerShell (Windows)
pwsh setup.ps1
```

What it does, in order:

| Step | Action |
|------|--------|
| 1/4 | `npm install` at repo root (tsx, playwright, @playwright/test, …) |
| 2/4 | `npm install` in `.claude/mcp-server/` (@modelcontextprotocol/sdk, axios, dotenv, …) |
| 3/4 | `npm install` in `.claude/mcp-workflow/` (@modelcontextprotocol/sdk, dotenv) |
| 4/4 | Creates `.env.playwright`, `.claude/mcp-server/.env`, `.mcp.json`, patches `.claude/settings.local.json` |

Safe to re-run — never overwrites existing files.

### Step 3 — Fill in credentials

The script prints a checklist at the end. Three things to fill in:

**`.claude/mcp-server/.env`** — Confluence access:

```env
# Option A — Personal Access Token (recommended)
CONFLUENCE_TOKEN=your_pat_token

# Option B — LDAP (username WITHOUT domain suffix)
# CONFLUENCE_USER=your_username
# CONFLUENCE_PASS=your_password
```

> Get `CONFLUENCE_TOKEN`: Confluence → your avatar → **Profile → Personal Access Tokens**

Also update the Confluence base URL in `.claude/mcp-server/index.ts`:

```typescript
const baseConfUrl = 'https://your-confluence-instance.com/conf';
```

**Root `.env`** — Kit token:

```env
KIT_TOKEN=your_kit_token
```

> Get `KIT_TOKEN`: contact the kit maintainer.  
> Alternative: run `npm run workflow:login` — it writes the token to your OS config automatically.

**`.env.playwright`** — UI verification tokens *(optional — only needed at B11)*:

```env
DEV_SERVER_URL=http://localhost:3000
PUBLIC_PATH=/your-app/          # remove if served at root /
PLAYWRIGHT_ACCESS_TOKEN=...     # copy from browser DevTools → Application → Local Storage
PLAYWRIGHT_REFRESH_TOKEN=...
PLAYWRIGHT_TOKEN_EXPIRES_AT=... # epoch ms
```

> Shortcut: `npm run workflow:login` populates all three Playwright tokens automatically.

> **Why `PUBLIC_PATH` matters**: SPAs with a non-root deploy path (webpack `PUBLIC_PATH`) serve
> their HTML at `http://localhost:<port>/<PUBLIC_PATH>/`. Without this prefix React Router cannot
> match any routes → blank page → all `waitForSelector` calls time out.

### Step 4 — Run /init to generate CLAUDE.md

In Claude Code, open the new project and run:

```
/init
```

This reads the codebase and generates `CLAUDE.md` at the project root.

**The workflow reads `CLAUDE.md` to auto-detect:**
- Tech stack (React/Vue/Angular/etc.) from `query_library` key
- HTTP client pattern from `http_client` key
- Response transform from `response_transform` key
- Import alias from `import_alias` key
- Feature file structure from `feature_file_structure` key (if present)

If `CLAUDE.md` is missing when you run `/feature-from-confluence`, you'll be prompted
to run `/init` first — the workflow resumes automatically after.

### Step 5 — Restart Claude Code

Restart Claude Code so it reads `.mcp.json` and starts both MCP servers.
When prompted to approve an MCP server → **Allow**.

### Step 6 — Verify

Type `/` in Claude Code chat. These commands must appear:
- `/feature-from-confluence`
- `/playwright-verify`
- `/drop-mock`
- `/api-contract`
- `/codex-review`

Then test with a real Confluence page:

```
/feature-from-confluence https://your-confluence/pages/123
```

Expected: SESSION BOOTSTRAP prints `✅ Tech stack detected: [your stack]` and proceeds.

Test `/playwright-verify` independently (dev server must be running):

```
/playwright-verify /your/feature/route --feature-name MyFeature
```

Expected: PKG_MANAGER detected, Playwright checked/installed, 5 checks run, screenshots saved to
`docs/specs/MyFeature/screenshots/`, and `docs/specs/MyFeature/checklist.md` auto-updated if present.

> **Dev server URL:** defaults to `http://localhost:8000`. Override with `DEV_SERVER_URL` in `.env.playwright`.
> **PUBLIC_PATH:** set `PUBLIC_PATH=/<your-path>/` in `.env.playwright` — runner auto-prepends it to every route.

---

## How tech stack detection works

During SESSION BOOTSTRAP, the workflow reads `CLAUDE.md` and extracts these keys:

| Key extracted | Detected from |
|---------------|---------------|
| `query_library` | Identifies framework: `@tanstack` → React, `pinia` → Vue, `ngrx` → Angular |
| `http_client` | e.g. `yourHttpClient()`, `axios`, `$fetch` |
| `response_transform` | e.g. `transformResponse(data)`, `toCamelCase` |
| `import_alias` | e.g. `@src/`, `@/`, `~` |
| `commit_format` | e.g. `[JIRA-ID][TYPE]`, `feat:`, `fix:` |
| `feature_file_structure` | Override default file layout if present |

**Framework → file structure defaults:**

| Framework | Files generated |
|-----------|----------------|
| React | `data/types.ts`, `data/api.ts`, `data/apiHooks.ts`, `Feature.tsx`, `messages.ts`, `Feature.scss` |
| Vue 3 | `data/types.ts`, `api/feature.ts`, `composables/useFeature.ts`, `Feature.vue`, `i18n/en.json` |
| Angular | `data/types.ts`, `services/feature.service.ts`, `feature.component.ts`, `feature.component.html` |
| Unknown | `data/types.ts`, `api/feature.ts`, `Feature.[ext]`, i18n strings file |

---

## How package manager detection works

During SESSION BOOTSTRAP, the workflow detects your package manager from lockfiles:

| Lockfile | Package manager |
|----------|----------------|
| `bun.lockb` or `bun.lock` | bun |
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` | yarn |
| `package-lock.json` | npm (default) |

All install commands (B9.6 packages, B11 Playwright) use the detected package manager automatically.

---

## How Playwright verification works (opt-in)

Playwright is **not required upfront**. After implementation (B10), the workflow stops
and asks:

```
✅ Implementation done.
Do you want to run UI verification with Playwright?
  [Yes] / [No]
```

- **Yes** → Claude checks if Playwright is installed. If not, installs it using your
  package manager, then calls the `run_b11` MCP tool (single call):

  ```json
  { "featureName": "MyFeature", "featurePath": "src/my-feature" }
  ```

  `run_b11` orchestrates everything in one shot: scoped types + lint, then Playwright
  smoke-tests for **all routes** listed in `ux-states.json routes[]`. Returns
  `{ b11_a, b11_b, typeErrors, lintErrors, routeResults[], checklistUpdated }`.

- **No** → Skip UI testing. Call `run_b11` with `{ noPlaywright: true }` for static analysis only.
- **Checklist auto-update**: `run_b11` (via `b11-runner.ts`) automatically fills PLAYWRIGHT rows
  in `docs/specs/<FeatureName>/checklist.md`.

To install Playwright manually beforehand:

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

---

## How the feedback loop improves runs over time

After each completed feature (B12), the workflow calls `run_feedback_append` MCP tool (single call):

```json
{
  "featureName": "FeatureName",
  "metrics": {
    "reflectionFinal": "94%", "recoveries": 2,
    "b11_a": "pass", "b11_b": "pass",
    "skipped": [], "designCycleback": false, "gatesRevised": []
  }
}
```

This appends a structured entry to both `docs/specs/<FeatureName>/feedback.log` (per-feature) and
`docs/specs/.feedback-history.md` (global), and trims the global file to 10 most recent entries.

```
[2026-04-05T10:00:00Z] [FeatureName] [auto]
reflection_final: 94% | recoveries: 2 | b11_a: pass | b11_b: pass
b9_6: skip | peer_conflict: no | skipped: [] | design_cycleback: no | gates_revised: []
```

On the **next run**, `feedback-analyzer.ts` reads this history, clusters failure patterns
by frequency, and applies targeted adjustments silently:

| Pattern detected | Adjustment applied |
|------------------|--------------------|
| B11 Agent A fails frequently | B10 agent brief enhanced with early type-check step |
| B11 Agent B fails frequently | B11 prompt enhanced with explicit 4-state verification |
| Design cycle-back from B11 | B6.5 Design Review requires more explicit component justification |
| B9.6 install fails frequently | B9.6 adds dry-run pre-check before actual install |

After **≥5 runs** with HIGH-priority patterns (≥30% frequency), the workflow proposes
specific amendments to the command file itself (B12.6 self-rewriting). User reviews
and approves each proposal.

---

## Running skills independently

Most skills in this kit can be run **without** triggering the full `feature-from-confluence` workflow:

| Command | When to use |
| ------- | ----------- |
| `/playwright-verify <route>` | Verify UI after a manual bug fix, or check any existing feature |
| `/drop-mock` | Remove `USE_MOCK` flag once the real API is ready |
| `/api-contract` | Generate `.http` API contract from a feature's data layer |
| `/codex-review` | Review the current branch against `CLAUDE.md` conventions |

**`/playwright-verify` usage:**

```bash
/playwright-verify <route> [--feature-name <name>] [--folder <src/path>]

# Examples:
/playwright-verify /your-app/feature-route
/playwright-verify /your-app/feature-route --feature-name UserProfile
/playwright-verify /your-app/feature-route --feature-name UserProfile --folder src/your-app/user-profile
```

`/playwright-verify` is fully **portable** — no project-specific configuration needed beyond:

1. Dev server running (`npm run dev`), URL set via `DEV_SERVER_URL` in `.env.playwright` (default `http://localhost:8000`)
2. `PUBLIC_PATH` set in `.env.playwright` if the app is served at a non-root path (see Step 3)
3. Playwright auto-installs on first run if not present

---

## What's project-specific (must configure per project)

| Item | What to do |
|------|-----------|
| `.env.playwright` | Set `DEV_SERVER_URL`, `PUBLIC_PATH`, and auth tokens per project (see Step 3) |
| `.claude/mcp-server/.env` | Add your Confluence credentials |
| `baseConfUrl` in `mcp-server/index.ts` | Update to your Confluence instance URL |
| `CLAUDE.md` | Generate with `/init` per project |
| `CLAUDE.md` → `### Workflow Overrides` | (v3.16) Pin repo-specific HARD-RULE knobs: `reference_feature`, `endpoint_base_override`, `api_url_convention`, `spec_section_map`, `ui_library`. **Per-repo — NOT shipped with the kit.** Absent → generic-safe fallbacks (HR23 inactive, dominant `src/` convention, semantic spec-section detection). See the command's `## PORTABILITY` section. |
| `.claude/settings.local.json` | Configure permissions for your project's scripts |

## What's portable (copy as-is)

| Item | Notes |
|------|-------|
| All command files (`.claude/commands/`) | No project-specific values |
| All integration scripts (`.claude/integrations/`) | Generic, no hardcoded paths |
| All templates (`.claude/templates/`) | Pure placeholders |
| `mcp-workflow/` | All tools are path-agnostic (use `process.cwd()`) |
| This SETUP.md | No credentials or project-specific info |
| MCP server source (`.claude/mcp-server/index.ts`) | Only `baseConfUrl` needs updating |

---

## MCP tools reference

Both servers must be running (registered in settings + restarted) for the workflow to use them.

### `confluence-mcp` server

| Tool | When called | What it does |
|------|-------------|--------------|
| `fetch_confluence_page` | B1 | Fetches a Confluence page and returns its HTML content |

### `feature-workflow` server

| Tool | When called | What it does |
|------|-------------|--------------|
| `save_workflow_context` | After B4, B6, B8, B9 | Persists current phase to `context-summary.md` |
| `load_workflow_context` | SESSION BOOTSTRAP | Resumes in-progress session |
| `analyze_feedback_patterns` | SESSION BOOTSTRAP, B12.5 | Clusters past-run failure patterns |
| `verify_feature_route` | B11 (standalone) | 5 smoke-test checks on a single route |
| `run_b11` | **B11 (orchestrated)** | Types + lint + Playwright for **all routes** in one call |
| `run_feedback_append` | **B12.5** | Appends metrics entry, trims history to 10 entries |

**`run_b11` input:**

```json
{
  "featureName": "AdminTaskProcessing",
  "featurePath": "src/your-app/tabs/admin-tasks",
  "noPlaywright": false
}
```

**`run_feedback_append` input:**

```json
{
  "featureName": "AdminTaskProcessing",
  "metrics": {
    "reflectionFinal": "95%",
    "recoveries": 1,
    "b11_a": "pass",
    "b11_b": "pass",
    "b9_6": "skip",
    "peerConflict": false,
    "skipped": [],
    "designCycleback": false,
    "gatesRevised": []
  }
}
```

> **Restart required**: after registering or modifying either MCP server, restart Claude Code (or VS Code) to pick up the new tool list.

---

## Toolchain scripts & pre-flight gates (v3.16)

The workflow self-checks its own toolchain before doing any feature work. SESSION BOOTSTRAP runs three best-effort gates in order:

| Step | Script | Effect |
|------|--------|--------|
| 0.C — Amendment advisory | `improve-trigger.ts --bootstrap` | Applies ≤1 soft-constraint lesson for this run (advisory; never relaxes a hard rule) |
| 0.D — Learned config | `learned-config.ts --json` | Loads strengthen-only knobs (self-eval threshold, max recoveries, …) |
| 0.E — Regression guard | `regression-corpus.ts` + `prompt-budget.ts --gate` | **Halts** if a golden corpus case regresses or the command file exceeds its KB budget |

Developer-facing npm scripts (all path-agnostic, run from repo root):

```bash
npm run lint:feature -- <feature-folder> --checklist <md> --ux-states <json> --gate   # B11 compliance gate (HR33/34/35/36)
npm run eval:feature -- <feature-folder> --spec docs/specs/<F> [--baseline <json>|--write-baseline <json>]
npm run verify:browser -- "<route>" --feature-name <F> --interactions docs/specs/<F>/ux-states.json --screenshot   # real-browser + real-API per-AC verification (B11)
npm run check:ownership           # feature-boundary gate
npm run check:lessons             # verified-lesson registry summary
npm run check:amendments          # pending amendment status (improve-trigger --status)
npm run workflow:kpis             # aggregate KPIs from feedback history
npm run workflow:dashboard        # KPI dashboard view
npm run workflow:index            # regenerate docs/specs/INDEX.md (-- --check for CI drift, -- --json for resume read)
npm run workflow:digest -- <F>    # write feature-digest.md for a finalConfirmed feature
npm run test:kit                  # full toolchain self-test (lint-feature + ownership + integration + eval + eval-regression + lesson-registry + improve-trigger + prompt-budget + contract-probe + learned-config + friction-meter + feature-index + feature-digest)
```

> **B11 must verify ACs, not just route health.** A route returning HTTP 200 is *not* AC verification. The
> machine-enforced AC step is `verify:browser` (→ `playwright-runner.ts`) driven by the feature's
> `ux-states.json` `ac_assertions[]` — it injects the `.env.playwright` token into `localStorage`, runs against
> the **real API with `USE_MOCK=false`**, executes one DOM assertion per AC (PLAYWRIGHT-008 reports `passed/total`),
> and saves a per-state screenshot. **Calibrate `ux-states.json` to the real backend response** (ids, counts,
> branch a flag actually takes) — assertions written against mock values silently pass on mock and silently fail
> on real data. When the real seed can't exercise a branch (e.g. `time_available:false`), cover that branch with a
> **unit test** (`utils/*.test.ts`) and file the seed gap in the feature's BE integration report — never weaken the
> assertion to make it pass.

> **Windows caveat (unchanged):** the project's `npm test` uses a Unix-style `NODE_ENV=test` prefix that fails on Windows — run `npm run test:kit` directly for the toolchain self-tests. A `posttest` hook chains `test:kit` after `npm test` on CI/Linux.

---

## Changelog

### v3.16 — 2026-06-11

- **Contract-first (HARD RULE 32)**: B4 now asks the backend-contract status (`REAL` / `PROVISIONAL` / `FE_ONLY`), persisted as `contractStatus`. REAL → adopt the user-provided contract as golden at B8.6 (skip inference); PROVISIONAL → stamp `// CONTRACT: PROVISIONAL` + emit `RECONCILE.md`.
- **Mapping layer (HARD RULE 33)**: new per-feature `data/transform.ts` — every API response goes through an explicit `mapXxx(raw): Xxx`; blind-casting raw responses as a typed value is banned (grep gate). When the real API differs from the mock, only `transform.ts` changes. `FILE_STRUCTURE` (React default) and `steps.md` template updated to include it.
- **Business rules = code+test (HARD RULE 34)**: every Business-Rule / display-format checklist row maps to a `utils/` pure function + co-located `.test.ts` (or `<!-- enforced-by: BE -->`). Step 6.5 is now required when ≥1 BR row exists; B11 runs the unit tests.
- **Done = verified (HARD RULE 35)**: the B12 completion box shows true per-section verified ratios and a `browser-unverified: N rows` line; it must not claim "Complete" while >40% of UI+ACT rows are unverified without explicit acknowledgement.
- **New step B12.8 — Contract Reconciliation**: non-blocking; when PROVISIONAL + a real contract file is present, diffs inferred ↔ real and writes a `RECONCILE.md` drift table (report-only).
- **PROGRESS DISPLAY** redesigned: 8 named phases (INTAKE → LEARN), 🛑 STOP-gate markers, current-step header, complexity mode, and a `done / total` progress bar.
- **Sibling skills**: `/drop-mock` keeps `transform.ts` + mappers and pre-checks the PROVISIONAL stamp; `/api-contract` reads `transform.ts` for true on-the-wire field names.
- **Gate self-test + enforcement**: `lint-feature.ts` now has its own fixture-based tests (`lint-feature.test.ts`, 16 cases incl. tautological-assertion detection, comment false-positive guard, verified-ratio ≤100% clamp, `parseArgs`, exit-code). Run `npm run test:kit` (cross-platform). A `posttest` hook runs it after `npm test` in CI/Linux. **Windows caveat**: the project's `npm test` uses a Unix-style `NODE_ENV=test` prefix that fails on Windows (pre-existing) — on Windows run `npm run test:kit` directly.
- **Copilot edition**: removed (2026-06-13) — the cross-edition machinery (B12.7, the EDITION CONFIG cross-edition block, `parity-check*`) was deleted; this kit is **Claude Code only**.

### v3.15 — 2026-06-11

- **`PUBLIC_PATH` env var** (`playwright-runner.ts`): runner now reads `PUBLIC_PATH` from `.env.playwright` and auto-prepends it to every feature route. Callers pass bare routes (`/course-dashboard/...`) — no need to include the public path prefix manually. Prevents blank-page timeouts when the app is deployed at a non-root path (e.g. `/your-app/`, `/authoring/`).
- **`.env.playwright` template**: added `DEV_SERVER_URL` and `PUBLIC_PATH` keys with comments. Documented in new Setup Step 3.
- **Hard Rule 27 amended**: replaced hardcoded public-path-in-DEV_SERVER_URL approach with `PUBLIC_PATH` env var approach. Old form required callers to know and embed the public path; new form is configured once per project.
- **`playwright-verify.md`**: added note that `PUBLIC_PATH` is read from `.env.playwright` automatically — route arguments should not include the prefix.

### v3.14 — 2026-06-11

- **Hard Rule 31** (`ux-states.json` non-optional): `ux-states.json` must be generated at B10 with ≥3 states, even when Playwright is opted out.
- **B5 checklist completeness**: all 5 sections (REQ + UI + ACT + UX + Playwright) required before B6 gate.
- **`task-type.md` format**: structured evidence table replaces 3-line stub.
- **Diagram LR layout**: `flowchart LR` + ≤15 nodes per diagram; no large single `flowchart TD`.

### v3.13 — 2026-05-18

- **Hard Rule 30**: Playwright b11_a PASS criterion is 5/5 basic checks; per-AC extended checks are BONUS only.
- **ui_rows floor**: if `ui_rows < 12` after initial count, re-scan spec for missed named components.

### v3.12 — 2026-05-18

- **Hard Rule 28**: golden endpoint file check at B8.6 before inventing new paths.
- **Hard Rule 29**: naming conventions mirrored from reference implementation.
- **Hard Rule 25 amendment**: `## Feature Checklist (browser-level)` — parenthetical suffix required.
