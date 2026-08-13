# P17-001 — Project Intelligence Wave 1 Evidence

Date: 2026-08-13

Status: complete

Scope: provider-neutral Project Intelligence core, normalized Project Profile, and thin source
adapters for Codex, Claude Code, and GitHub Copilot.

## Outcome

Project Intelligence now performs deterministic, read-only repository discovery before feature
planning. It reports the framework, language, package manager, router, i18n, styling, data layer,
HTTP/UI conventions, task taxonomy, instruction files, bounded evidence roots, and ranked nearby
reference features. Required unknowns and contradictions return `needs_input`; absence never creates
an unsupported framework or capability gate.

Examples now covered:

- A React Native repository is identified as `react-native`, never as React web merely because it
  uses React packages.
- A repository with no i18n dependency has `i18n.state=absent` and `gates.i18n=false`; the workflow
  cannot fabricate a `messages.ts` completeness rule.
- A React web repository with Vue Router evidence is rejected as `needs_input` with an evidence path.
- Multiple package-manager lockfiles are reported as a conflict instead of choosing by enumeration.

## Provider-neutral contract

- Canonical implementation: `packages/core/src/project-intelligence.ts`
- Compatibility wrapper: `.claude/integrations/project-intelligence.ts`
- JSON Schema 2020-12: `docs/schemas/project-profile.schema.json`
- Schema version: `1.0.0`
- Transport sentinel: `@@PROJECT_PROFILE@@`
- Exit codes: `0` ready, `1` needs input or safe inspection failure, `2` invalid CLI usage
- Traversal: depth two, deterministic lexical ordering, ignored dependency/build segments, no
  symlink following
- Runtime choice: TypeScript/Node 20+. No benchmark or capability gap justified adding Python,
  Rust, or Go to this bounded manifest/config scan.

SHA-256 at the verified checkpoint:

- Core source: `659e9e3eced9e7adff33475c242d6ec4c5f56c4c1e65756bec8d2273b3cbb388`
- JSON Schema: `c34e2bdd8c46f2cbbcfcf84517d44c1b91db087ad844f18d111593a6b40ed49d`
- Each provider skill adapter: `43354459773a00003413f1789c1826b9149fc09318509da67d55b65747be7164`

The identical skill hashes prove that no provider copied or forked framework/gate business rules.
Provider-specific files contain only discovery metadata, tool bounds, and invocation instructions.

## Fixtures and attacks

Five canonical fixtures are committed under
`.claude/integrations/fixtures/project-intelligence/`:

1. React web with React Router, React Intl, styled-components, TanStack Query, Axios, MUI, JSONC
   `tsconfig.json`, and a multi-signal reference feature.
2. Vue with Vue Router, Vue I18n, Sass, and Pinia.
3. React Native with Expo Router.
4. React web without i18n.
5. React web with a contradictory Vue Router signal.

The focused suite also proves read-only behavior by hashing the complete fixture tree before and
after inspection, repeat-run deep equality, stable SHA-256 profile fingerprints, exact one-line CLI
transport, and eleven negative controls covering unknown/conflicting frameworks, lockfile conflicts,
malformed manifests, missing roots, forged status/gates/fingerprints, and empty/duplicate/malformed
envelopes.

## Provider source packages

Versioned package sources live under `providers/` rather than ignored `dist/`:

| Provider | Package contract | Result |
|---|---|---|
| Codex | `.codex-plugin/plugin.json` + `skills/project-intelligence` | Official plugin validator PASS; skill validator PASS |
| Claude Code | `.claude-plugin/plugin.json` + skill + read-only agent | `claude plugin validate --strict` PASS; skill validator PASS |
| GitHub Copilot | `.github/skills` + `.github/agents/*.agent.md` | Skill validator PASS; custom-agent/content contract PASS |

`providers/provider-bundles.json` pins bundle `0.1.0` to shared core `1.0.0`. Every package contains
a detailed README, Apache-2.0 reference, compatibility boundary, and fail-closed security behavior.
Copilot deliberately has no fabricated plugin manifest. Codex deliberately has no fabricated
standalone-agent manifest.

These are source packages, not yet standalone install archives. Self-contained archive building,
package content copying, clean-install discovery smoke, and release checksums remain `P17-008`.
No installation, marketplace registration, provider/model execution, publication, sync, or push was
performed.

## Test record

Focused commands:

```text
npm run test:project-intelligence
PASS — 5 canonical fixtures, schema/envelope integrity, deterministic CLI/read-only proof,
       11 negative controls

npm run test:provider-bundles
PASS — 3 providers, one core version, identical thin skills, manifest/agent/security contracts

npm run test:post-17-wave-1-inputs
PASS — 23 mandatory phases, 1 conditional phase, 3 providers, 7 negative controls

npm run test:post-17-roadmap
PASS — 21 tasks, 4 initiatives
```

Official validators:

```text
skill-creator quick_validate.py — PASS for Codex, Claude, and Copilot skills
plugin-creator validate_plugin.py — PASS for Codex plugin
claude plugin validate providers/claude/agentic-feature-kit --strict — PASS
```

Full regressions:

```text
claude-workflow-kit: npm test — exit 0 in 154.2 seconds
kit-dashboard: npm test — 57 files / 420 tests passed in 7.27 seconds
kit-dashboard: npx tsc --noEmit --incremental false — exit 0
git diff --check — exit 0 in both repositories
```

## Recorded RED-to-GREEN corrections

1. The first Windows CLI test used `npx.cmd` with `shell:false` and returned `status=null`. The test
   now launches the local `tsx` module with `process.execPath`; production behavior was unchanged.
2. Runtime schema validation exposed non-canonical package-manager conflict evidence. Evidence
   collections are now sorted and deduplicated before profile hashing.
3. The first full regression passed all functional suites but failed the existing README version
   stamp gate after provider-neutral wording replaced the exact machine stamp. The exact
   `Kit version **v3.25**` declaration was restored; the validator was not weakened, and the full
   suite then passed.

## Boundary after completion

P17-001 is complete. P17-002 may now implement typed phase envelopes and resume conservation using
this Project Profile as a bounded input. P17-008 remains responsible for true installable bundles;
the presence of valid provider source packages must not be reported as clean-install evidence.
