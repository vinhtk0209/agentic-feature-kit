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
// §8.1 AA.3 — reuse the PROVEN endpoint extractors (TS-AST api.ts parser + .http parser +
// path normalizer + contract resolver). Do NOT hand-roll a second parser (Wall-1 rewrite).
import { parseHttp, parseApiReturnTypes, normalizePath, resolveContractHttp } from './contract-probe';
// G-SUMMARY-TRUNCATE — reuse the heading-agnostic locator already proven for the Playwright
// section (b11-runner.ts, buildPlaywrightInsert) instead of hand-rolling a second one here.
import { findHeadingLine, normalizeHeading } from './b11-runner';
// §10.9 D9.2 — writer-side capture-time defer-stamp evaluation (C3b-iv). stampRowDefer/
// buildPredicateCaptureInput are pure (no fs) and live in checklist-defer.ts alongside
// PREDICATE_REGISTRY/resolvePredicate; reused here rather than duplicated.
import { stampRowDefer, buildPredicateCaptureInput, PredicateCaptureInput } from './checklist-defer';

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

// ── InteractionStep discriminated union (v3) ────────────────────────────────
// Each action is a separate interface for full type safety in switch branches.
// Existing action types are preserved exactly; new types added below.

interface StepCommon { label: string; screenshotAfter?: boolean; timeout?: number; }

// Existing
interface ClickStep            extends StepCommon { action: 'click';           selector: string; }
interface FillStep             extends StepCommon { action: 'fill';            selector: string; value: string; }
interface NavigateStep         extends StepCommon { action: 'navigate';        url: string; }
interface WaitStep             extends StepCommon { action: 'wait'; }
interface WaitForSelectorStep  extends StepCommon { action: 'waitForSelector'; selector: string; }
interface ScreenshotStep       extends StepCommon { action: 'screenshot'; }
interface MockRouteStep        extends StepCommon {
  action: 'mockRoute';
  urlPattern?: string;
  url?: string;
  responseStatus?: number;
  responseBody?: unknown;
  responseHeaders?: Record<string, string>;
}

// New v3 action types
/** page.type() — fires keydown/keyup per character; use for debounced inputs. */
interface TypeStep extends StepCommon { action: 'type'; selector: string; value: string; }
/** page.selectOption() — selects an <option> by value string. */
interface SelectStep extends StepCommon { action: 'select'; selector: string; value: string; }
/**
 * Inline assertion: reads an attribute and asserts its value.
 * Boolean attributes (disabled, checked, readonly, required, selected):
 *   expected="true"  → assert attribute is present
 *   expected="false" → assert attribute is absent
 * All other attributes: string equality check.
 * Throws on mismatch — fails the enclosing state (triggers cascade detection).
 */
interface AssertAttributeStep extends StepCommon {
  action: 'assertAttribute';
  selector: string;
  attribute: string;
  expected: string;
}
/**
 * Registers a one-shot dialog dismiss handler.
 * Place BEFORE the step that opens the dialog.
 * Handler fires once and clears; add another dismissDialog for each subsequent dialog.
 */
interface DismissDialogStep extends StepCommon { action: 'dismissDialog'; }
/** page.waitForURL() — waits until page URL matches a glob pattern string. */
interface WaitForURLStep extends StepCommon { action: 'waitForURL'; pattern: string; }
/**
 * Inline assertion: counts elements matching selector and asserts equals expected.
 * Throws on mismatch — fails the enclosing state.
 */
interface AssertCountStep extends StepCommon { action: 'assertCount'; selector: string; expected: number; }
/**
 * Drag the source element onto the target via a manual pointer sequence
 * (move→down→nudge→move-in-steps→settle→up). Works with pointer-sensor DnD
 * libraries (e.g. @dnd-kit) where Playwright's high-level dragTo can be unreliable.
 */
interface DragAndDropStep extends StepCommon { action: 'dragAndDrop'; selector: string; targetSelector: string; }
/** Inline assertion: trimmed text content of selector equals expected. Throws on mismatch. */
interface AssertTextStep extends StepCommon { action: 'assertText'; selector: string; expected: string; }
/**
 * page.setInputFiles() — attaches files to a hidden or visible file input element.
 * Each entry in `files` is either:
 *   - A real file path on disk (absolute or relative to cwd)
 *   - A mock spec string: 'mock:<name>:<sizeBytes>:<mimeType>'
 *     e.g. 'mock:enrollments.csv:1024:text/csv'
 *     Generates a synthetic Buffer of the given byte length (filled with 'A').
 * Works on inputs with display:none — Playwright bypasses the OS picker.
 */
interface SetInputFilesStep extends StepCommon {
  action: 'setInputFiles';
  selector: string;
  files: string | string[];
}

type InteractionStep =
  | ClickStep | FillStep | NavigateStep | WaitStep | WaitForSelectorStep | ScreenshotStep | MockRouteStep
  | TypeStep | SelectStep | AssertAttributeStep | DismissDialogStep | WaitForURLStep | AssertCountStep
  | DragAndDropStep | AssertTextStep | SetInputFilesStep;

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
  // §10.3 (C2): optional capture run-reference. On a PASS it is stamped as `✅ <runRef>` into the
  // Evidence cell (falls back to `evidence` when unset). Additive — callers that omit it are unaffected.
  runRef?: string;
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

/** STOP signal (§10.3 D3): the checklist writer met a header it cannot resolve BY NAME — absent, or
 *  missing a Status-equivalent / Evidence column. Carries the verdict + the offending header so the
 *  operator sees why the write was refused; the cell-count fallback behind the (a2) destructive
 *  misalignment is never used. Mirrors EndpointDerivationError's typed-STOP shape (§17.7). */
export class ChecklistLayoutError extends Error {
  readonly verdict = 'tierB-checklist-unrecognized-layout';
  readonly rowId: string;
  readonly header: string;
  constructor(rowId: string, header: string, message: string) {
    super(message);
    this.name = 'ChecklistLayoutError';
    this.rowId = rowId;
    this.header = header;
  }
}

// §W2a: neutralize raw ANSI SGR sequences and embedded line breaks (both observed in real
// Playwright Error.message call-logs) before evidence text is woven into a markdown table cell.
// A single space replaces each line break — CommonMark inline content collapses raw line breaks
// to a space on render anyway, so this matches expected rendering instead of injecting a visible
// marker (⏎ / literal "\n") that isn't otherwise meaningful to a table reader. No truncation.
function sanitizeEvidenceCell(value: string): string {
  return value
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\r\n|\r|\n/g, ' ')
    .trim();
}

