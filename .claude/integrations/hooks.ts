#!/usr/bin/env node
/**
 * hooks.ts — plugin / extension hook system (A-06).
 *
 * WHY: the kit's integrations are hardcoded; external teams can't extend it without forking.
 * This adds a tiny event bus + a plugin loader so a repo can drop a plugin into
 * `.claude/plugins/` and react to kit lifecycle events (`before:lint`, `after:verify`,
 * `on:error`, …) without touching the kit.
 *
 * Contract (see docs/PLUGINS.md): a plugin file in `.claude/plugins/` default-exports
 *   { name: string, hooks: { '<event>': (ctx) => void | Promise<void> } }
 *
 * Error isolation: a throwing handler is caught and reported — one bad plugin never crashes
 * a kit run. The bus is best-effort by design.
 *
 * CLI:
 *   npx tsx .claude/integrations/hooks.ts --list           # discovered plugins + their hooks
 *   npx tsx .claude/integrations/hooks.ts emit before:lint # fire an event (commands/scripts shell out)
 *   npx tsx .claude/integrations/hooks.ts emit on:error '{"message":"boom"}'
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

// ─── Well-known events (any string is allowed; these are the documented ones) ─────

export const KNOWN_EVENTS = [
  'before:lint', 'after:lint',
  'before:verify', 'after:verify',
  'before:sync', 'after:sync',
  'on:error',
] as const;
export type KnownEvent = (typeof KNOWN_EVENTS)[number];
export type HookEvent = KnownEvent | (string & {});

export interface HookContext { event: HookEvent; payload?: unknown; log: (msg: string) => void }
export type HookHandler = (ctx: HookContext) => void | Promise<void>;
export interface KitPlugin { name: string; hooks: Partial<Record<HookEvent, HookHandler>> }

export interface EmitResult { plugin: string; ok: boolean; error?: string }

// ─── Validation ──────────────────────────────────────────────────────────────────

export function isValidPlugin(obj: unknown): obj is KitPlugin {
  if (!obj || typeof obj !== 'object') return false;
  const p = obj as Record<string, unknown>;
  if (typeof p.name !== 'string' || !p.name.trim()) return false;
  if (!p.hooks || typeof p.hooks !== 'object') return false;
  return Object.values(p.hooks as Record<string, unknown>).every((h) => typeof h === 'function');
}

// ─── Bus ─────────────────────────────────────────────────────────────────────────

export class HookBus {
  private handlers = new Map<HookEvent, { plugin: string; fn: HookHandler }[]>();

  register(plugin: KitPlugin): void {
    for (const [event, fn] of Object.entries(plugin.hooks)) {
      if (typeof fn !== 'function') continue;
      const list = this.handlers.get(event) ?? [];
      list.push({ plugin: plugin.name, fn });
      this.handlers.set(event, list);
    }
  }

  /** Plugin names listening to an event, in registration order. */
  listeners(event: HookEvent): string[] {
    return (this.handlers.get(event) ?? []).map((h) => h.plugin);
  }

  events(): HookEvent[] {
    return [...this.handlers.keys()];
  }

  /** Fire an event — runs every handler sequentially, isolating errors. */
  async emit(event: HookEvent, payload?: unknown, log: (m: string) => void = () => {}): Promise<EmitResult[]> {
    const results: EmitResult[] = [];
    for (const { plugin, fn } of this.handlers.get(event) ?? []) {
      try {
        await fn({ event, payload, log: (m) => log(`[${plugin}] ${m}`) });
        results.push({ plugin, ok: true });
      } catch (e) {
        results.push({ plugin, ok: false, error: (e as Error).message });
      }
    }
    return results;
  }
}

// ─── Loading ─────────────────────────────────────────────────────────────────────

export function pluginsDir(cwd: string = process.cwd()): string {
  return path.join(cwd, '.claude', 'plugins');
}

export function pluginFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(ts|js|mjs)$/.test(f) && !/\.(test|spec)\./.test(f) && !f.startsWith('_'))
    .sort()
    .map((f) => path.join(dir, f));
}

/** Dynamically import each plugin file; skip (with a warning) any that don't satisfy the contract. */
export async function loadPlugins(dir: string, warn: (m: string) => void = () => {}): Promise<KitPlugin[]> {
  const plugins: KitPlugin[] = [];
  for (const file of pluginFiles(dir)) {
    try {
      const mod = await import(pathToFileURL(file).href);
      const candidate = mod.default ?? mod.plugin ?? mod;
      if (isValidPlugin(candidate)) plugins.push(candidate);
      else warn(`skipped ${path.basename(file)} — does not export a valid { name, hooks } plugin`);
    } catch (e) {
      warn(`failed to load ${path.basename(file)} — ${(e as Error).message}`);
    }
  }
  return plugins;
}

/** Convenience: build a bus with all plugins from `.claude/plugins/` registered. */
export async function createBusFromDir(cwd: string = process.cwd(), warn: (m: string) => void = () => {}): Promise<HookBus> {
  const bus = new HookBus();
  for (const p of await loadPlugins(pluginsDir(cwd), warn)) bus.register(p);
  return bus;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────────

async function main(argv: string[]): Promise<number> {
  const warn = (m: string) => console.warn(`⚠️  ${m}`);
  if (argv.includes('--list')) {
    const plugins = await loadPlugins(pluginsDir(), warn);
    console.log(`\n🔌 ${plugins.length} plugin(s) in ${path.relative(process.cwd(), pluginsDir()) || '.claude/plugins'}\n`);
    for (const p of plugins) console.log(`  • ${p.name}  →  ${Object.keys(p.hooks).join(', ') || '(no hooks)'}`);
    console.log(`\nKnown events: ${KNOWN_EVENTS.join(', ')}\n`);
    return 0;
  }
  const [cmd, event, payloadStr] = argv;
  if (cmd === 'emit' && event) {
    let payload: unknown;
    if (payloadStr) { try { payload = JSON.parse(payloadStr); } catch { payload = payloadStr; } }
    const bus = await createBusFromDir(process.cwd(), warn);
    const results = await bus.emit(event, payload, (m) => console.log(m));
    const failed = results.filter((r) => !r.ok);
    console.log(`\nemit "${event}" → ${results.length} handler(s), ${failed.length} failed`);
    for (const f of failed) console.log(`  ❌ ${f.plugin}: ${f.error}`);
    return 0; // best-effort: a failing plugin must not fail the kit
  }
  console.error('Usage: hooks.ts --list | emit <event> [jsonPayload]');
  return 1;
}

if (process.argv[1] && /hooks\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main(process.argv.slice(2)).then((c) => process.exit(c));
}
