# P17-013 — Documentation and Runtime Claim Audit Evidence

Date: 2026-08-13  
Status: DONE  
Scope: critical public claims, local deterministic probes, and generated-output reproducibility

## Outcome

Six critical/high public claims now live in a closed `1.0.0` registry. Every claim names one unique
documentation anchor and one allowlisted in-process probe; registry data cannot provide a command or
arbitrary executable. The audit produces exactly one content-addressed `@@CLAIM_AUDIT@@` envelope and
exits `0` on pass, `1` on claim failure, or `2` on invalid audit input/runtime setup.

The audit found and corrected two real documentation drifts: root README still advertised provider
bundle/output `0.2.0` and two capabilities after bundle `0.3.0` introduced a third runtime, and the
sync section omitted the verified-run fail-closed precondition. README now states bundle `0.3.0`, all
three runtimes, and distinguishes the pre-sync verification/dirty guards from best-effort post-copy
reporting.

## Architecture and artifacts

| Artifact | Responsibility | SHA-256 |
|---|---|---|
| `docs/roadmap/p17-013-claim-runtime-audit-plan.md` | plan-first architecture, attacks, acceptance, non-goals | `da5223e5890c23bb24b485078c4322c87c02c421e572f2299d975fcee01b8130` |
| `docs/claims/runtime-claims.json` | closed claim-to-document/probe registry | `b0a35948751ec24af737b6d65e0a4c8e6db1a7683bd91dc704ac9528e7435e6e` |
| `.claude/integrations/claim-runtime-audit.ts` | audit core, typed allowlisted probes, CLI/result validation | `3fa2d398ce697b94c6dd34c12fb489c7f73c07ecd7a76f2d5e37a3d804d1c98e` |
| `.claude/integrations/claim-runtime-audit.test.ts` | real probes and hostile controls | `d7b9febc01fc4e52c243ed1e8f94a58138e80b22364a602f863d2d4ef479bab4` |
| `README.md` | corrected public distribution and sync claims | `43b9bffe1d4397c291240a3319a2c16a09ac7e216a84c7ca8e2161c59abbe5ee` |
| `scripts/build-copilot-edition.ts` | injected kit-root version authority for reproducible builds | `5fe1defb7433a619b44cd4a8a46309f4594dc07c4d71194eb63a0f967beb8c97` |

The separation is data registry → application audit core → narrow filesystem/generator probe
adapters → CLI composition. Probe verdicts are typed booleans; status is never inferred from evidence
wording. Catalog content never crosses into shell execution.

## Machine result

All six claims pass with one unique document anchor each:

- original roadmap `17/17 complete`, `reopened=false`;
- release authorities `v3.25` / package `3.25.0`;
- provider parity `codex,claude,copilot`, bundle `0.3.0`, three runtimes;
- two independent Copilot generations share tree hash
  `f2ce2f0bd2e9c5f2886af173fb6146e28eb832f51a707212c03c9f84f0d76200`;
- generated `dist/` is ignored and install/publication is explicitly excluded;
- README and runtime both expose verified and dirty fail-closed sync guards.

Result content hash:
`a4d46be88587981b2086cada03b1fd74d44c60263c643c30854accc1f3fd1789`.

## Focused and attack proof

`npm run test:claim-runtime-audit` passes eight grouped assertions. Negative controls reject:

- duplicate claim IDs, unknown probes, extra command fields, traversal paths, and invalid severity;
- package/source version mismatch;
- an omitted provider capability and non-identical shared skill;
- missing, extra, content, and line-ending-only generated-output drift;
- missing, duplicated, and stale documentation anchors;
- forged result hash, unsorted evidence, and contradictory overall status.

Existing gates remain green: version check, provider source contract, Copilot transform (6 tests),
provider distribution (3 deterministic archives, 9 clean runtime smokes, 3 attacks), and isolated
TypeScript 5.7.3 no-emit.

## Regression proof

- Final full kit `npm test` on the typed-verdict closeout state: exit `0`, 181.1 seconds.
- Full dashboard: 57 files / 420 tests, 9.59 seconds.
- Final focused dashboard after status closeout: 2 files / 6 tests, 1.22 seconds.
- Final dashboard TypeScript and both repository `git diff --check` commands: exit `0`.

## Boundaries

No automatic release publication, prompt rewriting, provider/model execution, credential access,
user-directory install, sync, push, or target `.Codex` edit occurred. TypeScript handled bounded
filesystem hashing and deterministic generation without a measured need for Python, Rust, or Go.
