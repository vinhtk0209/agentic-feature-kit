# Editions & multi-provider

The kit authors its workflow **once** (the Claude edition: `.claude/commands/*.md`) and can
emit editions for other model providers. This is the foundation for running the kit beyond
Claude (GitHub Copilot today; Codex/others later).

## Provider registry (`.claude/model-config.json`)

Each model entry declares a `provider` (`claude` | `copilot` | `codex` | …):

```jsonc
{
  "primary": "opus",
  "fallback": ["sonnet", "haiku"],
  "models": {
    "opus":    { "id": "claude-opus-4-8", "label": "Opus 4.8", "provider": "claude" },
    "copilot": { "id": "github-copilot",  "label": "GitHub Copilot", "provider": "copilot" }
  }
}
```

`integrations/model-config.ts` exposes `providerOf`, `providersOf`, `modelsByProvider`,
`resolveModelChain`. Inspect with `npm run model:chain`. The dashboard `/performance` page
derives each run's provider from this registry.

## Copilot edition (IDE)

GitHub Copilot has no PTY/OTEL, so it runs **in the IDE**, not via the dashboard Command
Runner — there is **no telemetry** for Copilot runs by design. Generate the Copilot bundle:

```bash
npm run build:copilot                        # → dist/copilot-edition/.github/...
npm run build:copilot -- --out ../some-repo  # write .github/ straight into another repo
```

This emits, from the Claude command source:

```
.github/
  copilot-instructions.md        # workspace-wide custom instructions (kit overview + conventions)
  prompts/
    feature-from-confluence.prompt.md   # invoke as /feature-from-confluence in Copilot Chat
    new-feature.prompt.md
    drop-mock.prompt.md
    api-contract.prompt.md
    playwright-verify.prompt.md
    codex-review.prompt.md
```

The transform: each command's frontmatter `description` becomes the prompt file's
`description`, the body is copied with `$ARGUMENTS` mapped to VS Code's `${input:arguments}`,
and `mode: 'agent'` is set so Copilot can act across files.

### Using it

1. Run the generator with `--out` pointing at the repo you want (or copy `dist/copilot-edition/.github/`).
2. Open that repo in VS Code with GitHub Copilot enabled.
3. In Copilot Chat, run a prompt as `/feature-from-confluence` (etc.). The workspace
   instructions apply automatically.

### From the dashboard

`kit-dashboard` → **/run** has a **Copilot edition → Generate** button (operator+ role). Pick a
repo in the launcher, click Generate, and it shells out `build:copilot --out <repo>` (route
`/api/build-copilot`). If the repo already has a non-kit `copilot-instructions.md`, the run is
refused (409) and the UI offers **Overwrite (back up existing)** which re-runs with `--force`
(the original is saved to `copilot-instructions.md.bak`). This only *generates* the bundle —
Copilot itself still runs in the IDE, not on the dashboard (no PTY/OTEL/telemetry).

### Safety

`build:copilot` will not silently clobber a `copilot-instructions.md` it didn't author: it
refuses unless `--force`, and even with `--force` it backs the existing file up to `.bak`. Its
own prior output (marked with the kit title) is overwritten freely on re-generation.

> The deterministic toolchain (gates, eval, regression corpus, telemetry, dashboard Command
> Runner) is **Claude-edition only**. The Copilot edition is the prompt layer.

## Adding another provider (e.g. Codex)

1. Add an entry to `model-config.json` with `"provider": "codex"`.
2. Add `bin/editions/codex/index.ts` (constants, mirror `claude`/`copilot`).
3. Add a generator (mirror `scripts/build-copilot-edition.ts`) that emits that provider's
   prompt/instruction format.
