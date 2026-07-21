/**
 * checklist-defer.ts — §10.4 C3a: STATIC marker-validation for AC-level (checklist-row) declared-defers.
 *
 * Lifts the §17.7 endpoint-defer mechanism (`extractDefer` / `deriveFeatureEndpoints`, machine-enforced
 * anchor pattern `§\s?\d+(\.\d+)*`) up to the checklist-row level (§10.4 D4, LOCKED 2026-07-20).
 *
 * A row-level defer is carried by an inline `<!-- DEFER: §<anchor> ; predicate:<key> -->` marker,
 * mirroring the BE channel `<!-- enforced-by: BE -->` (lint-feature.ts:125). It is ADMITTED only when
 * it carries BOTH (§10.4):
 *   1. a §-anchor pointing at a *locked* design decision that authorizes the defer, AND
 *   2. a machine-checkable predicate key (the environment condition that would invalidate it).
 * Anchorless OR predicate-less OR anchor-not-locked → STOP (fail-closed, mirroring §17.7 T6).
 *
 * SCOPE — C3a is STATIC validation ONLY: parse the marker and STOP on a malformed one. It does NOT
 * yet exclude a valid defer from the HR35 denominator / HR36 coverage set (that is C3b), and it does
 * NOT evaluate the predicate (that is C3b capture-time). The reader hook in lint-feature.ts that calls
 * these is also a separate step. This module is pure/hermetic: no fs, no capture, in-memory only.
 */

// §17.7.3 anchor pattern, re-declared locally (approved: do NOT export from / edit playwright-runner.ts —
// keeps the C3a diff inside this new module, zero blast radius on production files). Source of truth for
// the shape is §17.7 (playwright-runner.ts:1066); both sites are grep-findable via `§\s?`.
const ANCHOR = /§\s?\d+(\.\d+)*/;

// Predicate key channel: `predicate:<key>` — a NAMED key (resolved by a code registry in C3b), NOT a DSL
// and NOT eval'd here. C3a only checks that a key is present.
const PREDICATE = /predicate:\s*([\w.-]+)/;

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
  return { anchor, predicateKey };
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
