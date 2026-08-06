/**
 * spec-intake-xlsx.ts — Excel (.xlsx) adapter (f3-spec-intake-ir §1-4).
 *
 * .xlsx is a ZIP of XML parts: xl/workbook.xml (sheet list), xl/worksheets/sheetN.xml (cell
 * grids), xl/sharedStrings.xml (deduplicated string pool most text cells reference by index).
 * Merged cells (<mergeCells><mergeCell ref="A1:B2"/>) anchor to their top-left cell only — the
 * other cells in the range are skipped so a merge never produces duplicate/misattributed
 * paragraphs (docs/design/spec-intake-ir.md §2).
 */

import { readZip, ZipFormatError } from './zip-min';
import { SpecIR, SpecAdapterError, sha256, extractAcceptanceCriteria, validateSpecIR, emptyIrWarningsCheck, AnchoredParagraph } from './spec-ir';

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml)) !== null) {
    let text = '';
    let tm: RegExpExecArray | null;
    tRe.lastIndex = 0;
    while ((tm = tRe.exec(m[1])) !== null) text += decodeXmlEntities(tm[1]);
    strings.push(text);
  }
  return strings;
}

interface CellRange { minCol: number; minRow: number; maxCol: number; maxRow: number; topLeft: string; }

function colToNum(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseCellRef(ref: string): { col: number; row: number } {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new SpecAdapterError('excel', `malformed cell reference "${ref}"`);
  return { col: colToNum(m[1]), row: Number(m[2]) };
}

function parseMergeRanges(sheetXml: string): CellRange[] {
  const ranges: CellRange[] = [];
  const mcRe = /<mergeCell\s+ref="([^"]+)"\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = mcRe.exec(sheetXml)) !== null) {
    const [a, b] = m[1].split(':');
    if (!b) continue;
    const pa = parseCellRef(a);
    const pb = parseCellRef(b);
    ranges.push({
      minCol: Math.min(pa.col, pb.col), maxCol: Math.max(pa.col, pb.col),
      minRow: Math.min(pa.row, pb.row), maxRow: Math.max(pa.row, pb.row),
      topLeft: a,
    });
  }
  return ranges;
}

function isSuppressedByMerge(ref: string, ranges: CellRange[]): boolean {
  const { col, row } = parseCellRef(ref);
  return ranges.some((r) => ref !== r.topLeft && col >= r.minCol && col <= r.maxCol && row >= r.minRow && row <= r.maxRow);
}

function extractSheetParagraphs(sheetName: string, sheetXml: string, shared: string[], warnings: string[]): AnchoredParagraph[] {
  const mergeRanges = parseMergeRanges(sheetXml);
  const paragraphs: AnchoredParagraph[] = [];
  const cellRe = /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(sheetXml)) !== null) {
    const attrs = m[1];
    const inner = m[2] ?? '';
    const refMatch = attrs.match(/\br="([^"]+)"/);
    if (!refMatch) { warnings.push('cell with no r= reference skipped'); continue; }
    const ref = refMatch[1];
    if (isSuppressedByMerge(ref, mergeRanges)) continue;

    const typeMatch = attrs.match(/\bt="([^"]+)"/);
    const type = typeMatch ? typeMatch[1] : null;

    let text = '';
    if (type === 'inlineStr') {
      const isM = inner.match(/<is>([\s\S]*?)<\/is>/);
      const tM = isM ? isM[1].match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/) : null;
      text = tM ? decodeXmlEntities(tM[1]) : '';
    } else {
      const vM = inner.match(/<v>([\s\S]*?)<\/v>/);
      const raw = vM ? decodeXmlEntities(vM[1]) : '';
      if (type === 's') {
        const idx = Number(raw);
        text = Number.isInteger(idx) && shared[idx] !== undefined ? shared[idx] : '';
        if (shared[idx] === undefined) warnings.push(`cell ${ref}: shared-string index ${idx} out of range`);
      } else {
        text = raw; // numeric / boolean / str-formula-result
      }
    }
    const trimmed = text.trim();
    if (trimmed.length > 0) paragraphs.push({ anchor: `xlsx:${sheetName}!${ref}`, text: trimmed });
  }
  return paragraphs;
}

export function adaptExcel(buf: Buffer, sourceRef: string): SpecIR {
  let entries: Map<string, Buffer>;
  try {
    entries = readZip(buf);
  } catch (e) {
    if (e instanceof ZipFormatError) throw new SpecAdapterError('excel', `not a valid .xlsx (${e.message})`, sourceRef);
    throw e;
  }
  const workbookXml = entries.get('xl/workbook.xml')?.toString('utf8');
  if (!workbookXml) throw new SpecAdapterError('excel', 'missing xl/workbook.xml (not a valid .xlsx package)', sourceRef);
  const shared = parseSharedStrings(entries.get('xl/sharedStrings.xml')?.toString('utf8'));

  const sheetNames = [...workbookXml.matchAll(/<sheet\s+[^>]*name="([^"]+)"[^>]*\/>/g)].map((m) => m[1]);
  if (sheetNames.length === 0) throw new SpecAdapterError('excel', 'workbook.xml declares 0 sheets', sourceRef);

  const sheetFiles = [...entries.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => {
      const na = Number(a.match(/sheet(\d+)\.xml/)![1]);
      const nb = Number(b.match(/sheet(\d+)\.xml/)![1]);
      return na - nb;
    });
  if (sheetFiles.length === 0) throw new SpecAdapterError('excel', 'no worksheet parts found (xl/worksheets/sheetN.xml)', sourceRef);

  const warnings: string[] = [];
  if (sheetFiles.length !== sheetNames.length) {
    warnings.push(`workbook declares ${sheetNames.length} sheet(s) but ${sheetFiles.length} worksheet part(s) were found — positional name mapping may be wrong`);
  }

  const paragraphs: AnchoredParagraph[] = [];
  sheetFiles.forEach((file, i) => {
    const name = sheetNames[i] ?? file;
    const xml = entries.get(file)!.toString('utf8');
    paragraphs.push(...extractSheetParagraphs(name, xml, shared, warnings));
  });

  const ir: SpecIR = {
    schemaVersion: 1,
    sourceKind: 'excel',
    sourceRef,
    sourceSha256: sha256(buf),
    title: sheetNames[0] ?? null,
    paragraphs,
    acceptanceCriteria: extractAcceptanceCriteria(paragraphs),
    warnings,
  };
  emptyIrWarningsCheck(ir, 'excel', sourceRef);
  return validateSpecIR(ir);
}
