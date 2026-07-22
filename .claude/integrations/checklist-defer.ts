/**
 * checklist-defer.ts — §10.4 C3a STATIC marker-validation + §10.9 C3b-i predicate registry & stamp.
 *
 * Lifts the §17.7 endpoint-defer mechanism (`extractDefer` / `deriveFeatureEndpoints`, machine-enforced
 * anchor pattern `§\s?\d+(\.\d+)*`) up to the checklist-row level (§10.4 D4, LOCKED 2026-07-20).
 *
 * A row-level defer is carried by an inline
 *   `<!-- DEFER: §<anchor> ; predicate:<key> ; stamp:<satisfied|unsatisfied>@<run-ref> -->`
 * marker, mirroring the BE channel `<!-- enforced-by: BE -->` (lint-feature.ts:125). It is ADMITTED
 * only when it carries (§10.4 + §10.9 D9.2/D9.3):
 *   1. a §-anchor pointing at a *locked* design decision that authorizes the defer,
 *   2. a machine-checkable predicate key (the environment condition that would invalidate it), AND
 *   3. a capture-time `stamp:` clause (D9.3) — its absence STOPs `tierB-defer-unstamped`, closing the
 *      roadmap-A5 grandfather hole (an un-evaluated defer must never pass as validly deferred).
 * Anchorless OR predicate-less OR anchor-not-locked OR unstamped → STOP (fail-closed, §17.7 T6 family).
 *
 * SCOPE — C3b-i (this module, current state) adds the §10.9 D9.1 predicate registry and the D9.2
 * stamp shape/parse + D9.3 unstamped-STOP. It does NOT yet exclude a valid defer from the HR35
 * denominator / HR36 coverage set, nor consume `isDeferValid`'s result anywhere — that grab-path
 * wiring (3 sites: grab/finalCellVerified/brRows) is C3b-ii (§10.9 D9.4 scope fence). The D9.2
 * "own-run trust rule" (stamp.runRef must match the CURRENT run, not just be present) is also NOT
 * wired here: no call site threads a current-run-ref into this reader path yet, so today `stamp !==
 * null` is the only condition checked — an absent stamp already collapses to the same
 * `tierB-defer-unstamped` STOP the full rule would produce; only the "stale run-ref from an earlier
 * run" sub-case needs that follow-up plumbing. This module stays pure/hermetic: no fs, no capture.
 */

// §17.7.3 anchor pattern, re-declared locally (approved: do NOT export from / edit playwright-runner.ts —
// keeps the C3a diff inside this new module, zero blast radius on production files). Source of truth for
// the shape is §17.7 (playwright-runner.ts:1066); both sites are grep-findable via `§\s?`.
const ANCHOR = /§\s?\d+(\.\d+)*/;

// Predicate key channel: `predicate:<key>` — a NAMED key (resolved by PREDICATE_REGISTRY below), NOT a
// DSL and NOT eval'd here.
const PREDICATE = /predicate:\s*([\w.-]+)/;

// §10.9 D9.2 (LOCKED 2026-07-22) — third `;`-separated clause: `stamp:<satisfied|unsatisfied>@<run-ref>`.
const STAMP = /stamp:\s*(satisfied|unsatisfied)@([\w.-]+)/;

/**
 * §10.9 D9.1 — predicate registry: named KEY → pure code, never a string-eval'd DSL. EXACTLY 2 seed
 * keys (no template/example keys), each backed by a real AC. Adding a key requires a locked design
 * decision plus a reviewed commit — the same anti-inflation control §10.4 already applies to
 * §-anchors, now applied to predicate keys too.
 */
export interface PredicateCaptureInput {
  /** per-exam charts network capture — one entry per exam, `empty` mirrors the chart's empty-state. */
  perExamCharts?: Array<{ empty: boolean }>;
  /** assessments network capture. */
  assessments?: unknown[];
}

export const PREDICATE_REGISTRY: Readonly<Record<string, (input: PredicateCaptureInput) => boolean>> = {
  'specific-exam-filter': (input) => (input.perExamCharts ?? []).some((c) => c.empty === false),
  'no-published-assessment': (input) => (input.assessments ?? []).length > 0,
};

/**
 * §10.9 D9.1 governance — resolve a predicate key to its registered fn. An UNKNOWN key is a hard
 * error (anti-inflation), never a silent pass. Not yet called from anywhere: the capture-time
 * evaluation call site (writer-side, `updateChecklistRows`) that would invoke this is out of scope
 * for C3b-i — this function exists so that call site has a governed lookup to use once it lands.
 */
export function resolvePredicate(key: string): (input: PredicateCaptureInput) => boolean {
  const fn = PREDICATE_REGISTRY[key];
  if (!fn) {
    throw new Error(`unknown predicate key "${key}" — §10.9 D9.1 requires a locked design decision + reviewed commit to add one`);
  }
  return fn;
}

/**
 * T4 (defer-inflation) mitigation — the reviewed allowlist of §-anchors that legitimately authorize a
 * *checklist-row* defer. Explicit constant, NOT a scan of design-doc `LOCKED` banners: the trust must be
 * anchored in a reviewed code diff, not in hand-editable prose (the same hand-editable surface §10.3
 * rejects for the reader). §10.4 (D4 LOCKED 2026-07-20) is the sole locked decision that authorizes a
 * ROW-level defer; §17.6/§17.7 authorize ENDPOINT defers (a different consumer, `deriveFeatureEndpoints`)
 * and are deliberately OUT of this set. Widening it requires an approved commit.
 */
