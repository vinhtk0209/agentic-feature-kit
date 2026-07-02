#!/usr/bin/env node
/**
 * version-check.ts — single-source version guard for the workflow command file.
 *
 * `PROMPT_VERSION` in feature-from-confluence.md is the SOURCE OF TRUTH for the kit's
 * (logical) version. Every other in-file stamp must agree with it. This catches the
 * exact drift the audit found (copyright v3.15 ≠ PROMPT_VERSION v3.16 ≠ banner v3.16).
 *
 * It checks ONLY the three release stamps (copyright header, PROMPT_VERSION, progress
 * banner) — not the body `(v3.x — Change ...)` rule annotations, which are historical.
 *
 * Usage:
 *   npx tsx .claude/integrations/version-check.ts [--json]
 *   npx tsx .claude/integrations/version-check.ts --playwright   (token expiry check)
 *
 * Exit codes:
 *   0 = stamps agree (or playwright token is fresh)
 *   1 = version drift
 *   2 = a stamp or file is missing
 *   3 = playwright token expired or expiring within 24 h (warning — not used in CI)
 */
import * as fs from 'fs';
import * as path from 'path';

const CMD = path.join('.claude', 'commands', 'feature-from-confluence.md');
const README = 'README.md';
// Only the SOURCE kit carries sync.config.json (repo-root; never in the sync
// allowlist, so it is never copied into a target). Installed copies in target
// repos have no kit README, so the README stamp must NOT be enforced there —
// gating on this file keeps the kit's drift detection loud while letting
// `version:check` stay green in targets.
const SYNC_CONFIG = 'sync.config.json';

interface Stamp { name: string; re: RegExp; }
const STAMPS: Stamp[] = [
  { name: 'copyright header', re: /Claude Code Edition (v\d+\.\d+)/ },
  { name: 'progress banner', re: /feature-from-confluence · (v\d+\.\d+)/ },
];
// README declares the kit version in a different file. Anchor to the specific
// "Kit version **vX.Y**" bold declaration so historical version mentions elsewhere
// in the README (changelog tables, "Copilot v3.7", rule-origin tags) don't match.
// Only audited in the source kit (see SYNC_CONFIG gate below).
const README_STAMPS: Stamp[] = [
  { name: 'README kit version', re: /Kit version \*\*(v\d+\.\d+)\*\*/ },
];

export interface VersionCheck {
  source: string | null;
  found: Array<{ name: string; version: string }>;
  missing: string[];
  mismatches: Array<{ name: string; version: string }>;
}

// ─── Playwright token expiry check ──────────────────────────────────────────

export type PlaywrightTokenStatus = 'ok' | 'expiring-soon' | 'expired' | 'missing';

export interface PlaywrightTokenCheck {
  expiresAt: number | null;
  nowMs: number;
  status: PlaywrightTokenStatus;
  msRemaining: number | null;
}

const WARN_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 h

export function checkPlaywrightToken(
  envFile: string,
  nowMs: number = Date.now(),
): PlaywrightTokenCheck {
  if (!fs.existsSync(envFile)) {
    return { expiresAt: null, nowMs, status: 'missing', msRemaining: null };
  }
  const content = fs.readFileSync(envFile, 'utf-8');
  const m = content.match(/PLAYWRIGHT_TOKEN_EXPIRES_AT=(\d+)/);
  if (!m) {
    return { expiresAt: null, nowMs, status: 'missing', msRemaining: null };
  }
  const expiresAt = parseInt(m[1], 10);
  const msRemaining = expiresAt - nowMs;
  const status: PlaywrightTokenStatus =
    msRemaining <= 0 ? 'expired'
    : msRemaining < WARN_THRESHOLD_MS ? 'expiring-soon'
    : 'ok';
  return { expiresAt, nowMs, status, msRemaining };
}

export function checkVersions(content: string, readmeContent = '', auditReadme = false): VersionCheck {
  const sourceMatch = content.match(/PROMPT_VERSION:\s*(v\d+\.\d+)/);
  const source = sourceMatch ? sourceMatch[1] : null;
  const found: VersionCheck['found'] = [];
  const missing: string[] = [];
  const mismatches: VersionCheck['mismatches'] = [];
  const scan = (text: string, stamps: Stamp[]) => {
    for (const s of stamps) {
      const m = text.match(s.re);
      if (!m) { missing.push(s.name); continue; }
      found.push({ name: s.name, version: m[1] });
      if (source && m[1] !== source) mismatches.push({ name: s.name, version: m[1] });
    }
  };
  scan(content, STAMPS);
  if (auditReadme) scan(readmeContent, README_STAMPS);
  return { source, found, missing, mismatches };
}

if (process.argv[1] && /version-check\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  // ── --playwright mode: token expiry check only ─────────────────────────────
  if (process.argv.includes('--playwright')) {
    const ENV = path.join(process.cwd(), '.env.playwright');
    const t = checkPlaywrightToken(ENV);
    if (t.status === 'missing') {
      console.warn('⚠️  PLAYWRIGHT_TOKEN_EXPIRES_AT not found in .env.playwright.');
      console.warn('   Refresh credentials before running B11 Playwright verification.');
      process.exit(3);
    }
    const hoursLeft = t.msRemaining !== null ? Math.round(t.msRemaining / 3_600_000) : null;
    if (t.status === 'expired') {
      const hoursAgo = Math.abs(hoursLeft ?? 0);
      console.warn(`⚠️  Playwright token EXPIRED ${hoursAgo}h ago.`);
      console.warn('   Re-authenticate at the app and update .env.playwright with fresh tokens.');
      console.warn('   See docs/specs/AnalyzeData/ACCESS_GUIDE.md for refresh steps.');
      process.exit(3);
    }
    if (t.status === 'expiring-soon') {
      console.warn(`⚠️  Playwright token expires in ~${hoursLeft}h — refresh before running B11.`);
      process.exit(0); // warn but don't block
    }
    console.log(`✅ Playwright token valid for ~${hoursLeft}h.`);
    process.exit(0);
  }

  // ── default mode: version stamp check ──────────────────────────────────────
  if (!fs.existsSync(CMD)) {
    console.error(`❌ version-check: command file not found at ${CMD}`);
    process.exit(2);
  }
  const isSourceKit = fs.existsSync(SYNC_CONFIG);
  const readmeContent = isSourceKit && fs.existsSync(README) ? fs.readFileSync(README, 'utf-8') : '';
  const r = checkVersions(fs.readFileSync(CMD, 'utf-8'), readmeContent, isSourceKit);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`🔖 PROMPT_VERSION (source of truth): ${r.source ?? '(NOT FOUND)'}`);
    for (const f of r.found) console.log(`   ${f.version === r.source ? '✅' : '❌'} ${f.name}: ${f.version}`);
    for (const m of r.missing) console.log(`   ⚠️  ${m}: NOT FOUND`);
  }
  if (!r.source) { console.error('❌ PROMPT_VERSION not found — cannot verify.'); process.exit(2); }
  if (r.missing.length > 0) { console.error(`❌ Missing stamp(s): ${r.missing.join(', ')}`); process.exit(2); }
  if (r.mismatches.length > 0) {
    console.error(`❌ Version drift: ${r.mismatches.map((m) => `${m.name}=${m.version}`).join(', ')} ≠ PROMPT_VERSION ${r.source}`);
    process.exit(1);
  }
  console.log(`✅ All version stamps agree (${r.source}).`);
}
