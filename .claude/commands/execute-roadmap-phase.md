---
description: Execute one ROADMAP-AUTONOMOUS-SDLC.md §C phase by id — re-verify its hard_deps against disk, then run that phase's own design-doc-first workflow
---

<!--
  execute-roadmap-phase — SKELETON (p0-scheduler-engine, sub-pass 2 of 4)

  This pass defines the INPUT CONTRACT and BEHAVIOR SPEC only. Two pieces are not yet wired:
    - Engine dispatch (sub-pass 3): kit-dashboard/server/orchestrator.ts is proposed (not
      built) to call launch({command: 'execute-roadmap-phase', args: phase.id, trigger:
      'roadmap'}) once per tick, per orchestrator.md §4.5. Until that lands, this command has
      no automatic caller — it is invoked manually by an operator, same as any other kit
      slash-command.
    - Guard-denylist enforcement (sub-pass 4): orchestrator.md §6's GUARD_DENYLIST (real
      `npm run sync`, git commit/push, Supabase migration/data-write, `record-verify.ts`
      capture, token minting) is a pre-dispatch screen that does not exist yet. This skeleton
      does NOT implement any pattern-matching or automated refusal — see the STOP conditions
      below, which state the same six action families as a manual, prose-level check the
      operator/session must honor by hand until sub-pass 4 replaces it with real enforcement.

  Do not extend this command with dispatch code or denylist regexes outside those two sub-passes.
-->

Phase id: **$ARGUMENTS**

Re-read `ROADMAP-AUTONOMOUS-SDLC.md` fresh on every invocation — never rely on a prior session's
memory of a phase's fields, and never trust any stored/cached status (e.g. a `phase_queue.status`
row, if this command is ever invoked downstream of the orchestrator) as the gate. Stored status is
a denormalized display copy; disk is the only source of truth (§5).

## Steps

1. **Validate input.** If `$ARGUMENTS` is empty or blank, STOP and ask the user for a phase id
   (the same ids that appear as both `§A` YAML `id:` fields and `§C` `### <id> — <title>`
   headers in `ROADMAP-AUTONOMOUS-SDLC.md`, e.g. `p0-scheduler-engine`).

2. **Locate the phase.** In `ROADMAP-AUTONOMOUS-SDLC.md`:
   - `§A. ROADMAP.yaml` — find the entry whose `id:` equals the given phase id. This is the
     machine-readable record: `title/repo/layer/independently_shippable/hard_deps/soft_deps/
     parallelizable_with/contract_change/precondition_probe/definition_of_done/
     estimated_canary_count/risk_level/is_bootstrap_milestone`.
   - `§C. Phase specs` — find the matching `### <id> — <title>` section. This is the
     human-prose record: **Goal**, **Why now**, optionally **Scope**/**Chosen vs rejected**,
     **Design doc first**, **Attack-tests**, and any phase-specific notes (e.g. **Reverse-sync
     discipline**).
   - Phase id not found in either section ⇒ STOP, report the id was not found, list the
     `id:` values that do exist in §A so the user can correct a typo. Do not guess a
     near-match.

3. **Re-verify hard_deps against disk — before doing anything else in this phase.** For every
   entry in this phase's `hard_deps` (from its own §A record, step 2): look up **that
   dependency's own** `precondition_probe` and `definition_of_done` from §A — not this phase's
   copy of anything, not a cached result from an earlier run, not a `phase_queue` denormalized
   status. Execute/read the dependency's `precondition_probe` fresh, right now, and confirm its
   `definition_of_done` actually holds on disk. Probes are read-only by the roadmap's own
   invariant (`ROADMAP-AUTONOMOUS-SDLC.md:9`, "All probes are READ-ONLY") — do not run anything
   beyond what the probe text itself specifies.
   - A hard_dep that does not clearly re-verify (mismatch, error, or a probe whose prose is
     ambiguous enough that pass/fail isn't clearly demonstrated) ⇒ STOP. Report the raw
     probe output for that dependency verbatim and do not proceed — do not infer "pass" from
     the absence of an obvious failure, and do not silently adapt the plan around a dep that
     hasn't actually re-verified (§5.1–§5.2; no machine-checkable sentinel convention exists
     yet, so this step is judgment-based prose evaluation, not a scripted exit code).
   - All hard_deps re-verify ⇒ proceed to step 4.

4. **Execute the phase's own design-doc-first workflow.** Open the doc named at this phase's
   §C **Design doc first** line. Follow that phase's own **Goal**, **Scope** (if present),
   **Chosen vs rejected** (if present), and **Attack-tests** exactly as written in §C — this
   command does not re-derive, re-scope, or substitute judgment for what the phase spec already
   states. If the design doc is marked as not yet written or not yet approved (e.g. "needs
   review approval, not authoring"), STOP and report that the phase is blocked on a design
   decision that is not this command's to make.

5. **Guard boundary — STOP conditions (manual for now; TODO for sub-pass 4).** Before taking any
   action that falls into one of the six operator-only families below — whether required by
   the phase's own workflow, its attack-tests, or any step along the way — STOP and hand back
   to the operator for explicit confirmation. Do not perform the action yourself, do not find a
   workaround, and do not treat "the guard isn't wired yet" as license to proceed:
   - Real `npm run sync` (i.e. NOT `npm run sync:dry`), or either of its named escape hatches
     (`--force-dirty`, `--force-unverified`).
   - `git commit` / `git push` (any form, any repo in this workspace).
   - A Supabase migration apply, or any Supabase data write (DDL, `insert`/`update`/`delete`
     against Supabase — read-only `GET .../rest/v1/...` probes are fine).
   - A `record-verify.ts` capture (direct invocation or any `npm run` script wrapping it).
   - Token minting (`workflow:login`-style commands, admin-bypass-code creation).
   - Design-review sign-off — this is a human-judgment call, not a shell action; ask for it
     explicitly rather than assuming approval.
   > **TODO — sub-pass 4:** replace this manual, prose-level check with the real
   > `GUARD_DENYLIST` pre-dispatch screen (orchestrator.md §6: allowlist-first, then denylist
   > pattern match on the assembled command+args and on probe text). Not implemented here —
   > this skeleton pass adds no regex, no pattern-matching code, and no automated refusal
   > logic; the bullets above are the same six-family list carried as prose only.

6. **Report** to the user: phase id + title; hard_deps checked and their re-verify result
   (pass per-dep, or the STOP in step 3); design doc opened (path); what the phase's own
   workflow requires next; and, if step 5 triggered, exactly which guarded action it was and
   what the operator needs to do to unblock it. If the run completed the phase's
   `definition_of_done` without hitting a step-5 STOP, say so plainly — do not report success
   on a phase that never reached its own definition_of_done.
