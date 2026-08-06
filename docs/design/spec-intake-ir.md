# Spec-IR — canonical intake representation (f3-spec-intake-ir)

Status: §1–4 implemented this canary (schema, provenance model, adapter contract, ambiguity
handling) for the **raw-US / Word / PDF / Excel** adapters. §5–6 (split criteria, AC-conservation)
live in `f4-feature-splitter`'s own section of this doc, added when that phase lands.

**Descoped this canary, explicitly:** "Confluence path refactored onto IR, byte-equivalent B0
behavior proven by golden tests" (`ROADMAP-AUTONOMOUS-SDLC.md` f3 attack-tests). B0 today ingests
Confluence/PDF/Word content directly inside `commands/feature-from-confluence.md` via MCP/Read-tool
+ LLM judgment (verified this session: `INPUT_TYPE` branches at that file's Step 2, `Branch A —
confluence` at :857). There is no deterministic function to golden-test there — "byte-equivalent
B0 behavior" can only be proven by running the real multi-turn agentic B0 flow twice (old prompt vs.
IR-refactored prompt) against the same input and diffing output. `eval-feature.ts` scores an
*already-generated* feature's output; it does not do pre/post prompt-behavior diffing, and no such
harness exists in this repo. That is an operator-level evaluation, not a `npx tsx` scoped run — same
class of gate as the B11 capture work called OPERATOR-GATED elsewhere in this project. Attempting it
here would also mean editing the single highest-blast-radius file in the kit
(`commands/feature-from-confluence.md`) without a way to prove non-regression on disk. The IR +
adapters below are additive and touch nothing on the existing Confluence path.

## §1 — IR schema (typed, versioned)

`SpecIR` (`.claude/integrations/spec-ir.ts`):

```ts
interface SpecIR {
  schemaVersion: 1;
  sourceKind: 'raw-us' | 'word' | 'pdf' | 'excel';
  sourceRef: string;            // file path / label the caller supplied
  sourceSha256: string;         // integrity of the raw bytes/text that produced this IR
  title: string | null;
  paragraphs: AnchoredParagraph[];  // normalized text, one entry per extracted unit
  acceptanceCriteria: SpecAc[];
  warnings: string[];           // non-fatal extraction notes (never silently dropped)
}

interface AnchoredParagraph {
  anchor: string;      // adapter-specific, stable, human-readable (see §2)
  text: string;
}

interface SpecAc {
  id: string;                 // AC-1, AC-2, ... stable within one IR
  text: string;
  sourceAnchor: string;       // MUST reference a real paragraphs[].anchor — enforced by validateSpecIR
  sourceQuote: string;        // MUST be a literal substring of that paragraph's text
}
```

`validateSpecIR(ir)` enforces: every `SpecAc.sourceAnchor` resolves to a real paragraph; every
`sourceQuote` is a verbatim substring of that paragraph's text (byte-traceable — an AC that fails
this is a bug in the adapter, not a downstream consumer's problem, so it throws rather than
returning a "maybe" IR). An IR that fails validation is never handed to a caller — adapters call
`validateSpecIR` on their own output before returning (fail-closed, not fail-visible-later).

## §2 — Provenance model (byte/anchor traceability)

Every format anchors differently, but the anchor string is always enough for a human to relocate
the source text without re-running the adapter:

| Adapter | Anchor format | Meaning |
|---|---|---|
| raw-US | `line:<n>` | 1-based source line number |
| Word (.docx) | `docx:p<n>` | nth `<w:p>` paragraph in `word/document.xml`, document order |
| PDF | `pdf:page<p>:run<n>` | nth extracted text run on page `p` |
| Excel (.xlsx) | `xlsx:<sheet>!<cellRef>` | sheet name + top-left cell ref (merged ranges anchor to their top-left cell) |

## §3 — Adapter contract

`type SpecAdapter = (input: Buffer | string, sourceRef: string) => SpecIR`. Every adapter:
1. Treats the input as **inert data** — extracted text is never interpreted as instructions
   (spec-injection attack-tests assert this: a payload like "ignore previous instructions" embedded
   in a paragraph is extracted as ordinary AC/paragraph text, never executed or specially branched
   on by the adapter or `validateSpecIR`).
2. Fails closed on a malformed/truncated source: throws a typed `SpecAdapterError` naming the
   format and the structural check that failed (never returns a partial/best-effort IR silently).
3. Emits `warnings[]` for recoverable oddities (e.g., a table row with more cells than the header)
   instead of dropping data silently.

## §4 — Ambiguity handling

AC detection reuses ONE heuristic (`extractAcceptanceCriteria` in `spec-ir.ts`) across all four
adapters, run over each adapter's normalized `AnchoredParagraph[]` — so "what counts as an AC" is
defined once, not reimplemented per format. A paragraph is treated as AC text when it matches a
numbered/bulleted acceptance-style lead-in (`AC1`, `AC-1`, `1)`, `Given/When/Then`, etc.); ambiguous
paragraphs that don't match are left as plain `paragraphs[]` entries, never force-fit into an AC —
under-extraction (a human adds a missed AC by hand) is preferred over over-extraction (a fabricated
AC with fabricated provenance, which `validateSpecIR` would reject anyway since it has no real
source quote).

## Zero-new-dependency constraint (this canary)

The kit's `package.json` carries no document-parsing library (`devDependencies` = tsx, typescript,
playwright, axe-core, pixelmatch, pngjs only — verified this session). Adding `mammoth`/`pdf-parse`/
`xlsx`-class dependencies is a real, repo-wide, sync-relevant decision (affects both target repos
once sync unblocks) that this canary did not make unilaterally. Word/Excel are ZIP+XML containers —
`.claude/integrations/zip-min.ts` is a minimal, dependency-free ZIP central-directory reader (uses
Node's built-in `zlib` for DEFLATE) shared by both adapters. PDF text extraction
(`spec-intake-pdf.ts`) decodes `FlateDecode` content streams (also via `zlib`) and walks `Tj`/`TJ`
text-showing operators — sufficient for text-based PDFs (the common case for an exported spec
document); scanned/image-only PDFs are out of scope (no OCR) and are rejected via `SpecAdapterError`
rather than silently returning an empty IR.
