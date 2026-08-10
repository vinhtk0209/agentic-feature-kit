# O2 — Continuous Assurance

Status: §1–3 implemented as a source-only kit slice. Scheduler registration and Slack transport
remain consumers outside this document: they must invoke the signed manifest runner and preserve
its full stdout transcript. No consumer may convert a failing or malformed run into a green event.

## §1 — Nightly battery contract

The battery command is:

```text
npx tsx .claude/integrations/continuous-assurance.ts run .claude/assurance/nightly.json --json
```

`.claude/assurance/nightly.json` is a typed data manifest with exactly one top-level
`"sentinel": "continuous-assurance/v1"`. Missing, malformed, or duplicate sentinel is a hard
error **before any test executes**. Check IDs and quarantine IDs are unique; a quarantine for an
unknown check is also a hard error. Commands are argv arrays and are run with `shell: false`.
The built-in contract check calls `probeContractDetailed` from `contract-probe.ts`, preserving the
existing AST/.http parser rather than creating a second contract reader.

The runner executes every declared check and emits an auditable JSON report. A non-quarantined
failure makes `gatePassed=false` and process exit 1. This boundary intentionally has no database
write, scheduler mutation, or Slack HTTP call. P0 stores the emitted JSON as the phase probe
transcript; the authorized notification actor can send `slackDigest` verbatim.

## §2 — Spec-drift detector

The scheduler's fetch step must use the canonical B0 adapter to produce a fresh validated `SpecIR`.
O2 compares that output with the baseline via:

```text
npx tsx .claude/integrations/continuous-assurance.ts drift baseline-ir.json refetched-ir.json --json
```

Both sides run `validateSpecIR`; invalid schema, duplicate AC IDs, broken anchors, or fake quotes
therefore stop the comparison fail-closed. The detector compares the AC **set**, not position or
number: whitespace, case, terminal punctuation, and `AC-1` formatting do not flag drift. A semantic
edit reports the former and current AC IDs, literal source quotes, and source anchors. This makes a
human review byte-traceable back to each source version rather than trusting a generated summary.

## §3 — Quarantine semantics

Quarantine is reporting-only: a quarantined test remains in the battery and executes every night.
If it fails, the gate does not block solely because of that known flake, but Slack digest labels it
`QUARANTINED FAILED`, includes its command output, and states that it still executed. A passing
quarantined test is reported as passed. Quarantine has no silent skip mode and no inferred entries.

The attack corpus in `continuous-assurance.test.ts` proves: cosmetic spec changes produce no drift;
a semantic AC edit produces quote-level provenance; duplicate Spec-IR AC IDs fail closed; malformed
manifest sentinels are rejected; and a seeded quarantined regression still appears in the digest.
