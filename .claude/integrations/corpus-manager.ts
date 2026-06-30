#!/usr/bin/env node
/**
 * corpus-manager.ts — curate the regression-corpus golden cases (A-02).
 *
 * WHY: cases in corpus/*.case.json were hand-authored with no tooling. This adds a
 * small CLI to scaffold, filter, and validate them so the corpus stays consistent and
 * growable. It does NOT run the LLM workflow — it manages the deterministic case files
 * that regression-corpus.ts replays.
 *
 * Subcommands:
 *   add      scaffold a new NN-name.case.json from a template
 *   list     list cases (optionally filtered by --tag / --kind)
 *   validate schema-check every case + confirm each is runnable (no throw)
 *
 * Usage:
 *   npx tsx .claude/integrations/corpus-manager.ts add --name "modal-close" --tags "L-03,UI"
 *   npx tsx .claude/integrations/corpus-manager.ts add --name "b11-fail" --kind detector
 *   npx tsx .claude/integrations/corpus-manager.ts list --tag UI
 *   npx tsx .claude/integrations/corpus-manager.ts validate
 *
 * Exit 0 = ok, 1 = a validation error (validate) / bad usage.
 */

import * as fs from 'fs';
import * as path from 'path';
import { corpusDir, runCorpus } from './regression-corpus';

// ─── Types (mirror regression-corpus's schema + an optional `tags` field) ─────────

export type CaseKind = 'gate' | 'detector';

export interface RawCase {
  id?: unknown;
  kind?: unknown;
  description?: unknown;
  files?: unknown;
  tags?: unknown; // optional; regression-corpus ignores it, used here for curation
  lint?: unknown;
  expect?: unknown;
  [k: string]: unknown;
}

export interface LoadedCase {
  file: string; // basename, e.g. "04-learned-loading-on-flags.case.json"
  raw: RawCase;
}

// ─── Loading ─────────────────────────────────────────────────────────────────────

export function listCaseFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.case.json')).sort();
}

export function loadCases(dir: string): { cases: LoadedCase[]; parseErrors: string[] } {
  const cases: LoadedCase[] = [];
  const parseErrors: string[] = [];
  for (const file of listCaseFiles(dir)) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as RawCase;
      cases.push({ file, raw });
    } catch (e) {
      parseErrors.push(`${file}: invalid JSON — ${(e as Error).message}`);
    }
  }
  return { cases, parseErrors };
}

// ─── Tags + filtering ──────────────────────────────────────────────────────────

export function caseTags(raw: RawCase): string[] {
  if (!Array.isArray(raw.tags)) return [];
  return raw.tags.filter((t): t is string => typeof t === 'string');
}

export function filterCases(
  cases: LoadedCase[],
  opts: { tag?: string; kind?: CaseKind },
): LoadedCase[] {
  return cases.filter((c) => {
    if (opts.kind && c.raw.kind !== opts.kind) return false;
    if (opts.tag && !caseTags(c.raw).some((t) => t.toLowerCase() === opts.tag!.toLowerCase())) return false;
    return true;
  });
}

// ─── Validation ──────────────────────────────────────────────────────────────────

function isStringRecord(v: unknown): v is Record<string, string> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
    && Object.values(v as Record<string, unknown>).every((x) => typeof x === 'string');
}

