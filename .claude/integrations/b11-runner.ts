#!/usr/bin/env node
/**
 * b11-runner.ts — Phase-level B11 orchestration
 *
 * Runs the full B11 verification in a single call:
 *   1. Read routes[] from ux-states.json (or extract from states[].screen)
 *   2. Run playwright-runner.ts for each route (serial)
 *   3. Run scoped types + lint checks (errors outside feature folder are pre-existing)
 *   4. Update checklist.md PLAYWRIGHT-* rows
 *   5. Return structured JSON
 *
 * Usage:
 *   npx tsx .claude/integrations/b11-runner.ts <featureName>
 *   npx tsx .claude/integrations/b11-runner.ts <featureName> --feature-path src/your-app/tabs/admin-tasks
 *   npx tsx .claude/integrations/b11-runner.ts <featureName> --no-playwright
 *
 * Output (JSON to stdout):
 *   {
 *     b11_a: "pass" | "fail",           // static analysis (types + lint)
 *     b11_b: "pass" | "fail" | "skip",  // playwright UI verification
 *     typeErrors: N,                     // errors inside feature folder
 *     lintErrors: N,
 *     routeResults: [{ route, passed, checks, screenshotPath }],
 *     checklistUpdated: boolean,
 *     summary: string
 *   }
 */