export function updateChecklistRows(
  checklistPath: string,
  verdicts: RowVerdict[],
  // §10.9 D9.2 — optional: when supplied, any row carrying a well-formed `<!-- DEFER: ... -->`
  // marker is re-stamped from THIS run's capture before its Status/Evidence cells are written.
  // Omitted by existing callers → behavior is unchanged (fully additive/backward-compatible).
  deferInput?: { input: PredicateCaptureInput; runRef: string },
): void {
  if (!fs.existsSync(checklistPath) || verdicts.length === 0) return;
  const raw = fs.readFileSync(checklistPath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  const cellsOf = (l: string) => l.split('|').slice(1, -1).map((c) => c.trim());

  // §10.3 D3: resolve the Status-equivalent + Evidence columns FROM THE HEADER, by NAME. Recognized
  // ⇔ the header carries BOTH. `cells.length` is never consulted — the cell-count fallback is the
  // exact mechanism behind the (a2) destructive misalignment, so it is deleted, not degraded to.
  // Note the UI template header names the status column `Matches Spec`, not `Status` — matched here.
  const resolveLayout = (headerLine: string): { statusIdx: number; evidenceIdx: number } | null => {
    const names = cellsOf(headerLine);
    const statusIdx = names.findIndex((n) => /^(status|matches spec|result)$/i.test(n));
    const evidenceIdx = names.findIndex((n) => /^evidence$/i.test(n));
    return statusIdx === -1 || evidenceIdx === -1 ? null : { statusIdx, evidenceIdx };
  };

  // Validate-all-then-write-once: plan every edit first; throw on the first unrecognized row BEFORE
  // the single fs.writeFileSync → any STOP leaves the file byte-identical (fail-closed, §10.3 / T7).
  const planned: Array<{ idx: number; line: string }> = [];
  for (const v of verdicts) {
    const idRe = new RegExp(`^\\s*\\|\\s*${v.id.replace(/[-]/g, '\\-')}\\s*\\|`);
    const rowIdx = lines.findIndex((l) => idRe.test(l));
    if (rowIdx === -1) continue; // id not in this checklist → nothing to update (row untouched)
    // Walk up to this table's header: the row directly above the `|---|` separator.
    let headerIdx = -1;
    for (let i = rowIdx - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (/^\|(\s*:?-+:?\s*\|)+$/.test(t)) { headerIdx = i - 1; break; } // separator → header is above
      if (!t.startsWith('|')) break; // left the table without a separator → unrecognized
    }
    const layout = headerIdx >= 0 ? resolveLayout(lines[headerIdx]) : null;
    if (!layout) {
      throw new ChecklistLayoutError(v.id, headerIdx >= 0 ? lines[headerIdx] : '',
        `tierB-checklist-unrecognized-layout: row ${v.id} sits under a header that is absent or lacks a ` +
        `Status-equivalent/Evidence column (header: ${headerIdx >= 0 ? lines[headerIdx].trim() : 'NONE'}). ` +
        'Cell-count fallback is prohibited (§10.3); zero bytes written.');
    }
    // §10.9 D9.2 — re-stamp any DEFER marker on this row from THIS run's capture BEFORE cell-split,
    // so the fresh stamp is what gets written. Convention (matching `enforced-by: BE`, §10.2): a
    // marker lives in the description/Test cell, not Status/Evidence — stampRowDefer only touches
    // text inside the marker's own `<!-- DEFER: ... -->` delimiters, so this is safe regardless of
    // which cell it sits in, EXCEPT if a marker were placed inside the Status/Evidence cell itself,
    // where the unconditional overwrite two lines below would discard it — not expected per the
    // established BE-marker convention, not additionally guarded against here.
    if (deferInput) {
      lines[rowIdx] = stampRowDefer(lines[rowIdx], deferInput.input, deferInput.runRef);
    }
    const cells = cellsOf(lines[rowIdx]);
    if (cells.length <= Math.max(layout.statusIdx, layout.evidenceIdx)) {
      throw new ChecklistLayoutError(v.id, lines[headerIdx],
        `tierB-checklist-unrecognized-layout: row ${v.id} has ${cells.length} cells but the header resolves ` +
        `Status@${layout.statusIdx} / Evidence@${layout.evidenceIdx} — column/row mismatch; zero bytes written.`);
    }
    cells[layout.statusIdx] = v.passed ? '✅ Pass' : '❌ Fail';
    // §10.3: on PASS, stamp `✅ <run-ref>` into the EVIDENCE cell — that ✅ is what finalCellVerified
    // counts (T5). runRef defaults to the free-form evidence when a caller hasn't threaded one in.
    cells[layout.evidenceIdx] = v.passed ? `✅ ${sanitizeEvidenceCell(v.runRef ?? v.evidence)}` : sanitizeEvidenceCell(v.evidence);
    planned.push({ idx: rowIdx, line: `| ${cells.join(' | ')} |` });
  }
  if (planned.length === 0) return; // nothing matched → file left byte-identical
  for (const p of planned) lines[p.idx] = p.line;
  fs.writeFileSync(checklistPath, lines.join(eol), 'utf8');
}

/**
 * Count one `## <title>` checklist section: total data rows and the ✅/❌/⬜ split.
 *
 * Hoisted out of updateChecklistSummary (design §10.2 / canary C1) so the BE-exclusion
 * invariant is reachable from a test — it was previously a closure over `text` and no
 * test could observe it. Pure: text in, counts out; no I/O.
 */
export function countChecklistSection(
  text: string,
  title: string,
): { total: number; pass: number; fail: number; pending: number } {
  // Heading-agnostic match (G-COUNTSECTION-LITERAL-MATCH): reuses the same
  // normalizeHeading/findHeadingLine pair replaceSummarySection already relies on, so a
  // title's heading resolves the same whether it's plain (`## ACT — ...`) or emoji-prefixed
  // (`## 🧪 ACT — ...`) — a literal indexOf silently returned an all-zero count on drift.
  const needle = normalizeHeading(`## ${title}`);
  const lines = text.split(/\r\n|\r|\n/);
  const startLine = needle === null ? -1 : findHeadingLine(text, needle);
  if (startLine === -1) return { total: 0, pass: 0, fail: 0, pending: 0 };
  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i += 1) {
    if (/^\s*#{2,}\s+/.test(lines[i])) { endLine = i; break; }
  }
  const section = lines.slice(startLine, endLine);
  const tableLines = section.filter(
    (l) => /^\|/.test(l.trim()) && !/^\|\s*[-:]+\s*\|/.test(l.trim()),
  );
  // §10.2 D2 — BE-exclusion symmetry: a row tagged `<!-- enforced-by: BE -->` is a backend
  // obligation, not an FE-verifiable one, so it must be invisible here exactly as it already is
  // to grab/brRows in lint-feature.ts. Leaving it in kept `pass === total` unreachable for any
  // section holding a BE row, so icon() could never emit ✅ and HR35 fell back to row-scan forever.
  const dataRows = tableLines
    .slice(1) // skip header row
    .filter((l) => !/<!--\s*enforced-by:\s*BE/i.test(l));
  return {
    total: dataRows.length,
    pass: dataRows.filter((l) => l.includes('✅')).length,
    fail: dataRows.filter((l) => l.includes('❌')).length,
    pending: dataRows.filter((l) => l.includes('⬜')).length,
  };
}

/**
 * Replace (or append) the `## Summary` section of checklist `text` with `newSummary`.
 *
 * Hoisted out of updateChecklistSummary (G-SUMMARY-TRUNCATE canary, following the C1
 * countChecklistSection precedent above) so a test can observe it directly. Fixes two
 * failure modes of the old `text.replace(/## Summary[\s\S]*$/, newSummary)` tail:
 *   1. SILENT-NOOP — the literal string never matched a drifted heading like `## 📊 Summary`,
 *      so the section was never updated. Fixed by locating the heading via
 *      `findHeadingLine(text, 'summary')` (b11-runner.ts), which is heading-agnostic.
 *   2. DATA-LOSS — `[\s\S]*$` has no end bound, so any section AFTER Summary (e.g. a
 *      trailing `## Legend`) was deleted along with it. Fixed by bounding the replaced
 *      region to the next `## ` heading, or EOF if Summary is the last section.
 * On a missing Summary heading, APPENDS `newSummary` rather than returning `text` unchanged —
 * follows the buildPlaywrightInsert precedent (b11-runner.ts): a "should have written" case
 * must never silently no-op.
 * Pure: text in, text out. EOL-agnostic split/rejoin (E-02 discipline) preserves the input's
 * dominant EOL style (CRLF or LF), including inside `newSummary` itself.
 */
export function replaceSummarySection(text: string, newSummary: string): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const normalizedSummary = newSummary.split(/\r\n|\r|\n/).join(eol);
  const lines = text.split(/\r\n|\r|\n/);
  const headingIdx = findHeadingLine(text, 'summary');

  if (headingIdx === -1) {
    return `${text}${eol}${normalizedSummary}`;
  }

  let nextHeadingIdx = -1;
  const headingRe = /^\s*#{2,}\s+/;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (headingRe.test(lines[i])) { nextHeadingIdx = i; break; }
  }

  const before = lines.slice(0, headingIdx);
  const after = nextHeadingIdx === -1 ? [] : lines.slice(nextHeadingIdx);
  return [...before, ...normalizedSummary.split(eol), ...after].join(eol);
}

