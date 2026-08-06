/**
 * spec-intake-pdf.ts — PDF adapter (f3-spec-intake-ir §1-4).
 *
 * Scope (docs/design/spec-intake-ir.md "Zero-new-dependency constraint"): text-based, unencrypted
 * PDFs with directly-declared objects (`N G obj ... endobj`) — the common case for a spec exported
 * from a word processor. NOT supported, and fail-closed rather than silently wrong: encrypted
 * PDFs, PDF 1.5+ compressed object streams (`/Type /ObjStm`) hiding the page tree, scanned/
 * image-only PDFs (no text operators — would need OCR). Text decoding is ASCII/Latin1-oriented
 * (literal/hex string operands), not full Unicode CMap resolution.
 *
 * Technique: regex-scan the raw bytes for `N G obj ... endobj` blocks directly (bypasses the
 * xref table entirely — object bodies are in that textual form regardless of PDF version, unless
 * compressed into an object stream). FlateDecode streams are inflated via Node's built-in `zlib`.
 * Content-stream text is extracted from `BT...ET` blocks via the `Tj`/`TJ` show-text operators.
 */

import * as zlib from 'zlib';
import { SpecIR, SpecAdapterError, sha256, extractAcceptanceCriteria, validateSpecIR, emptyIrWarningsCheck, AnchoredParagraph } from './spec-ir';

interface PdfObject { num: number; body: Buffer; }

function scanObjects(buf: Buffer): Map<number, PdfObject> {
  const text = buf.toString('latin1'); // 1 byte <-> 1 char, safe for locating ASCII markers in binary data
  const objects = new Map<number, PdfObject>();
  const objRe = /(\d+)\s+\d+\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(text)) !== null) {
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const endIdx = text.indexOf('endobj', bodyStart);
    if (endIdx === -1) continue; // truncated trailing object — ignored, not fatal on its own
    objects.set(num, { num, body: buf.subarray(bodyStart, endIdx) });
  }
  return objects;
}

