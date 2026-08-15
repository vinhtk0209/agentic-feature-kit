# feature-from-confluence — Claude Code Agentic Workflow Kit (standalone)

[![Workflow Kit CI](https://github.com/vinhtk0209/agentic-feature-kit/actions/workflows/workflow-kit-ci.yml/badge.svg)](https://github.com/vinhtk0209/agentic-feature-kit/actions/workflows/workflow-kit-ci.yml)

> **One command. Your spec becomes convention-compliant, PR-ready code — with human-in-the-loop gates, a deterministic self-test toolchain, and a self-improvement loop.**
>
> Kit version **v3.25**. The flagship workflow currently runs in Claude Code. Post-17 provider-neutral
> capabilities are being released incrementally for Codex, Claude Code, and GitHub Copilot under
> `providers/`; each capability declares its own readiness and compatibility boundary.

## Requirements

- **Node ≥ 20** (`.nvmrc` pins 24), npm
- **Claude Code** (the slash commands live in `.claude/commands/`)
- Optional: **Playwright** (UI verification, auto-installed via devDeps) and a **Confluence MCP** (optional spec source — see below)

## Provider packages (post-17)

The versioned provider source packages live under `providers/`, while all shared business rules
live once under `packages/core/`. **Project Intelligence** profiles repository facts; the
fingerprint-bound **Stack Portability** contract then resolves framework layout, HTTP transport,
mapping helpers, and target-specific assumptions without provider heuristics. The additive
**Phase Model Router** then makes content-addressed `selected`, `no_model`, or `needs_input`
decisions from explicit qualification evidence without executing a provider.

| Provider | Supported source surface | Current status |
|---|---|---|
| Codex | `.codex-plugin/plugin.json` + Agent Skills | Self-contained directory + deterministic ZIP `0.5.0` |
| Claude Code | `.claude-plugin/plugin.json` + skills + read-only agents | Self-contained directory + deterministic ZIP `0.5.0` |
| GitHub Copilot | `.github/skills` + `.github/agents/*.agent.md` | Self-contained repository bundle + deterministic ZIP `0.5.0` |

Run `npm run build:providers` to generate all three distributions under ignored
`dist/provider-bundles/0.5.0/`. Every bundle carries the same five Node 20+ shared runtimes
(Project Intelligence, Stack Portability, Conditional Quality Gates, Workflow Orchestrator, and
Phase Model Routing),
schemas/contracts, Apache-2.0 license, content-addressed manifest, and release checksum. The clean
distribution suite executes all five capabilities from extracted archives without `tsx`, a source
checkout, or repository `node_modules`. See `providers/README.md` for provider-specific use and
verification. No installation, package publication, marketplace registration, provider execution,
sync, or push is performed by the build/test flow.

## Setup

```bash
npm install                         # root: installs tsx, typescript, playwright (devDeps)
# Optional spec/verification connectors (each is self-contained):
( cd .claude/mcp-server  && npm install )   # Confluence MCP (optional)
( cd .claude/mcp-workflow && npm install )   # workflow MCP (optional)
```

1. **Optionally add a `CLAUDE.md` to your project root.** The workflow combines explicit instructions with observed manifests/imports. Missing or conflicting required evidence returns `needs_input`; it does not manufacture React, HTTP-client, transform, or alias defaults.
2. **(Optional) Confluence:** copy `.claude/mcp-server/.env.example` → `.claude/mcp-server/.env` and fill credentials. **Never commit `.env`** (it's gitignored).

## Verify the kit

```bash
npm test          # = npm run test:kit
```

`test:kit` runs all integration suites + `version-check` + `workflow:index --check` + the prompt-budget ratchet `--gate`. The CI workflow (`.github/workflows/workflow-kit-ci.yml`) runs the same on every PR.

## Syncing the kit to target repos (workspace)

This kit is the **source of truth**. Use the sync script to push it into the repos that consume it (one-way, source always wins):

Real sync is fail-closed: the current kit version must have a live `verified=true` record before any
target write begins. The only explicit override is `--force-unverified "<reason>"`; dirty source
also requires `--force-dirty`. Use `npm run sync:dry` for safe preview and guard verification.

```bash
npm run sync          # copy allowlisted paths -> target repos, then report versions
npm run sync:dry      # preview only (no files written, no Supabase write)
```

- Targets + paths are declared in **`sync.config.json`** (`targets`, `syncPaths`). Only allowlisted paths (`commands/`, `integrations/`, `templates/`, `_content/`, `prompt-evolution.md`) are touched — anything else in a target (e.g. `.env`, `mcp-server/`) is left alone.
- After an authorized, guard-approved copy, the script records each target's installed `PROMPT_VERSION` into Supabase (`installs` table) so the dashboard can show "installed vs running" per repo. Only this reporting step is **best-effort** — a reporting network failure warns after the guarded file sync; it does not bypass the pre-sync verification guard.
- Supabase creds for the report come from the kit's own **`.env`** (`SUPABASE_URL`, `SUPABASE_ANON_KEY`; public anon key, RLS-protected). Missing creds → report skipped with a warning.

## Database migrations (Supabase)

SQL in **`migrations/`** is run **manually** in the Supabase SQL editor (the scripts never run DDL):

| File | Purpose |
|---|---|
| `0001_installs.sql` | `installs` table — version synced onto each repo (written by `npm run sync`) |
| `0002_repo_runs.sql` | `repo_runs` table — historical per-repo run-version rows; new upserts are paused by P17-016 B2C until a tenant-attested Wave C sink exists |

Both schemas retain anon + RLS policies. The dashboard joins stored rows per-repo on `/versions`,
but `repo_runs` must be treated as historical/stale while tenant-safe central reporting is paused.
Successful `telemetry verify` now emits a closed local privacy receipt instead of writing that table.

## Commands (Claude Code slash commands)

| Command | Purpose |
|---|---|
| `/feature-from-confluence <spec>` | Full B0–B12 workflow with confirm gates (flagship) |
| `/new-feature` | Lightweight scaffold **without** a spec |
| `/drop-mock <api.ts>` | Remove `USE_MOCK` infra when the real API lands |
| `/api-contract <feature>` | Reverse-engineer a `.http` contract from a data layer |
| `/playwright-verify <route>` | Standalone UI verification (screenshots, UX states) |
| `/codex-review` | Repo-convention branch review (complements built-in `/code-review`) |

> **Run these from a browser:** the companion **kit-dashboard** ships a **Command Runner** (`/run`)
> that launches these commands on any repo without a terminal — live output, interactive gates, and
> per-run token/cost telemetry on `/performance`. See `kit-dashboard/README.md`.

## Spec sources are pluggable

`/feature-from-confluence` accepts the spec from any of:
**Confluence (optional MCP)** · **PDF** · **Word** · **local markdown** · **pasted text**.
The Confluence MCP (`.claude/mcp-server/`) is a **reference connector, not a hard dependency** — if it isn't configured, use any other source. See the command file's `## ARG VALIDATION` / `B0` for the contract.

## Where to read more

- `.claude/SETUP.md` — files in the kit + setup detail
- `docs/claude-commands/README.md` — full developer guide (English; `README.vi.md` is a may-lag translation)
- `docs/claude-commands/INTEGRATIONS.md` — toolchain wiring map, dependency graph, data-flow
- `docs/claude-commands/TOKEN-OPTIMIZATION.md` — context/lazy-load strategy

## Security

`.env` files hold credentials and are gitignored — **never commit them**. Ship only `.env.example`.
