---
description: Split an oversized spec into N independently-consumable sub-features with a proven dependency ordering
---

Target spec: **$ARGUMENTS** (a raw-US/Word/PDF/Excel file path, or an existing `docs/specs/<Feature>/raw-spec.md`)

The SPLIT DECISION (which ACs go in which sub-feature, dependency ordering, AC-conservation) is
**deterministic tooling** (`.claude/integrations/feature-splitter.ts`), not judgment made in this
step — see `docs/design/spec-intake-ir.md` §5-6. This command's job is to run that tooling and
write its output to disk; it must not re-group ACs by hand.

## Steps

1. **Build the Spec-IR.** Pick the adapter by the target's extension/kind (`.claude/integrations/`):
   `spec-intake-raw-us.ts` (`adaptRawUs`) for a `.md`/plain-text spec, `spec-intake-docx.ts`
   (`adaptWord`) for `.docx`, `spec-intake-pdf.ts` (`adaptPdf`) for `.pdf`, `spec-intake-xlsx.ts`
   (`adaptExcel`) for `.xlsx`. If the target is a `docs/specs/<Feature>/checklist.md` or similar
   already-generated artifact rather than a raw source, read `raw-spec.md` in that folder instead
   (raw-US path). Write the resulting `SpecIR` JSON to a scratch file.

2. **Tag areas, if useful.** If the spec is large enough to warrant grouping by feature area rather
   than plain size-chunking, and the raw text doesn't already carry `[Area: X]` markers, ask the
   user whether to annotate ACs with `[Area: <name>]` (and optionally `[DependsOn: <area>]`) before
   splitting — do not silently invent areas by re-reading the tooling's size-mode fallback as a
   flaw; size mode is a valid, intentional default (docs/design/spec-intake-ir.md §5).

3. **Run the splitter:**
   ```
   npx tsx .claude/integrations/feature-splitter.ts <scratch-spec-ir.json> [--max-acs-per-subfeature N]
   ```
   - `CyclicSplitDependencyError` → STOP, report the cycle verbatim to the user; do not attempt to
     break it by hand (fail-closed by design).
   - `AcConservationError` → STOP, this means the tooling itself has a bug; report it, do not paper
     over it with a manual edit to the output.
   - A `warnings[]` entry naming an oversized area → surface it to the user; do not silently ship
     an over-cap sub-feature.
   - `degenerate: true` (1 sub-feature) → tell the user the spec did not need splitting; ask
     whether to proceed anyway or skip the split.

4. **Write outputs.** For each `subFeatures[]` entry, create
   `docs/specs/<parentName>-<suffix>/raw-spec.md` containing that sub-feature's ACs verbatim (each
   AC's `text`, in order) plus a header noting the parent spec and this sub-feature's `dependsOn`
   list. Write the full tool JSON output to `docs/specs/<parentName>-<suffix-root>/SPLIT.json` at
   the parent level (not inside any one sub-feature folder) as the single source of truth for the
   dependency ordering.

5. **Report** to the user: N sub-features, their names, the dependency order, any warnings
   (oversized area / degenerate split), and the suggested branch name for each
   (`feature/<parentName>-<suffix>`, per this workspace's default-branch convention). Each
   sub-feature's `raw-spec.md` is independently consumable by a fresh
   `/feature-from-confluence docs/specs/<parentName>-<suffix>/raw-spec.md` run — nothing in B0
   needs the parent spec or sibling sub-features beyond the ordering already recorded in
   `SPLIT.json`.
