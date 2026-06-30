#!/usr/bin/env node
/**
 * build-copilot-edition.ts — generate a GitHub Copilot edition from the Claude command source.
 *
 * The kit authors slash commands once (.claude/commands/*.md, the Claude edition). This
 * transforms them into a Copilot "IDE edition" bundle you run inside VS Code Copilot Chat:
 *   <out>/.github/copilot-instructions.md     — workspace-wide custom instructions
 *   <out>/.github/prompts/<name>.prompt.md     — one reusable prompt per command (invoke as /name)
 *
 * It's a pure transform — no LLM, no network. Copilot has no PTY/OTEL, so there's no
 * telemetry path (by design); these artifacts are meant to be run by a human in the IDE.
 *
 * Usage:
 *   npm run build:copilot                       # → dist/copilot-edition/.github/...
 *   npm run build:copilot -- --out ../some-repo # write the .github/ bundle into another repo
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const thisFile = fileURLToPath(import.meta.url);
const KIT_ROOT = path.dirname(path.dirname(thisFile)); // scripts/ -> kit root

export interface ParsedCommand { description: string; body: string }
export interface CommandSummary { name: string; description: string }

/** Split a command markdown file into its frontmatter `description` and the body. */
export function parseCommandFile(raw: string): ParsedCommand {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { description: '', body: raw.trim() };
  const fm = m[1];
  const body = m[2].trim();
  const d = /^description:\s*(.+)$/m.exec(fm);
  const description = d ? d[1].trim().replace(/^["']|["']$/g, '') : '';
  return { description, body };
}

/** Map the Claude `$ARGUMENTS` placeholder to a VS Code prompt input variable. */
export function transformBody(body: string): string {
  return body.replace(/\$ARGUMENTS/g, '${input:arguments}');
}

/** Render one VS Code prompt file (.github/prompts/<name>.prompt.md). */
export function toPromptFile(description: string, body: string): string {
  const desc = (description || 'Kit command').replace(/'/g, "’"); // keep YAML single-quote safe
  return [
    '---',
    "mode: 'agent'",
    `description: '${desc}'`,
    '---',
    '',
    transformBody(body),
    '',
  ].join('\n');
}

/** Render the workspace-wide .github/copilot-instructions.md. */
export function renderCopilotInstructions(commands: CommandSummary[], version: string): string {
  const rows = commands.map((c) => `| \`/${c.name}\` | ${c.description || '—'} |`).join('\n');
  return [
    '# claude-workflow-kit — Copilot edition',
    '',
    `> Generated from the kit's Claude command source (v${version}) by \`npm run build:copilot\`.`,
    "> Do not edit by hand — re-run the generator to update.",
    '',
    'This workspace uses the **claude-workflow-kit** agentic workflow. When generating feature',
    'code, follow this repository\'s conventions (see its `CLAUDE.md` / convention docs): use an',
    'anti-corruption layer (route HTTP responses through a `transform.ts`, never blind-cast',
    '`data as Foo`), keep features convention-compliant, and never auto-commit or auto-push —',
    'a human always does that.',
    '',
    '## Available prompts',
    '',
    'Run these in Copilot Chat as slash prompts (they live in `.github/prompts/`):',
    '',
    '| Prompt | What it does |',
    '|--------|--------------|',
    rows,
    '',
    '> These prompts are the Copilot port of the kit\'s slash commands. The deterministic',
    "> toolchain (gates, eval, telemetry) is Claude-edition only — Copilot runs are not tracked.",
    '',
  ].join('\n');
}

// ─── CLI ─────────────────────────────────────────────────────────────────────────

function readVersion(): string {
  try {
    const f = path.join(KIT_ROOT, '.claude', 'commands', 'feature-from-confluence.md');
    const m = fs.readFileSync(f, 'utf8').match(/PROMPT_VERSION:\s*v([\d.]+)/);
    return m ? m[1] : '0.0';
  } catch {
    return '0.0';
  }
}

/** Title line in our instructions file — used to tell our own output from a foreign one. */
export const INSTRUCTIONS_MARKER = '# claude-workflow-kit — Copilot edition';

export function buildCopilotEdition(
  kitRoot: string,
  outRoot: string,
  opts: { force?: boolean } = {},
): { instructions: string; prompts: string[]; backedUp?: string } {
  const cmdDir = path.join(kitRoot, '.claude', 'commands');
  if (!fs.existsSync(cmdDir)) throw new Error(`No commands dir at ${cmdDir}`);
  const files = fs.readdirSync(cmdDir).filter((f) => f.endsWith('.md')).sort();

  const githubDir = path.join(outRoot, '.github');
  const promptsDir = path.join(githubDir, 'prompts');

  // Protect a pre-existing, NON-kit copilot-instructions.md (e.g. a team's own / spec-kit file):
  // refuse without --force; back it up to .bak when forced. Our own output is overwritten freely.
  const instrPath = path.join(githubDir, 'copilot-instructions.md');
  let backedUp: string | undefined;
  if (fs.existsSync(instrPath)) {
    const current = fs.readFileSync(instrPath, 'utf8');
    const isOurs = current.includes(INSTRUCTIONS_MARKER);
    if (!isOurs) {
      if (!opts.force) {
        throw new Error(
          `${path.relative(outRoot, instrPath)} already exists and was not generated by this tool. ` +
          `Re-run with --force to overwrite it (the existing file will be backed up to copilot-instructions.md.bak).`
        );
      }
      fs.copyFileSync(instrPath, instrPath + '.bak');
      backedUp = path.relative(outRoot, instrPath) + '.bak';
    }
  }

  fs.mkdirSync(promptsDir, { recursive: true });

  const summaries: CommandSummary[] = [];
  const written: string[] = [];
  for (const file of files) {
    const name = file.replace(/\.md$/, '');
    const { description, body } = parseCommandFile(fs.readFileSync(path.join(cmdDir, file), 'utf8'));
    summaries.push({ name, description });
    const out = path.join(promptsDir, `${name}.prompt.md`);
    fs.writeFileSync(out, toPromptFile(description, body), 'utf8');
    written.push(path.relative(outRoot, out));
  }

  fs.writeFileSync(instrPath, renderCopilotInstructions(summaries, readVersion()), 'utf8');
  return { instructions: path.relative(outRoot, instrPath), prompts: written, backedUp };
}

if (process.argv[1] && /build-copilot-edition\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const force = process.argv.includes('--force');
  const outIdx = process.argv.findIndex((a) => a === '--out' || a.startsWith('--out='));
  let outRoot = path.join(KIT_ROOT, 'dist', 'copilot-edition');
  if (outIdx !== -1) {
    const a = process.argv[outIdx];
    const v = a.includes('=') ? a.slice(a.indexOf('=') + 1) : process.argv[outIdx + 1];
    if (!v) { console.error('--out requires a directory'); process.exit(1); }
    outRoot = path.resolve(KIT_ROOT, v);
  }
  try {
    const { instructions, prompts, backedUp } = buildCopilotEdition(KIT_ROOT, outRoot, { force });
    console.log(`\n🟣 Copilot edition written to ${outRoot}`);
    if (backedUp) console.log(`  ↻ backed up existing instructions → ${backedUp}`);
    console.log(`  + ${instructions}`);
    for (const p of prompts) console.log(`  + ${p}`);
    console.log(`\n${prompts.length} prompt(s) + 1 instructions file. Open the repo in VS Code and run /<name> in Copilot Chat.\n`);
  } catch (e) {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  }
}