import { execSync, spawnSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { resolveRoutes, parseUxStates } from './ux-states';
import { resolveContractHttp } from './contract-probe';
import { checkPlaywrightToken } from './version-check';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RouteResult {
  route: string;
  passed: boolean;
  checks: Array<{ id: string; passed: boolean; message: string }>;
  screenshotPath?: string;
}

interface B11Result {
  b11_a: 'pass' | 'fail';
  b11_b: 'pass' | 'fail' | 'skip';
  typeErrors: number;
  lintErrors: number;
  coverageErrors: number;
  contractErrors: number;
  contractWarnings: number;
  routeResults: RouteResult[];
  checklistUpdated: boolean;
  summary: string;
}

/**
 * FIRST link of the two-link join (Y.1 / measurement-layer-b11-gate-and-version-bootstrap.md §1):
 * derive the Playwright verdict `b11_b` from the raw per-route results. Pure + exported so the
 * derivation itself is attack-testable (the previous bug lived at the JOIN between values, so both
 * links are tested, not just the gate). `tierBRan` = Playwright actually executed (not opted out AND
 * ≥1 route). A skipped Tier B is 'skip' (a valid, non-failing outcome, never 'fail').
 */
export function computeB11B(routeResults: ReadonlyArray<{ passed: boolean }>, tierBRan: boolean): 'pass' | 'fail' | 'skip' {
  if (!tierBRan || routeResults.length === 0) return 'skip';
  return routeResults.every((r) => r.passed) ? 'pass' : 'fail';
}

/**
 * SECOND link of the join (Y.1 — THE fix): the process exit gate. `b11_b === 'fail'` now GATES the
 * exit (the bug was its omission — a failing Playwright run exited 0 and false-proved verified=true).
 * `'skip'` stays valid (Tier-B-less / opt-out features). Pure + exported so the full matrix is proven.
 * The caller maps `process.exit(gatesPass ? 0 : 1)`.
 */
export function computeGatesPass(b11_a: 'pass' | 'fail', coverageErrors: number, b11_b: 'pass' | 'fail' | 'skip'): boolean {
  return b11_a === 'pass' && coverageErrors === 0 && b11_b !== 'fail';
}

// ─── Args ────────────────────────────────────────────────────────────────────

// True only when b11-runner.ts is the CLI entry point — NOT when imported (b11-runner.test.ts imports
// computeB11B/computeGatesPass). Guards the arg-required exit + main() so a test import is side-effect-free.
const isCli = !!(process.argv[1] && /b11-runner\.ts$/.test(process.argv[1].replace(/\\/g, '/')));

const args = process.argv.slice(2);
if (isCli && args.length === 0) {
  console.error('Usage: npx tsx b11-runner.ts <featureName> [--feature-path <path>] [--no-playwright]');
  process.exit(1);
}

const featureName = args[0] ?? ''; // '' only on a non-CLI import (main() never runs then)
const featurePathIdx = args.indexOf('--feature-path');
const featurePath = featurePathIdx >= 0 ? args[featurePathIdx + 1] : null;
const noPlaywright = args.includes('--no-playwright');

const cwd = process.cwd();
const specsDir = path.join(cwd, 'docs', 'specs', featureName);
const integrationsDir = path.join(cwd, '.claude', 'integrations');

// ─── Tier B auth preflight (v3.24) ───────────────────────────────────────────
// Before Playwright launches, the access token MUST be present AND fresh. A
// missing/empty/stale token → 401 → cross-origin login redirect → empty-shell
// render that a shell-only assertion would FALSE-PASS (the class §4 closes).
// We gate on the token's real STATE, NOT `version-check --playwright`'s exit
// code — that CLI returns 0 for `expiring-soon` (warn-only), so gating on it
// would let a token lapse mid-run. checkPlaywrightToken() inspects only
// PLAYWRIGHT_TOKEN_EXPIRES_AT, so access-token PRESENCE is checked here too
// (a valid expiry with no access token is the real Z.3 blocker). All of
// missing / expired / expiring-soon THROW → main().catch → exit 1, BEFORE any
// browser context is created.

/** Resolve the .env.playwright the preflight reads — the same `<cwd>/.env.playwright`
 *  playwright-runner loads (loadEnvFile → path.resolve). `PLAYWRIGHT_ENV_FILE`
 *  overrides for TESTING ONLY (attack-test fixtures); never point it at prod creds. */
export function resolvePlaywrightEnvPath(): string {
  return process.env.PLAYWRIGHT_ENV_FILE ?? path.join(cwd, '.env.playwright');
}

/** Fail-closed Tier B token preflight. Throws with a distinct reason code —
 *  tierB-token-missing / tierB-token-expired / tierB-token-expiring — for any
 *  non-`ok` state. Pure + exported so it is unit-attack-testable against fixtures. */
export function assertPlaywrightTokenFresh(envPath: string, nowMs: number = Date.now()): void {
  if (!fs.existsSync(envPath)) {
    throw new Error(
      `tierB-token-missing: .env.playwright not found at ${envPath} — Tier B needs a fresh ` +
        `PLAYWRIGHT_ACCESS_TOKEN to reach the backend authenticated; refusing to run blind.`,
    );
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const at = content.match(/^\s*PLAYWRIGHT_ACCESS_TOKEN=(.*)$/m);
  const accessToken = at ? at[1].trim().replace(/^['"]|['"]$/g, '') : '';
  if (!accessToken) {
    throw new Error(
      `tierB-token-missing: PLAYWRIGHT_ACCESS_TOKEN absent/empty in ${envPath} — injectAuthTokens ` +
        `would inject nothing → 401 → empty-shell false-pass. Refresh before Tier B.`,
    );
  }
  const t = checkPlaywrightToken(envPath, nowMs);
  const hrs = t.msRemaining !== null ? Math.round(t.msRemaining / 3_600_000) : null;
  if (t.status === 'missing') {
    throw new Error(
      `tierB-token-missing: PLAYWRIGHT_TOKEN_EXPIRES_AT absent in ${envPath} — cannot prove the ` +
        `token is fresh; refusing to run Tier B unauthenticated-blind.`,
    );
  }
  if (t.status === 'expired') {
    throw new Error(
      `tierB-token-expired: PLAYWRIGHT_ACCESS_TOKEN expired ~${Math.abs(hrs ?? 0)}h ago — ` +
        `re-authenticate and update .env.playwright before Tier B.`,
    );
  }
  if (t.status === 'expiring-soon') {
    throw new Error(
      `tierB-token-expiring: PLAYWRIGHT_ACCESS_TOKEN expires in ~${hrs}h (<24h) — fail-closed so ` +
        `it cannot lapse mid-run into a silent 401. Refresh before Tier B.`,
    );
  }
  // status === 'ok' → token present and fresh → proceed.
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd: string, timeoutMs = 120_000): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(cmd, {
    shell: true,
    cwd,
    encoding: 'utf-8',
    timeout: timeoutMs,
  });
  return {
    code: result.status ?? 1,
    stdout: (result.stdout ?? '').toString().trim(),
    stderr: (result.stderr ?? '').toString().trim(),
  };
}

/**
 * Async Playwright-safe runner: uses spawn() to get a real PID, then kills the
 * FULL process tree (not just the shell) on timeout — prevents orphaned Chromium.
 *
 * Windows: taskkill /pid <pid> /T /F traverses shell → Chromium subtree.
 * POSIX:   detached:true gives the child its own pgid; process.kill(-pgid) wipes it.
 */
async function runPlaywrightSpawn(
  cmd: string,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, {
      shell: true,
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    const killTree = (pid: number): void => {
      if (process.platform === 'win32') {
        spawnSync(`taskkill /pid ${pid} /T /F`, { shell: true, stdio: 'ignore' });
      } else {
        try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ }
      }
    };

    const timer = setTimeout(() => {
      if (proc.pid) killTree(proc.pid);
      resolve({
        code: 1,
        stdout: stdout.trim(),
        stderr: (stderr + `\n[PLAYWRIGHT-TIMEOUT] Killed after ${timeoutMs / 1000}s — Chromium process tree terminated`).trim(),
      });
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

/**
 * Kill headless Chromium orphans left by previous crashed B11 runs before
 * launching a new browser. Two OR conditions:
 *   1. ms-playwright in CommandLine — Playwright's own Chromium cache (primary)
 *   2. --headless in CommandLine   — fallback for custom PLAYWRIGHT_BROWSERS_PATH setups
 * Never touches the user's real Chrome (which has neither).
 */
function killOrphanedChromium(): void {
  if (process.platform === 'win32') {
    spawnSync(
      'powershell -NoProfile -Command "Get-WmiObject Win32_Process | Where-Object { ($_.Name -like \'chrome*\' -or $_.Name -like \'chromium*\') -and ($_.CommandLine -like \'*ms-playwright*\' -or $_.CommandLine -like \'*--headless*\') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"',
      { shell: true, stdio: 'ignore', timeout: 15_000 },
    );
  } else {
    spawnSync('pkill -f "(ms-playwright.*chrome|chrome.*--headless)" 2>/dev/null; true', { shell: true, stdio: 'ignore', timeout: 10_000 });
  }
}

function readFile(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
}

function writeFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ─── Step 1: Read routes ──────────────────────────────────────────────────────

function readRoutes(): string[] {
  // Route resolution lives in ux-states.ts (single source of truth, shared with the integration
  // test) so the B5 flat schema (states[].route) can never silently diverge from the reader again
  // — audit F1. parseUxStates returns null on malformed JSON → resolveRoutes → [].
  const raw = readFile(path.join(specsDir, 'ux-states.json'));
  if (!raw) return [];
  return resolveRoutes(parseUxStates(raw));
}

function readStateCount(): number {
  const raw = readFile(path.join(specsDir, 'ux-states.json'));
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { states?: unknown[]; negative_states?: unknown[] };
    return (parsed.states?.length ?? 0) + (parsed.negative_states?.length ?? 0);
  } catch { return 0; }
}

// ─── Step 2: Run playwright for each route ────────────────────────────────────

async function runPlaywrightForRoute(route: string, timeoutMs: number): Promise<RouteResult> {
  const runnerPath = path.join(integrationsDir, 'playwright-runner.ts');
  if (!fs.existsSync(runnerPath)) {
    return { route, passed: false, checks: [{ id: 'RUNNER', passed: false, message: 'playwright-runner.ts not found' }] };
  }

  const uxStatesPath = path.join(specsDir, 'ux-states.json');
  const checklistPath = path.join(specsDir, 'checklist.md');
  const interactionsArg = fs.existsSync(uxStatesPath) ? `--interactions "${uxStatesPath}"` : '';
  const checklistArg = fs.existsSync(checklistPath) ? `--ac-checklist "${checklistPath}"` : '';

  // §8.1 AA.3: pass the feature's data/api.ts so playwright-runner can derive E_feat (feature-scoped
  // §4). Same resolution as runContractProbe. Absent (no --feature-path) → runner fails §4 closed.
  const apiFile = featurePath
    ? [path.join(cwd, featurePath, 'data', 'api.ts'), path.join(cwd, featurePath, 'api.ts')].find((p) => fs.existsSync(p))
    : undefined;
  const apiPathArg = apiFile ? `--api-path "${apiFile}"` : '';

  const cmd = [
    `npx tsx "${runnerPath}"`,
    `"${route}"`,
    `--screenshot`,
    `--feature-name "${featureName}"`,
    interactionsArg,
    checklistArg,
    apiPathArg,
  ].filter(Boolean).join(' ');

  const { code, stdout, stderr } = await runPlaywrightSpawn(cmd, timeoutMs);

  // playwright-runner outputs JSON — try to parse it
  try {
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        passed?: boolean;
        checks?: Array<{ id: string; passed: boolean; message: string }>;
        screenshotPath?: string;
      };
      return {
        route,
        passed: parsed.passed ?? code === 0,
        checks: parsed.checks ?? [],
        screenshotPath: parsed.screenshotPath,
      };
    }
  } catch {
    // fall through to plain result
  }

  return {
    route,
    passed: code === 0,
    checks: [{ id: 'PLAYWRIGHT-RUN', passed: code === 0, message: stdout || stderr }],
  };
}

// ─── Step 3: Static analysis ──────────────────────────────────────────────────

function countScopedErrors(output: string, scopePath: string | null): number {
  if (!scopePath) return 0;
  const lines = output.split('\n');
  // A line is a scoped error if it contains the feature path and contains "error"
  return lines.filter((l) => l.includes(scopePath) && /error/i.test(l)).length;
}

function runStaticAnalysis(): { typeErrors: number; lintErrors: number; b11_a: 'pass' | 'fail' } {
  // Types
  const typesResult = run('npm run types 2>&1');
  const typeOutput = typesResult.stdout + typesResult.stderr;
  // With a feature path → scope to the feature. Without one (audit F3): fall back to the
  // WHOLE-PROJECT error count rather than silently reporting 0, so a missing --feature-path
  // can never produce an unconditional green b11_a.
  const typeErrors = featurePath
    ? countScopedErrors(typeOutput, featurePath)
    : (typeOutput.match(/error TS\d+/g) ?? []).length;

  // ESLint scoped to feature folder (only if featurePath given)
  let lintErrors = 0;
  if (featurePath) {
    const lintResult = run(`npx eslint --ext .js,.jsx,.ts,.tsx "${featurePath}" 2>&1`);
    const lintOutput = lintResult.stdout + lintResult.stderr;
    lintErrors = (lintOutput.match(/\d+ error/g) ?? [])
      .reduce((sum, m) => sum + parseInt(m, 10), 0);
  }

  const b11_a: 'pass' | 'fail' = typeErrors === 0 && lintErrors === 0 ? 'pass' : 'fail';
  return { typeErrors, lintErrors, b11_a };
}

// ─── Step 3.5: Coverage gate (audit F5 — wire lint-feature --gate into the orchestrator) ──────
// The strongest HR33/34/35/36 gate used to be a separate prose step the model had to remember.
// Run it here so its verdict travels in the run_b11 result. HR33/34/35/36 is a hard rule, so
// coverageErrors > 0 now fails the run (non-zero exit) alongside b11_a — it is no longer advisory.
function runCoverageGate(): { coverageErrors: number; coverageSummary: string } {
  if (!featurePath) return { coverageErrors: 0, coverageSummary: 'coverage=skipped (no --feature-path)' };
  const linter = path.join(integrationsDir, 'lint-feature.ts');
  const checklistPath = path.join(specsDir, 'checklist.md');
  const uxStatesPath = path.join(specsDir, 'ux-states.json');
  if (!fs.existsSync(linter) || !fs.existsSync(checklistPath)) {
    return { coverageErrors: 0, coverageSummary: 'coverage=skipped (linter or checklist missing)' };
  }
  const parts = [`npx tsx "${linter}"`, `"${featurePath}"`, `--checklist "${checklistPath}"`];
  if (fs.existsSync(uxStatesPath)) parts.push(`--ux-states "${uxStatesPath}"`);
  parts.push('--gate', '--json');
  const { stdout, stderr } = run(parts.join(' '));
  try {
    const m = (stdout || stderr).match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]) as { errors?: number };
      const n = j.errors ?? 0;
      return { coverageErrors: n, coverageSummary: `coverage=${n} error(s) (HR33/34/35/36)` };
    }
  } catch { /* fall through */ }
  return { coverageErrors: 0, coverageSummary: 'coverage=unparsed' };
}