/** Schema-validate one case. Returns a list of human-readable errors ([] = valid). */
export function validateCase(raw: RawCase, file: string): string[] {
  const errs: string[] = [];
  const where = (m: string) => `${file}: ${m}`;

  if (typeof raw.id !== 'string' || !raw.id.trim()) errs.push(where('`id` must be a non-empty string'));
  if (raw.kind !== 'gate' && raw.kind !== 'detector') errs.push(where('`kind` must be "gate" or "detector"'));
  if (typeof raw.description !== 'string' || !raw.description.trim()) errs.push(where('`description` must be a non-empty string'));
  if (!isStringRecord(raw.files)) errs.push(where('`files` must be an object of relpath → string content'));
  else if (Object.keys(raw.files).length === 0) errs.push(where('`files` must declare at least one fixture file'));
  if (raw.tags !== undefined && !(Array.isArray(raw.tags) && raw.tags.every((t) => typeof t === 'string'))) {
    errs.push(where('`tags`, if present, must be an array of strings'));
  }

  if (raw.kind === 'gate') {
    const lint = raw.lint as Record<string, unknown> | undefined;
    if (!lint || typeof lint !== 'object') errs.push(where('gate case needs a `lint` object'));
    else if (typeof lint.folder !== 'string' || !lint.folder.trim()) errs.push(where('`lint.folder` must be a non-empty string'));
    const expect = raw.expect as Record<string, unknown> | undefined;
    if (!expect || typeof expect !== 'object') errs.push(where('gate case needs an `expect` object'));
    else if (expect.gate !== 'pass' && expect.gate !== 'fail') errs.push(where('`expect.gate` must be "pass" or "fail"'));
  } else if (raw.kind === 'detector') {
    const expect = raw.expect as Record<string, unknown> | undefined;
    if (!expect || typeof expect !== 'object') errs.push(where('detector case needs an `expect` object'));
    else if (expect.patterns === undefined && expect.notPatterns === undefined && expect.minTotalRuns === undefined) {
      errs.push(where('detector `expect` must set at least one of patterns/notPatterns/minTotalRuns'));
    }
  }
  return errs;
}

// ─── Scaffolding ─────────────────────────────────────────────────────────────────

export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Next 2-digit prefix from existing files (e.g. "07"). */
export function nextPrefix(existingFiles: string[]): string {
  let max = 0;
  for (const f of existingFiles) {
    const m = /^(\d+)-/.exec(f);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return String(max + 1).padStart(2, '0');
}

export function scaffoldCase(opts: {
  name: string;
  kind: CaseKind;
  tags: string[];
  description?: string;
  existingFiles: string[];
}): { file: string; content: string } {
  const slug = slugify(opts.name);
  if (!slug) throw new Error('--name produced an empty slug; use alphanumeric characters');
  const file = `${nextPrefix(opts.existingFiles)}-${slug}.case.json`;
  const description = opts.description ?? `TODO: why this case exists (${opts.name})`;

  const body: Record<string, unknown> = opts.kind === 'gate'
    ? {
        id: slug,
        kind: 'gate',
        description,
        ...(opts.tags.length ? { tags: opts.tags } : {}),
        files: {
          'feat/data/transform.ts': 'export const mapFoo = (raw: unknown) => raw;\n',
          'docs/specs/F/ux-states.json': '{"states":[{"name":"Success","route":"/x"}]}\n',
        },
        lint: { folder: 'feat', uxStates: 'docs/specs/F/ux-states.json' },
        expect: { gate: 'pass', mustFlagRules: [], mustNotFlagRules: [] },
      }
    : {
        id: slug,
        kind: 'detector',
        description,
        ...(opts.tags.length ? { tags: opts.tags } : {}),
        files: {
          'docs/specs/.feedback-history.md': '## TODO: feedback entries that trigger the pattern\n',
        },
        expect: { patterns: [], notPatterns: [], minTotalRuns: 1 },
      };

  return { file, content: JSON.stringify(body, null, 2) + '\n' };
}

// ─── Arg parsing ─────────────────────────────────────────────────────────────────

export function parseFlags(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { out[key] = next; i += 1; } else { out[key] = true; }
    }
  }
  return out;
}

function parseTags(v: string | boolean | undefined): string[] {
  if (typeof v !== 'string') return [];
  return v.split(',').map((t) => t.trim()).filter(Boolean);
}

// ─── CLI ─────────────────────────────────────────────────────────────────────────

