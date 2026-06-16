/// <reference types="node" />
/**
 * playwright-runner.ts
 * Invoked by /feature-from-confluence at B11 to verify a feature route.
 *
 * Usage:
 *   npx tsx .claude/integrations/playwright-runner.ts <route> [--screenshot] [--feature-name <name>]
 *     [--mock-error] [--interactions <path/to/ux-states.json>]
 *
 * Examples:
 *   npx tsx .claude/integrations/playwright-runner.ts /your-app/feature-route
 *   npx tsx .claude/integrations/playwright-runner.ts /your-app/feature-route --screenshot --feature-name UserProfile
 *   npx tsx .claude/integrations/playwright-runner.ts /route --mock-error --feature-name Foo
 *   npx tsx .claude/integrations/playwright-runner.ts /route --interactions docs/specs/Foo/ux-states.json --feature-name Foo
 *
 * New flags:
 *   --mock-error         Intercept all requests matching PLAYWRIGHT_API_PATH_PATTERN env var
 *                        (default: "**\/api\/**") with HTTP 500 to verify error state renders,
 *                        then restore passthrough.
 *   --interactions       Path to a ux-states.json file with declarative interaction steps for
 *                        loading / empty / success UX state verification.
 *
 * Output:
 *   Prints JSON result to stdout — consumed by the command to update checklist.
 *   Saves screenshots to docs/specs/<FeatureName>/screenshots/<route-slug>-<timestamp>.png
 *   Falls back to docs/specs/screenshots/ if --feature-name is not provided.
 *
 * Auth:
 *   Reads PLAYWRIGHT_ACCESS_TOKEN / PLAYWRIGHT_REFRESH_TOKEN / PLAYWRIGHT_TOKEN_EXPIRES_AT
 *   from .env.playwright and injects them into localStorage before any page script runs.
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Optional deps — loaded lazily so the script still runs if they're missing
type PixelmatchFn = (a: Uint8Array, b: Uint8Array, out: Uint8Array, w: number, h: number, opts?: { threshold?: number; includeAA?: boolean }) => number;
type PngLike = { width: number; height: number; data: Uint8Array };
type PngModule = { sync: { read: (buf: Buffer) => PngLike; write: (png: PngLike) => Buffer }; new (opts: { width: number; height: number }): PngLike };

async function loadPixelmatch(): Promise<PixelmatchFn | null> {
  try {
    const mod = await import('pixelmatch');
    return (mod.default ?? mod) as PixelmatchFn;
  } catch {
    return null;
  }
}

async function loadPngjs(): Promise<PngModule | null> {
  try {
    const mod = await import('pngjs');
    return (mod as unknown as { PNG: PngModule }).PNG;
  } catch {
    return null;
  }
}

async function loadAxeBuilder(): Promise<(new (opts: { page: Page }) => { analyze: () => Promise<{ violations: AxeViolation[] }> }) | null> {
  try {
    const mod = await import('@axe-core/playwright');
    return (mod as unknown as { default: new (opts: { page: Page }) => { analyze: () => Promise<{ violations: AxeViolation[] }> } }).default;
  } catch {
    return null;
  }
}

interface AxeViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  description: string;
  help: string;
  nodes: Array<{ target: string[]; html: string }>;
}

/** Parse a .env-style file and merge values into process.env (does not overwrite existing). */
function loadEnvFile(filePath: string): void {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return;
  const lines = fs.readFileSync(resolved, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// Load .env.playwright first, then .env.private as fallback
loadEnvFile('.env.playwright');
loadEnvFile('.env.private');

interface TestResult {
  route: string;
  timestamp: string;
  passed: boolean;
  checks: CheckResult[];
  screenshotPath?: string;
  error?: string;
  extended?: ExtendedResults;
}

interface CheckResult {
  id: string;
  description: string;
  passed: boolean;
  evidence?: string;
}

interface InteractionStep {
  action: 'click' | 'fill' | 'navigate' | 'wait' | 'waitForSelector' | 'screenshot' | 'mockRoute';
  selector?: string;
  value?: string;
  url?: string;
  timeout?: number;
  label: string;
  screenshotAfter?: boolean;
  // mockRoute-specific fields
  urlPattern?: string;        // glob pattern for page.route() interception
  responseStatus?: number;
  responseBody?: unknown;
  responseHeaders?: Record<string, string>;
}

interface InteractionScript {
  states: {
    loading?: InteractionStep[];
    error?: InteractionStep[];
    empty?: InteractionStep[];
    success?: InteractionStep[];
  };
}

// ── Extended ux-states.json schema (v2) ────────────────────────────────────
// Plan §F: per-row verification mapping. states[] is array form (v2);
// states{} object form is legacy (v1). Schema detection via Array.isArray.

interface AcAssertion {
  ac_id: string;
  selector: string;
  // expected formats:
  //   "visible" | "hidden" | "text:<exact>" | "count:<n>" | "attr:<name>=<value>" | "i18n:<message-id>"
  expected: string;
}

interface StateV2 {
  name: string;
  route?: string;
  steps: InteractionStep[];
  baseline?: string;       // path to spec image for visual diff
  ui_rows?: string[];      // UI-XXX IDs verified by this state's baseline diff
  ac_assertions?: AcAssertion[];
}

interface UnitTestEntry {
  ac_id: string;
  test_file: string;
  grep?: string;
}

interface InteractionScriptV2 {
  feature?: string;
  states: StateV2[];
  negative_states?: StateV2[];
  unit_tests?: UnitTestEntry[];
}

function isV2Schema(parsed: unknown): parsed is InteractionScriptV2 {
  return !!parsed && typeof parsed === 'object'
    && Array.isArray((parsed as { states?: unknown }).states);
}

// ── L-08 cascade detection ────────────────────────────────────────────
// When a step ACTION fails in state N (e.g. element not found on click), all subsequent
// states in the same page session produce misleading assertion evidence rather than real
// failures. Detect the root cause and report cascade-blocked count separately.

export interface CascadeAnalysis {
  rootFailure: { stateName: string; evidence: string } | null;
  cascadeBlockedCount: number;
}

/**
 * Pure function — given a sequence of (name, stepPassed, stepEvidence) results,
 * returns the first failure as rootFailure and counts how many subsequent states
 * would be cascade-blocked.  Testable without a browser.
 */
export function analyzeCascade(
  stateResults: Array<{ name: string; passed: boolean; evidence: string }>,
): CascadeAnalysis {
  let rootFailure: { stateName: string; evidence: string } | null = null;
  let cascadeBlockedCount = 0;
  for (const r of stateResults) {
    if (rootFailure) {
      cascadeBlockedCount += 1;
    } else if (!r.passed) {
      rootFailure = { stateName: r.name, evidence: r.evidence };
    }
  }
  return { rootFailure, cascadeBlockedCount };
}

interface RowVerdict {
  id: string;
  passed: boolean;
  evidence: string;
}

interface ExtendedResults {
  uiResults: RowVerdict[];
  acResults: RowVerdict[];
  unitTestResults: RowVerdict[];
  visualDiffs: Array<{ stateName: string; baselineImage: string; diffPercent: number; diffImagePath?: string; passed: boolean }>;
  a11yViolations: AxeViolation[];
  cssViolations: Array<{ selector: string; property: string; actual: string; expected: string }>;
}

/**
 * Inject localStorage auth tokens before any page script runs.
 * Reads from PLAYWRIGHT_ACCESS_TOKEN / PLAYWRIGHT_REFRESH_TOKEN / PLAYWRIGHT_TOKEN_EXPIRES_AT.
 * Must be called before page.goto() so addInitScript fires on the first navigation.
 */
async function injectAuthTokens(page: Page): Promise<boolean> {
  const accessToken = process.env.PLAYWRIGHT_ACCESS_TOKEN;
  if (!accessToken) return false;

  const refreshToken = process.env.PLAYWRIGHT_REFRESH_TOKEN ?? '';
  const expiresAt = process.env.PLAYWRIGHT_TOKEN_EXPIRES_AT ?? '';

  await page.addInitScript(
    ({ a, r, e }: { a: string; r: string; e: string }) => {
      localStorage.setItem('access_token', a);
      if (r) localStorage.setItem('refresh_token', r);
      if (e) localStorage.setItem('token_expires_at', e);
    },
    { a: accessToken, r: refreshToken, e: expiresAt },
  );
  return true;
}

// ── Helpers for v3.6 verification (visual diff, axe, css audit, checklist) ─

async function takeScreenshotAt(page: Page, targetPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  await page.screenshot({ path: targetPath, fullPage: true });
}

async function runVisualDiff(
  actualPath: string,
  baselinePath: string,
  thresholdPercent: number,
): Promise<{ diffPercent: number; diffPixels: number; totalPixels: number; passed: boolean; diffImagePath?: string; error?: string }> {
  const pixelmatch = await loadPixelmatch();
  const PNG = await loadPngjs();
  if (!pixelmatch || !PNG) {
    return { diffPercent: 0, diffPixels: 0, totalPixels: 0, passed: false, error: 'pixelmatch/pngjs not installed at root — npm install -D pixelmatch pngjs' };
  }
  if (!fs.existsSync(actualPath)) return { diffPercent: 100, diffPixels: 0, totalPixels: 0, passed: false, error: `Actual screenshot missing: ${actualPath}` };
  if (!fs.existsSync(baselinePath)) return { diffPercent: 100, diffPixels: 0, totalPixels: 0, passed: false, error: `Baseline missing: ${baselinePath}` };

  const actualPng = PNG.sync.read(fs.readFileSync(actualPath));
  let baselinePng = PNG.sync.read(fs.readFileSync(baselinePath));
  if (baselinePng.width !== actualPng.width || baselinePng.height !== actualPng.height) {
    // Nearest-neighbor resize baseline to actual dims
    const w = actualPng.width;
    const h = actualPng.height;
    const resized = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) {
      const sy = Math.min(baselinePng.height - 1, Math.floor((y * baselinePng.height) / h));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(baselinePng.width - 1, Math.floor((x * baselinePng.width) / w));
        const sIdx = (sy * baselinePng.width + sx) << 2;
        const dIdx = (y * w + x) << 2;
        resized.data[dIdx] = baselinePng.data[sIdx];
        resized.data[dIdx + 1] = baselinePng.data[sIdx + 1];
        resized.data[dIdx + 2] = baselinePng.data[sIdx + 2];
        resized.data[dIdx + 3] = baselinePng.data[sIdx + 3];
      }
    }
    baselinePng = resized;
  }

  const diff = new PNG({ width: actualPng.width, height: actualPng.height });
  const diffPixels = pixelmatch(actualPng.data, baselinePng.data, diff.data, actualPng.width, actualPng.height, { threshold: 0.1, includeAA: false });
  const totalPixels = actualPng.width * actualPng.height;
  const diffPercent = (diffPixels / totalPixels) * 100;
  const passed = diffPercent <= thresholdPercent;

  const baseName = path.basename(actualPath, '.png');
  const diffDir = path.join(path.dirname(actualPath), '..', 'visual-diff');
  fs.mkdirSync(diffDir, { recursive: true });
  const diffImagePath = path.join(diffDir, `${baseName}-diff.png`);
  fs.writeFileSync(diffImagePath, PNG.sync.write(diff));

  return { diffPercent, diffPixels, totalPixels, passed, diffImagePath };
}

