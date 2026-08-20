# P17-016 Wave C5B provider recovery-point capability evidence

**Date:** 2026-08-20
**Status:** Source-qualified; exact-head remote qualification pending
**Roadmap task:** P17-016
**Decision lock:** `A1/P1/B1/R1/L1/Q1/M1/O1/N1`
**Source commit:** `d92e29212c8e226f30351de82ec935882dfabb8e`
**Source parent:** `32e7a6cbf5f0697690ee0181b52d10d86322f3a8`
**Source tree:** `2227c50dd638ca17fab19f0f8da865f53b4e1fab`

## Outcome

The fourth canonical C5B operation now has a provider-neutral Node capability instead of an
arbitrary caller-authored recovery receipt. The capability admits only an exact packet and the three
completed predecessor receipts, then calls separately implemented creation and observation sources
inside the active writer-freeze window.

Creation transfers one bounded opaque correlation token into capability ownership. Independent
observation must bind the exact capability, attempt, packet hash, creation state, restorable state,
creation time, and retention expiry. Success returns only a domain-separated metadata hash, the
boolean recovery claim, and expiry. Any state after the creation call is terminal and quarantined;
there is deliberately no destructive recovery-point cleanup port.

This is local infrastructure qualification. No provider adapter, provider API, project, database,
writer mutation, recovery point, backup, restore, sync, release, or publication action occurred.

## Qualified source boundary

The source commit changes exactly eight paths:

- `.claude/integrations/core/live-cutover-provider-recovery-point-node.ts`;
- `docs/roadmap/p17-016-wave-c5b-provider-recovery-point-capability-plan.md`;
- `package.json`;
- `packages/core/src/live-cutover-provider-recovery-point-node.ts`;
- `packages/core/test/live-cutover-provider-recovery-point-node.test.ts`;
- `release/public-release-manifest.json`;
- `scripts/build-synced-core.ts`; and
- `scripts/post-17-privacy-wave-c5b-provider-recovery-point-capability-plan.test.ts`.

The canonical module and generated mirror are byte-identical with SHA-256
`bea24764828fae99ded6ad7796bf89a4780a26f90b3aa0500d2fd866ea84a9ac`. The source manifest has
`713` unique ordinal-sorted entries and exactly five new source admissions. Existing package and
builder entries were reused rather than duplicated.

## Runtime contract

### Admission and single attempt

- The context must contain an exact validated packet and exactly three valid predecessor receipts.
- The next canonical operation must be `create_provider_recovery_point`.
- Invalid prefixes perform zero source calls and do not consume the factory.
- Once creation starts, concurrent replay, sequential replay, and overlapping packets are refused.
- Every result after source access is terminal because provider state may exist even when it cannot
  be independently observed.

### Trust separation and bounds

- Creation and observation source objects and callable identities cannot alias.
- Validated configuration and callables are snapshotted at factory construction.
- Each source receives its own bounded `AbortSignal`.
- Each deadline is the minimum of configured timeout, packet step maximum, and remaining freeze
  time; the timer remains referenced so Node cannot exit while an operation is unresolved.
- Trusted timestamps must be canonical, monotonic, and inside the freeze window.
- A late creation result is ignored publicly and its valid token is zeroized through a late cleanup
  continuation.

### Correlation ownership

- Creation may return only one bounded, non-empty, non-shared `Uint8Array` data property.
- Source bytes are copied and zeroized before observation.
- Observation receives a separate copy; observation, capability-owned, and retained source buffers
  are zeroized at terminal cleanup.
- Token bytes never enter the metadata hash, result, error, log, file, or durable evidence.

### Independent recovery proof

- Observation must return exactly the configured capability ID, packet attempt ID, packet hash,
  `recoveryPointCreated=true`, `restorable=true`, canonical creation time, and canonical expiry.
- Creation cannot precede the freeze receipt or follow operation completion.
- Expiry must exceed the packet freeze expiry, and retention must remain inside configured minimum
  and maximum bounds.
- Accessors, Symbols, proxies, unknown fields, binding drift, false claims, invalid clocks, and
  malformed retention collapse to a closed provider refusal.

### Metadata-only result and quarantine

- SHA-256 covers a fixed-key JSON object under the domain
  `agentic-feature-kit/c5b/provider-recovery-metadata/v1\0`.
- Success contains exactly `recoveryPointCreated`, `recoveryPointMetadataHash`, and `expiresAt`.
- Provider text, resource ID, project identity, URL, host, path, credential, SQL, application value,
  and correlation material cannot cross the shared boundary.
- The factory exposes no delete or expire method. Uncertain state remains available for operator-led
  recovery instead of being destructively compensated.

## RED and review chronology

1. The registered plan validator first failed only because the decision plan was absent.
2. The first plan draft missed the validator's exact `accessor property` attack wording; the text was
   corrected without changing the design.
3. The runtime attack harness then reached the exact absent module/export and failed as intended.
4. The first implementation appeared to pass but printed only `2/9` groups. Review proved the sole
   deadline timer was unref'ed, so Node exited while a promise remained unresolved. Keeping the
   deadline referenced converted the false green into an honest `7/9` RED.
