#!/usr/bin/env node
/**
 * prompt-budget.ts — size guard for the workflow command prompt.
 *
 * The command file is loaded in full when the skill runs, so unbounded growth
 * (every "apply verbatim" lesson appends to it) dilutes instruction adherence and
 * costs tokens. This tool measures it, breaks it down by `##` section, and — under
 * `--gate` — fails if it exceeds the budget, turning the size into a ratchet that
 * can only go down.
 *
 * Token estimate is a heuristic (~chars/4); treat it as an order-of-magnitude guide,
 * not an exact count.
 *
 * Usage:
 *   npx tsx .claude/integrations/prompt-budget.ts                 # default file, report
 *   npx tsx .claude/integrations/prompt-budget.ts --file <md>
 *   npx tsx .claude/integrations/prompt-budget.ts --budget-kb 175 --gate
 *   npx tsx .claude/integrations/prompt-budget.ts --top 15 --json
 *
 * Budget resolution: --budget-kb flag → else .claude/integrations/prompt-budget.json
 * ({ "files": { "<relpath>": <kb> } }) → else no budget (report only).
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Section { title: string; bytes: number; lines: number; startLine: number; }
export interface BudgetReport {
  file: string;
  bytes: number;
  kb: number;
  approxTokens: number;
  lines: number;
  sections: Section[];
  budgetKb: number | null;
  overBudget: boolean;
}

const DEFAULT_FILE = path.join('.claude', 'commands', 'feature-from-confluence.md');

export function splitSections(text: string): Section[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const sections: Section[] = [];
  let title = '(preamble)';
  let buf: string[] = [];
  let startLine = 1; // 1-based line where the current section begins
  const flush = () => {
    if (buf.length === 0 && sections.length > 0) return;
    const body = buf.join('\n');
    sections.push({ title, bytes: Buffer.byteLength(body, 'utf8'), lines: buf.length, startLine });
  };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    // Top-level section headers only (## ), not ### or deeper, and not inside fences.
    if (/^##\s+\S/.test(ln) && !/^###/.test(ln)) {
      flush();
      title = ln.replace(/^##\s+/, '').trim();
      buf = [ln];
      startLine = i + 1;
    } else {
      buf.push(ln);
    }
  }
  flush();
  return sections;
}

export function analyzeBudget(filePath: string, budgetKb: number | null): BudgetReport {
  const text = fs.readFileSync(filePath, 'utf8');
  const bytes = Buffer.byteLength(text, 'utf8');
  const kb = Math.round((bytes / 1024) * 10) / 10;
  const approxTokens = Math.round(text.length / 4);
  const sections = splitSections(text).sort((a, b) => b.bytes - a.bytes);
  return {
    file: filePath,
    bytes,
    kb,
    approxTokens,
    lines: text.split('\n').length,
    sections,
    budgetKb,
    overBudget: budgetKb !== null && kb > budgetKb,
  };
}

function resolveBudget(file: string, flagKb: number | null): number | null {
  if (flagKb !== null) return flagKb;
  const cfgPath = path.join(process.cwd(), '.claude', 'integrations', 'prompt-budget.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { files?: Record<string, number> };
      const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
      if (cfg.files && typeof cfg.files[rel] === 'number') return cfg.files[rel];
    } catch { /* ignore */ }
  }
  return null;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && /prompt-budget\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const file = arg('--file') ?? DEFAULT_FILE;
  if (!fs.existsSync(file)) { console.error(`prompt-budget: file not found: ${file}`); process.exit(2); }
  const flagKb = arg('--budget-kb') ? Number(arg('--budget-kb')) : null;
  const budgetKb = resolveBudget(file, flagKb);
  const top = arg('--top') ? Number(arg('--top')) : 12;
  const report = analyzeBudget(file, budgetKb);

  if (process.argv.includes('--toc')) {
    // Lazy-load aid: emit a section map in DOCUMENT order with line ranges so a
    // session can targeted-Read just the section it needs (Read offset/limit)
    // instead of loading the whole ~41K-token command file. See TOKEN-OPTIMIZATION.md.
    const ordered = splitSections(fs.readFileSync(file, 'utf8'));
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(
        ordered.map((s) => ({ title: s.title, startLine: s.startLine, endLine: s.startLine + s.lines - 1, kb: Math.round((s.bytes / 1024) * 10) / 10 })),
        null, 2,
      ));
    } else {
      console.log(`\n🗺️  Section map — ${report.file}  (Read offset/limit to load one section)\n`);
      for (const s of ordered) {
        const skb = Math.round((s.bytes / 1024) * 10) / 10;
        const range = `${s.startLine}-${s.startLine + s.lines - 1}`;
        console.log(`   ${range.padStart(11)}  ${String(skb).padStart(6)} KB  ${s.title}`);
      }
      console.log('');
    }
  } else if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...report, sections: report.sections.slice(0, top) }, null, 2));
  } else {
    console.log(`\n📏 prompt-budget — ${report.file}`);
    console.log(`   ${report.kb} KB · ${report.bytes.toLocaleString()} bytes · ~${report.approxTokens.toLocaleString()} tokens · ${report.lines.toLocaleString()} lines`);
    console.log(`   budget: ${budgetKb !== null ? `${budgetKb} KB → ${report.overBudget ? '❌ OVER' : '✅ within'}` : '(none set)'}\n`);
    console.log(`   Largest sections (top ${top}):`);
    for (const s of report.sections.slice(0, top)) {
      const skb = Math.round((s.bytes / 1024) * 10) / 10;
      console.log(`     ${String(skb).padStart(6)} KB  ${s.title}`);
    }
    console.log('');
  }
  process.exit(process.argv.includes('--gate') && report.overBudget ? 1 : 0);
}
