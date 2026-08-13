# P17-002 — Provider-Neutral Workflow Orchestrator Evidence

Date: 2026-08-13

Status: complete

Scope: a provider-neutral phase contract and bounded CLI, with thin source adapters for Codex,
Claude Code, and GitHub Copilot. This task does not rewrite the flagship command, execute an
external provider, install a package, publish a marketplace artifact, sync, or push.

## Outcome

The Workflow Orchestrator now represents the existing workflow as 23 mandatory phase boundaries,
one conditional `D-cross-2` boundary, and eight ordered stages. Each transition uses an exact,
versioned envelope containing bounded input/output references, content hashes and byte counts,
gate authority, a predecessor hash, and a self hash. Resume accepts only a contiguous verified
prefix; missing, incomplete, reordered, duplicated, forged, or conditionally inconsistent traces
fail closed.

Provider adapters cannot auto-approve gates. `B9` requires literal human approval, `B11` requires
a trusted computed verification result, and `B12` derives completion from trusted verification
policy. A model-supplied success flag is not accepted as proof.

Examples now covered:

- A run stopped at `B6` resumes at `B6.5` from its verified envelope chain without replaying B0.
- An awaiting `B8` human gate remains incomplete and cannot be collapsed into a completed phase.
- A provider action smoke cannot satisfy the sanctioned golden's phase, artifact, gate, Tier, or
  resume conservation checks.
- A forged but self-consistent envelope is still rejected when its predecessor does not match the
  verified transition chain.

## Shared contract

- Core: `packages/core/src/workflow-orchestrator.ts`
- CLI: `packages/core/src/workflow-orchestrator-cli.ts`
- JSON Schema 2020-12: `docs/schemas/orchestrator-phase-envelope.schema.json`
- Boundary authority: `docs/roadmap/post-17-orchestrator-boundaries.json`
- Same-input authority: `docs/roadmap/post-17-orchestrator-golden.json`
- Contract version: `1.0.0`
- Envelope schema version: `1`
- Transport sentinel: `@@ORCHESTRATOR_RESULT@@`
- CLI modes: `create-envelope`, `validate-envelope`, `resume`, `compare-golden`
- Input bound: 4 MiB on standard input
- Runtime choice: TypeScript/Node 20+. The work is bounded JSON, hashing, validation, and transport;
  no measured capability or performance gap justified adding Python, Rust, or Go.

SHA-256 at closeout:

- Core: `1697a683cba1e8036260011c0ed7dd35e2fe738120011fb080936259175f649c`
- CLI: `f28be17e42a8d4c49e439c0ce676a80495de706bb24ac4bccf73bb7ece40f1eb`
- Phase-envelope schema: `63db57941bfa36ead984a27a6ddc4e1b18e2dac68600980429ef315cc5d46950`
- Each provider Orchestrator skill: `ecd96521f05767bb15689ea1d01727dbca88f5d16189805192e5306d175acd68`

## Golden conservation

The sanctioned baseline is the verified canonical `US-AD-095-ProgressReports` capture:

- Confluence page `830569842`
- Source SHA-256 `dd36b30b0c1c162bafac9f6b464105da6ad3310014a13ce81931f02d41c9ea93`
- 19,310 bytes, 95 paragraphs, 19 source acceptance criteria
- Verified run `run-1786560631191-1cd57bdc`
- Tier A/B exits `0/0`, `verified=true`, resume `DONE`
- Implementation commit `94c682cf370402f5fca86b90e20efed95b141b15`
- Final capture commit `fbe3291`

The test constructs a complete decomposed trace against that authority and compares input identity,
mandatory coverage, conditional disposition, gate semantics, required artifact classes, trusted
verification, and resume result. This is a deterministic contract-conservation test, not a claim
that all three external providers executed the feature. Live same-input provider parity remains
P17-007.

The golden parser is exact and fail closed. Missing or extra top-level fields, malformed reference
hashes, duplicate gate/artifact identities, non-scalar metrics, and any permission for adapter
auto-approval are rejected before comparison.

## Attack record

The core suite exercises 26 negative controls, including boundary duplication and source-order
drift; missing/extra contract keys; malformed envelope fields; hash tamper; forbidden adapter
auto-approval; weakened B9/B11 authority; missing/tampered/extra content; forged transition links;
duplicate or gapped resume traces; inconsistent conditional disposition; pending DONE state;
golden input/coverage/gate/artifact/verification/resume drift; and malformed golden shape/hash/gate
authority.

Two test fixtures were corrected during RED-to-GREEN without weakening production rules:

1. The first order attack accidentally duplicated a phase. It was changed to a true swap so the
   source-order invariant is tested independently.
2. The first transition attack changed a predecessor without rehashing the envelope. It was rebuilt
   as a self-consistent forged envelope so the chain invariant is tested independently of self-hash
   validation.

## Provider source packages

Bundle source version `0.2.0` contains Project Intelligence and Workflow Orchestrator adapters:

| Provider | Orchestrator surface | Validation |
|---|---|---|
| Codex | Agent Skill under `skills/workflow-orchestrator` | official skill + plugin validators PASS |
| Claude Code | skill plus `agents/workflow-orchestrator.md` | official skill + strict plugin validators PASS |
| GitHub Copilot | skill plus `.github/agents/workflow-orchestrator.agent.md` | official skill + repository contract tests PASS |

All three Orchestrator skill files are byte-identical and contain no provider-specific business
rules. Codex deliberately has no fabricated standalone-agent manifest. Copilot deliberately has no
fabricated plugin manifest. Self-contained archives and clean-install smoke remain P17-008.

## Verification record

```text
npm run test:workflow-orchestrator
PASS — 24 phase boundaries, chained envelopes, content verification, resume/golden conservation,
       26 attacks

npm run test:workflow-orchestrator-cli
PASS — one-sentinel transport, validate/resume, malformed/mode/size controls

npm run test:provider-bundles
PASS — 3 providers, 2 byte-identical skills, one core version, manifest/agent/security contracts

TypeScript 5.7.3 isolated no-emit check — exit 0
skill-creator quick_validate.py — PASS for all 6 skills
plugin-creator validate_plugin.py — PASS for the Codex plugin
claude plugin validate providers/claude/agentic-feature-kit --strict — PASS
claude-workflow-kit: npm test — exit 0 in 137.7 seconds on the final closeout tree
kit-dashboard: npm test — 57 files / 420 tests passed in 6.00 seconds
kit-dashboard: npx tsc --noEmit --incremental false — exit 0
git diff --check — exit 0 in both repositories
```

The repository-pinned TypeScript 4.9.5 cannot parse the installed `@types/node@26.1.0`
declarations. The isolated compiler used the session-temporary TypeScript 5.7.3 binary, emitted no
files, and changed no manifest or lockfile. Upgrading the repository toolchain is tracked separately
instead of being hidden inside P17-002.

## Boundary after completion

P17-002 delivers versioned source contracts and provider surfaces, not installable releases.
P17-008 must copy the shared runtime into self-contained packages, build archives and checksums, and
prove clean discovery/execution from isolated install roots. P17-007 remains responsible for real
same-input cross-provider parity. The 2,692-line flagship command remains byte-untouched by this
task; future decomposition can migrate phase implementations behind the verified contract.
