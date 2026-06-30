/**
 * example-logger — a harmless reference plugin for the A-06 hook system.
 *
 * Copy this file to make your own plugin. Drop any `*.ts`/`*.js` file in `.claude/plugins/`
 * that default-exports `{ name, hooks }`; files starting with `_` are ignored. Delete this
 * file to opt out. See docs/PLUGINS.md for the full contract.
 */
import type { KitPlugin } from '../integrations/hooks';

const plugin: KitPlugin = {
  name: 'example-logger',
  hooks: {
    'before:lint': (ctx) => ctx.log('lint is about to run'),
    'after:verify': (ctx) => ctx.log(`verify finished${ctx.payload ? ` — ${JSON.stringify(ctx.payload)}` : ''}`),
    'on:error': (ctx) => ctx.log(`error observed: ${JSON.stringify(ctx.payload ?? null)}`),
  },
};

export default plugin;
