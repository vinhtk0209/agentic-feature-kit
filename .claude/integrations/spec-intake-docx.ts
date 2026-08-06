/**
 * spec-intake-docx.ts — Word (.docx) adapter (f3-spec-intake-ir §1-4).
 *
 * .docx is a ZIP of XML parts; the document body lives at word/document.xml. Each <w:p> is one
 * paragraph (anchor docx:p<n>, document order, 1-based); its text is the concatenation of every
 * <w:t> run inside it, XML-entity-decoded. No XML parser dependency — DOCX paragraphs are
 * non-nested, so a bounded regex walk over <w:p>...</w:p> blocks is sufficient and dependency-free
 * (see docs/design/spec-intake-ir.md "Zero-new-dependency constraint").
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
    .replace(/&amp;/g, '&'); // last: must not re-decode entities produced by the substitutions above
}

const P_RE = /<w:p[ >][\s\S]*?<\/w:p>/g;
const T_RE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

export function adaptWord(buf: Buffer, sourceRef: string): SpecIR {
  let entries: Map<string, Buffer>;
  try {
    entries = readZip(buf);
  } catch (e) {
    if (e instanceof ZipFormatError) throw new SpecAdapterError('word', `not a valid .docx (${e.message})`, sourceRef);
    throw e;
  }
  const docXmlBuf = entries.get('word/document.xml');
  if (!docXmlBuf) throw new SpecAdapterError('word', 'missing word/document.xml (not a valid .docx package)', sourceRef);
  const xml = docXmlBuf.toString('utf8');

  const paragraphs: AnchoredParagraph[] = [];
  const pMatches = xml.match(P_RE) ?? [];
  pMatches.forEach((pXml, i) => {
    let text = '';
    let m: RegExpExecArray | null;
    T_RE.lastIndex = 0;
    while ((m = T_RE.exec(pXml)) !== null) text += decodeXmlEntities(m[1]);
    const trimmed = text.trim();
    if (trimmed.length > 0) paragraphs.push({ anchor: `docx:p${i + 1}`, text: trimmed });
  });

  const coreProps = entries.get('docProps/core.xml')?.toString('utf8') ?? '';
  const titleMatch = coreProps.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/);
  const title = titleMatch ? decodeXmlEntities(titleMatch[1]).trim() || null : (paragraphs[0]?.text ?? null);

  const ir: SpecIR = {
    schemaVersion: 1,
    sourceKind: 'word',
    sourceRef,
    sourceSha256: sha256(buf),
    title,
    paragraphs,
    acceptanceCriteria: extractAcceptanceCriteria(paragraphs),
    warnings: [],
  };
  emptyIrWarningsCheck(ir, 'word', sourceRef);
  return validateSpecIR(ir);
}
