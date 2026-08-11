# I1 Canonical Error Phase Evidence

## Live defect

Run `1c5ea7dc-08c8-44df-b86d-d47d8001f081` executed the trusted telemetry producer with a descriptive phase label:

```text
npx tsx .claude/integrations/telemetry.ts error step_failure "B0 — Evidence Bundle" "..."
```

The producer emitted an `error` event whose `phase` was not part of the canonical kit phase grammar. The dashboard correctly rejected that event as `malformed_kit_event`. The same run had already emitted valid trusted `meta` and `state B0` events, so this was isolated to the error producer call.

## Contract correction

- Error telemetry now accepts only canonical phase IDs such as `B0`, `B2`, and `D-cross-2`.
- A descriptive phase fails with exit code 2 before error telemetry or marker output.
- The workflow failure protocol now supplies `<canonical-phase-id>` and explicitly forbids a human-readable step label.
- A valid error event still binds the exact dashboard-provided run nonce.

## Test evidence

- RED: `npm run test:telemetry` — 13 passed, 1 failed because `B0 — Evidence Bundle` returned exit code 0.
- GREEN: `npm run test:telemetry` — 15 passed, 0 failed.
- Regression: `npm run test:kit` — exit code 0 in 137.6 seconds.
- Prompt budget: 159,662 bytes, below the 172 KB gate.

No live sync, push, database mutation, or credential output occurred.
