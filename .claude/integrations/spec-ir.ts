/**
 * spec-ir.ts — canonical Spec-IR schema + shared AC-extraction heuristic (f3-spec-intake-ir).
 *
 * See docs/design/spec-intake-ir.md §1-4 for the schema/provenance/adapter-contract/ambiguity
 * design. This module owns the format-agnostic pieces only: the IR types, the validator, the ONE
 * AC-detection heuristic every adapter reuses, and the shared SpecAdapterError.
 */

import * as crypto from 'crypto';

export interface AnchoredParagraph {
  anchor: string;
  text: string;
}

export interface SpecAc {
  id: string;
  text: string;
  sourceAnchor: string;
  sourceQuote: string;
}

export type SourceKind = 'raw-us' | 'word' | 'pdf' | 'excel';

export interface SpecIR {
  schemaVersion: 1;
  sourceKind: SourceKind;
  sourceRef: string;
  sourceSha256: string;
  title: string | null;
  paragraphs: AnchoredParagraph[];
  acceptanceCriteria: SpecAc[];
  warnings: string[];
}

/** Thrown by an adapter on a malformed/truncated/unsupported source. Fail-closed: never a partial IR. */
export class SpecAdapterError extends Error {
  constructor(public readonly sourceKind: SourceKind, public readonly reason: string, public readonly sourceRef?: string) {
    super(`spec-adapter-fail-closed: [${sourceKind}] ${reason}${sourceRef ? ` (source: ${sourceRef})` : ''}`);
    this.name = 'SpecAdapterError';
  }
}

/** Thrown by validateSpecIR when an adapter's own output fails the provenance/anchor contract. */
export class SpecIrValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`spec-ir-invalid: ${issues.join('; ')}`);
    this.name = 'SpecIrValidationError';
  }
}

export const sha256 = (buf: Buffer | string): string =>
  crypto.createHash('sha256').update(buf as any).digest('hex');

// ─── §4 — shared AC-detection heuristic (ambiguity handling: under- over over-extraction) ─────

// Numbered/bulleted acceptance-style lead-ins. Intentionally conservative — a paragraph that does
// NOT match stays a plain paragraph, never a fabricated AC (validateSpecIR would reject a fabricated
// quote anyway, since it must be a literal substring of a real paragraph — this heuristic just
// decides which real paragraphs get promoted to acceptanceCriteria[]).
const AC_LEAD_IN = /^\s*(?:\|\s*(?:\*\*|__)?AC[-\s]?\d+(?:\*\*|__)?\s*\||AC[-\s]?\d+[:.)]?|(?:acceptance\s+criteri(?:a|on)\s+\d+[:.)]?)|\d+[).]\s|[-*•]\s*(?:given|when|then)\b|given\b.*\bwhen\b.*\bthen\b)/i;

/**
 * Scan an adapter's normalized paragraphs for AC-shaped text. Pure, format-agnostic — every
 * adapter calls this over its OWN AnchoredParagraph[] so "what counts as an AC" is defined once.
 * Spec-injection note: this only pattern-matches text as DATA (to decide "is this AC-shaped"); it
 * never evaluates, executes, or branches program control on the paragraph content itself.
 */
export function extractAcceptanceCriteria(paragraphs: AnchoredParagraph[]): SpecAc[] {
  const acs: SpecAc[] = [];
  let n = 0;
  for (const p of paragraphs) {
    const text = p.text.trim();
    if (!text) continue;
    if (AC_LEAD_IN.test(text)) {
      n += 1;
      acs.push({ id: `AC-${n}`, text, sourceAnchor: p.anchor, sourceQuote: text });
    }
  }
  return acs;
}

/**
 * Fail-closed check of the provenance contract (§1): every AC must resolve to a real paragraph and
 * its sourceQuote must be a literal substring of that paragraph's text. Adapters call this on their
 * own output before returning — an IR that fails this is never handed to a caller.
 */
export function validateSpecIR(ir: SpecIR): SpecIR {
  const issues: string[] = [];
  if (ir.schemaVersion !== 1) issues.push(`unsupported schemaVersion ${ir.schemaVersion}`);
  const byAnchor = new Map(ir.paragraphs.map((p) => [p.anchor, p.text]));
  const seenAnchors = new Set<string>();
  for (const p of ir.paragraphs) {
    if (seenAnchors.has(p.anchor)) issues.push(`duplicate paragraph anchor "${p.anchor}"`);
    seenAnchors.add(p.anchor);
  }
  const seenAcIds = new Set<string>();
  for (const ac of ir.acceptanceCriteria) {
    if (seenAcIds.has(ac.id)) issues.push(`duplicate AC id "${ac.id}"`);
    seenAcIds.add(ac.id);
    const paraText = byAnchor.get(ac.sourceAnchor);
    if (paraText === undefined) {
      issues.push(`${ac.id}: sourceAnchor "${ac.sourceAnchor}" does not resolve to any paragraph`);
      continue;
    }
    if (!paraText.includes(ac.sourceQuote)) {
      issues.push(`${ac.id}: sourceQuote is not a literal substring of paragraph "${ac.sourceAnchor}"`);
    }
  }
  if (issues.length > 0) throw new SpecIrValidationError(issues);
  return ir;
}

export function emptyIrWarningsCheck(ir: SpecIR, sourceKind: SourceKind, sourceRef: string): void {
  if (ir.paragraphs.length === 0) {
    throw new SpecAdapterError(sourceKind, 'no extractable text found in source (0 paragraphs)', sourceRef);
  }
}
