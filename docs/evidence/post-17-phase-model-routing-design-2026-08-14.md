# P17-006 phase-aware model routing design checkpoint — 2026-08-14

## Result

The P17-006 system design is locked before implementation. The task advances from `ready` to
`in_progress`; no router runtime, provider execution, workflow wiring, credential access, install,
publication, sync, push, or target `.Codex` edit is part of this checkpoint.

The design keeps the existing B0–B12 workflow unchanged and introduces an additive pure decision
boundary only. All current real candidates remain non-routable until P17-007 supplies exact
same-input phase qualification evidence.

## Locked architecture

- Pure TypeScript domain function for request/candidate/matrix validation and deterministic decisions.
- Bounded CLI adapter with a 512 KiB stdin cap, at most 32 candidates, a trusted injected clock,
  one structured sentinel, and no raw dependency errors.
- Exactly three outcomes: `selected`, `no_model`, or `needs_input`.
- Closed reason codes, stable SHA-256 decision identity, explicit fallback lineage, no permission
  escalation, and no automatic provider switch.
- One byte-identical fifth runtime shared by the Codex, Claude, and Copilot distributions; no
  fabricated Codex standalone-agent manifest or Copilot plugin manifest.
- Provider bundle release `0.4.0` to `0.5.0` and shared core `1.2.0` to `1.3.0`, while all existing
  four runtimes and orchestrator envelopes remain usable.

The complete architecture, contracts, algorithm, evidence ladder, rollout, rollback, and language
decision are in `docs/roadmap/p17-006-phase-model-routing-plan.md`.

## Design gate

```text
npm run test:post-17-phase-routing-plan
  PASS (16 sections, 24 phases, 5 conditions, architecture/version/security/rollback contracts)

npm run test:post-17-phase-capabilities
  PASS (24 phases, 7 official sources, 15 negative controls)

npm run test:post-17-roadmap
  PASS (22 tasks, 4 initiatives)

git diff --check
  exit 0
```

Three initial fail-closed plan-validator results are retained in `HANDOFF.md` and
`POST-17-HANDOFF.md`. They were exact documentation-contract mismatches (`100 ms p95`, pure domain
function, and a line-wrapped compatibility statement), not runtime failures. The validator was not
weakened.

After the design gate passed and P17-006 advanced to `in_progress`, the focused status proof was
rerun:

```text
npm run test:post-17-phase-routing-plan
  PASS
npm run test:post-17-phase-capabilities
  PASS (24 phases, 7 official sources, 15 negative controls)
npm run test:post-17-roadmap
  PASS (22 tasks, 4 initiatives)
git diff --check
  exit 0
```

The first exact-file secret scan was invalid: under StrictMode, its one positive-control match was
a scalar without `.Count`, so the wrapper stopped before scanning any file. The authoritative rerun
used explicit array coercion, verified all ten cross-repo checkpoint files existed, passed one fake
secret positive control, and found zero secret-pattern hits. The invalid zero-result is not used as
evidence.

## Next authorized slice

Implement and attack-test the request/decision schemas, pure domain router, bounded CLI, generated
provider runtime, and thin provider guidance. Canonical candidates must still resolve to
`needs_input`; only synthetic qualified fixtures may prove `selected` until P17-007 closes the real
qualification gap.