export const LOCKED_ANCHORS = new Set<string>(['§10.4']);

/** Dissected inline defer marker. `null` on a field ⇔ that component is absent from the marker text
 *  (so a malformed marker still yields a non-null RowDefer for the reader to STOP on). */
export interface RowDefer {
  anchor: string | null;
  predicateKey: string | null;
  /** §10.9 D9.2 (LOCKED) — capture-time stamp. `null` = no `stamp:` clause present (or malformed) —
   *  the D9.3 unstamped-STOP case. Additive field: `null` on every C3a-era marker with no clause. */
  stamp: { outcome: 'satisfied' | 'unsatisfied'; runRef: string } | null;
}

/** Typed STOP for a malformed row-level defer. Mirrors ChecklistLayoutError's shape (playwright-runner.ts:596)
 *  / EndpointDerivationError (§17.7): a distinct `verdict` string the call site surfaces as a fail-closed STOP. */
export class ChecklistDeferError extends Error {
  readonly verdict: string;
  constructor(verdict: string, message?: string) {
    super(message ?? `checklist row-defer rejected: ${verdict}`);
    this.name = 'ChecklistDeferError';
    this.verdict = verdict;
  }
}

/**
 * Surface the inline defer marker on a single checklist row, if present.
 *   • No `<!-- DEFER: … -->` marker on the row → `null` (nothing to validate; today's rows are unaffected).
 *   • Marker present (even malformed) → non-null RowDefer, with `anchor`/`predicateKey` set to whatever the
 *     reason text yields (each may be `null`). Validation of the pieces is `validateRowDefer`'s job.
 * The §-anchor is normalized by stripping the optional single space after `§` (`§ 10.4` → `§10.4`) so it
 * compares byte-for-byte against LOCKED_ANCHORS.
 */
export function parseRowDefer(rowLine: string): RowDefer | null {
  const marker = rowLine.match(/<!--\s*DEFER:\s*(.+?)\s*-->/i);
  if (!marker) return null;
  const reason = marker[1];
  const rawAnchor = ANCHOR.exec(reason)?.[0] ?? null;
  const anchor = rawAnchor ? rawAnchor.replace(/§\s+/, '§') : null;
  const predicateKey = reason.match(PREDICATE)?.[1] ?? null;
  const stampMatch = reason.match(STAMP);
  const stamp = stampMatch ? { outcome: stampMatch[1] as 'satisfied' | 'unsatisfied', runRef: stampMatch[2] } : null;
  return { anchor, predicateKey, stamp };
}

/**
 * STATIC admission check for a parsed row-defer. Throws ChecklistDeferError (a STOP) unless the marker
 * carries a locked §-anchor AND a predicate key. Check order is fixed — each attack-test (§10.5 T2/T3/T4)
 * violates exactly one condition, so order does not cause cross-firing, but it is stated to keep verdicts
 * stable: anchorless → predicate-less → anchor-not-locked.
 * Well-formed + locked → returns void (ADMITTED). NOTE (C3a): admission here does NOT exclude the row from
 * any count — TODO(C3b): a valid defer must drop out of the HR35 denominator + HR36 coverage set.
 */
export function validateRowDefer(parsed: RowDefer, locked: Set<string>): void {
  if (!parsed.anchor) {
    throw new ChecklistDeferError('tierB-defer-anchorless',
      'row-level defer has no §-anchor (§10.4: a defer MUST cite a locked design decision)');
  }
  if (!parsed.predicateKey) {
    throw new ChecklistDeferError('tierB-defer-predicate-less',
      `defer ${parsed.anchor} has no predicate key (§10.4: a defer MUST carry a machine-checkable predicate)`);
  }
  if (!locked.has(parsed.anchor)) {
    throw new ChecklistDeferError('tierB-defer-anchor-not-locked',
      `defer anchor ${parsed.anchor} is not a locked design decision (§10.5 T4: mass-defer inflation blocked)`);
  }
}

/**
 * §10.9 D9.3 (LOCKED 2026-07-22) — a marker that passed validateRowDefer (locked anchor + predicate
 * key) but carries NO `stamp:` clause is NOT treated as deferred: STOP `tierB-defer-unstamped`. This
 * closes roadmap amendment A5's grandfathering hole (an un-evaluated defer must never silently pass
 * as "admitted" forever). Kept as a SEPARATE function from validateRowDefer (not folded in) so C3a's
 * existing callers/tests — which predate stamps and assert `validateRowDefer` does NOT throw on a
 * well-formed-but-unstamped marker — stay additive/unbroken; the reader call site invokes both.
 */
export function validateRowDeferStamp(parsed: RowDefer): void {
  if (!parsed.stamp) {
    throw new ChecklistDeferError('tierB-defer-unstamped',
      `defer ${parsed.anchor} has no capture-time stamp (§10.9 D9.3: an un-evaluated defer must STOP, not be silently admitted)`);
  }
}

/**
 * §10.9 D9.1/A5 — pure semantic helper for C3b-ii's exclusion wiring: a defer whose predicate came
 * back SATISFIED at capture time auto-invalidates (the AC must be evaluated for real, no
 * grandfathering); UNSATISFIED means the defer remains valid (an exclusion candidate). Requires a
 * present stamp — call after validateRowDeferStamp has not thrown. Not consumed by any grab-path
 * site yet; that wiring is C3b-ii (§10.9 D9.4 scope fence).
 */
export function isDeferValid(parsed: RowDefer): boolean {
  return parsed.stamp !== null && parsed.stamp.outcome === 'unsatisfied';
}
