# feature-from-confluence — Claude Code Agentic Workflow Kit (standalone)

> **One command. Your spec becomes convention-compliant, PR-ready code — with human-in-the-loop gates, a deterministic self-test toolchain, and a self-improvement loop.**
>
> Kit version **v3.17**. **Claude Code only** and **tech-stack agnostic** — it reads your project's conventions from `CLAUDE.md`.

## Requirements

- **Node ≥ 20** (`.nvmrc` pins 24), npm
- **Claude Code** (the slash commands live in `.claude/commands/`)
- Optional: **Playwright** (UI verification, auto-installed via devDeps) and a **Confluence MCP** (optional spec source — see below)

## Setup

```bash
npm install                         # root: installs tsx, typescript, playwright (devDeps)
# Optional spec/verification connectors (each is self-contained):
( cd .claude/mcp-server  && npm install )   # Confluence MCP (optional)
( cd .claude/mcp-workflow && npm install )   # workflow MCP (optional)
```

1. **Add a `CLAUDE.md` to your project root.** The workflow reads it for conventions (HTTP client, response transform, query library, branch, import alias, …). Copy `CLAUDE.md.template` → your project's `CLAUDE.md` and fill it in. Without it, the kit falls back to React/TypeScript defaults and warns.
2. **(Optional) Confluence:** copy `.claude/mcp-server/.env.example` → `.claude/mcp-server/.env` and fill credentials. **Never commit `.env`** (it's gitignored).

## Verify the kit

```bash
npm test          # = npm run test:kit
```

`test:kit` runs all integration suites + `version-check` + `workflow:index --check` + the prompt-budget ratchet `--gate`. The CI workflow (`.github/workflows/workflow-kit-ci.yml`) runs the same on every PR.

## Commands (Claude Code slash commands)

| Command | Purpose |
|---|---|
| `/feature-from-confluence <spec>` | Full B0–B12 workflow with confirm gates (flagship) |
| `/new-feature` | Lightweight scaffold **without** a spec |
| `/drop-mock <api.ts>` | Remove `USE_MOCK` infra when the real API lands |
| `/api-contract <feature>` | Reverse-engineer a `.http` contract from a data layer |
| `/playwright-verify <route>` | Standalone UI verification (screenshots, UX states) |
| `/codex-review` | Repo-convention branch review (complements built-in `/code-review`) |

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
