# P17-016 Wave C5B Operator Application Contract Evidence

**Date:** 2026-08-20

**Scope:** Provider-neutral local operator application contract only

**Source commit:** `ff892d92d7ff36452a474dba9405a659e6c6d6aa`

**Qualified source tree:** `21a69aec7d214f985f6d5a35676c08c6b3162a98`

## Outcome

The C5B operator application contract is locally source-qualified. It adds a core-owned incremental
prefix gate, narrowly typed capability ports, canonical one-pass orchestration, closed metadata-only
results, and reached-state cleanup/unfreeze compensation.

This slice is not a provider adapter and does not execute provider, database, backup, restore,
filesystem, process, browser, SQL, or network operations. Live C5B and P17-016 remain incomplete.

## Qualified decisions

The plan validator locks:

- `application=A1` — one provider-neutral application service;
- `gate=G1` — core semantics are enforced before every next port;
- `ports=P1` — one narrowly typed method per capability;
- `compensation=C1` — reached-state, at-most-once cleanup and unfreeze;
- `result=R1` — deeply frozen metadata-only results; and
- `runtime=T1` — TypeScript remains selected without a measured threshold breach.

The service never delegates `complete_preflight` to infrastructure. It unfreezes writers before
creating the final core receipt, and a failed unfreeze returns no completion receipt.

## Red-to-green evidence

1. The registered plan validator first exited `1` with exactly one missing item: the operator plan.
2. After the plan passed unchanged, the complete fake-port test first exited `1` with exact
   `MODULE_NOT_FOUND` for the absent operator module.
3. The first implementation run exposed one reached-state defect: a validated
   `freezeConfirmed=true` receipt with active writers blocked correctly but did not unfreeze. The
   service now records the reached freeze before prefix evaluation.
4. The refusal matrix separately corrected its expectation so a refused freeze does not unfreeze.
5. Adversarial review added a compensation attack where cleanup claimed confirmation with one
   residual resource. The attack failed before correction and now blocks as `cleanup_incomplete`.

No gate was skipped or weakened to obtain GREEN.

## Focused and type qualification

- Operator application tests: `9/9` grouped checks passed.
- Core packet/receipt/prefix/final tests: `9/9` grouped checks passed.
- Plan validator: `A1/G1/P1/C1/R1/T1` locked.
- Parent C5B validator: `B1/P1/O1/R1/F1/S1/T1` locked.
- Canonical roadmap: `22` tasks and `4` initiatives.
- Synced-core generator: `8` byte-identical files.
- Synced-core attacks: `4` assertions passed.
- TypeScript `5.9.3`: strict, no emit, and `skipLibCheck=false` with zero diagnostics over the exact
  operator/core/test/validator set.

## Provider and public-source qualification

- Provider core: three providers, two byte-identical skills, five shared runtimes, and all
  version/schema/manifest/agent/security contracts passed.
- Provider distribution: three deterministic archives, `71` entries, eight schema-valid and
  secret-clean sidecars, `11` checksums, `79` text scans, `15` runtime smokes, and four attacks.
- Public release readiness: one canonical case plus `40` attacks passed.
- Public Git-index Node adapter: `7/7` tests passed.
- Public release contract: `18/18` tests passed.
- Link readiness: `200` Markdown files and `48/48` valid relative links.
- License readiness: four lockfiles, `754` dependency occurrences, and `617` unique dependencies.
- Secret readiness: `668` text files, ten detector families, and zero findings.
- Final public-source status: `eligible-for-r5c2` across `671` manifest paths before this evidence row.

All public-source checks were bound to the exact staged index. Positive-controlled scans found no
project URL, dashboard project reference, JWT, secret-key, private-key, service-role assignment, or
non-English feature content in the source checkpoint.

## Full-kit qualification

Native `npm test` completed with exit code `0` in `411.3` seconds and produced `2,226` output lines on
the exact source tree. Final checks retained:

- package and prompt version `v3.25`;
- prompt size `163,206` bytes within budget; and
- lesson synchronization `60/60`.

The only warnings were the existing malformed lesson-fixture warnings used by negative tests.

## Exact source manifest

The source commit contains exactly:

- `.claude/integrations/core/live-cutover-preflight-operator.ts`;
- `.claude/integrations/core/live-cutover-preflight.ts`;
- `docs/roadmap/p17-016-wave-c5b-operator-application-plan.md`;
- `package.json`;
- `packages/core/src/live-cutover-preflight-operator.ts`;
- `packages/core/src/live-cutover-preflight.ts`;
- `packages/core/test/live-cutover-preflight-operator.test.ts`;
- `packages/core/test/live-cutover-preflight.test.ts`;
- `release/public-release-manifest.json`;
- `scripts/build-synced-core.ts`; and
- `scripts/post-17-privacy-wave-c5b-operator-application-plan.test.ts`.

The canonical and generated operator files are byte-identical. The existing preflight core and its
generated mirror are also byte-identical after the prefix-gate refactor.

## Live capability reconciliation

The separately approved live preflight was attested read-only and stopped before mutation because
the current environment did not provide the complete provider recovery point, protected logical
backup, database connection, and isolated-restore capability chain required by S1.

No writer freeze, backup, restore, cleanup, unfreeze, SQL, migration, cutover, or live completion
receipt occurred. This local operator contract does not convert missing capabilities into success.

## Non-claims

This evidence does not claim a live project matched, catalog or ACL metadata was read, writers were
frozen, a provider recovery point was created, an encrypted logical backup exists, backup bytes were
produced, an isolated database was restored, restored-state parity was observed, cleanup ran, writers
were unfrozen, live C5B completed, P17-016 completed, or any dependent task became ready.

It records no project identity, URL, host, connection material, credential, key, provider exception,
artifact path, backup bytes, SQL body, row value, subject identity, or machine identity. No sync,
target, target `.Codex`, push, merge, tag, release, publication, visibility, credential, key, grant,
or broad deletion action is part of this evidence checkpoint.
