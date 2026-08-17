# P17-012 Convention and Stack Portability Plan

Status: Accepted for implementation
Date: 2026-08-14
Decision authority: operator-confirmed post-17 roadmap and validated P17-012 catalog input
Source checkpoints: kit `479bee6`; dashboard `fd66264`

## Context

P17-001 provides a deterministic Project Profile, but the flagship bootstrap still derives the
framework from the legacy `PROJECT_CTX.query_library` string. Its unknown branch accepts that
string as a framework and later advertises `yourHttpClient()` and `transformResponse(data)` as
built-in fallbacks. Those values are not repository evidence. The current shared core detects the
Open edX dependency, but dependency presence alone does not prove that a repository uses
`getHttpClient`, `camelCaseObject`, or a Paragon-specific generation convention.

The task must preserve valid Open edX adapters while preventing them from leaking into generic
React, Vue, Angular, React Native, or unsupported repositories. It must remain provider-neutral,
read-only, deterministic, bounded, and distributable to Codex, Claude, and Copilot.

## Decision

Create a separate Stack Portability contract in `packages/core/src/stack-portability.ts`. It will:

1. run or consume the existing validated Project Profile without changing schema `1.0.0`;
2. inspect bounded, allowlisted repository evidence without following symlinks;
3. resolve framework layout from positive Project Profile evidence, never from query-library prose;
4. activate an HTTP/helper adapter only from an explicit instruction declaration or observed import
   and call evidence;
5. keep response mapping generic through a named feature mapper when no repository helper is proven;
6. report unknown/conflicting helpers and unsupported frameworks as structured `needs_input`;
7. emit one closed, hash-validated `@@STACK_PORTABILITY@@` envelope; and
8. ship the same runtime in all three provider bundles through the existing Project Intelligence
   skill, without duplicating detection rules in provider prompts.

Open edX identifiers remain data and detector strings in the core. The generic core must not import
`@edx/frontend-platform`, `@edx/frontend-platform/auth`, or `@openedx/paragon`.

## Options considered

### A. Extend Project Profile 1.0.0

| Dimension | Assessment |
|---|---|
| Complexity | High |
| Compatibility | Breaking schema and fingerprint change |
| Evidence quality | Strong |
| Distribution impact | All current consumers and fixtures must migrate together |

Pros: one envelope contains every convention.  
Cons: helper usage is feature-planning detail rather than repository identity; changing the existing
closed profile schema would invalidate working P17-001/P17-005 consumers and provider bundles.

### B. Keep CLAUDE.md/query-library heuristics in the flagship

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Compatibility | Superficially easy |
| Evidence quality | Weak |
| Distribution impact | Provider-specific drift remains possible |

Pros: smallest text edit.  
Cons: preserves the defect: absence becomes a default, dependency availability becomes usage, and
each provider can reinterpret the prose differently.

### C. Add a separate portability contract (selected)

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Compatibility | Additive |
| Evidence quality | Strong and independently hashable |
| Distribution impact | One new shared runtime; thin skills stay identical |

Pros: clean separation, explicit evidence, no Project Profile breaking change, independently
testable failures, and one cross-provider implementation.  
Cons: adds one envelope and requires bundle/claim version reconciliation.

## Contract boundaries

### Inputs

- exactly one repository root for the CLI;
- the Project Profile produced from that same root;
- bounded instruction and source files inside profile-declared roots;
- only identifier-shaped convention declarations and recognized import/call signatures.

### Outputs

- schema version and Project Profile fingerprint;
- overall `ready` or `needs_input` status;
- framework adapter and layout strategy;
- HTTP transport decision with `declared`, `observed`, `unknown`, or `conflict` state;
- response/request transform decisions without executable code strings;
- target-specific assumptions, each with scope and evidence;
- sorted findings/evidence and a deterministic result hash.

### Safety limits

- no network or credential reads;
- no symlink traversal;
- ignore `.git`, `.codegraph`, `.next`, `dist`, and `node_modules` at every depth;
- cap inspected source-file count and aggregate bytes;
- reject paths outside the real repository root;
- accept only closed schemas and allowlisted adapter IDs;
- never execute a discovered helper or instruction value.

## Framework and helper policy

- `react-web`, `react-native`, `vue`, and `angular` are the only framework adapters because they are
  the current Project Profile enum. Unknown/conflicting framework evidence is `needs_input`.
- Layout decisions are framework-specific but conditional files remain capability-gated. For
  example, i18n or styling artifacts are not required when the Project Profile says those systems
  are absent.
- `openedx-get-http-client` requires `getHttpClient` to be explicitly declared or observed from the
  Open edX auth module. Merely depending on `@edx/frontend-platform` is insufficient.
