## §10 — Checklist gate semantics: HR35/HR36 resolution + AC-level declared-defer (LOCKED 2026-07-20)

> **Status: LOCKED 2026-07-20.** Decisions D1–D6, the attack-test suite (§10.5, T1–T8) and the
> canary split (§10.8, C1→C2→C3→C4) are all closed; do not re-open without an explicit operator
> unlock. **No code has been written for §10** — this lock authorizes the canaries, it does not
> record them as done. All anchors re-verified against working tree `2dfe4b4` (clean) on 2026-07-20;
> where a probe-era claim drifted, the drift is called out inline rather than silently restated.

### 10.0 — Problem statement: why HR35 is structurally unsatisfiable today

HR35 (`checkVerifiedRatio`, `lint-feature.ts:280-289`) computes `total = cl.totalUi + cl.totalAct`
(`:282`) and fails the gate below `min`. Four independent defects make a passing ratio unreachable by
honest capture.

**(a) Writer/reader cell mismatch.** `updateChecklistRows` (`playwright-runner.ts:589-611`) builds
`statusIcon = v.passed ? '✅ Pass' : '❌ Fail'` (`:593`) and writes it into the **Status** cell —
`cells[3]` on the ≥5-cell branch (`:599-602`), `cells[2]` on the 4-cell branch (`:603-606`) — while
the **evidence** cell receives `v.evidence`, free-form text that carries no ✅. The HR35 fallback
reader `finalCellVerified` (`lint-feature.ts:151-160`) counts a ✅ **only** in the final cell:
`last = cells[cells.length - 2] || cells[cells.length - 1]` (`:156`), i.e. the evidence cell of a
well-formed row. The writer and the reader therefore address **different cells**: capture flips do
not move the count.

Measured on the live target checklist
(`tempp/isu-elearner-authoring/docs/specs/US-AD-095-ProgressReports/checklist.md`) on 2026-07-20 by
replaying `finalCellVerified` verbatim: **ACT = 1, UI = 0 → 1/38 = 3%**. The single hit is
`ACT-AC11` (`checklist.md:89`), whose evidence cell contains a literal embedded newline, splitting
the row across two physical lines so that the *first* physical line terminates at the Status cell —
making the Status cell coincidentally the "final cell" for that line. Every well-formed sibling row
(e.g. `ACT-AC8`/`AC9`/`AC10`, which all read `✅ Pass` in Status) is **not** counted. ACT-AC11's 1/38
is an accident of a 2-line row split, **not** design.

**(a2) — NEW, not in the probe: the ≥5-cell branch is column-misaligned for the UI table.** The UI
table header is `| # | Component | Screen | Check | Status |` (`checklist.md:29`) — 5 columns with
Status **last**. `updateChecklistRows` takes its `cells.length >= 5` branch (`:599-602`), which is
written for the ACT layout `id|desc|tool|status|evidence` and assigns `cells[3] = statusIcon`,
`cells[4] = v.evidence`. Applied to a UI row that means the status icon **overwrites the Check
description** and the evidence text **overwrites the Status cell**. This is latent, not yet observed:
all 16 UI rows still read `⬜` (`0/21` per Summary `:139`), so no UI verdict has ever been written.
It becomes live the moment UI verdicts start flowing, and it is destructive (it erases spec text).
The same drift exists inside the ACT table: written rows have drifted to `id|desc|status|evidence`
while the header (`checklist.md:68`) and the untouched `enforced-by:BE` rows (`:91-97`) still follow
`id|desc|screen|status`. **Consequence for §10.3: "the Status cell" is not at a fixed index**, so the
writer fix must resolve the column by header, not by cell count.