/**
 * Auto-update the `## Summary` section in checklist.md after row updates.
 * Counts ✅/❌/⬜ per section (REQ, UI, ACT, UX) and rewrites the Summary block.
 * Called immediately after updateChecklistRows() so counts reflect the latest run.
 */
function updateChecklistSummary(
  checklistPath: string,
  playwrightChecks: CheckResult[],
  acResults: RowVerdict[],
  unitTestResults: RowVerdict[],
  runTimestamp: string,
): void {
  if (!fs.existsSync(checklistPath)) return;
  const text = fs.readFileSync(checklistPath, 'utf8');

  const countSection = (title: string) => countChecklistSection(text, title);

  const req = countSection('Requirements Coverage');
  const ui = countSection('UI Verification');
  const act = countSection('ACT');
  const ux = countSection('UX States');

  const date = new Date(runTimestamp).toISOString().slice(0, 10);
  const passPw = playwrightChecks.filter((c) => c.passed).length;
  const totalPw = playwrightChecks.length;
  const acPass = acResults.filter((r) => r.passed).length;
  const utPass = unitTestResults.filter((r) => r.passed).length;
  const utTotal = unitTestResults.length;

  const icon = (s: { pass: number; fail: number; total: number }): string => {
    if (s.total === 0) return '⬜';
    if (s.fail > 0) return '❌';
    if (s.pass === s.total) return '✅';
    return '⚠️';
  };
  const pendingNote = (n: number) => (n > 0 ? ` (${n} pending)` : '');

  const summaryLines = [
    `- Total REQ rows: **${req.total}** — ${icon(req)} ${req.pass}/${req.total}${pendingNote(req.pending)}`,
    `- Total UI rows: **${ui.total}** — ${icon(ui)} ${ui.pass}/${ui.total} verified`,
    `- Total ACT rows: **${act.total}** — ${icon(act)} ${act.pass}/${act.total} verified${pendingNote(act.pending)}`,
    `- Total UX rows: **${ux.total}** — ${icon(ux)} ${ux.pass}/${ux.total}`,
    `- Playwright latest: **${passPw}/${totalPw}${passPw === totalPw ? ' ALL PASS' : ''}** (${date})${acResults.length > 0 ? ` — ${acPass}/${acResults.length} AC assertions` : ''}`,
    ...(utTotal > 0 ? [`- Unit tests: **${utPass}/${utTotal}** pass`] : []),
    '',
    '- `⬜` = not yet verified | `✅` = verified | `⚠️` = backend-only/partial | `❌` = failing',
  ];

  const newSummary = `## Summary\n\n${summaryLines.join('\n')}`;
  const updated = replaceSummarySection(text, newSummary);
  if (updated !== text) fs.writeFileSync(checklistPath, updated, 'utf8');
}

