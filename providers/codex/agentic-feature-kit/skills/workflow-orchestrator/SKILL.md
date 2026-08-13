---
name: workflow-orchestrator
description: Run or resume the Agentic Feature Kit workflow through bounded, content-addressed phase envelopes without weakening human or computed gates. Use for spec-driven feature delivery that must preserve B0-B12.8 ordering, evidence, resume semantics, and provider-neutral parity across Codex, Claude Code, or GitHub Copilot.
license: Apache-2.0
---

# Workflow Orchestrator

Use the provider-neutral Orchestrator contract. Do not copy phase rules into provider-specific
instructions or treat a provider action/transport smoke as workflow parity.

## Required inputs

Before execution, require all of the following:

- a validated Project Profile from the `project-intelligence` skill;
- the versioned boundary contract at `docs/roadmap/post-17-orchestrator-boundaries.json`;
- the sanctioned comparison baseline at `docs/roadmap/post-17-orchestrator-golden.json`;
- a resolved spec source and feature identity;
- explicit authorization for any external write, install, sync, push, publication, or provider run
  that the current task actually needs.

If an input is missing or contradictory, stop before running a phase.

## Run or resume

1. Call the shared Orchestrator CLI through stdin, never by interpolating untrusted JSON into a
   shell command:
   `npx tsx packages/core/src/workflow-orchestrator-cli.ts resume`.
2. Trust only the single `@@ORCHESTRATOR_RESULT@@` envelope. A nonzero exit, malformed envelope,
   invalid hash, broken predecessor, missing artifact, extra artifact, or contract mismatch blocks.
3. Resume at `resumeFromPhase`. Never replay a completed intake phase and never skip the first
   missing or incomplete mandatory phase.
4. Load only the current phase boundary and the shared implementation guidance needed for that
   phase. Keep the eight stage groups bounded: INTAKE, SCOPE, DESIGN, APPROVE, PREP, BUILD, DONE,
   and LEARN.
5. After the phase, produce every declared output or an explicit supported skip record, build and
   verify content-addressed evidence, then create and validate the next chained phase envelope.
6. Re-run resume validation before advancing. A phase is not complete because an agent says so.

## Gate ownership

- Provider adapters never auto-approve a gate.
- B9 requires literal human approval; explicit autonomy is not a substitute.
- B11 requires the trusted verifier's computed pass. Never accept a model-supplied `verified` flag.
- B12 derives from trusted verification and ratio policy; only the main orchestrator may claim done.
- `D-cross-2` remains conditional and never changes the 23-phase mandatory resume order.
- An awaiting or failed gate returns control to the main task with exact evidence; a worker cannot
  continue independently.

## Parallel work

Parallelize only phases the boundary contract marks as parallel and only after their predecessors
are verified. Give each worker bounded inputs and an isolated output set. The main orchestrator
validates all returned evidence, merges once, and runs the unchanged final gate. Do not dispatch
unbounded agents or let provider-specific behavior alter phase ordering.

## Conservation and completion

Before claiming provider parity or completion, invoke the shared golden comparison and require no
issues for input identity, mandatory/conditional phase coverage, gate semantics, artifact classes,
trusted Tier A/Tier B verification, and resume result. Report semantic quality, evidence, gates,
latency, cost, and provider metadata separately.

Do not edit target `.Codex` directories directly. Do not sync, push, publish, install packages, or
perform external writes unless the user has explicitly authorized that operation. If the shared
core or locked contracts are unavailable, stop rather than substituting provider heuristics.
