/**
 * check-ownership.ts — deterministic repo/route ownership gate (audit F9).
 *
 * Replaces the prose-only B0.5 Check 3. Compares the spec's primary route against this app's
 * PUBLIC_PATH so the workflow cannot silently implement a feature into the WRONG MFE — a demonstrated
 * failure mode: a sibling-MFE route being implemented into the wrong app.
 *
 * Usage:
 *   npx tsx .claude/integrations/check-ownership.ts "<spec-route>" \
 *     [--public-path </slug/>] [--env-file .env.playwright] [--json]
 *
 * Exit code: 0 = match | indeterminate | unknown-app-path (all non-blocking);  1 = mismatch (wrong repo).
 * Pure Node — no external deps.
 */

import * as fs from 'fs';

export type OwnershipVerdict = 'match' | 'mismatch' | 'indeterminate' | 'unknown-app-path';
export interface OwnershipResult {
  verdict: OwnershipVerdict;
  appSlug: string | null;
  routeSlug: string | null;
  reason: string;
}

/** First non-empty path segment, lowercased, after stripping any scheme+host. */
function firstSegment(p: string | null | undefined): string | null {
  if (!p) return null;
  const seg = p.replace(/^https?:\/\/[^/]+/i, '').split(/[\\/]/).filter(Boolean)[0];
  return seg ? seg.toLowerCase() : null;
}

/** All path segments, lowercased, after stripping any scheme+host. Splits on `/` AND `\`. */
function allSegments(p: string | null | undefined): string[] {
  if (!p) return [];
  return p.replace(/^https?:\/\/[^/]+/i, '').split(/[\\/]/).filter(Boolean).map((s) => s.toLowerCase());
}

/** Family stem = slug up to the last hyphen (e.g. `my-app` from `my-app-learning`). */
function familyStem(slug: string): string {
  const i = slug.lastIndexOf('-');
  return i > 0 ? slug.slice(0, i) : slug;
}

/**
 * Pure classification — no IO.
 *   match            : the route contains the app's own MFE slug
 *   mismatch         : the route contains a DIFFERENT MFE in the SAME family (shared stem) → wrong repo
 *   indeterminate    : route carries no MFE-family prefix (bare feature route) → cannot judge → non-blocking
 *   unknown-app-path : no PUBLIC_PATH could be resolved → non-blocking
 *
 * Mangling-resistant: scans ALL route segments (not just the first) for an MFE-family slug, so a route
 * mangled by a POSIX shell (git-bash/MSYS rewrites a leading `/my-app-authoring/...` to
 * `C:/Program Files/Git/my-app-authoring/...`) is still classified correctly.
 */
export function classifyOwnership(route: string, publicPath: string | null | undefined): OwnershipResult {
  const appSlug = firstSegment(publicPath);
  if (!appSlug) return { verdict: 'unknown-app-path', appSlug: null, routeSlug: firstSegment(route), reason: 'no PUBLIC_PATH resolved — cannot judge ownership' };
  const stem = familyStem(appSlug);
  const isFamily = (s: string) => s.includes('-') && s.startsWith(`${stem}-`) && familyStem(s) === stem;
  const segs = allSegments(route);
  // Prefer an MFE-family segment anywhere in the route; this both finds the slug under shell mangling
  // and ignores noise segments (drive letters, `program files`, `git`, sub-resources).
  const familySeg = segs.find((s) => s === appSlug || isFamily(s)) ?? null;
  const routeSlug = familySeg ?? segs[0] ?? null;
  if (familySeg === appSlug) return { verdict: 'match', appSlug, routeSlug, reason: 'route is served by this app' };
  if (familySeg) return { verdict: 'mismatch', appSlug, routeSlug: familySeg, reason: `route belongs to sibling MFE '${familySeg}', not '${appSlug}'` };
  return { verdict: 'indeterminate', appSlug, routeSlug, reason: 'route carries no MFE-family prefix (bare feature route)' };
}

/** Map a verdict to a process exit code (only `mismatch` blocks). */
export function exitCodeFor(verdict: OwnershipVerdict): number { return verdict === 'mismatch' ? 1 : 0; }

function resolvePublicPath(opts: { publicPath?: string; envFile?: string }): string | null {
  if (opts.publicPath) return opts.publicPath;
  const envFile = opts.envFile || '.env.playwright';
  try {
    if (fs.existsSync(envFile)) {
      const m = fs.readFileSync(envFile, 'utf8').replace(/\r\n/g, '\n').match(/^\s*PUBLIC_PATH\s*=\s*(.+?)\s*$/m);
      if (m && m[1].trim()) return m[1].trim();
    }
  } catch { /* ignore */ }
  return process.env.PUBLIC_PATH || null;
}

function main() {
  const argv = process.argv.slice(2);
  let publicPath: string | undefined;
  let envFile: string | undefined;
  let json = false;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--public-path') { publicPath = argv[++i]; } else if (t === '--env-file') { envFile = argv[++i]; } else if (t === '--json') { json = true; } else { rest.push(t); }
  }
  const route = rest[0] || '';
  if (!route) {
    console.error('usage: check-ownership.ts "<route>" [--public-path </slug/>] [--env-file <f>] [--json]');
    process.exit(2);
  }
  const res = classifyOwnership(route, resolvePublicPath({ publicPath, envFile }));
  if (json) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    const icon = res.verdict === 'mismatch' ? '🛑' : (res.verdict === 'match' ? '✅' : 'ℹ️');
    console.log(`${icon} ownership: ${res.verdict} — ${res.reason} (app='${res.appSlug ?? '?'}' route='${res.routeSlug ?? '?'}')`);
  }
  process.exit(exitCodeFor(res.verdict));
}

// Run the CLI only when invoked directly (not when imported by the test).
if (process.argv[1] && /check-ownership\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) main();
