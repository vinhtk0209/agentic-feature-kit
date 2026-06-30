# Plugins & Hooks (A-06)

The kit exposes a small **event bus** so you can extend it without forking. Drop a plugin
into `.claude/plugins/` and react to kit lifecycle events (`before:lint`, `after:verify`,
`on:error`, …).

> Source: `.claude/integrations/hooks.ts`. Reference plugin:
> `.claude/plugins/example-logger.ts`.

## The contract

A plugin is any `*.ts` / `*.js` / `*.mjs` file in `.claude/plugins/` that **default-exports**
an object:

```ts
import type { KitPlugin } from '../integrations/hooks'

const plugin: KitPlugin = {
  name: 'my-plugin',                 // unique, non-empty
  hooks: {
    'before:lint': (ctx) => { ctx.log('about to lint') },
    'after:verify': async (ctx) => { await postToSlack(ctx.payload) },
    'on:error': (ctx) => { ctx.log(`error: ${JSON.stringify(ctx.payload)}`) },
  },
}

export default plugin
```

- Files starting with `_` (e.g. `_template.ts`) and `*.test.*` / `*.spec.*` are **ignored** —
  handy for templates and tests.
- A handler receives a `HookContext`: `{ event, payload?, log }`. `log(msg)` is namespaced
  with your plugin name.
- Handlers may be sync or `async`. They run **sequentially**, in load order (filenames are
  sorted), then registration order.

## Events

Known lifecycle events (any string is allowed; these are the documented ones):

| Event | When |
|-------|------|
| `before:lint` / `after:lint` | Around the convention gate (`lint-feature`). |
| `before:verify` / `after:verify` | Around UI/Playwright verification. |
| `before:sync` / `after:sync` | Around `npm run sync` to target repos. |
| `on:error` | When the workflow hits an error worth surfacing. |

## Error isolation

The bus is **best-effort**: a handler that throws is caught and reported, and the remaining
handlers still run. A broken plugin never crashes a kit run.

## Firing events

Deterministic scripts can build a bus and emit directly:

```ts
import { createBusFromDir } from './hooks'
const bus = await createBusFromDir()
await bus.emit('after:verify', { route: '/dashboard', passed: true })
```

Slash commands (markdown prompts) and shell steps can fire events via the CLI:

```bash
npx tsx .claude/integrations/hooks.ts --list                 # list discovered plugins + hooks
npx tsx .claude/integrations/hooks.ts emit before:lint        # fire an event
npx tsx .claude/integrations/hooks.ts emit on:error '{"message":"boom"}'
```

Or via npm:

```bash
npm run hooks:list
```

## Testing your plugin

Plugins are plain modules — unit-test them directly, or rely on the kit's `test:hooks`
suite which validates the bus, the loader, and the shipped example plugin.