**(b) Summary path lacks BE exclusion.** `countSection` (`playwright-runner.ts:629-645`) counts every
data row in a section — `pass: dataRows.filter((l) => l.includes('✅'))` (`:641`) — with **no**
`enforced-by: BE` filter, so BE rows stay in `total`. `icon()` (`:659-664`) returns `'✅'` only when
`s.pass === s.total` (`:662`), else `'⚠️'`/`'❌'`. Any section holding a `⚠️` BE row can therefore
never render `✅`. The HR35 reader only accepts the Summary as authoritative when it can match
`✅ X/Y` (`lint-feature.ts:141`); `verifiedSource` falls back to `'row-scan'` whenever no such pair
exists (`:149`). Live confirmation: Summary reads `❌ 0/21 verified` and `❌ 12/30 verified`
(`checklist.md:139-140`) — no `✅` pair → `summaryPair` returns `null` for both → HR35 falls back to
row-scan permanently, straight into defect (a).

**(c) HR36: ACT-BR2/BR6 uncovered (91%).** `checkAcCoverage` (`lint-feature.ts:267-277`) flags
`uncovered = cl.actIds.filter((id) => !tested.has(id))` (`:270`). `ACT-BR2`
(`computeAttendanceRate`, `checklist.md:103`) and `ACT-BR6` (`groupSubmissionsByDay`, `:107`) are the
two uncovered rows: 20/22 = 91%. Both computations are **BE-owned**; FE mapping fidelity for the same
data path is already co-verified by the BR1/BR3 tests.

**(d) AC-1/AC-2 structural exclusivity.** AC-1 requires data-**PRESENT** and AC-2 requires
data-**ABSENT** on the same class/route. No single-route capture can satisfy both. Empirically
confirmed 2026-07-19: retargeting a second route (class-1001) dragged in a pre-existing
out-of-feature preview/certificate bug plus a double-capture, making the gates strictly worse — the
attempt was reverted.

### 10.1 — D1 LOCKED: HR36 resolution = `enforced-by:BE` on ACT-BR2/BR6

Mark `ACT-BR2` (`checklist.md:103`) and `ACT-BR6` (`:107`) with `<!-- enforced-by: BE -->`, following
the existing precedent of `ACT-AC12`/`AC13`/`AC17`/`AC18` (`:91-97`). This is a **target-only
checklist edit** — a spec artifact, not kit code.

Effect per the verified path: `grab` skips any line matching `/<!--\s*enforced-by:\s*BE/i`
(`lint-feature.ts:125`) before collecting ids, so `actIds` drops **22 → 20**; `checkAcCoverage`
(`:270`) then finds `uncovered = []` → coverage **100%** (`:273`). Measured baseline 2026-07-20:
unique BE-excluded ACT ids = 22, UI ids = 16.

**This does NOT resolve HR35.** It shrinks the ACT denominator by 2 but leaves the writer/reader
mismatch (a) fully intact; the numerator stays at 1.

### 10.2 — D2 LOCKED: unified `enforced-by:BE` exclusion across all three paths

**Invariant: a row marked `enforced-by:BE` is invisible to all three computations.**

| # | Path | Anchor | State |
|---|------|--------|-------|
| 1 | HR36 coverage set | `checkAcCoverage` `lint-feature.ts:267-277`, fed by `grab :125` | already excludes ✔ |
| 2 | HR35 row-scan denominator | `grab` `lint-feature.ts:125` | already excludes ✔ |
| 3 | HR35 Summary path | `countSection` `playwright-runner.ts:629-645` | **MISSING ✘ → must be added ✔** |

Path 3 is the gap: adding the BE filter to `countSection` lets a section reach full-green, which lets
`icon()` (`:659-664`) emit `✅`, which lets `summaryPair` (`lint-feature.ts:138-146`) match — moving
`verifiedSource` off `'row-scan'` and onto the authoritative Summary path (`:149`). For symmetry note
that `brRows` already applies the same filter (`lint-feature.ts:174`); `finalCellVerified`
(`:151-160`) does **not** — a fourth asymmetry that D2 should close in the same canary.

Kit-first: implement in the kit, byte-copy to target after implementation. No target-side `.claude/`
edits (workspace reverse-sync rule).

### 10.3 — D3 LOCKED: writer/reader alignment = fix the WRITER, not the reader