5. The `7/9` run exposed a retained source-token mutation and an operator fixture using the wrong
   public call shape. Terminal source re-zeroization and the real dependency envelope closed them.
6. The next `8/9` run exposed an attestation timestamp outside its operator receipt. A deterministic
   contract-valid chronology corrected the fixture without weakening production validation.
7. Repository-local TypeScript `4.9.5` could not parse installed newer Node declarations. The
   already-installed documentation compiler `5.9.3` reached the new files and found one real readonly
   fixture mutation. Constructing a shortened immutable context fixed it.
8. Final focused execution passes all `9/9` groups, and TypeScript 5.9.3 strict source checking emits
   zero diagnostics.

No test assertion, timeout, privacy detector, strictness flag, provider boundary, parent schema, or
quarantine rule was weakened to obtain GREEN.

## Focused attack matrix

The focused runtime suite passes nine grouped attacks:

1. malformed, accessor, Symbol, proxy, mutable, aliased, and widened dependencies;
2. invalid prefix, missing freeze, replay, concurrency, overlap, and zero I/O before admission;
3. creation exception, malformed result, timeout, abort, actual late settlement, and quarantine;
4. empty, oversized, shared, wrong-type, accessor-backed, mutated, and leaked correlation material;
5. malformed or hostile observation, binding drift, false creation, and non-restorable state;
6. freeze chronology, retention bounds, canonical time, clock exception, and rollback;
7. exact deterministic metadata hashing, immutability, and no raw provider material;
8. terminal success or uncertainty with no destructive lifecycle surface; and
9. real operator ordering through logical-backup refusal, exact unfreeze, and static no-I/O proof.

## Qualification matrix

| Gate | Result |
|---|---|
| Provider recovery plan | PASS, nine decision locks |
| Provider recovery runtime | PASS, `9/9` grouped attacks |
| Preflight core | PASS, `9/9` |
| Operator application | PASS, `9/9` |
| Project attestation | PASS, `9/9` |
| Catalog/ACL probe | PASS, `9/9` |
| Writer freeze | PASS, `9/9` |
| Logical-backup chain | PASS, executable `9/9`, connection `8`, adapter `11` groups |
| Strict TypeScript 5.9.3 | PASS, zero source diagnostics with library declarations skipped |
| Synced core | PASS, four generator attacks and `15` byte-identical files |
| Public readiness | PASS, one canonical plus `40` attacks |
| Git-index public adapter | PASS, `7/7` |
| Provider distribution | PASS, `71/8/11/79/15/4` qualification counts |
| Public source readiness | PASS, `713` paths, `214` Markdown, `48/48` links, zero issues |
| Dependency catalog | PASS, `4` lockfiles, `754` occurrences, `617` unique |
| Secret readiness | PASS, `710` text files, ten families, zero findings |
| Full native kit | PASS, exit `0`, `279.4s`, `2360` output lines |

The full run preserves v3.25, prompt budget `163,206/176,128`, the current feature index, and `60/60`
lesson synchronization.

## Encoding, privacy, and source audit

All eight source paths pass strict UTF-8, no BOM, final LF, no CR, and no trailing whitespace. The
trailing-whitespace negative scan was accepted only after its positive control matched. Feature
content is English. Cached diff check and the exact eight-path Git index both pass.

Public readiness reports `713` unique ordinal-sorted paths, `48/48` valid internal links, `617`
unique dependencies, and zero findings across ten secret-detector families. The implementation
imports no filesystem, process, network, provider SDK, database, browser, or logging surface.

## Backup and rollback

The verified daily rollback boundary predates all source edits:

- ZIP SHA-256 `f4bdc06c3f55919cfa590d90809680885f8898d29099fb7108c4a6d1e06e837a`;
- Git tag `backup/2026-08-20` at `4230aa6b7c754bfd39427b6efc60c1a124475952`; and
- exact source commit/tree listed above.

No throwaway dependency junction, hard reset, hook bypass, or direct target edit was used.

## External effects and non-claims

The provider recovery source itself has not been pushed or opened as a PR at the time of this
evidence snapshot. No provider, database, dashboard, target, or Supabase mutation occurred.

No direct-main push, branch deletion, target `.Codex` edit, sync, tag, release, package publication,
marketplace publication, or visibility change occurred.

This evidence does not claim that a live project was attested, writers were frozen, a provider
recovery point exists, a logical backup or isolated restore exists, C5B is complete, or P17-016 is
complete. The encrypted logical-backup operation remains the next canonical runtime composition
boundary after this capability is remotely merged.

## Remote qualification still required

The evidence commit must add only this document and its sorted manifest row. Its exact head must be
pushed non-force to the retained provider-recovery branch, opened as a Draft PR into current `main`,
and pass fresh Linux, Windows, aggregate, artifact, exact-head, Ready, standard-merge, merge-parent,
merge-tree, and retained-branch verification before this capability is remotely complete.