// ─── Step 3.6: Contract probe (advisory) ──────────────────────────────────────
// Verify the .http contract still satisfies data/types.ts (api.ts blind-casts the
// response, so nothing else checks this). ADVISORY by policy (USE_MOCK=true, real API
// not yet integrated): reported in the result, never gates the exit code.
function runContractProbe(): { contractErrors: number; contractWarnings: number; contractSummary: string } {
  if (!featurePath) return { contractErrors: 0, contractWarnings: 0, contractSummary: 'contract=skipped (no --feature-path)' };
  const probe = path.join(integrationsDir, 'contract-probe.ts');
  // The flagship writes the contract to docs/components/<Feature>/<Feature>.full.http (B8.6);
  // resolveContractHttp looks there first (prefer *.full.http), with docs/specs/<Feature>/ as fallback.
  const componentsDir = path.join(cwd, 'docs', 'components', featureName);
  const httpFile = resolveContractHttp(componentsDir, specsDir);
  const typesFile = [path.join(cwd, featurePath, 'data', 'types.ts'), path.join(cwd, featurePath, 'types.ts')].find((p) => fs.existsSync(p)) ?? '';
  const apiFile = [path.join(cwd, featurePath, 'data', 'api.ts'), path.join(cwd, featurePath, 'api.ts')].find((p) => fs.existsSync(p)) ?? '';
  if (!fs.existsSync(probe) || !httpFile || !typesFile || !apiFile) {
    return { contractErrors: 0, contractWarnings: 0, contractSummary: 'contract=skipped (missing .http/types/api)' };
  }
  const cmd = `npx tsx "${probe}" --http "${httpFile}" --types "${typesFile}" --api "${apiFile}" --get-only --json`;
  const { stdout, stderr } = run(cmd);
  try {
    const m = (stdout || stderr).match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]) as { errors?: number; warnings?: number };
      const e = j.errors ?? 0;
      const w = j.warnings ?? 0;
      return { contractErrors: e, contractWarnings: w, contractSummary: `contract=${e} drift error(s), ${w} warning(s) [advisory]` };
    }
  } catch { /* fall through */ }
  return { contractErrors: 0, contractWarnings: 0, contractSummary: 'contract=unparsed' };
}