function runUnitTestEntry(entry: UnitTestEntry): { passed: boolean; evidence: string } {
  // Use npx jest directly with --no-coverage to avoid threshold failures and speed up runs.
  try {
    const { spawnSync } = require('child_process') as typeof import('child_process');
    const args = ['jest', entry.test_file, '--no-coverage'];    if (entry.grep) args.push('-t', entry.grep);
    const r = spawnSync('npx', args, { encoding: 'utf8', shell: true });
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
        // ── v3 action types ─────────────────────────────────────────────────
        case 'type':
          await page.type(step.selector, step.value, { timeout: step.timeout ?? 10_000 });
          break;
        case 'select':
          await page.selectOption(step.selector, step.value, { timeout: step.timeout ?? 10_000 });
          break;
        case 'assertAttribute': {
          const el = await page.$(step.selector);
          if (!el) throw new Error(`assertAttribute: selector not found — ${step.selector}`);
          const actual = await el.getAttribute(step.attribute);
          const boolAttrs = ['disabled', 'checked', 'readonly', 'required', 'selected', 'multiple'];
          if (boolAttrs.includes(step.attribute) && (step.expected === 'true' || step.expected === 'false')) {
            const present = actual !== null;
            if (present !== (step.expected === 'true')) {
              throw new Error(`assertAttribute: "${step.attribute}" is ${present ? 'present' : 'absent'} on "${step.selector}" (expected ${step.expected})`);
            }
          } else if (actual !== step.expected) {
            throw new Error(`assertAttribute: "${step.attribute}"="${actual}" expected "${step.expected}" on "${step.selector}"`);
          }
          break;
        }
        case 'dismissDialog':
          page.once('dialog', (dialog) => { dialog.dismiss().catch(() => {}); });
          break;
        case 'waitForURL':
          await page.waitForURL(step.pattern, { timeout: step.timeout ?? 10_000 });
          break;
        case 'assertCount': {
          const count = await page.locator(step.selector).count();
          if (count !== step.expected) {
            throw new Error(`assertCount: "${step.selector}" count=${count} expected ${step.expected}`);
          }
          break;
        }
        case 'dragAndDrop': {
          const source = page.locator(step.selector).first();
          const target = page.locator(step.targetSelector).first();
          const sb = await source.boundingBox();
          const tb = await target.boundingBox();
          if (!sb) throw new Error(`dragAndDrop: source not found — ${step.selector}`);
          if (!tb) throw new Error(`dragAndDrop: target not found — ${step.targetSelector}`);
          const sx = sb.x + sb.width / 2;
          const sy = sb.y + sb.height / 2;
          const tx = tb.x + tb.width / 2;
          // Drop into the lower portion of the target so a downward sortable swap commits;
          // closestCenter then resolves the target as "over".
          const ty = tb.y + tb.height * 0.75;
          await page.mouse.move(sx, sy);
          await page.mouse.down();
          await page.waitForTimeout(100);
          // small nudge to trip pointer-sensor activation (e.g. @dnd-kit)
          await page.mouse.move(sx, sy + 8);
          await page.waitForTimeout(100);
          await page.mouse.move(tx, ty, { steps: 20 });
          await page.waitForTimeout(150);
          // settle on the target so the sortable registers the final position
          await page.mouse.move(tx, ty);
          await page.waitForTimeout(150);
          await page.mouse.up();
          break;
        }
        case 'assertText': {
          const actual = (await page.locator(step.selector).first().textContent() ?? '').trim();
          if (actual !== step.expected) {
            throw new Error(`assertText: "${step.selector}" text="${actual}" expected "${step.expected}"`);
          }
          break;
        }
        case 'setInputFiles': {
          const fileList = Array.isArray(step.files) ? step.files : [step.files];
          const resolved = fileList.map((f) => {
            if (f.startsWith('mock:')) {
              const parts = f.split(':');
              const name = parts[1] ?? 'test.csv';
              const size = parseInt(parts[2] ?? '1024', 10) || 1024;
              const mimeType = parts[3] ?? 'text/csv';
              return { name, mimeType, buffer: Buffer.alloc(size, 65) };
            }
            return f;
          });
          await page.setInputFiles(step.selector, resolved as Parameters<typeof page.setInputFiles>[1]);
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
  visualDiff?: boolean;   // opt-in (default off): run per-state/standalone visual baseline diffs
  disableWebSecurity?: boolean;
  dataReadySelector?: string; // Z.2: per-route data-ready selector (else bounded networkidle)
  dataGate?: boolean;         // §4 data-reached gate; ON unless explicitly false (static route)
  apiPath?: string;           // §8.1 AA.3: feature data/api.ts (cross-check source for E_feat scope)
}

// ── §4 Tier B data-reached assertion + Z.2 bounded wait (v3.24) ──────────────
// The load-bearing measurement-layer guard. A stale/absent token lets the app
// render its SHELL while every data call 401s → an empty page that a shell-only
// assertion (e.g. PLAYWRIGHT-005 body-length) PASSES. §4 closes that by
// inspecting the actual network: ≥1 key API call must return 2xx with a
// genuinely non-empty body, else the route FAILS Tier B with a distinct reason.
// CORS / --disable-web-security is NOT used here (Z.3 disproved the CORS block).

export interface ApiResponseObservation { url: string; status: number; bodyText: string; }
export interface DataReachedVerdict { passed: boolean; reason: string; evidence: string; }

/** True iff a body carries at least one real data ROW — not '', null, [], {}, or a
 *  skeleton envelope whose list payload is empty (even alongside a zero count).
 *  Rule (array-aware, fail-closed per §4):
 *    • any non-empty array anywhere            → data rows present → non-empty
 *    • arrays present but ALL empty            → skeleton → EMPTY  (e.g. {"content":[],"totalElements":0})
 *    • no arrays at all, but a meaningful leaf → non-empty (a detail object {"name":"A"})
 *  A count-only shell ({"data":[]} / {"total":0,"data":[]}) is EMPTY: the point of §4
 *  is to fail the stale-token empty-render, and a zero-row list IS that shape. */
export function isNonEmptyBody(bodyText: string): boolean {
  const t = (bodyText ?? '').trim();
  if (t.length === 0) return false;
  let parsed: unknown;
  try { parsed = JSON.parse(t); } catch { return t.length > 2; } // non-JSON text payload
  let sawArray = false, sawNonEmptyArray = false, sawScalarLeaf = false;
  const visit = (v: unknown): void => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) {
      sawArray = true;
      if (v.length > 0) sawNonEmptyArray = true;
      v.forEach(visit);
    } else if (typeof v === 'object') {
      Object.values(v as Record<string, unknown>).forEach(visit);
    } else if (typeof v === 'string') {
      if (v.trim().length > 0) sawScalarLeaf = true;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      sawScalarLeaf = true;
    }
  };
  visit(parsed);
  if (sawNonEmptyArray) return true; // real rows
  if (sawArray) return false;        // arrays present but all empty → skeleton
  return sawScalarLeaf;              // no arrays → non-empty iff a meaningful leaf exists
}

