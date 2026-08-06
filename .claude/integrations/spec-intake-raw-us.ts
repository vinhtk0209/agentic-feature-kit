/**
 * spec-intake-raw-us.ts — raw-US adapter (f3-spec-intake-ir §1-4).
 *
 * Simplest adapter, no parser risk (per ROADMAP-AUTONOMOUS-SDLC.md f3 "Order within" — built
 * first). Input is already plain text (a raw user-story / markdown spec pasted or read from disk);
 * each non-blank line is one AnchoredParagraph, anchored by its 1-based line number.
 */

import { SpecIR, SpecAdapterError, sha256, extractAcceptanceCriteria, validateSpecIR, emptyIrWarningsCheck } from './spec-ir';

export function adaptRawUs(text: string, sourceRef: string): SpecIR {
  if (typeof text !== 'string') {
    throw new SpecAdapterError('raw-us', 'input is not a string', sourceRef);
  }
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const paragraphs = lines
    .map((line, i) => ({ anchor: `line:${i + 1}`, text: line.trim() }))
    .filter((p) => p.text.length > 0);

  const firstLine = lines.find((l) => l.trim().length > 0)?.trim() ?? null;
  const title = firstLine ? firstLine.replace(/^#+\s*/, '') : null;

  const ir: SpecIR = {
    schemaVersion: 1,
    sourceKind: 'raw-us',
    sourceRef,
    sourceSha256: sha256(text),
    title,
    paragraphs,
    acceptanceCriteria: extractAcceptanceCriteria(paragraphs),
    warnings: [],
  };
  emptyIrWarningsCheck(ir, 'raw-us', sourceRef);
  return validateSpecIR(ir);
}