function getStreamBytes(obj: PdfObject): Buffer | null {
  const text = obj.body.toString('latin1');
  const streamIdx = text.indexOf('stream');
  if (streamIdx === -1) return null;
  // stream keyword is followed by CRLF or LF before raw data begins.
  let dataStart = streamIdx + 'stream'.length;
  if (text[dataStart] === '\r') dataStart += 1;
  if (text[dataStart] === '\n') dataStart += 1;
  const endIdx = text.indexOf('endstream', dataStart);
  if (endIdx === -1) return null;
  let dataEnd = endIdx;
  // trim a single trailing EOL before 'endstream' if present (not part of the stream data).
  if (text[dataEnd - 1] === '\n') dataEnd -= 1;
  if (text[dataEnd - 1] === '\r') dataEnd -= 1;
  const raw = obj.body.subarray(dataStart, dataEnd);
  if (/\/Filter\s*(\/FlateDecode|\[\s*\/FlateDecode)/.test(text.slice(0, streamIdx))) {
    try {
      return zlib.inflateSync(raw);
    } catch (e) {
      throw new SpecAdapterError('pdf', `object ${obj.num} stream failed FlateDecode: ${(e as Error).message}`);
    }
  }
  return Buffer.from(raw);
}

function dictRefs(dictText: string, key: string): number[] {
  // Matches "/Key N 0 R" or "/Key [N 0 R M 0 R ...]"
  const single = dictText.match(new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`));
  if (single) return [Number(single[1])];
  const arr = dictText.match(new RegExp(`/${key}\\s*\\[([^\\]]*)\\]`));
  if (arr) return [...arr[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));
  return [];
}

/** Resolve page object numbers in reading order via Catalog -> Pages -> Kids. Returns null if the
 *  tree can't be resolved directly (likely hidden in a compressed object stream). */
function resolvePageOrderViaTree(objects: Map<number, PdfObject>): number[] | null {
  let catalogNum: number | null = null;
  for (const [num, obj] of objects) {
    if (/\/Type\s*\/Catalog\b/.test(obj.body.toString('latin1'))) { catalogNum = num; break; }
  }
  if (catalogNum === null) return null;
  const catalogText = objects.get(catalogNum)!.body.toString('latin1');
  const pagesRefs = dictRefs(catalogText, 'Pages');
  if (pagesRefs.length === 0) return null;

  const pageNums: number[] = [];
  const visit = (num: number, depth: number): boolean => {
    if (depth > 50) return false; // cycle guard
    const obj = objects.get(num);
    if (!obj) return false;
    const text = obj.body.toString('latin1');
    if (/\/Type\s*\/Page\b(?!s)/.test(text)) { pageNums.push(num); return true; }
    if (/\/Type\s*\/Pages\b/.test(text)) {
      const kids = dictRefs(text, 'Kids');
      if (kids.length === 0) return false;
      return kids.every((k) => visit(k, depth + 1));
    }
    return false;
  };
  if (!visit(pagesRefs[0], 0) || pageNums.length === 0) return null;
  return pageNums;
}

function decodePdfString(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === '\\' && i + 1 < raw.length) {
      const c = raw[i + 1];
      if (c === 'n') { out += '\n'; i += 1; }
      else if (c === 'r') { out += '\r'; i += 1; }
      else if (c === 't') { out += '\t'; i += 1; }
      else if (c === '(' || c === ')' || c === '\\') { out += c; i += 1; }
      else if (/[0-7]/.test(c)) {
        const oct = raw.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)![0];
        out += String.fromCharCode(parseInt(oct, 8));
        i += oct.length;
      } else { out += c; i += 1; }
    } else {
      out += raw[i];
    }
  }
  return out;
}

function decodeHexString(hex: string): string {
  const clean = hex.replace(/\s/g, '');
  let out = '';
  for (let i = 0; i < clean.length - 1; i += 2) out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  return out;
}

/** Extract shown-text runs from one content stream: ONE run per Tj/TJ/' show-text operator
 *  occurrence, in document order (the anchor granularity `pdf:page<p>:run<n>` is per-operator,
 *  not per BT/ET block — a single text object commonly contains many show-text calls). */
function extractTextRuns(contentText: string): string[] {
  const runs: string[] = [];
  const opRe = /\[((?:[^\[\]]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|')|<([0-9A-Fa-f\s]*)>\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = opRe.exec(contentText)) !== null) {
    let text = '';
    if (m[1] !== undefined) {
      const strRe = /\(((?:[^()\\]|\\.)*)\)|<([0-9A-Fa-f\s]*)>/g;
      let sm: RegExpExecArray | null;
      while ((sm = strRe.exec(m[1])) !== null) {
        text += sm[1] !== undefined ? decodePdfString(sm[1]) : decodeHexString(sm[2]);
      }
    } else if (m[2] !== undefined) {
      text = decodePdfString(m[2]);
    } else if (m[3] !== undefined) {
      text = decodeHexString(m[3]);
    }
    const trimmed = text.trim();
    if (trimmed.length > 0) runs.push(trimmed);
  }
  return runs;
}

export function adaptPdf(buf: Buffer, sourceRef: string): SpecIR {
  const header = buf.subarray(0, 5).toString('latin1');
  if (header !== '%PDF-') throw new SpecAdapterError('pdf', 'missing %PDF- header (not a PDF file)', sourceRef);

  const fullText = buf.toString('latin1');
  if (/\/Encrypt\b/.test(fullText)) {
    throw new SpecAdapterError('pdf', 'encrypted PDFs are not supported', sourceRef);
  }

  const objects = scanObjects(buf);
  if (objects.size === 0) throw new SpecAdapterError('pdf', 'no indirect objects found (corrupt or fully object-stream-compressed PDF)', sourceRef);

  let pageOrder = resolvePageOrderViaTree(objects);
  if (!pageOrder) {
    // Fallback: any directly-visible /Type /Page object, in ascending object-number order.
    pageOrder = [...objects.entries()]
      .filter(([, obj]) => /\/Type\s*\/Page\b(?!s)/.test(obj.body.toString('latin1')))
      .map(([num]) => num)
      .sort((a, b) => a - b);
  }
  if (pageOrder.length === 0) {
    throw new SpecAdapterError('pdf', 'no page objects found directly (likely compressed into an object stream — unsupported)', sourceRef);
  }

  const paragraphs: AnchoredParagraph[] = [];
  const warnings: string[] = [];
  pageOrder.forEach((pageNum, pageIdx) => {
    const pageObj = objects.get(pageNum)!;
    const pageText = pageObj.body.toString('latin1');
    const contentRefs = dictRefs(pageText, 'Contents');
    if (contentRefs.length === 0) { warnings.push(`page ${pageIdx + 1} (obj ${pageNum}) has no /Contents`); return; }

    const contentText = contentRefs
      .map((ref) => {
        const obj = objects.get(ref);
        if (!obj) { warnings.push(`page ${pageIdx + 1}: /Contents ref ${ref} not found`); return ''; }
        const bytes = getStreamBytes(obj);
        return bytes ? bytes.toString('latin1') : '';
      })
      .join('\n');

    extractTextRuns(contentText).forEach((run, runIdx) => {
      paragraphs.push({ anchor: `pdf:page${pageIdx + 1}:run${runIdx + 1}`, text: run });
    });
  });

  const ir: SpecIR = {
    schemaVersion: 1,
    sourceKind: 'pdf',
    sourceRef,
    sourceSha256: sha256(buf),
    title: paragraphs[0]?.text ?? null,
    paragraphs,
    acceptanceCriteria: extractAcceptanceCriteria(paragraphs),
    warnings,
  };
  emptyIrWarningsCheck(ir, 'pdf', sourceRef);
  return validateSpecIR(ir);
}
