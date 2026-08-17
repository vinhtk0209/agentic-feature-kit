# I1 Deterministic Feature Identity and B0 Budget Evidence

## Live defect

Run `add64975-1b07-4f28-96e1-49662562c370` processed Confluence ticket `US-AD-095` but derived `US-AD-095-ClassDetailsProgressReports` instead of reusing the unique existing `US-AD-095-ProgressReports` folder. The different identity hid the valid prior B0 bundle. The run then attempted three new B0 bundles, including raw source and Spec-IR combinations, and correctly failed after all exceeded the 4,000-token budget. It emitted a canonical `B0` error and the dashboard rejected the partial exit as `missing_terminal_phase`.

No over-budget override, phase skip, feature implementation, push, or sync occurred.

## Contract correction

- `feature-identity.ts` resolves one ticket to one canonical `docs/specs/<ticket>-*` folder.
- A unique existing ticket folder wins regardless of title wording in a new session.
- Multiple matching folders fail closed before any write instead of choosing enumeration order.
- Malformed ticket IDs and traversal-like suggested names fail closed.
- The CLI emits exactly one `@@FEATURE_IDENTITY@@` v1 sentinel; the exact parser rejects missing, malformed, duplicate, or extra output.
- B0 evidence is now explicitly limited to `task-type.md` plus a short non-sensitive transcript containing the source reference/hash, counts, classification, score, and implementation folder.
- Raw `.incoming-spec.md` and `.incoming-spec.ir.json` are forbidden B0 bundle inputs because their provenance can be represented within budget without hashing the full payload into the phase context.

## Test evidence

- RED: `feature-identity.test.ts` failed with `MODULE_NOT_FOUND` before the resolver existed.
- GREEN: `npm run test:feature-identity` — 7 passed, 0 failed.
- Integrated P1 boundary: evidence bundle 31 passed plus identity 7 passed.
- Full regression: `npm run test:kit` — exit code 0 in 146.8 seconds.
- Prompt budget: 161,779 bytes, below the 172 KB gate.

The duplicate failed-run folder remains only as local forensic input until it is backed up and removed from the next capture retry.