// ── §8.1 AA.3 — feature-endpoint scope (E_feat): .http primary, api.ts cross-check, ──────────
// fail-closed on divergence. The broad api.fpt-apps.com|/api/ pattern PASSES §4 on a SIBLING
// page's data (e.g. class-edit's own load calls at /class-management/edit/1) while the feature's
// own data never loaded → a `verified=true` attesting the WRONG feature. E_feat scopes §4 to the
// feature's own endpoints so only the feature's data can satisfy the gate.

/** A feature-endpoint matcher: a normalized path template (from `/api` onward, `${…}`/`{{…}}`
 *  id-segments wildcarded to `:p`, query stripped) — the SAME normalized form `parseHttp` and
 *  `parseApiReturnTypes` emit via `normalizePath`. */
export type EndpointMatcher = string;

/** STOP signal: E_feat could not be derived honestly. Carries the reason + both source sets so the
 *  operator sees exactly what diverged (never silently reconciled to a union/intersection). */
export class EndpointDerivationError extends Error {
  reason: string;
  httpSet: string[];
  apiSet: string[];
  // §17.7.3 structured cause: the two set-difference axes, so callers/tests can tell an
  // undeclared-missing contract endpoint (H∖A, no §-anchored # DEFER:) apart from an extra
  // code call site (A∖H) — the reason string alone conflates them. Both default to [] so any
  // OTHER throw site (e.g. tierB-no-feature-endpoints) is unaffected.
  readonly undeclaredMissing: string[];
  readonly extraInCode: string[];
  constructor(
    reason: string, message: string, httpSet: string[] = [], apiSet: string[] = [],
    undeclaredMissing: string[] = [], extraInCode: string[] = [],
  ) {
    super(message);
    this.name = 'EndpointDerivationError';
    this.reason = reason;
    this.httpSet = httpSet;
    this.apiSet = apiSet;
    this.undeclaredMissing = undeclaredMissing;
    this.extraInCode = extraInCode;
  }
}

/** True iff an observed response URL falls under a feature-endpoint matcher. Path-prefix match,
 *  segment-wise, with `:p` wildcarding any single (id) segment. The matcher must be a PREFIX of the
 *  observed path (matcher.length ≤ observed.length) — so a shorter SIBLING url (e.g. the class-edit
 *  `/classes/1` load) cannot satisfy a longer feature matcher `/classes/:p/progress-reports`. */
export function urlMatchesEndpoint(url: string, matcher: EndpointMatcher): boolean {
  // Observed URLs are ABSOLUTE (resp.url()), and an `api.*` host would make `normalizePath`'s
  // `indexOf('/api')` catch `//api.fpt-apps.com` instead of the real `/api/…` path. Strip the
  // origin via URL() first so only the pathname is normalized. (.http/api.ts sources use a
  // `{{baseUrl}}`/`${API_BASE_URL}` placeholder host, so they don't hit this — only runtime urls do.)
  let pathname = url;
  try { pathname = new URL(url).pathname; } catch { pathname = url.split('?')[0]; }
  const obs = normalizePath(pathname).split('/').filter(Boolean);   // concrete ids intact (e.g. "1")
  const m = matcher.split('/').filter(Boolean);                // `:p` at id positions
  if (m.length === 0 || m.length > obs.length) return false;
  for (let i = 0; i < m.length; i += 1) {
    if (m[i] === ':p') continue; // wildcard id segment
    if (m[i] !== obs[i]) return false;
  }
  return true;
}

/** Unique, sorted normalized path set from a list of endpoints. */
function pathSet(paths: string[]): string[] {
  return Array.from(new Set(paths)).sort();
}

/**
 * Derive the feature endpoint set `E_feat` from its contract `.http` (H, PRIMARY) cross-checked
 * against its `data/api.ts` call sites (A). Fail-closed reconciliation (§8.1 + §17.7, LOAD-BEARING):
 *   • `declaredDeferSet` = normalized paths of H-elements carrying a §-anchored `# DEFER:` marker
 *     (§17.7.3). An anchorless `# DEFER:` is treated as ABSENT — orphan defers fail closed.
 *   • PASS ⟺ `extraInCode` (A∖H) is empty AND `undeclaredMissing` ((H∖A)∖deferSet) is empty.
 *     Then E_feat = H ∖ declaredDeferSet (§17.7.4) — deferred endpoints have no runtime consumer,
 *     so leaving them in E_feat would make §4 data-scoping unsatisfiable for them. When A∖H is
 *     empty this equals A exactly.
 *   • Otherwise → STOP `tierB-endpoint-source-divergence`: either code calls an endpoint the
 *     contract lacks (`extraInCode`), or the contract has an extra endpoint that is NOT declared-
 *     deferred (`undeclaredMissing`). `deferSet` NEVER comes from "what api.ts happens not to call"
 *     — only from an explicit on-disk `# DEFER:` declaration.
 *   • E_feat empty: with `dataGate:false` (--no-data-gate static opt-out) → N/A (applicable=false).
 *     Without → STOP `tierB-no-feature-endpoints` (a data-gated feature with zero derivable
 *     endpoints is a config error, not a pass).
 * Pure over the two source texts (no disk) — the disk resolution lives in the caller.
 */
