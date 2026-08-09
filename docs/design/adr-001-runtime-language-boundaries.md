# ADR-001: Preserve TypeScript at workflow boundaries; introduce native sidecars only on measured need

**Status:** Accepted
**Date:** 2026-08-10
**Deciders:** Workflow-kit maintainers

## Context

The workflow kit and dashboard are TypeScript/Node systems. The request is to consider Python,
Rust, or Go where they provide a real capability or performance benefit rather than migrating by
preference.

Current evidence (2026-08-10):

- `npm run test:spec-intake` completed three times in 4,500.36 ms, 4,578.71 ms, and 4,731.28 ms
  (median 4,578.71 ms). This includes Node/tsx process startup plus 27 adapter and CLI tests; it
  is not a production hot-loop profile.
- The largest integration paths are runtime-coupled: `playwright-runner.ts` (93,695 bytes),
  `contract-probe.ts` (37,420), `b11-runner.ts` (29,505), and MCP `index.ts`.
- These paths depend directly on Playwright, the MCP TypeScript SDK, Next/Supabase conventions,
  or Node process management. Rewriting them would add IPC and duplicate security-sensitive
  contracts without evidence of a bottleneck.
- The new Spec-IR path is dependency-free TypeScript using Node `zlib`; its adapter tests and a
  live Confluence B0 golden currently pass.

## Decision

Keep TypeScript as the implementation language for dashboard UI/API, MCP integration, Playwright,
Supabase, orchestration, and current Spec-IR adapters.

Do not migrate an existing TypeScript component to Python, Rust, or Go unless a reproducible
profile proves the component itself (not process startup or network latency) consumes at least 30%
of representative end-to-end wall time and a sidecar prototype improves that workload by at least
2x while preserving the same evidence contract.

When a qualifying need exists:

- Use **Rust** for CPU-bound, deterministic byte/image/PDF processing where memory safety and a
  compiled binary improve a demonstrated throughput or latency constraint.
- Use **Python** only for a required ecosystem capability not available in the Node path (for
  example OCR, document ML, or a vetted scientific parser), never as a default rewrite target.
- Use **Go** only for an independently deployed, high-concurrency network service; no current
  kit component meets that condition.

Native components must be separate sidecars with JSON stdin/stdout or a versioned local HTTP
contract. Their input, output, exit code, SHA-256 evidence manifest, timeout, and fail-closed
error behavior must be contract-tested before replacing a TypeScript path.

## Options Considered

### Option A: Keep TypeScript at current boundaries

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Capability fit | High for current Node/MCP/Playwright stack |
| Performance evidence | No measured bottleneck requiring migration |
| Operational risk | Low |

**Pros:** preserves one test/runtime model and existing security gates.

**Cons:** does not preemptively optimize CPU-heavy workloads that may appear later.

### Option B: Rewrite current integrations in Python, Rust, or Go now

| Dimension | Assessment |
|---|---|
| Complexity | High |
| Capability fit | Low for UI/MCP/Playwright paths |
| Performance evidence | Missing |
| Operational risk | High due to IPC and duplicated contracts |

**Pros:** could benefit a future proven CPU-bound hot path.

**Cons:** weakens current evidence continuity and adds multiple toolchains without a verified gain.

### Option C: Add measured native sidecars only when a threshold is met

| Dimension | Assessment |
|---|---|
| Complexity | Medium, deferred |
| Capability fit | High for qualified CPU/OCR/service workloads |
| Performance evidence | Required before adoption |
| Operational risk | Controlled by versioned contract and fail-closed tests |

**Pros:** enables Rust/Python/Go where useful without speculative rewrites.

**Cons:** requires benchmark corpus and sidecar contract maintenance when triggered.

## Consequences

- No existing TypeScript file is migrated by this decision.
- New performance work starts with a reproducible benchmark and profiling evidence.
- A later sidecar change must include a baseline-versus-candidate benchmark, contract attack tests,
  and an evidence manifest before it can replace a TypeScript implementation.
