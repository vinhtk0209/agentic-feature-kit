# P17-003 — Provider-Neutral Semantic Specification Model Evidence

Date: 2026-08-13  
Status: DONE  
Scope: shared offline TypeScript contract only

## Outcome

The shared core now owns Semantic Specification schema `1.0.0`. It separates normalized intent
(`semanticHash`) from source-specific evidence (`provenanceHash`), preserves literal source anchors
through transformations, and represents contract knowledge as `known`, `unknown`, or `conflict`.
Missing API information is emitted as `API_CONTRACT_UNSPECIFIED`; no endpoint is guessed.

This task does not implement Jira/Azure DevOps transport or RAG. The Jira input in the equivalence
fixture is source-neutral offline data used only to prove semantic normalization.

## Artifacts

| Artifact | SHA-256 |
|---|---|
| `packages/core/src/semantic-spec.ts` | `0ba61ac4cc6277e94bf24876a5a70895132bc549358fa9d7e82e4604ff7d9745` |
| `docs/schemas/semantic-spec.schema.json` | `1cbbb4188cf339a3442b2ecec337279d97abf91229962e3d7b3f5b56ed868e9d` |
| `packages/core/test/fixtures/semantic-spec-equivalence.json` | `76f9f832d08f2f61d7aa498358c9c3879d7f4caf2e4bd4c4a908b27801cf7166` |

The source-neutral Confluence-table and Jira-prose fixtures produce the same semantic hash:
`f15ac0657eb1f98075d01ba68436e73f266100c7e83450084a3fbd7099c07489`.
Their provenance hashes remain intentionally different:

- Confluence: `cf33e62c68b9f797bb3f634e0a73092020990fb238200c5f1b975627eaa28772`
- Jira: `1fc890917a5a9f217c51af752462d9207773eca9e891b406737aa72ddf230528`

## Canonical baseline conservation

The immutable offline `US-AD-095-ProgressReports` SpecIR baseline normalizes to 19 requirements with
all 19 IDs, anchors, and literal quotes conserved. Its source SHA remains
`dd36b30b0c1c162bafac9f6b464105da6ad3310014a13ce81931f02d41c9ea93`.

- Semantic hash: `af8fa6fcaf313cdb0eda8e5207c1544ba6f7a3acef2edeab927393eda4750ca9`
- Provenance hash: `0445ebc817f91faaebf98e3aa869eeccade3979a7a1764224654ce8074de1568`
- Ambiguities: one explicit missing `api.contract`; no inferred value

## Focused proof

`npm run test:semantic-spec` passes 8 positive assertions and 12 attacks:

- exact semantic equivalence across source formatting;
- exact JSON round trip and content-hash validation;
- provenance/field conservation through semantic transforms;
- explicit known/unknown/conflict behavior;
- real 19-AC baseline conservation;
- fabricated source and contract quotes rejected;
- duplicate IDs, guessed unknown values, removed required ambiguity, forged hashes, undeclared
  sources, extra fields, lossy cross-source conservation, malformed JSON, and empty input rejected.

An isolated TypeScript 5.7.3 no-emit compilation of the core and focused test exits `0`. The newer
temporary compiler remains isolated because the repository-pinned TypeScript 4.9.5 / installed
`@types/node` parser drift is a pre-existing toolchain item, not part of P17-003.

## Regression proof

- `npm test` in `claude-workflow-kit`: exit `0`, 193.8 seconds.
- `npm run test:post-17-roadmap`: `PASS (21 tasks, 4 initiatives)`.
- Dashboard full Vitest: 57 files / 420 tests, 7.89 seconds.
- Dashboard `npx tsc --noEmit`: exit `0`.
- Kit and dashboard `git diff --check`: exit `0`.

## Boundaries

No provider/model execution, source transport, RAG, install, publication, sync, push, target
`.Codex` edit, or credential access occurred. TypeScript satisfies this bounded deterministic
JSON/text model; no measured capability or performance gap justified Python, Rust, or Go.