export function deriveFeatureEndpoints(
  httpText: string, apiText: string, opts: { dataGate: boolean },
): { endpoints: EndpointMatcher[]; applicable: boolean } {
  const httpEndpoints = parseHttp(httpText);
  const H = pathSet(httpEndpoints.map((e) => e.path));
  const A = pathSet(parseApiReturnTypes(apiText).map((r) => r.path));

  if (H.length === 0 && A.length === 0) {
    if (opts.dataGate === false) return { endpoints: [], applicable: false }; // sanctioned static opt-out
    throw new EndpointDerivationError('tierB-no-feature-endpoints',
      'data gate ON but no feature endpoint derivable from .http or api.ts (config error — a data-gated ' +
      'feature must expose ≥1 endpoint; use --no-data-gate only for a genuinely backend-less route)', H, A);
  }

  // §17.7.3: a deferred endpoint counts ONLY if its `# DEFER:` reason references a design §-anchor.
  const ANCHOR = /§\s?\d+(\.\d+)*/;
  const declaredDeferSet = new Set(
    httpEndpoints
      .filter((e) => e.deferReason != null && ANCHOR.test(e.deferReason))
      .map((e) => e.path),
  );

  const Aset = new Set(A);
  const Hset = new Set(H);
  const extraInCode = A.filter((p) => !Hset.has(p));                                      // A ∖ H
  const undeclaredMissing = H.filter((p) => !Aset.has(p) && !declaredDeferSet.has(p));    // (H∖A) ∖ deferSet

  if (extraInCode.length > 0 || undeclaredMissing.length > 0) {
    throw new EndpointDerivationError('tierB-endpoint-source-divergence',
      `.http endpoint set and api.ts call-site set diverge. ` +
      `extraInCode=[${extraInCode.join(', ')}] (code calls an endpoint the contract lacks); ` +
      `undeclaredMissing=[${undeclaredMissing.join(', ')}] (contract endpoint with no §-anchored # DEFER:). ` +
      `declaredDefer=[${[...declaredDeferSet].join(', ')}]. ` +
      `Regenerate .http (baseline-http-gen) so they agree, or add a §-anchored # DEFER: for a ` +
      `deliberately-deferred endpoint, then re-capture. .http=[${H.join(', ')}] api.ts=[${A.join(', ')}]`,
      H, A, undeclaredMissing, extraInCode);
  }

  // §17.7.4: E_feat = H ∖ declaredDeferSet (== A when A∖H is empty).
  const endpoints = H.filter((p) => !declaredDeferSet.has(p));
  return { endpoints, applicable: true };
}

/** Disk resolver for E_feat (§8.1): read the feature's contract `.http` (flagship writes it to
 *  `docs/components/<feature>/`, `docs/specs/<feature>/` fallback — same lookup as contract-probe)
 *  and its `data/api.ts` (path passed by b11-runner via `--api-path`), then reconcile via
 *  `deriveFeatureEndpoints`. Throws `EndpointDerivationError` on a STOP (divergence / no-endpoints).
 *  A missing source reads as '' so an unresolvable feature fails closed, never silently unscoped. */
export function resolveFeatureEndpoints(
  featureName: string | undefined, apiPath: string | undefined, opts: { dataGate: boolean },
): { endpoints: EndpointMatcher[]; applicable: boolean } {
  const httpFile = featureName
    ? resolveContractHttp(path.join('docs', 'components', featureName), path.join('docs', 'specs', featureName))
    : '';
  const readSafe = (p: string): string => { try { return p ? fs.readFileSync(p, 'utf8') : ''; } catch { return ''; } };
  return deriveFeatureEndpoints(readSafe(httpFile), readSafe(apiPath ?? ''), opts);
}

/** §4 verdict over the key API responses observed during a route load.
 *  §8.1 AA.3: `featureEndpoints` (E_feat) is REQUIRED — observations are ALWAYS scoped to the
 *  feature's own endpoints first, so a sibling page's 2xx-non-empty data can never satisfy the gate.
 *  There is deliberately NO unscoped path: an optional param would leave a reachable-by-refactor
 *  unscoped mode where AA.3 could silently resurrect with no test going red. Every caller (runtime
 *  and unit) must supply an explicit E_feat.
 *  Fail-closed: zero in-scope observations (login-redirect, tab never reached, or only sibling
 *  noise) → FAIL. */
export function assessDataReached(
  apiResponses: ApiResponseObservation[], featureEndpoints: EndpointMatcher[],
): DataReachedVerdict {
  const apiResponsesScoped = apiResponses.filter(
    (r) => featureEndpoints.some((m) => urlMatchesEndpoint(r.url, m)),
  );
  if (apiResponsesScoped.length === 0) {
    const evidence = apiResponses.length > 0
      ? `no response matched the feature endpoint set [${featureEndpoints.join(', ')}]; ` +
        `${apiResponses.length} other response(s) observed but none is the feature's own data ` +
        `(sibling/adjacent-page data must NOT pass §4)`
      : 'no key API/XHR response observed during load (app may have redirected to login before fetching)';
    return { passed: false, reason: 'tierB-no-data-reached', evidence };
  }
  const reached = apiResponsesScoped.find((r) => r.status >= 200 && r.status < 300 && isNonEmptyBody(r.bodyText));
  if (reached) {
    return { passed: true, reason: 'data-reached',
      evidence: `${reached.status} ${reached.url} (${reached.bodyText.trim().length} body chars)` };
  }
  // No 2xx-non-empty in scope → most diagnostic failure reason (scoped to E_feat responses).
  const unauthorized = apiResponsesScoped.find((r) => r.status === 401);
  const forbidden = apiResponsesScoped.find((r) => r.status === 403);
  const serverErr = apiResponsesScoped.find((r) => r.status >= 400);
  if (unauthorized) return { passed: false, reason: 'tierB-api-401',
    evidence: `key API 401 (${unauthorized.url}) — stale/absent token; data never authenticated` };
  if (forbidden) return { passed: false, reason: 'tierB-api-403',
    evidence: `key API 403 (${forbidden.url})` };
  if (serverErr) return { passed: false, reason: 'tierB-api-error',
    evidence: `key API HTTP ${serverErr.status} (${serverErr.url})` };
  const first = apiResponsesScoped[0];
  return { passed: false, reason: 'tierB-empty-body',
    evidence: `key API ${first.status} but empty/skeleton body (${first.url}) — shell rendered with no data` };
}

/** Z.2 wait strategy: a named data-ready selector when ux-states provides one,
 *  else a BOUNDED networkidle fallback (never plain/unbounded — hang risk on
 *  long-poll/websocket/analytics). Both carry a finite timeout, hard-capped. */