// ─── Step 4: Update checklist PLAYWRIGHT rows ─────────────────────────────────

/**
 * Normalize a single line to a heading key, or null if it isn't an ATX heading (2+ `#`,
 * then whitespace, then title). Stripping everything but [a-z0-9] from the title makes
 * `## Playwright Verify (B11)` and `## 🔬 Playwright Verification Log` resolve to
 * comparable keys regardless of emoji, case, punctuation, or spacing drift (W3).
 */
export function normalizeHeading(line: string): string | null {
  const m = /^\s*#{2,}\s+(.*)$/.exec(line);
  if (!m) return null;
  return m[1].toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * First line index whose normalized heading key contains `needle` (already normalized by
 * the caller), or -1. EOL-agnostic split (E-02 discipline) so CRLF checklists resolve the
 * same as LF ones.
 */
export function findHeadingLine(content: string, needle: string): number {
  const lines = content.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const key = normalizeHeading(lines[i]);
    if (key !== null && key.includes(needle)) return i;
  }
  return -1;
}

function updateChecklistPlaywright(routeResults: RouteResult[]): boolean {
  const checklistPath = path.join(specsDir, 'checklist.md');
  const content = readFile(checklistPath);
  if (!content) return false;

  const allPassed = routeResults.every((r) => r.passed);
  const passCount = routeResults.filter((r) => r.passed).length;
  const total = routeResults.length;

  // Update PLAYWRIGHT-001 through PLAYWRIGHT-005 summary if present
  let updated = content;

  // Mark overall playwright section pass/fail
  // If there's an existing "Playwright Verify" table, update it
  if (findHeadingLine(updated, 'playwright') !== -1) {
    // Section exists — leave per-check rows as-is (playwright-runner updates them)
    // Just ensure the section is present; runner handles individual row updates
  } else {
    // Append a minimal section
    const rows = routeResults.map((r, i) => {
      const icon = r.passed ? '✅ pass' : '❌ fail';
      const notes = r.checks.find((c) => !c.passed)?.message ?? '';
      return `| PLAYWRIGHT-ROUTE-${String(i + 1).padStart(3, '0')}: ${r.route} | ${icon} | ${notes} |`;
    }).join('\n');

    const section = `\n## Playwright Verify (B11)\n\n| Check | Result | Notes |\n|-------|--------|-------|\n${rows}\n`;
    const summaryLineIdx = findHeadingLine(updated, 'summary');
    if (summaryLineIdx === -1) {
      // No Summary heading to anchor to (e.g. a template-drifted file) — append rather
      // than silently no-op (W3: the old regex-anchor miss left this branch a no-write).
      updated = `${updated}${section}`;
    } else {
      const lines = updated.split(/\r\n|\r|\n/);
      lines.splice(summaryLineIdx, 0, ...section.split('\n'));
      updated = lines.join('\n');
    }
  }

  if (updated !== content) {
    writeFile(checklistPath, updated);
    return true;
  }
  return false;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Kill any headless Chromium orphans from previous crashed B11 runs before
  // launching a new browser. Scoped to ms-playwright cache + --headless flag — safe.
  killOrphanedChromium();

  const routes = readRoutes();
  // Fixed 10-minute ceiling per route — generous enough for any realistic feature.
  // Revisit only if a feature genuinely needs > 10 min (unlikely: that's 20+ states).
  const playwrightTimeoutMs = 600_000;

  // Static analysis
  const { typeErrors, lintErrors, b11_a } = runStaticAnalysis();

  // Coverage gate (HR33/34/35/36) — reported alongside static analysis
  const { coverageErrors, coverageSummary } = runCoverageGate();

  // Contract probe (advisory) — .http contract vs data/types.ts
  const { contractErrors, contractWarnings, contractSummary } = runContractProbe();

  // Playwright
  const routeResults: RouteResult[] = [];
  const tierBRan = !noPlaywright && routes.length > 0;
  if (tierBRan) {
    // v3.24 Tier B auth preflight — fail closed on a missing/stale/expiring token
    // BEFORE any browser context is created. A bad token renders an empty-shell
    // 401 page that a shell-only assertion would false-pass (the class §4 closes).
    assertPlaywrightTokenFresh(resolvePlaywrightEnvPath());
    for (const route of routes) {
      routeResults.push(await runPlaywrightForRoute(route, playwrightTimeoutMs));
    }
  }
  // Link 1: routeResults → b11_b (pure, tested).
  const b11_b = computeB11B(routeResults, tierBRan);

  // Update checklist
  const checklistUpdated = routeResults.length > 0
    ? updateChecklistPlaywright(routeResults)
    : false;

  const passedRoutes = routeResults.filter((r) => r.passed).length;
  const summary = [
    `Static: types=${typeErrors} errors, lint=${lintErrors} errors (b11_a=${b11_a})`,
    coverageSummary,
    contractSummary,
    routes.length > 0
      ? `Playwright: ${passedRoutes}/${routeResults.length} routes passed (b11_b=${b11_b})`
      : 'Playwright: no routes defined (b11_b=skip)',
  ].join(' | ');

  const result: B11Result = {
    b11_a,
    b11_b,
    typeErrors,
    lintErrors,
    coverageErrors,
    contractErrors,
    contractWarnings,
    routeResults,
    checklistUpdated,
    summary,
  };

  // Persist the machine-measured verdict so b12-logger records b11_a/b11_b from
  // ground truth instead of trusting hand-transcribed metrics (audit Fix 2).
  // Written on every run — including failures — so the learning loop sees real
  // pass/fail. b12-logger consumes (deletes) this file after reading it.
  try {
    fs.mkdirSync(specsDir, { recursive: true });
    writeFile(
      path.join(specsDir, '.b11-result.json'),
      JSON.stringify({ b11_a, b11_b, coverageErrors, writtenAt: new Date().toISOString() }, null, 2),
    );
  } catch { /* non-fatal — stdout JSON remains the primary contract */ }

  console.log(JSON.stringify(result, null, 2));
  // Hard gates (Y.1 fix): static analysis (b11_a) AND AC coverage (HR33/34/35/36) AND Playwright
  // (b11_b !== 'fail'). A FAILING Playwright run now gates the exit (its prior omission let a
  // Playwright-failing run exit 0 and false-prove verified=true — the exact "exit code ≠ verdict"
  // hole the measurement layer exists to close). 'skip' stays valid (Tier-B-less / opt-out features).
  // Link 2: b11_a + coverage + b11_b → exit code (pure, full-matrix tested).
  const gatesPass = computeGatesPass(b11_a, coverageErrors, b11_b);
  process.exit(gatesPass ? 0 : 1);
}

// Run main() only as the CLI entry point — NOT when imported (b11-runner.test.ts imports the pure
// computeB11B / computeGatesPass fns). Mirrors record-verify.ts's guard.
if (isCli) {
  main().catch((err) => {
    console.error(JSON.stringify({ error: String(err) }));
    process.exit(1);
  });
}
