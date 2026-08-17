# PR #2 clean-checkout repository-boundary remediation

**Status:** Approved in-scope PR remediation; plan locked before code
**Date:** 2026-08-17
**Affected pull request:** `p17-014-a3a-detached-signing` into `p17-014-a2d-progress-receipts`
**Observed run:** GitHub Actions `31963670605`

## Outcome

Make the public workflow-kit verification chain self-contained without deleting, skipping, or
weakening the substantive cross-repository post-17 contracts. The kit CI must run from a clean checkout
that has no sibling dashboard repository. Cross-repository contracts remain fail-closed in one
explicit workspace gate that requires both repositories.

## Reproduction and root cause

Both Linux and Windows jobs stop in
`post-17-privacy-wave-c2-schema-migration-design.test.ts` while resolving a dashboard evidence file
through `path.resolve(kitRoot, '..', 'kit-dashboard')`. Local verification passed because the
developer workspace contains both repositories. GitHub checks out only the public kit, so the
sibling path cannot exist.

The same direct dependency exists in eight registered kit commands. Fixing only the first missing
C2 file would expose the next missing dashboard dependency later in the same chain.

## Ownership decision

The public kit owns `test:kit` and its clean-checkout repository-boundary guard. The workspace owns
cross-repository composition. The dashboard continues to own its SQL, migrations, application
source, fixtures, and tests. No dashboard artifact is copied into the kit as a second editable
source of truth.

This follows dependency direction:

1. kit-domain and kit-application checks depend only on kit-owned files;
2. dashboard checks depend only on dashboard-owned files;
3. workspace composition may depend on both repositories;
4. neither product repository assumes a sibling checkout in its default CI contract.

## Exact cross-repository command registry

The workspace gate owns exactly these commands, in dependency order:

1. `test:post-17-privacy-wave-c2-schema-migration-design`;
2. `test:post-17-privacy-wave-c3-tenant-foundation-execution`;
3. `test:post-17-privacy-wave-c3c-service-role-denial`;
4. `test:post-17-privacy-wave-c3d-disposable-postgres`;
5. `test:post-17-privacy-wave-c4-verification-sink-plan`;
6. `test:post-17-privacy-wave-c4d-disposable-verification`;
7. `test:post-17-privacy-wave-c5-live-cutover-plan`; and
8. `test:post-17-control-plane-implementation-plan`.

`test:workspace-contracts` must execute all eight commands and must fail when the dashboard sibling
or any required dashboard artifact is absent. It is not a best-effort or optional test.

## Self-contained CI contract

`test:ci-repository-boundary` must:

- parse `package.json` rather than rely on prose;
- prove `test:kit` invokes the repository-boundary guard;
- recursively expand every direct `npm run`/`npm run-script` command and npm lifecycle hook
  reachable from `test:kit`, including supported npm flags;
- reject every registered cross-repository command from that graph;
- prove `test:workspace-contracts` contains exactly the eight commands above, once each and in the
  locked order;
- prove every registered command still exists and still names `kit-dashboard`, so a stale registry
  cannot silently reclassify a self-contained test;
- derive executable TypeScript/JavaScript sources for every reachable kit command and reject any
  new source or package command that names the dashboard sibling, even when it is not in the locked
  eight-command registry;
- reject a missing workspace aggregator, duplicate command, reordered command, or reintroduced
  sibling dependency; and
- avoid network, database, provider, browser, migration, sync, deployment, and target access.

## Implementation sequence

1. Add the executable repository-boundary validator and register it in `test:kit` while leaving the
   current cross-repository commands in place. Run it and record the expected RED.
2. Add `test:workspace-contracts` with the exact registry and remove only those eight commands from
   `test:kit`. Keep every substantive contract assertion unchanged; update only each validator's
   package-registration assertion from the old `test:kit` owner to `test:workspace-contracts`.
3. Run the boundary validator GREEN.
4. Run all eight workspace contracts with both current repositories; they must remain GREEN.
5. Run the relevant dashboard tests and TypeScript proof without accessing user-owned settings.
6. Run the full kit suite from the normal workspace.
7. Run the full kit suite from an isolated clean-checkout scratch tree with copied dependencies,
   no sibling dashboard, and no `node_modules` junction or reparse point.
8. Audit exact files, English feature content, credentials/internal paths, whitespace, backups, and
   unchanged dashboard tracked state. Commit source and evidence separately.
9. Non-force push only the existing PR branch, then require terminal Linux/Windows CI before a merge
   recommendation.

## Attack matrix

- missing `test:workspace-contracts`;
- one cross-repository command omitted;
- one cross-repository command duplicated;
- cross-repository commands reordered;
- cross-repository command reintroduced directly into `test:kit`;
- nested package command smuggles a registered cross-repository command into `test:kit`;
- npm lifecycle hook smuggles a registered cross-repository command into `test:kit`;
- a previously unknown reachable script introduces a dashboard sibling read;
- registry entry points to a missing package script;
- registered script no longer has a dashboard dependency;
- clean checkout has no sibling dashboard;
- workspace checkout has a missing dashboard artifact;
- dashboard user settings are absent, untracked, or unreadable; and
- Linux/Windows path separators differ.

## Evidence contract

Durable evidence must include the remote Linux and Windows errors, exact eight-command inventory,
RED before package separation, GREEN boundary attacks, GREEN workspace contracts, dashboard proof,
normal and isolated full-kit results, immutable source SHA, exact manifests, backup identifiers,
and the terminal replacement GitHub Actions run.

## Non-claims

This remediation does not claim P17-014, P17-016, or the post-17 roadmap complete. It does not
change signing behavior, privacy policy, SQL, migrations, dashboard runtime, provider behavior, or
target content. It does not authorize merge, direct-main push, sync, deployment, live database
access, or release publication.