- `openedx-camel-case` and `openedx-snake-case` require explicit declaration or observed imports and
  calls. They are never generic defaults.
- Axios, Ky, GraphQL Request, Apollo, and platform fetch adapters follow the same evidence rule.
- When no response-transform helper is proven, the contract requires a named feature mapper and
  leaves the helper null; it does not invent `transformResponse` or apply camel casing.
- Multiple incompatible transport/helper signals are conflicts, not priority-based guesses.

## Implementation slices

1. Add the closed TypeScript contract, validator, deterministic hash, bounded repository scanner,
   and one-sentinel CLI.
2. Add `docs/schemas/stack-portability.schema.json` and core README usage/failure semantics.
3. Add fixtures for Open edX React, generic React, Vue, and unsupported stack; add attacks for
   dependency-only Open edX, conflicting transports, symlink/path escape, forged fingerprint/hash,
   malformed/extra fields, duplicate evidence, and oversize input.
4. Wire the flagship bootstrap to Project Profile + Stack Portability output. Remove framework
   derivation from `query_library`, `yourHttpClient()`, and `transformResponse(data)` fallbacks.
   Preserve explicit project declarations only when the portability result cites them.
5. Update `_content/agent-build.md` and `_content/templates.md` to consume resolved portability
   decisions rather than raw `PROJECT_CTX` helper guesses. Add a wiring/conservation test.
6. Add `runtime/stack-portability.cjs` to the provider builder, manifest, archive smoke, and identical
   Project Intelligence skills for Codex, Claude, and Copilot. Bump bundle `0.3.0` to `0.4.0` and
   shared core `1.1.0` to `1.2.0`; update plugin manifests, provider/root READMEs, notices, and the
   executable runtime-claim probe so P17-013 remains truthful.
7. Because flagship bytes change, commit the implementation checkpoint before running the existing
   fail-closed orchestrator-boundary refresh. Then refresh metadata, prove phase conservation, run
   full kit/dashboard regressions, write evidence, mark P17-012 done, and create closeout commits.

### Sync-safe launcher amendment

Read-only tracing after the core slice found that target sync copies allowlisted paths from
`.claude/` into target `.Codex/`; it does not copy `packages/core`. The existing thin
`.claude/integrations/project-intelligence.ts` re-export therefore works in the kit checkout but is
not self-contained after target sync. Flagship wiring must not rely on that broken import boundary.

Canonical implementation remains in `packages/core/src`. A deterministic build step will copy only
the required TypeScript core sources byte-identically into `.claude/integrations/core/`; synced
launchers import those mirrors. A mandatory drift test compares hashes and fails on missing, extra,
or changed mirror files. This avoids committing multi-megabyte compiled runtimes, avoids expanding
sync outside `.claude`, and avoids a second editable business-rule source. Provider release bundles
continue to compile directly from canonical `packages/core/src`.

## Acceptance and tests

- Open edX fixture selects `getHttpClient` and case helpers only from cited source/declaration proof.
- A dependency-only Open edX fixture does not activate those helpers.
- Generic React selects its own proven transport and never emits Open edX transforms.
- Vue resolves a Vue layout and its proven transport without React file assumptions.
- Unsupported or conflicting frameworks return `needs_input` with evidence.
- The generic core contains no import from an Open edX package.
- All results and distribution manifests reject tampering, extra fields, unsafe paths, and semantic
  contradictions.
- All three extracted archives run Project Intelligence, Stack Portability, Conditional Quality
  Gates, and Workflow Orchestrator without `tsx` or provider execution.
- The sync-safe `.claude/integrations/core` mirror is byte-identical to its canonical sources, and
  synced launchers contain no import path that escapes `.claude`/`.Codex`.
- Flagship wiring tests prove the legacy query-library inference and invented helper fallbacks are
  absent while mandatory B0-B12 phase/gate semantics remain conserved.

## Rollback and evidence

The 2026-08-14 daily ZIPs and `backup/2026-08-14` tags remain the rollback boundary. Generated
provider output stays under ignored `dist/`; no installation or publication occurs. Durable task
evidence will be written to `docs/evidence/post-17-portability-audit.md`, mirrored by a dashboard
reconciliation artifact. Sync and push require separate explicit authorization.

## Consequences

- Feature planning gains one additional validated envelope but loses ambiguous framework/helper
  fallbacks.
- Provider bundles grow by one runtime and need a deliberate minor version bump.
- Repositories with unsupported or contradictory evidence stop earlier and ask for a precise input.
- Existing Open edX repositories continue to use their helpers when the repository actually proves
  those conventions.