async function runAxeAudit(page: Page): Promise<{ violations: AxeViolation[]; available: boolean }> {
  const AxeBuilder = await loadAxeBuilder();
  if (!AxeBuilder) return { violations: [], available: false };
  const results = await new AxeBuilder({ page }).analyze();
  // Filter to critical/serious only (per plan)
  const critical = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  return { violations: critical, available: true };
}

interface VisualProperties {
  palette: string[];      // lowercase 6-char hex with leading #
  spacing: number[];      // px values
  typographyRoles: Record<string, { fontSize?: string; fontWeight?: string }>;
}

function parseVisualProperties(filePath: string): VisualProperties {
  const empty: VisualProperties = { palette: [], spacing: [], typographyRoles: {} };
  if (!fs.existsSync(filePath)) return empty;
  const text = fs.readFileSync(filePath, 'utf8');

  const palette: string[] = [];
  const hexRe = /#([0-9a-fA-F]{6})\b/g;
  let m: RegExpExecArray | null;
  const paletteSection = text.match(/##\s*Palette([\s\S]*?)(?=\n##|$)/);
  if (paletteSection) {
    while ((m = hexRe.exec(paletteSection[1])) !== null) palette.push(`#${m[1].toLowerCase()}`);
  }

  const spacing: number[] = [];
  const spacingSection = text.match(/##\s*Spacing scale([\s\S]*?)(?=\n##|$)/);
  if (spacingSection) {
    const pxRe = /(\d+)\s*px/g;
    while ((m = pxRe.exec(spacingSection[1])) !== null) spacing.push(parseInt(m[1], 10));
  }

  const typographyRoles: Record<string, { fontSize?: string; fontWeight?: string }> = {};
  const typoSection = text.match(/##\s*Typography([\s\S]*?)(?=\n##|$)/);
  if (typoSection) {
    const roleRe = /-\s*(H1|H2|H3|Body|Caption|Label)\s*:\s*([^\n]+)/gi;
    while ((m = roleRe.exec(typoSection[1])) !== null) {
      const role = m[1];
      const value = m[2];
      const size = value.match(/(\d+(?:\.\d+)?)\s*(px|rem|em)/);
      const weight = value.match(/(\d{3}|normal|bold|medium|light|semibold)/i);
      typographyRoles[role] = {
        fontSize: size ? `${size[1]}${size[2]}` : undefined,
        fontWeight: weight ? weight[1].toLowerCase() : undefined,
      };
    }
  }

  return { palette, spacing, typographyRoles };
}

function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
  if (!m) return null;
  const r = parseInt(m[1], 10).toString(16).padStart(2, '0');
  const g = parseInt(m[2], 10).toString(16).padStart(2, '0');
  const b = parseInt(m[3], 10).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`.toLowerCase();
}

async function runCssAudit(
  page: Page,
  selectors: string[],
  props: VisualProperties,
): Promise<Array<{ selector: string; property: string; actual: string; expected: string }>> {
  const violations: Array<{ selector: string; property: string; actual: string; expected: string }> = [];
  if (props.palette.length === 0 && props.spacing.length === 0) return violations;

  for (const sel of selectors) {
    const el = await page.$(sel);
    if (!el) continue;
    const style = await el.evaluate((node) => {
      const s = getComputedStyle(node as Element);
      return {
        color: s.color,
        backgroundColor: s.backgroundColor,
        padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
        margin: `${s.marginTop} ${s.marginRight} ${s.marginBottom} ${s.marginLeft}`,
        gap: s.gap,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
      };
    });

    if (props.palette.length > 0) {
      const colorHex = rgbToHex(style.color);
      if (colorHex && !props.palette.includes(colorHex) && colorHex !== '#000000') {
        violations.push({ selector: sel, property: 'color', actual: colorHex, expected: `one of ${props.palette.join(', ')}` });
      }
      const bgHex = rgbToHex(style.backgroundColor);
      if (bgHex && !props.palette.includes(bgHex) && bgHex !== '#000000' && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        violations.push({ selector: sel, property: 'background-color', actual: bgHex, expected: `one of ${props.palette.join(', ')}` });
      }
    }

    if (props.spacing.length > 0) {
      const pxValues = [style.padding, style.margin, style.gap]
        .join(' ')
        .match(/(\d+(?:\.\d+)?)px/g) ?? [];
      for (const px of pxValues) {
        const n = parseFloat(px);
        if (n > 0 && !props.spacing.includes(n) && !props.spacing.includes(Math.round(n))) {
          violations.push({ selector: sel, property: 'spacing', actual: `${n}px`, expected: `one of [${props.spacing.join(',')}]px` });
          break; // one violation per selector for brevity
        }
      }
    }
  }

  return violations;
}

async function runAcAssertion(
  page: Page,
  assertion: AcAssertion,
  messagesPath?: string,
): Promise<{ passed: boolean; evidence: string }> {
  const { selector, expected } = assertion;
  try {
    if (expected === 'visible') {
      const el = await page.$(selector);
      const visible = !!el && (await el.isVisible());
      return { passed: visible, evidence: visible ? `${selector} visible` : `${selector} not visible` };
    }
    if (expected === 'hidden') {
      const el = await page.$(selector);
      const hidden = !el || !(await el.isVisible());
      return { passed: hidden, evidence: hidden ? `${selector} hidden` : `${selector} still visible` };
    }
    if (expected.startsWith('text:')) {
      const expectedText = expected.slice(5);
      const el = await page.$(selector);
      if (!el) return { passed: false, evidence: `${selector} not found` };
      const actual = (await el.innerText()).trim();
      return { passed: actual.includes(expectedText), evidence: `text="${actual.slice(0, 80)}"` };
    }
    if (expected.startsWith('i18n:')) {
      const messageId = expected.slice(5);
      let expectedText = messageId;
      if (messagesPath && fs.existsSync(messagesPath)) {
        const msgFile = fs.readFileSync(messagesPath, 'utf8');
        const re = new RegExp(`['"]${messageId.replace(/\./g, '\\.')}['"]\\s*,?\\s*defaultMessage\\s*:\\s*['"]([^'"]+)['"]`);
        const m = msgFile.match(re);
        if (m) expectedText = m[1];
      }
      const el = await page.$(selector);
      if (!el) return { passed: false, evidence: `${selector} not found` };
      const actual = (await el.innerText()).trim();
      return { passed: actual.includes(expectedText), evidence: `i18n:${messageId} → "${actual.slice(0, 80)}"` };
    }
    if (expected.startsWith('count:')) {
      const n = parseInt(expected.slice(6), 10);
      const count = await page.locator(selector).count();
      return { passed: count === n, evidence: `count=${count} (expected ${n})` };
    }
    if (expected.startsWith('attr:')) {
      const m = expected.slice(5).match(/^([^=]+)=(.+)$/);
      if (!m) return { passed: false, evidence: `invalid attr expected: ${expected}` };
      const [, attrName, attrValue] = m;
      const el = await page.$(selector);
      if (!el) return { passed: false, evidence: `${selector} not found` };
      const actual = await el.getAttribute(attrName);
      return { passed: actual === attrValue, evidence: `${attrName}="${actual}" (expected "${attrValue}")` };
    }
    return { passed: false, evidence: `Unknown expected format: ${expected}` };
  } catch (err) {
    return { passed: false, evidence: err instanceof Error ? err.message : String(err) };
  }
}

interface ChecklistRow {
  table: 'Requirements' | 'UI Verification' | 'ACT';
  id: string;
  tool?: string;
  status: string;
  evidence: string;
  rawLine: string;
}

function parseChecklistRows(checklistPath: string): ChecklistRow[] {
  if (!fs.existsSync(checklistPath)) return [];
  const text = fs.readFileSync(checklistPath, 'utf8');
  const rows: ChecklistRow[] = [];
  const lines = text.split(/\r?\n/);
  let currentTable: ChecklistRow['table'] | null = null;
  for (const line of lines) {
    const h = line.match(/^##\s+(Requirements Coverage|UI Verification|ACT)/i);
    if (h) {
      currentTable = h[1].toLowerCase().startsWith('req') ? 'Requirements'
        : h[1].toLowerCase().startsWith('ui') ? 'UI Verification'
        : 'ACT';
      continue;
    }
    if (!currentTable) continue;
    if (!line.trim().startsWith('|')) continue;
    if (/^\|\s*-+\s*\|/.test(line)) continue; // separator row
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    if (/^(ID|AC ID)$/i.test(cells[0])) continue; // header row
    const id = cells[0];
    if (!id || !/^[A-Z][A-Z0-9-]+/.test(id)) continue;
    if (currentTable === 'ACT') {
      rows.push({ table: 'ACT', id, tool: cells[2], status: cells[3] ?? '', evidence: cells[4] ?? '', rawLine: line });
    } else if (currentTable === 'UI Verification') {
      rows.push({ table: 'UI Verification', id, status: cells[2] ?? '', evidence: cells[3] ?? '', rawLine: line });
    } else {
      rows.push({ table: 'Requirements', id, status: cells[2] ?? '', evidence: cells[3] ?? '', rawLine: line });
    }
  }
  return rows;
}

function updateChecklistRows(checklistPath: string, verdicts: RowVerdict[]): void {
  if (!fs.existsSync(checklistPath) || verdicts.length === 0) return;
  let text = fs.readFileSync(checklistPath, 'utf8');
  for (const v of verdicts) {
    const statusIcon = v.passed ? '✅ Pass' : '❌ Fail';
    // Update line that starts with | <id> | ...
    const re = new RegExp(`^(\\|\\s*${v.id.replace(/[-]/g, '\\-')}\\s*\\|[^\\n]*)$`, 'm');
    const match = text.match(re);
    if (!match) continue;
    const cells = match[1].split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length >= 5) {
      // ACT table: id|desc|tool|status|evidence
      cells[3] = statusIcon;
      cells[4] = v.evidence;
    } else if (cells.length === 4) {
      // UI/Requirements: id|desc|status|evidence
      cells[2] = statusIcon;
      cells[3] = v.evidence;
    }
    const newLine = `| ${cells.join(' | ')} |`;
    text = text.replace(re, newLine);
  }
  fs.writeFileSync(checklistPath, text, 'utf8');
}

function runUnitTestEntry(entry: UnitTestEntry): { passed: boolean; evidence: string } {
  // Spawn jest. The repo has `npm test` configured. Use --testPathPattern and -t.
  try {
    const { spawnSync } = require('child_process') as typeof import('child_process');
    const args = ['test', '--', '--testPathPattern', entry.test_file];
    if (entry.grep) args.push('-t', entry.grep);
    const r = spawnSync('npm', args, { encoding: 'utf8', shell: true });
    const out = `${r.stdout}\n${r.stderr}`;
    const passed = r.status === 0 && /PASS/.test(out);
    return { passed, evidence: passed ? `jest pass: ${entry.test_file}` : `jest fail (exit ${r.status})` };
  } catch (err) {
    return { passed: false, evidence: err instanceof Error ? err.message : String(err) };
  }
}

async function runInteractionState(
  page: Page,
  steps: InteractionStep[],
  stateName: string,
  screenshotDir: string,
  timestamp: string,
): Promise<{ passed: boolean; evidence: string }> {
  try {
    for (const step of steps) {
      switch (step.action) {
        case 'click':
          await page.click(step.selector!, { timeout: step.timeout ?? 10_000 });
          break;
        case 'fill':
          await page.fill(step.selector!, step.value ?? '', { timeout: step.timeout ?? 10_000 });
          break;
        case 'navigate':
          await page.goto(step.url!, { waitUntil: 'domcontentloaded', timeout: step.timeout ?? 30_000 });
          break;
        case 'wait':
          await page.waitForTimeout(step.timeout ?? 2000);
          break;
        case 'waitForSelector':
          await page.waitForSelector(step.selector!, { timeout: step.timeout ?? 10_000 });
          break;
        case 'screenshot': {
          fs.mkdirSync(screenshotDir, { recursive: true });
          const p = path.join(screenshotDir, `${stateName}-${step.label.replace(/\s+/g, '_')}-${timestamp}.png`);
          await page.screenshot({ path: p, fullPage: true });
          break;
        }
        case 'mockRoute': {
          const pattern = step.urlPattern ?? step.url ?? '**/api/**';
          const status = step.responseStatus ?? 200;
          const body = step.responseBody !== undefined ? JSON.stringify(step.responseBody) : '{}';
          const headers: Record<string, string> = { 'content-type': 'application/json', ...step.responseHeaders };
          await page.route(pattern, (r) => r.fulfill({ status, body, headers }));
          break;
        }
      }
      if (step.screenshotAfter) {
        fs.mkdirSync(screenshotDir, { recursive: true });
        const p = path.join(
          screenshotDir,
          `${stateName}-after-${step.label.replace(/\s+/g, '_')}-${timestamp}.png`,
        );
        await page.screenshot({ path: p, fullPage: true });
      }
    }
    return { passed: true, evidence: `${steps.length} step(s) completed` };
  } catch (err) {
    return { passed: false, evidence: err instanceof Error ? err.message : String(err) };
  }
}

interface RunnerConfig {
  route: string;
  takeScreenshot: boolean;
  featureName?: string;
  mockError?: boolean;
  interactionScript?: InteractionScript;
  scriptV2?: InteractionScriptV2;
  visualBaseline?: string;
  visualBaselineDir?: string;
  acChecklistPath?: string;
  auditA11y?: boolean;
  auditCssPath?: string;
  messagesPath?: string;
  visualDiffThreshold?: number;
}

async function runFeatureVerification(cfg: RunnerConfig): Promise<TestResult & { extended?: ExtendedResults }> {
  const { route, takeScreenshot, featureName, mockError, interactionScript, scriptV2 } = cfg;
  const visualDiffThreshold = cfg.visualDiffThreshold ?? 5;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseUrl = process.env.DEV_SERVER_URL ?? 'http://localhost:3000';
  // Accept full URLs (e.g. http://localhost:3000/path) or path-only (/path).
  // On Windows/Git Bash, POSIX paths can be mangled to C:/Program Files/Git/...
  // — detect that and strip the prefix back to a path.
  let resolvedRoute = route;
  if (/^https?:\/\//.test(route)) {
    const parsed = new URL(route);
    resolvedRoute = parsed.pathname + parsed.search + parsed.hash;
  } else if (/^[A-Za-z]:[\\/]/.test(route)) {
    // Git Bash converted /foo → C:/Program Files/Git/foo — strip the drive+prefix
    resolvedRoute = '/' + route.replace(/^[A-Za-z]:[\\/]/, '').replace(/\\/g, '/');
    // Remove the "Program Files/Git" or similar Git install prefix if present
    const gitPrefixMatch = resolvedRoute.match(/^\/.*?\/Git(\/.*)/i);
    if (gitPrefixMatch) resolvedRoute = gitPrefixMatch[1];
  }
  // Prepend PUBLIC_PATH when set (e.g. /your-app/ or /authoring/).
  // Guard prevents double-prefix if the caller already included it.
  const publicPath = (process.env.PUBLIC_PATH ?? '').replace(/\/$/, '');
  if (publicPath && !resolvedRoute.startsWith(publicPath)) {
    resolvedRoute = publicPath + resolvedRoute;
  }
  const fullUrl = `${baseUrl}${resolvedRoute}`;

  const checks: CheckResult[] = [];
  let screenshotPath: string | undefined;
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Inject localStorage tokens before any script runs (prevents redirect to logout)
    const tokenInjected = await injectAuthTokens(page);
    if (!tokenInjected) {
      console.warn('⚠️  No PLAYWRIGHT_ACCESS_TOKEN found — app may redirect to logout');
    }

    // Check 2: No unhandled JS errors (filter 401/403 auth redirects and external-domain noise)
    // Register listener before goto so we catch errors during initial load
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // Ignore auth redirect noise: resource 401/403/404 and warnings from external auth MFEs
      if (/Failed to load resource.*40[134]/.test(text)) return;
      if (/Warning:/.test(text)) return;
      consoleErrors.push(text);
    });

    const response = await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Check 1: Route resolves (no 404 / error page)
    const status = response?.status() ?? 0;
    checks.push({
      id: 'PLAYWRIGHT-001',
      description: `Route ${resolvedRoute} resolves (HTTP ${status})`,
      passed: status >= 200 && status < 400,
      evidence: `HTTP ${status}`,
    });

    await page.waitForTimeout(5000);
    checks.push({
      id: 'PLAYWRIGHT-002',
      description: 'No unhandled JS errors on initial load',
      passed: consoleErrors.length === 0,
      evidence: consoleErrors.length > 0 ? consoleErrors.join('; ') : 'clean',
    });

    // Check 3: Loading state resolves (no stuck spinner)
    const spinner = await page.$('[data-testid="loading"], .spinner, [aria-label="Loading"]');
    if (spinner) {
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="loading"], .spinner, [aria-label="Loading"]'),
        { timeout: 10_000 },
      ).catch(() => null);
    }
    const spinnerAfter = await page.$('[data-testid="loading"], .spinner, [aria-label="Loading"]');
    checks.push({
      id: 'PLAYWRIGHT-003',
      description: 'Loading state resolves — no stuck spinner',
      passed: !spinnerAfter,
      evidence: spinnerAfter ? 'Spinner still visible after 10s' : 'Resolved',
    });

    // Check 4: No error alert visible
    const errorAlert = await page.$('[data-testid="error-alert"], .alert-danger, [role="alert"]');
    const errorText = errorAlert ? await errorAlert.innerText() : null;
    checks.push({
      id: 'PLAYWRIGHT-004',
      description: 'No error alert visible after load',
      passed: !errorAlert,
      evidence: errorText ?? 'No error alert',
    });

    // Check 5: Page has meaningful content (not blank)
    const bodyText = await page.locator('body').innerText();
    checks.push({
      id: 'PLAYWRIGHT-005',
      description: 'Page renders meaningful content (not blank)',
      passed: bodyText.trim().length > 100,
      evidence: `Body text length: ${bodyText.trim().length} chars`,
    });

    const screenshotDir = featureName
      ? path.join('docs', 'specs', featureName, 'screenshots')
      : path.join('docs', 'specs', 'screenshots');

    // --mock-error: inject HTTP 500 on all API calls, verify error state renders, then restore
    if (mockError) {
      const apiPattern = process.env.PLAYWRIGHT_API_PATH_PATTERN ?? '**/api/**';
      await page.route(apiPattern, (route) =>
        route.fulfill({ status: 500, body: JSON.stringify({ error: 'Mocked server error' }) }),
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      const errorEl = await page.$('[data-testid="error-alert"], .alert-danger, [role="alert"]');
      checks.push({
        id: 'PLAYWRIGHT-006',
        description: 'Error state renders when API returns 500',
        passed: !!errorEl,
        evidence: errorEl ? 'Error alert visible after 500 injection' : 'No error alert detected',
      });
      // Restore passthrough so subsequent checks see real data
      await page.route(apiPattern, (route) => route.continue());
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
    }

    const extended: ExtendedResults = {
      uiResults: [],
      acResults: [],
      unitTestResults: [],
      visualDiffs: [],
      a11yViolations: [],
      cssViolations: [],
    };

    // ── v1 path: --interactions with object-form states ──
    if (interactionScript && !scriptV2) {
      for (const [stateName, steps] of Object.entries(interactionScript.states)) {
        if (!steps?.length) continue;
        const result = await runInteractionState(page, steps, stateName, screenshotDir, timestamp);
        checks.push({
          id: `PLAYWRIGHT-STATE-${stateName.toUpperCase()}`,
          description: `UX state: ${stateName}`,
          passed: result.passed,
          evidence: result.evidence,
        });
      }
    }

    // ── v2 path: per-state baseline diff + ac_assertions + ui_rows verdicts ──
    if (scriptV2) {
      // L-08: cascade detection — process states + negative_states as one sequence.
      // When a step ACTION fails in state N, all subsequent states are cascade-blocked
      // (running them produces misleading assertion evidence rather than real failures).
      let cascadeFrom: { stateName: string; evidence: string } | null = null;
      let cascadeBlockedCount = 0;
      const allStates = [...(scriptV2.states ?? []), ...(scriptV2.negative_states ?? [])];

      for (const state of allStates) {
        if (cascadeFrom) {
          // Cascade-blocked: skip execution, mark as blocked with root-failure context
          cascadeBlockedCount += 1;
          const blockedEvidence = `cascade-blocked by root failure in "${cascadeFrom.stateName}": ${cascadeFrom.evidence}`;
          (state.ui_rows ?? []).forEach((id) => extended.uiResults.push({ id, passed: false, evidence: blockedEvidence }));
          (state.ac_assertions ?? []).forEach((a) => extended.acResults.push({ id: a.ac_id, passed: false, evidence: blockedEvidence }));
          continue;
        }

        const stepResult = await runInteractionState(page, state.steps, state.name, screenshotDir, timestamp);
        if (!stepResult.passed) {
          // Root step failure — mark this state's assertions failed and trigger cascade
          cascadeFrom = { stateName: state.name, evidence: stepResult.evidence };
          (state.ui_rows ?? []).forEach((id) => extended.uiResults.push({ id, passed: false, evidence: `state ${state.name} failed: ${stepResult.evidence}` }));
          (state.ac_assertions ?? []).forEach((a) => extended.acResults.push({ id: a.ac_id, passed: false, evidence: `state ${state.name} failed: ${stepResult.evidence}` }));
          continue;
        }

        // Per-state screenshot
        const stateSlug = state.name.replace(/[^a-zA-Z0-9-]/g, '_');
        const stateShot = path.join(screenshotDir, `state-${stateSlug}-${timestamp}.png`);
        await takeScreenshotAt(page, stateShot);

        // Visual baseline diff for this state (uses ui_rows)
        if (state.baseline) {
          const baselinePath = path.isAbsolute(state.baseline) ? state.baseline
            : featureName ? path.join('docs', 'specs', featureName, state.baseline)
            : state.baseline;
          const diff = await runVisualDiff(stateShot, baselinePath, visualDiffThreshold);
          extended.visualDiffs.push({ stateName: state.name, baselineImage: baselinePath, diffPercent: diff.diffPercent, diffImagePath: diff.diffImagePath, passed: diff.passed });
          const uiEvidence = diff.error ?? `diff ${diff.diffPercent.toFixed(2)}% (threshold ${visualDiffThreshold}%) — ${diff.diffImagePath ?? 'no diff img'}`;
          (state.ui_rows ?? []).forEach((id) => extended.uiResults.push({ id, passed: diff.passed, evidence: uiEvidence }));
        }

        // AC assertions for this state
        for (const assertion of state.ac_assertions ?? []) {
          const r = await runAcAssertion(page, assertion, cfg.messagesPath);
          extended.acResults.push({ id: assertion.ac_id, passed: r.passed, evidence: r.evidence });
        }
      }

      // L-08: report cascade summary alongside the root failure
      if (cascadeFrom && cascadeBlockedCount > 0) {
        checks.push({
          id: 'PLAYWRIGHT-CASCADE',
          description: 'Cascade failure analysis',
          passed: false,
          evidence: `Root failure ("${cascadeFrom.stateName}") → ${cascadeBlockedCount} cascade-blocked state(s); fix the root step failure before analyzing downstream assertion failures`,
        });
      }

      // Unit tests (not cascade-blocked — they run independently via jest)
      for (const unitTest of scriptV2.unit_tests ?? []) {
        const r = runUnitTestEntry(unitTest);
        extended.unitTestResults.push({ id: unitTest.ac_id, passed: r.passed, evidence: r.evidence });
      }

      // Aggregate v2 verdicts into checks
      const uiPassed = extended.uiResults.every((r) => r.passed);
      const acPassed = extended.acResults.every((r) => r.passed);
      const utPassed = extended.unitTestResults.every((r) => r.passed);
      const vdPassed = extended.visualDiffs.every((v) => v.passed);
      if (extended.visualDiffs.length > 0) {
        checks.push({ id: 'PLAYWRIGHT-007', description: 'Visual regression vs spec baselines', passed: vdPassed, evidence: `${extended.visualDiffs.filter((v) => v.passed).length}/${extended.visualDiffs.length} states matched (≤${visualDiffThreshold}% diff)` });
      }
      if (extended.acResults.length > 0) {
        checks.push({ id: 'PLAYWRIGHT-008', description: 'Per-AC behavior verification', passed: acPassed, evidence: `${extended.acResults.filter((r) => r.passed).length}/${extended.acResults.length} AC assertions passed` });
      }
      if (extended.uiResults.length > 0) {
        checks.push({ id: 'PLAYWRIGHT-UI-ROWS', description: 'UI row verdicts (via baseline diff)', passed: uiPassed, evidence: `${extended.uiResults.filter((r) => r.passed).length}/${extended.uiResults.length} UI rows passed` });
      }
      if (extended.unitTestResults.length > 0) {
        checks.push({ id: 'PLAYWRIGHT-UNIT', description: 'Unit tests for Unit-Test ACT rows', passed: utPassed, evidence: `${extended.unitTestResults.filter((r) => r.passed).length}/${extended.unitTestResults.length} jest entries passed` });
      }
    }

    // ── Standalone --visual-baseline (single image) ──
    if (cfg.visualBaseline && !scriptV2) {
      const slug = resolvedRoute.replace(/\//g, '_').replace(/^_/, '').replace(/[:<>"|?*]/g, '-');
      fs.mkdirSync(screenshotDir, { recursive: true });
      const actualPath = path.join(screenshotDir, `${slug}-${timestamp}.png`);
      await takeScreenshotAt(page, actualPath);
      const diff = await runVisualDiff(actualPath, cfg.visualBaseline, visualDiffThreshold);
      extended.visualDiffs.push({ stateName: 'main', baselineImage: cfg.visualBaseline, diffPercent: diff.diffPercent, diffImagePath: diff.diffImagePath, passed: diff.passed });
      checks.push({ id: 'PLAYWRIGHT-007', description: `Visual diff vs ${path.basename(cfg.visualBaseline)}`, passed: diff.passed, evidence: diff.error ?? `${diff.diffPercent.toFixed(2)}% diff → ${diff.diffImagePath}` });
      screenshotPath = actualPath;
    }

    // ── --audit-a11y ──
    if (cfg.auditA11y) {
      const axe = await runAxeAudit(page);
      if (!axe.available) {
        checks.push({ id: 'PLAYWRIGHT-009', description: 'A11y audit (axe-core)', passed: false, evidence: '@axe-core/playwright not installed — npm install -D @axe-core/playwright' });
      } else {
        extended.a11yViolations = axe.violations;
        const passed = axe.violations.length === 0;
        const summary = passed ? '0 critical/serious violations'
          : axe.violations.slice(0, 5).map((v) => `${v.id} (${v.impact})`).join(', ');
        checks.push({ id: 'PLAYWRIGHT-009', description: 'A11y audit (axe-core, critical+serious)', passed, evidence: summary });
      }
    }

    // ── --audit-css ──
    if (cfg.auditCssPath) {
      const props = parseVisualProperties(cfg.auditCssPath);
      // Build selector list from v2 ac_assertions (if present) + sensible defaults
      const selectors = new Set<string>(['body', 'h1', 'h2', 'button', 'a']);
      if (scriptV2) {
        scriptV2.states.forEach((s) => (s.ac_assertions ?? []).forEach((a) => selectors.add(a.selector)));
      }
      const violations = await runCssAudit(page, Array.from(selectors), props);
      extended.cssViolations = violations;
      const passed = violations.length === 0;
      const summary = passed ? '0 violations'
        : violations.slice(0, 5).map((v) => `${v.selector}: ${v.property}=${v.actual}`).join('; ');
      checks.push({ id: 'PLAYWRIGHT-010', description: 'CSS computed-style audit vs visual-properties.md', passed, evidence: summary });
    }

    // Optional: take final screenshot (if not already captured above)
    if (takeScreenshot && !screenshotPath) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      const slug = resolvedRoute.replace(/\//g, '_').replace(/^_/, '').replace(/[:<>"|?*]/g, '-');
      screenshotPath = path.join(screenshotDir, `${slug}-${timestamp}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    // ── Update checklist.md if --ac-checklist provided ──
    if (cfg.acChecklistPath && fs.existsSync(cfg.acChecklistPath)) {
      const allVerdicts = [...extended.uiResults, ...extended.acResults, ...extended.unitTestResults];
      updateChecklistRows(cfg.acChecklistPath, allVerdicts);
    }

    return {
      route: resolvedRoute,
      timestamp: new Date().toISOString(),
      passed: checks.every((c) => c.passed),
      checks,
      screenshotPath,
      extended,
    };
  } catch (err) {
    return {
      route: resolvedRoute,
      timestamp: new Date().toISOString(),
      passed: false,
      checks,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await browser?.close();
  }
}

function printResult(result: TestResult): void {
  const passCount = result.checks.filter((c) => c.passed).length;
  const total = result.checks.length;

  console.log('\n=== Playwright Verification Result ===');
  console.log(`Route     : ${result.route}`);
  console.log(`Timestamp : ${result.timestamp}`);
  console.log(`Status    : ${result.passed ? '✅ PASS' : '❌ FAIL'} (${passCount}/${total})`);

  if (result.screenshotPath) {
    console.log(`Screenshot: ${result.screenshotPath}`);
  }

  console.log('\nChecks:');
  for (const check of result.checks) {
    const icon = check.passed ? '✅' : '❌';
    console.log(`  ${icon} [${check.id}] ${check.description}`);
    if (check.evidence) console.log(`       Evidence: ${check.evidence}`);
  }

  if (result.error) {
    console.log(`\nError: ${result.error}`);
  }

  // Machine-readable JSON for checklist update
  console.log('\n--- JSON ---');
  console.log(JSON.stringify(result, null, 2));
}

// Run the CLI only when invoked directly (not when imported by the test).
if (process.argv[1] && /playwright-runner\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const args = process.argv.slice(2);
  const route = args[0];
  const takeScreenshot = args.includes('--screenshot');
  const mockError = args.includes('--mock-error');
  const auditA11y = args.includes('--audit-a11y');

  const flagValue = (name: string): string | undefined => {
    const idx = args.indexOf(name);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const featureName = flagValue('--feature-name');
  const interactionsPath = flagValue('--interactions');
  const visualBaseline = flagValue('--visual-baseline');
  const visualBaselineDir = flagValue('--visual-baseline-dir');
  const acChecklistPath = flagValue('--ac-checklist');
  const auditCssPath = flagValue('--audit-css');
  const messagesPath = flagValue('--messages-path');
  const thresholdRaw = flagValue('--visual-diff-threshold');
  const visualDiffThreshold = thresholdRaw ? parseFloat(thresholdRaw) : undefined;

  let interactionScript: InteractionScript | undefined;
  let scriptV2: InteractionScriptV2 | undefined;
  if (interactionsPath) {
    if (!fs.existsSync(interactionsPath)) {
      console.error(`Error: --interactions file not found: ${interactionsPath}`);
      process.exit(1);
    }
    const parsed = JSON.parse(fs.readFileSync(interactionsPath, 'utf8'));
    if (isV2Schema(parsed)) {
      scriptV2 = parsed;
    } else {
      interactionScript = parsed as InteractionScript;
    }
  }

  if (!route) {
    console.error(
      'Usage: npx tsx .claude/integrations/playwright-runner.ts <route> [--screenshot] [--feature-name <name>] [--mock-error]\n' +
      '       [--interactions <path>] [--visual-baseline <png>] [--visual-baseline-dir <dir>] [--ac-checklist <md>]\n' +
      '       [--audit-a11y] [--audit-css <visual-properties.md>] [--messages-path <messages.ts>] [--visual-diff-threshold <%>]',
    );
    process.exit(1);
  }

  runFeatureVerification({
    route,
    takeScreenshot,
    featureName,
    mockError,
    interactionScript,
    scriptV2,
    visualBaseline,
    visualBaselineDir,
    acChecklistPath,
    auditA11y,
    auditCssPath,
    messagesPath,
    visualDiffThreshold,
  })
    .then(printResult)
    .catch(console.error);
}