`updateChecklistRows` (`playwright-runner.ts:589-611`) additionally stamps
`✅ <capture-run-ref>` into the **evidence (final)** cell when a `RowVerdict` passes. Status-cell
behavior is unchanged. Per finding (a2), the target cell must be resolved **from the table header**,
not from `cells.length` — the current cell-count heuristic is already wrong for the UI table.

**Fail-closed — header resolution (symmetric in force with §10.4's admission rule).** The writer
resolves **both** the Status column and the evidence column from the section's **header row**. If the
header row is **absent**, or does not match a **recognized layout**, the writer performs **NO write
for that row** and the run **STOPS** with the distinct verdict
**`tierB-checklist-unrecognized-layout`**. Heuristic fallback to `cells.length` is **PROHIBITED** —
it is the exact mechanism that produces the destructive misalignment in (a2), so degrading to it on
an unrecognized header would reinstate the defect this decision exists to remove. A STOP here is also
not a silent skip: the run must fail loudly rather than leave the row untouched and continue.

> **Asymmetry being closed.** §10.4 carried its fail-closed sentence from the start ("Anchorless
> **or** predicate-less → **STOP**"); §10.3 did not, and the omission was load-bearing — a
> header-based rule with no stated behavior on unrecognized headers legitimately permits a
> cell-count fallback, i.e. permits (a2). Both decisions now state their STOP condition explicitly.

**Rejected alternative:** widening the reader to also count the Status cell. Status is equally
hand-editable, and evidence-cell semantics ("proof reference") are the honest home for capture
provenance. Widening the reader would make a hand-typed `✅ Pass` sufficient to move the gate.

**Residual risk — recorded, deliberately NOT fixed now:** the reader still counts a *bare* ✅ without
requiring a provenance token (`finalCellVerified :157` tests only `/✅|✔/`). A human can still type ✅
into an evidence cell and move the gate. Future hardening: require the run-ref token, not just the
glyph.

### 10.4 — D4 LOCKED: AC-level declared-defer (extends §17.7 from endpoint level to checklist-row level)

§17.7 already implements this shape for contract endpoints: `extractDefer` parses
`# DEFER: <reason>` (`contract-probe.ts:327-332`), and `deriveFeatureEndpoints` admits a defer **only**
when the reason matches `ANCHOR = /§\s?\d+(\.\d+)*/` (`playwright-runner.ts:997-1003`), computing
`undeclaredMissing = H.filter((p) => !Aset.has(p) && !declaredDeferSet.has(p))` (`:1008`) and throwing
otherwise (`:1010-1018`). Anchorless defers fail closed — `contract-probe.defer.test.ts:128` (T6,
PERMANENT). §10.4 lifts that mechanism to checklist rows.

Admission rules — a row-level defer MUST carry **both**:
1. a **§-anchor** pointing at the design decision that authorizes it; and
2. a **machine-checkable predicate** describing the environment condition that would invalidate it.

Anchorless **or** predicate-less → **STOP** (fail-closed, mirroring §17.7 T6).

**Re-evaluated on EVERY run.** If the environment satisfies the predicate, the defer
**AUTO-INVALIDATES** and the AC must genuinely pass — no grandfathering (roadmap amendment A5,
`ROADMAP-AUTONOMOUS-SDLC.md:589`, forward-note `:661`).

A validly deferred row is excluded from **both** the HR35 denominator and the HR36 coverage set.

**AC-2 concrete predicate (structural):** *"a second capturable route exists for a class with 0
published assessments AND that route captures cleanly without out-of-feature blockers."* When the
preview/certificate bug is fixed or a clean 0-assessment route appears, the defer dies automatically
and the per-unique-route mechanism becomes the real resolution path — `resolveRoutes`
(`ux-states.ts:38-42`) already returns a de-duplicated route list, and `b11-runner.ts:488` drives one
capture per unique route.

**Rejected: controlled fixture.** Any mock variant inside the same browser session is a leakage
vector into §4 data-reached — precisely the false-verified class this kit exists to block.

### 10.5 — Attack tests — LOCKED (specs T1–T8; T8 = documented-RED)

PERMANENT suite; obligations for the code canaries, **not yet written**. The spec below is locked —
a canary may not ship without its mapped tests (§10.8).

| ID | Attack | Expected |
|----|--------|----------|
| T1 | **defer-rot** — predicate satisfied but row still deferred | STOP |
| T2 | **anchorless defer** | STOP |
| T3 | **predicate-less defer** | STOP |
| T4 | **defer-inflation** — mass-deferring to shrink the denominator | Mitigation: every defer requires a §-anchor to a *locked* design decision; nightly battery (roadmap `o2-continuous-assurance`, `ROADMAP-AUTONOMOUS-SDLC.md:355`) re-evaluates all standing predicates |
| T5 | **cell-alignment regression** — writer's evidence-cell stamp is counted by `finalCellVerified` | GREEN (and RED before the §10.3 change) |
| T6 | **BE-exclusion symmetry** — a BE row is invisible to `countSection`, `grab`, and `checkAcCoverage` alike | GREEN |
| T7 | **unrecognized/absent header** — a checklist section whose header row is missing or matches no known layout | STOP with `tierB-checklist-unrecognized-layout`; **zero bytes written** to the checklist (assert file content byte-identical before/after); NOT a silent skip (no "row left untouched, run continues") |
| T8 | **bare-✅ reader gap** — a checklist row carrying a bare `✅` in the evidence cell, with **no** header-resolved status column and no provenance run-ref, is accepted by `finalCellVerified` (`lint-feature.ts:151-160`, glyph-only test `/✅\|✔/` at `:157`) | **GREEN today by design — documented-RED.** Asserts the gap **exists**. This is a KNOWN gap, intentionally **NOT** fixed in C1–C4 (§10.3 "Residual risk"). Anchor: §10.5-T8. |

**T8 mechanism — LOCKED: assert-the-gap (assertion inversion), not a runner directive.**

Runner detection 2026-07-20: the suite is **`node:test`** (`import { test } from 'node:test'` +
`node:assert/strict`), executed as `npx tsx <file>.test.ts` (`package.json` `test:kit`, `:78`).
`grep -rn "it\.fails\|test\.fails\|\.fails("` over `.claude/integrations/*.test.ts` → **0 hits,
exit 1**; vitest is not a dependency (`tsx ^4.19.0` only). vitest's `it.fails()` is therefore
**unavailable**.

T8 is written as a **normal passing assertion that the gap is still open** — e.g.
`assert.equal(readerAcceptsBareCheck(row), true)`. Properties, which are the whole point of the
test: it runs **green in CI while the gap exists**, and it turns **RED the moment the gap is
unexpectedly closed** — forcing a deliberate re-lock of §10.5 rather than silent drift. That is
exactly `it.fails()` semantics, reconstructed on a runner that lacks the directive.

`{ skip: … }` was **REJECTED** as the fallback: a skipped test never executes, so it can never
alarm — it would document the gap while discarding the property T8 exists to provide. `node:test`'s
`{ todo: true }` is likewise unsuitable (todo results do not fail the build in either direction).
**Do not "simplify" T8 into a skip or a todo.**

Note the directional coupling: C2 (§10.3) fixes the **writer**, deliberately not the reader, so T8
must stay green across C1–C4. A T8 failure during the canaries means a canary closed the reader gap
as an unintended side effect — investigate before proceeding, do not just update T8.

### 10.6 — Expected arithmetic (EXPECTATION, not a commitment)

Verifiable **only** by a real capture. Do not treat these numbers as achieved.

| Step | Denominator | Source |
|------|-------------|--------|
| today (measured 2026-07-20) | **38** (ACT 22 + UI 16) | `lint-feature.ts:282` |
| after §10.1 (BR2/BR6 → BE) | **36** | `grab :125` |
| after §10.4 (AC-2 defer) | **35** | §10.4 exclusion |

Threshold ≥60% ⇒ **≥21/35**. Today's honest numerator is **1** (§10.0a) — the entire gap is the
writer/reader mismatch, which is why §10.3 is the load-bearing change and §10.1/§10.4 are only
denominator hygiene.

Residual risks: bare-✅ reader (§10.3); latent UI-table column corruption (§10.0 a2) — must be fixed
*with* §10.3, not after, since §10.3 is what starts writing UI rows; AC-1 remains external (backend
data; operator note already drafted).

### 10.7 — Scope fence

- **NO** changes to §4 data-reached logic.
- **NO** mock leakage into capture.
- **NO** changes to the sync guard (`countVerifiedRuns`, `scripts/sync-to-targets.ts:568-572` —
  `verified=is.true` query at `:572`). Sync stays fail-closed; §10 does not unblock it.
- **AC-1 untouched.**

### 10.8 — Canary split — LOCKED 2026-07-20

**Order LOCKED: C1 → C2 → C3 → C4.** One change per canary, tests RED before GREEN, explicit
paths only (no `-A` staging), each canary independently revertible.

| Canary | Change | Tests | Rationale |
|--------|--------|-------|-----------|
| **C1** | §10.2 — BE exclusion in `countSection` (+ `finalCellVerified` symmetry) | T6 | Smallest, purely subtractive, no writer behavior change. Unblocks the Summary path so later canaries are observable. |
| **C2** | §10.3 — writer stamps evidence cell + **header-resolved** column addressing (fixes a2) + fail-closed `tierB-checklist-unrecognized-layout` | T5, **T7** | The load-bearing fix. Depends on C1 only for observability, not correctness. a2 rides here because C2 is what starts writing UI rows; T7 pins that an unrecognized header STOPs instead of degrading to the cell-count heuristic. |
| **C3** | §10.4 — AC-level defer: marker, §-anchor + predicate admission, denominator/coverage exclusion | T1, T2, T3, T4 | Largest new mechanism; lands last so the gate arithmetic is already honest when defers enter. |
| **C4** | §10.1 — target-only checklist edit (BR2/BR6 → `enforced-by:BE`) | — (covered by T6 in C1) | Spec artifact, not kit code. Last, after the kit reads it correctly — doing it first would move numbers for reasons the tests do not yet pin. |

Ordering rationale: C1 → C2 is reader-then-writer so each canary's effect on the ratio is
attributable; C3 lands after the ratio is honest so a defer can never be the thing that first makes
the gate pass; C4 is deliberately last so no checklist number moves before a test pins why.

**C4 ordering — CLOSED, LOCKED LAST.** C4 (§10.1, `enforced-by:BE` on ACT-BR2/BR6) is ordered
**LAST** and this order is **LOCKED**. Rationale: C4 lifts HR36 → 100% while HR35 is still ~3%,
producing a **partial-green false-signal** (green before green is real). HR35 is the load-bearing
defect (writer/reader mismatch, §10.0a — numerator stuck at 1); it must be resolved by C1–C3 first.
Advancing C4 for an early HR36 100% is the exact false-signal this gate exists to prevent —
**rejected.**

**Test → canary mapping (LOCKED — do not re-derive).** A canary ships only when every test mapped
to it is present and in the stated state.

| Test | Canary | Required state at that canary |
|------|--------|-------------------------------|
| T6 — BE-exclusion symmetry | **C1** | RED before, GREEN after |
| T5 — cell-alignment regression | **C2** | RED before, GREEN after |
| T7 — unrecognized/absent header | **C2** | STOP verdict `tierB-checklist-unrecognized-layout`, zero bytes written |
| T1 — defer-rot | **C3** | STOP |
| T2 — anchorless defer | **C3** | STOP |
| T3 — predicate-less defer | **C3** | STOP |
| T4 — defer-inflation | **C3** | Mitigation asserted (§-anchor to a *locked* decision required) |
| — (no new test) | **C4** | Covered by T6, already GREEN from C1 |
| T8 — bare-✅ reader gap | **all of C1–C4** | GREEN throughout (documented-RED; a flip to RED means a canary closed the reader gap unintentionally — investigate, do not update T8) |