export type WaitStrategy =
  | { kind: 'selector'; selector: string; timeoutMs: number }
  | { kind: 'networkidle'; timeoutMs: number };

export function resolveWaitStrategy(
  dataReadySelector: string | null | undefined,
  opts?: { selectorTimeoutMs?: number; networkidleTimeoutMs?: number; maxTimeoutMs?: number },
): WaitStrategy {
  const cap = opts?.maxTimeoutMs ?? 30_000; // hard cap — bounded, cannot hang
  const bound = (n: number) => Math.min(Math.max(1, n), cap);
  const sel = (dataReadySelector ?? '').trim();
  if (sel.length > 0) return { kind: 'selector', selector: sel, timeoutMs: bound(opts?.selectorTimeoutMs ?? 15_000) };
  return { kind: 'networkidle', timeoutMs: bound(opts?.networkidleTimeoutMs ?? 15_000) };
}

// ── §8.2 AA.2 — re-assess §4 at the feature's data-ready POINT (not at initial load) ──────────
// The feature's data fetch often fires only DURING the interaction steps (a tab click), so reading
// apiObservations at initial load false-FAILs a tab-gated feature. The assessment POINT moves; the
// page.on('response') listener (whole-page-life accumulation) is UNCHANGED.

/** WHERE §4 is assessed:
 *   • 'selector'    — a named data-ready selector is present (ux-states `--data-ready-selector`);
 *                     assess right after it resolves, bounded by the Z.2 30s cap.
 *   • 'after-steps' — no named selector; assess once, after ALL interaction steps complete. */
export type DataAssessPoint =
  | { kind: 'selector'; selector: string; timeoutMs: number }
  | { kind: 'after-steps' };

/** Decide the §4 assessment point from the route's data-ready selector (pure, testable). The bounded
 *  selector wait REUSES `resolveWaitStrategy` (Z.2) as the single source of the 30s cap + 15s default
 *  — no cap value is mirrored here. A present selector → assess right after it resolves (the feature's
 *  own "data has rendered" signal, the tightest deterministic point); a blank selector → after-steps. */
export function resolveDataAssessPoint(
  dataReadySelector: string | null | undefined,
  opts?: { selectorTimeoutMs?: number; maxTimeoutMs?: number },
): DataAssessPoint {
  const w = resolveWaitStrategy(dataReadySelector, opts);
  if (w.kind === 'selector') return { kind: 'selector', selector: w.selector, timeoutMs: w.timeoutMs };
  return { kind: 'after-steps' };
}

/** §4 verdict AT the (moved) assessment point (§8.2). Fail-closed both branches:
 *   • selector branch + the named selector TIMED OUT (Z.2 cap hit) → distinct FAIL
 *     `tierB-data-ready-timeout` (feature data never rendered — "selector wrong" ≠ "backend silent"),
 *     regardless of what is in `observations`.
 *   • otherwise → scope to E_feat via `assessDataReached` (zero in-scope obs → `tierB-no-data-reached`;
 *     never "no observations = benign"). This is the AA.2+AA.3 join: a sibling endpoint that fired at
 *     initial load is in `observations` but NOT in `featureEndpoints`, so it cannot satisfy the gate. */
export function finalizeDataReachedVerdict(args: {
  point: DataAssessPoint;
  selectorTimedOut: boolean;
  observations: ApiResponseObservation[];
  featureEndpoints: EndpointMatcher[];
}): DataReachedVerdict {
  if (args.point.kind === 'selector' && args.selectorTimedOut) {
    return {
      passed: false, reason: 'tierB-data-ready-timeout',
      evidence: `named data-ready selector "${args.point.selector}" did not resolve within ` +
        `${args.point.timeoutMs}ms — the feature's data never rendered (selector wrong, or backend never returned)`,
    };
  }
  return assessDataReached(args.observations, args.featureEndpoints);
}