function cmdAdd(dir: string, flags: Record<string, string | boolean>): number {
  const name = flags.name;
  if (typeof name !== 'string' || !name.trim()) {
    console.error('add: --name "<case name>" is required');
    return 1;
  }
  const kind: CaseKind = flags.kind === 'detector' ? 'detector' : 'gate';
  const tags = parseTags(flags.tags);
  const description = typeof flags.desc === 'string' ? flags.desc : undefined;
  const { file, content } = scaffoldCase({ name, kind, tags, description, existingFiles: listCaseFiles(dir) });
  const full = path.join(dir, file);
  if (fs.existsSync(full)) { console.error(`add: ${file} already exists`); return 1; }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  console.log(`✅ created corpus/${file} (${kind}${tags.length ? `, tags: ${tags.join(', ')}` : ''})`);
  console.log('   Edit the scaffolded `files` + `expect` to capture the behavior you want pinned, then run:');
  console.log('   npx tsx .claude/integrations/corpus-manager.ts validate');
  return 0;
}

function cmdList(dir: string, flags: Record<string, string | boolean>): number {
  const { cases, parseErrors } = loadCases(dir);
  for (const e of parseErrors) console.log(`⚠️  ${e}`);
  const tag = typeof flags.tag === 'string' ? flags.tag : undefined;
  const kind = flags.kind === 'gate' || flags.kind === 'detector' ? flags.kind : undefined;
  const filtered = filterCases(cases, { tag, kind });
  const suffix = [tag && `tag=${tag}`, kind && `kind=${kind}`].filter(Boolean).join(', ');
  console.log(`\n📂 ${filtered.length} case(s)${suffix ? ` (${suffix})` : ''}\n`);
  for (const c of filtered) {
    const tags = caseTags(c.raw);
    console.log(`  ${c.file}  [${c.raw.kind}]${tags.length ? `  #${tags.join(' #')}` : ''}`);
    if (typeof c.raw.description === 'string') console.log(`     ${c.raw.description}`);
  }
  console.log('');
  return 0;
}

function cmdValidate(dir: string): number {
  const { cases, parseErrors } = loadCases(dir);
  const errors: string[] = [...parseErrors];
  for (const c of cases) errors.push(...validateCase(c.raw, c.file));

  console.log(`\n🔎 Validating ${cases.length} case(s) in corpus/\n`);
  if (errors.length) {
    for (const e of errors) console.log(`  ❌ ${e}`);
    console.log(`\n${errors.length} schema error(s) — fix these before the cases are runnable.\n`);
    return 1;
  }
  console.log('  ✅ schema OK for all cases');

  // Runnable check: replay through the real runner; a throw = not runnable.
  let runResults;
  try {
    runResults = runCorpus(dir);
  } catch (e) {
    console.log(`  ❌ a case threw while running: ${(e as Error).message}`);
    return 1;
  }
  const mismatched = runResults.filter((r) => !r.ok);
  console.log(`  ✅ all ${runResults.length} case(s) ran without error`);
  if (mismatched.length) {
    console.log(`\n  ⚠️  ${mismatched.length} case(s) ran but their verdict no longer matches \`expect\`:`);
    for (const r of mismatched) console.log(`     • [${r.kind}] ${r.id}: ${r.messages.join('; ')}`);
    console.log('     (This is a regression signal — investigate via `npm run test:regression-corpus`.)');
  }
  console.log('');
  return 0;
}

if (process.argv[1] && /corpus-manager\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const [, , sub, ...rest] = process.argv;
  const dir = corpusDir();
  const flags = parseFlags(rest);
  let code: number;
  switch (sub) {
    case 'add': code = cmdAdd(dir, flags); break;
    case 'list': code = cmdList(dir, flags); break;
    case 'validate': code = cmdValidate(dir); break;
    default:
      console.error('Usage: corpus-manager.ts <add|list|validate> [flags]');
      console.error('  add      --name "<name>" [--kind gate|detector] [--tags "a,b"] [--desc "..."]');
      console.error('  list     [--tag <t>] [--kind gate|detector]');
      console.error('  validate');
      code = 1;
  }
  process.exit(code);
}
