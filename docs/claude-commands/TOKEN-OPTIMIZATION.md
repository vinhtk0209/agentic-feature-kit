# Token Optimization — lazy-loading strategy for the workflow kit

> Status: working-tree (uncommitted). Companion to `HARDENING-CHANGELOG.md`.

## Problem

`.claude/commands/feature-from-confluence.md` is **~167 KB / ~41K tokens / ~3,100 lines**
and is loaded **in full** whenever the `/feature-from-confluence` skill runs — that is
unavoidable for a skill file (the file *is* the instruction set the model executes).

The cost that *can* be removed is everywhere the workflow is consulted **without running
it end-to-end**:

- resume / overview sessions that just need "where is each feature?",
- doc-sync / maintenance sessions that need one section of the command,
- recalling a finished feature's outcome without re-reading 20+ artifacts.

Each of those previously meant fanning out across `docs/specs/*/` and/or loading the
whole command file. This document describes the lazy-load hierarchy that avoids it.

## Load hierarchy

| Tier | Load eagerly? | Files | Why |
|------|---------------|-------|-----|
| **HOT** | always (small) | `CLAUDE.md`, `docs/specs/<active>/context-summary.md`, `docs/specs/.current-feature`, `docs/specs/INDEX.md` | A few KB total. The minimum to know who/what/where. |
| **SOURCE OF TRUTH** | on demand, section-scoped | `feature-from-confluence.md` (per `##` section), `package.json`, `HARDENING-CHANGELOG.md` | Big. Load only the slice the task needs. |
| **RETRIEVAL** | grep / targeted read only | `checklist.md`, `processed.md`, `screenshots/`, BE reports, `feature-digest.md` | Bulk artifacts. Pull a field, not the file. |

## The three levers (all implemented in this change)

1. **`docs/specs/INDEX.md`** (`feature-index.ts`) — one flat table projecting every
   feature's phase / eval / finalConfirmed / last-updated from its `context-summary.md`.
   A resume/overview read is now **one small file** instead of N directory reads +
   N JSON parses. `--json` gives the same data for programmatic resume. Auto-refreshed
   by `memory.ts` on every save, so it is never stale.

2. **`feature-digest.md`** (`feature-digest.ts`) — for a `finalConfirmed` feature, a
   compact page (eval, gates, AC/browser coverage, BE findings, major fixes, known
   limitations). Recalling a done feature loads **one digest** instead of the full
   artifact set. Derived state — never a gate input, safe to delete/regenerate.

3. **Section map** (`prompt-budget.ts --toc`) — emits each `##` section of the command
   file with its **line range**, so a maintenance session can
   `Read(file, offset=<startLine>, limit=<lines>)` exactly one section (e.g. HARD RULES
   = lines 378–422, 22.7 KB) instead of the whole 41K-token file. `--toc --json` for
   tooling.

## Estimated token savings

Order-of-magnitude (1 KB ≈ 250 tokens):

| Scenario | Before | After | Saved |
|----------|--------|-------|-------|
| Resume / "list all features" | ~3 ctx files fanned out (~5–8 KB) + dir walk | INDEX.md (~0.7 KB) | **~85–90%** of the overview read |
| Recall a finished feature | full folder (~120 KB raw artifacts) | `feature-digest.md` (~2 KB) | **~98%** when only the outcome is needed |
| Edit/inspect one command section | whole file (~167 KB / 41K tok) | one section (HARD RULES 22.7 KB; most 2–12 KB) | **~70–99%** depending on section |

These are the *consultation* paths. They do **not** shrink a full workflow run — that
still loads the command file once by design (the size ratchet in `prompt-budget.json`
keeps that bounded at 168 KB).

## Tradeoffs

- **Derived state can drift from source.** INDEX.md and digests are projections. They
  are auto-regenerated on save and guarded by `npm run workflow:index -- --check`
  (wire into CI), so drift is detectable, but a hand-edit between saves is briefly stale.
- **Section reads can miss cross-references.** The command has rules that interact across
  sections (e.g. HARD RULES referenced from B5/B10). Targeted reads are for *maintenance*;
  a full run must still load the file whole. The `--toc` aid is explicitly scoped to the
  "consult one section" case.
- **Two more files per feature folder** (digest) and one repo-level file (INDEX). Small,
  regenerable, and excluded from the artifact-presence gate (not required to exist).

## Failure risks & mitigations

| Risk | Mitigation |
|------|-----------|
| A consumer trusts a stale INDEX/digest | Both regenerate on every `memory.ts save`; `--check` flags drift; both carry a "do not edit / source of truth elsewhere" banner. |
| Digest mistaken for source of truth | Banner + "never read as a gate input"; no gate consumes it; deleting it loses nothing. |
| `--toc` line ranges go stale after an edit | Regenerated live from the file on each invocation (not cached) — always current. |
| Projection code throws and blocks a save | `memory.ts` wraps both calls in try/catch and only warns — a save never fails because of the roll-up. |

## How to use

```bash
npm run workflow:index                 # refresh docs/specs/INDEX.md
npm run workflow:index -- --check      # CI: fail if INDEX.md is stale
npm run workflow:index -- --json       # cheap programmatic resume read
npm run workflow:digest -- <Feature>   # (re)write a finalConfirmed feature's digest
npx tsx .claude/integrations/prompt-budget.ts --toc          # command-file section map
npx tsx .claude/integrations/prompt-budget.ts --toc --json   # same, machine-readable
```