async function runFeatureVerification(cfg: RunnerConfig): Promise<TestResult & { extended?: ExtendedResults }> {
  const { route, takeScreenshot, featureName, mockError, interactionScript, scriptV2 } = cfg;
  const visualDiffThreshold = cfg.visualDiffThreshold ?? 5;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseUrl = (process.env.DEV_SERVER_URL ?? 'http://localhost:3000').replace(/\/$/, '');
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
    browser = await chromium.launch({
      headless: true,
      // --disable-web-security lets a local dev origin call a cross-origin backend without the
      // browser CORS-blocking the page (e.g. a parent page hitting a remote API like api.fpt-apps.com).
      // Opt-in via --disable-web-security; only for local dev verification, never production.
      args: cfg.disableWebSecurity
        ? ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process']
        : [],
    });
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

    // §4: capture key API/XHR responses so Tier B can prove the backend was
    // actually REACHED (2xx + non-empty body), not merely that a shell rendered.
    // Register before goto so initial-load fetches are seen. Handlers never throw.
    const apiUrlPattern = new RegExp(process.env.PLAYWRIGHT_API_URL_PATTERN ?? 'api\\.fpt-apps\\.com|/api/');
    const apiObservations: ApiResponseObservation[] = [];
    page.on('response', (resp) => {
      void (async () => {
        try {
          const rtype = resp.request().resourceType();
          if (rtype !== 'fetch' && rtype !== 'xhr') return;
          const url = resp.url();
          if (!apiUrlPattern.test(url)) return;
          let bodyText = '';
          try { bodyText = await resp.text(); } catch { bodyText = ''; }
          apiObservations.push({ url, status: resp.status(), bodyText });
        } catch { /* never let a response handler reject */ }
      })();
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

    // ── §4 Tier B data-reached — assessment MOVED (§8.2 AA.2) ──
    // The feature's data fetch often fires only DURING the interaction steps (a tab click), so §4 is
    // no longer assessed here at initial load (that false-FAILed a tab-gated feature). It is assessed
    // AFTER the v1/v2 interaction loops below, at the feature's data-ready point (see PLAYWRIGHT-DATA
    // near the end of this function). The page.on('response') listener above keeps accumulating.

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

    // Visual diff is opt-in (default off). Change W.1 was reverted from mandatory → opt-in
    // (Session 1): only run baseline diffs when --visual-diff is passed. Do NOT re-enable as required.
    const visualDiffEnabled = cfg.visualDiff === true;

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

        // Visual baseline diff for this state (uses ui_rows) — opt-in only (--visual-diff)
        if (visualDiffEnabled && state.baseline) {
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
      } else if (!visualDiffEnabled) {
        checks.push({ id: 'PLAYWRIGHT-007', description: 'Visual regression vs spec baselines', passed: true, evidence: 'skipped — visual diff is opt-in (pass --visual-diff to enable)' });
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

    // ── §4 Tier B data-reached assertion — assessed AFTER interaction steps (§8.2 AA.2) ──
    // The feature's data fetch often fires only during interaction (e.g. ProgressReports loads only
    // after the "Progress & reports" tab is clicked), so §4 is assessed HERE — after the v1/v2
    // interaction loops above have driven the feature's own endpoint to fire. Point per §8.2:
    // a named data-ready selector (assess right after it resolves, Z.2-capped) else after-steps.
    // Scope is E_feat (§8.1 AA.3): a sibling endpoint that fired at initial load is in apiObservations
    // but NOT in E_feat, so it cannot satisfy the gate. A STOP (divergence / no-derivable-endpoints)
    // FAILS the route with its distinct reason — never a silent unscoped pass.
    if (cfg.dataGate === false) {
      checks.push({
        id: 'PLAYWRIGHT-DATA',
        description: 'Tier B data-reached (§4) — disabled for backend-less route',
        passed: true,
        evidence: 'data gate disabled (--no-data-gate): route declared static/backend-less',
      });
    } else {
      const assessPoint = resolveDataAssessPoint(cfg.dataReadySelector);
      let selectorTimedOut = false;
      if (assessPoint.kind === 'selector') {
        try { await page.waitForSelector(assessPoint.selector, { timeout: assessPoint.timeoutMs }); }
        catch { selectorTimedOut = true; } // Z.2-capped; distinct tierB-data-ready-timeout below
      } else {
        // after-steps: a bounded networkidle settle flushes any in-flight feature response (Z.2 cap).
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => { /* bounded */ });
      }
      let verdict: DataReachedVerdict;
      try {
        const { endpoints } = resolveFeatureEndpoints(cfg.featureName, cfg.apiPath, { dataGate: true });
        verdict = finalizeDataReachedVerdict({ point: assessPoint, selectorTimedOut, observations: apiObservations, featureEndpoints: endpoints });
      } catch (e) {
        if (e instanceof EndpointDerivationError) {
          verdict = { passed: false, reason: e.reason, evidence: e.message };
        } else { throw e; }
      }
      const pointNote = assessPoint.kind === 'selector'
        ? (selectorTimedOut
          ? `assess-point: data-ready selector "${assessPoint.selector}" TIMED OUT (${assessPoint.timeoutMs}ms)`
          : `assess-point: after data-ready selector "${assessPoint.selector}" resolved`)
        : 'assess-point: after all interaction steps';
      checks.push({
        id: 'PLAYWRIGHT-DATA',
        description: 'Tier B: backend reached with real data (§4 — feature API 2xx + non-empty body)',
        passed: verdict.passed,
        evidence: `${verdict.reason} | ${pointNote} — ${verdict.evidence}`,
      });
    }

    // ── Standalone --visual-baseline (single image) — opt-in only (--visual-diff) ──
    if (visualDiffEnabled && cfg.visualBaseline && !scriptV2) {
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
      // §10.9 D9.2 — re-evaluate any declared row-defer from THIS run's own network capture.
      // runRef mirrors the SAME env var the reader's own-run trust rule checks
      // (checklist-defer.ts validateRowDeferStamp, process.env.KIT_RUN_ID) — record-verify.ts's
      // captureAndRecord() sets it into this process's env before spawning the tierB command,
      // so a real orchestrated run stamps with the id the reader will later see. Absent that
      // orchestration (e.g. a standalone manual invocation), the placeholder deliberately will
      // NOT match the reader's (also-unset) KIT_RUN_ID once a real run id exists — legitimate
      // fail-closed behavior, not a bug: an unstamped/unorchestrated run must not silently pass.
      const deferInput = { input: buildPredicateCaptureInput(apiObservations), runRef: process.env.KIT_RUN_ID ?? 'no-kit-run-id' };
      try {
        updateChecklistRows(cfg.acChecklistPath, allVerdicts, deferInput);
        updateChecklistSummary(cfg.acChecklistPath, checks, extended.acResults, extended.unitTestResults, new Date().toISOString());
      } catch (e) {
        // §10.3 fail-closed: an unrecognized checklist header STOPs the writer with ZERO bytes
        // written. Surface it as a loud, labeled failed check (verdict observable in the result) —
        // never a silent skip. Mirrors §17.7's `instanceof EndpointDerivationError` handling (:1478).
        if (e instanceof ChecklistLayoutError) {
          checks.push({ id: 'PLAYWRIGHT-CHECKLIST', description: `Tier B: checklist writer STOP (${e.verdict})`, passed: false, evidence: e.message });
        } else { throw e; }
      }
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
  const visualDiff = args.includes('--visual-diff');
  const disableWebSecurity = args.includes('--disable-web-security');
  const dataGate = !args.includes('--no-data-gate'); // §4 gate ON unless opted out

  const flagValue = (name: string): string | undefined => {
    const idx = args.indexOf(name);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const featureName = flagValue('--feature-name');
  const interactionsPath = flagValue('--interactions');
  const visualBaseline = flagValue('--visual-baseline');
  const visualBaselineDir = flagValue('--visual-baseline-dir');
  const acChecklistPath = flagValue('--ac-checklist');
  const dataReadySelector = flagValue('--data-ready-selector'); // Z.2 per-route data-ready selector
  const auditCssPath = flagValue('--audit-css');
  const apiPath = flagValue('--api-path'); // §8.1 feature data/api.ts for E_feat cross-check
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
      '       [--audit-a11y] [--audit-css <visual-properties.md>] [--messages-path <messages.ts>] [--visual-diff-threshold <%>]\n' +
      '       [--api-path <data/api.ts>]  (§8.1: feature api.ts for E_feat-scoped §4 data gate)\n' +
      '       [--visual-diff]  (opt-in: enable visual baseline diffs; off by default)',
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
    visualDiff,
    disableWebSecurity,
    dataReadySelector,
    dataGate,
    apiPath,
  })
    .then(printResult)
    .catch(console.error);
}
