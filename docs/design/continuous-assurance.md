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

### §1.1 — Version-scoped authoritative canary evidence

The emitted schema remains `schemaVersion: 1` for the existing P0 reader, with additive report
fields `kitVersion` (canonical `N.N.0`) and `observedAt`. Every executed result carries a `canary`
envelope with its stable manifest `id`, normalized status (`passed`, `mismatch`, or `error`), the
same canonical kit version and observation instant, and a lowercase SHA-256 `evidenceHash`.
`evidenceHash` covers only the check's immutable id/kind/quarantine/status/output tuple, not report
ordering or timestamps. The digest repeats the version, observation instant, canary status, and full
hash, so an operator can trace the notification to the exact JSON evidence.

`PROMPT_VERSION` in `.claude/commands/feature-from-confluence.md` remains the sole version authority.
The shared resolver accepts exactly one `vN.N` or `vN.N.0` declaration and emits `N.N.0`.
Continuous assurance resolves it before executing any check; missing, malformed, duplicate, or
noncanonical injected values fail closed. Telemetry and verify-record startup use the same resolver
and therefore stop before any network or git-note write instead of inventing a legacy version.
Its report validator also rejects duplicate ids, a canary
whose id/version/status/time/hash does not match its result, or a digest/gate that does not bind the
exact report. v1 authoritative report, result, and canary objects reject unexpected keys; a command
output may be the empty string and is still exact evidence (shown as `(no output)` in the digest).
Existing consumers can continue reading their v1 fields; an O1 adapter must validate this
authoritative envelope before treating a canary as observed evidence.

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

### §2.1 — Refetch actor manifest entry

To put a source under the nightly battery, add a `spec-refetch-drift` check to the same signed
manifest. Its actor is a scheduler-owned **argv-only** process; O2 does not embed a Confluence URL
or token. The actor must print exactly one nonblank line:

```text
@@SPEC_REFETCH_RESULT@@ {"v":1,"sourceRef":"confluence:<page-id>","sourceSha256":"<sha256>","sourceText":"<raw fetched text>"}
```

The declared `actor.sourceRef`, sentinel `sourceRef`, and baseline `SpecIR.sourceRef` must match
byte-for-byte. The sentinel hash must equal the exact `sourceText`; O2 then stages that text through
`stageConfluenceB0Source` and `validateSpecIR` before drift comparison. Missing, duplicate, malformed,
or extra actor output is a hard error, never a skipped drift check. A configuration shape is:

```json
{
  "id": "confluence-us-123-drift",
  "kind": "spec-refetch-drift",
  "baselineIrPath": "docs/specs/US-123/.assurance/baseline-spec-ir.json",
  "actor": {
    "command": ["node", "<scheduler-owned-confluence-refetch-actor>.mjs"],
    "sourceRef": "confluence:<page-id>"
  }
}
```

The shipped `nightly.json` intentionally does not invent this entry: no approved feature baseline,
Confluence page identity, or scheduler-owned actor argv has been supplied yet. Adding a placeholder
would manufacture a permanently failing (or silently fake) safety signal.

## §3 — Quarantine semantics

Quarantine is reporting-only: a quarantined test remains in the battery and executes every night.
If it fails, the gate does not block solely because of that known flake, but Slack digest labels it
`QUARANTINED FAILED`, includes its command output, and states that it still executed. A passing
quarantined test is reported as passed. Quarantine has no silent skip mode and no inferred entries.

The attack corpus in `continuous-assurance.test.ts` proves: cosmetic spec changes produce no drift;
a semantic AC edit produces quote-level provenance; duplicate Spec-IR AC IDs fail closed; malformed
manifest sentinels are rejected; and a seeded quarantined regression still appears in the digest.
