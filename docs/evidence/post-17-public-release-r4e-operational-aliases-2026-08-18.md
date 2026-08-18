# P17-018 R4E Public Operational Aliases — Evidence

**Date:** 2026-08-18
**Scope lock:** `slice=R4E, surfaces=S1, aliases=A1, regression=G1, registry=R1, evidence=E1`
**Starting merge:** `8220db9b79193f6aa16b8b2ed377b4d94cbc2297`
**Qualified source:** `5115d657c428be23456bf7eefe8f524dc62e9a81`
**Qualified source tree:** `32572f37a260c222fbf336f373b51ff48ae1a80f`
**Status:** Source qualified; evidence candidate under verification

## Result

R4E replaces five private workspace-identity spans in four public operational surfaces with the
stable public aliases `example-learning-app` and `example-authoring-app`. The affected surfaces are
the image-reuse guidance, source-of-truth comments, public API rollback example, and sync rollback
example. Runtime behavior and historical design/evidence remain unchanged.

The public-release contract remains intentionally fail-closed. Source authority is 619 included
paths, zero excluded paths, 10 classified occurrences, and nine unresolved marker dispositions.
The evidence row advances path authority to 620 included paths without changing marker authority.

## Rollback authority

- Daily Git tag: `backup/2026-08-18` at
  `88005e5bd14764c2d57bd02a261dcc637307bf02`.
- Daily worktree archive SHA-256:
  `468184283a30dd995f8513bea6e262d66fe93242ab75c19397c9def1fae812c0`.
- R4E starting merge: `8220db9b79193f6aa16b8b2ed377b4d94cbc2297`.
- Source commit can be reverted as one bounded unit. Registry or manifest bytes must not be reverted
  independently from the four transformed surfaces and their contracts.

## Scope and identity proof

The source commit contains exactly 13 paths. Its LF-final path-manifest SHA-256 is
`c1544bbf499547ea825e8b07b03ea44246b425edb656751346ab28b51154abc7`.
The evidence scope contains exactly this file plus `release/public-release-manifest.json`; its
LF-final path-manifest SHA-256 is
`caa319109c3c4b56c5035cdfe0a35440c4922cfc7523f6a39ec4adace4d15069`.

Source commit readback proves:

- parent `8220db9b79193f6aa16b8b2ed377b4d94cbc2297`;
- tree `32572f37a260c222fbf336f373b51ff48ae1a80f`;
- subject `feat(release): genericize public operational aliases`;
- 13 files, 641 insertions, and 53 deletions; and
- normal pre-commit `spec-integrity` passed over six TypeScript files.

## Canonical transformation receipts

Each transformation is reversible after canonical LF normalization. Exact canonical
source-to-transformed SHA-256 and line authority is:

| Surface | Source SHA-256 | Transformed SHA-256 | Lines |
|---|---|---|---:|
| Image-reuse guidance | `8b7cea3c9e4a354753fd925817b0e0d34a293cc464c58599544a3867cb1a8fa2` | `2af4469dce889d39abebdb6a43d135506672ff3b8b35d954619f33f49e0b37a2` | 321 |
| Source-of-truth comments | `c11d7b239ca25f1480d848187c2e8203faa9ee273289dd22208d6c17bd0c2790` | `03042f82c599e1627837a359698361ae7831c29260a830709637c7b509a6a384` | 52 |
| Public API rollback example | `3196e7205a07ceeaecf738babf678ff15dc220ab228b136cd0091f1f7fccfe57` | `637bbe2dc5677f8d07f3910f520a9a215ac89a4bf873a6fa2002308ed7e5178f` | 82 |
| Sync rollback example | `dfcfe7468d387e8bb6421738e19b023cfdee9ee44ee21c372c5a14358b3129e3` | `312fc77e346f50bbd64046fd752cf2ea2ae96dd405970c71172a95ce48448360` | 726 |

The source-of-truth surface contains one learning and one authoring alias. Each other surface
contains exactly one learning alias. Positive-controlled scans report zero retired candidate values
in these four paths while the unmodified historical-design corpus remains a known positive control.

## Marker and manifest authority

- Marker registry SHA-256:
  `12d808b79237aeb2dafcaa51cab17836e567462ce81bf48615a1dd58d13567ea`.
- `workspace-target-learning`: two occurrences and two bindings remain.
- `workspace-target-authoring`: six occurrences across five bindings remain.
- Live-project and local-path categories remain one occurrence/binding each.
- Total authority: 10 classified occurrences, nine bindings, all `genericize`.
- Source manifest: `619 total / 619 include / zero exclude`.
- Evidence manifest: `620 total / 620 include / zero exclude`.
- Contract mode: `contractValid=true`, `candidateStatus=blocked`.
- Eligibility mode: exits `1` with exactly the same nine unresolved dispositions.

No finding is suppressed. The nine remaining bindings are intentionally assigned to a later
historical-design/evidence slice.

## TDD and correction history

1. The readiness validator was package-registered before the plan and exited `1` with the sole gap
   `R4E public operational aliases plan`.
2. The first post-plan run rejected a parent-plan assertion because raw Markdown wrapped one phrase
   across a line break. Normalizing parent Markdown fixed the validator without changing policy.
3. The operational contract passed 10 pure attacks and reported exactly six current-tree gaps before
   remediation: surface transform, registry, R4C monotonicity, R4D monotonicity, Node authority, and
   release-manifest routing.
4. The first post-remediation run left only the surface-transform gap. Diagnostics proved exact
   aliases/lines and identified pre-existing Windows CRLF worktree checkout form in three files.
   Canonicalization was restored only at the current-worktree adapter; the pure CRLF attack and
   staged Git-index byte/filter authority remain strict.
5. The first static-audit wrapper was parser-invalid before assertions because its positive-control
   fragment used the wrong PowerShell array syntax. It made no mutation.
6. The next audit used culture-sensitive sorting while claiming ordinal authority. It was rejected,
   replaced with `[StringComparer]::Ordinal`, and rerun from the first assertion.
7. The first Node Git-index run correctly rejected a stale marker-registry digest even though marker
   counts were already `10/9`. Binding the manifest to the exact staged registry SHA-256 closed the
   sole gap; Node then passed `7/7`.
8. The first normal commit invocation was blocked before hook tests because the restricted sandbox
   omitted helper executables required by the npm shim. The same commit ran outside that restriction;
   no hook was bypassed.

These RED and invalid-invocation receipts are retained because they demonstrate fail-closed
behavior and distinguish product failures from test-wrapper or environment failures.

## Focused and strict verification

The staged and immutable source states pass:

- R4E readiness: `S1/A1/G1/R1/E1`;
- operational aliases: 10 attacks and six current surfaces;
- prompt-history aliases: 12 attacks and five current surfaces;
- private-archive boundary: 11 assertions and seven current surfaces;
- legacy backend config: `7/7`;
- synthetic fixtures: 11 attacks and seven current surfaces;
- public-release domain: `18/18`;
- Node Git-index adapter: `7/7`;
- sync config: `14/14`;
- sync rollback: `4/4`;
- sync verify guard and install report;
- exact 13-path staging, `13/13` blob/filter parity, zero residue, cached diff-check, and tree
  `32572f37a260c222fbf336f373b51ff48ae1a80f`; and
- TypeScript 5.9.3 with `strict`, `noEmit`, and `skipLibCheck=false` over the six affected
  TypeScript files.

TypeScript and Node remain the implementation language. This work needs deterministic text, JSON,
SHA-256, and Git-index operations already supplied by the toolchain. No measured CPU, memory,
concurrency, systems-API, or library gap justifies adding Rust, Go, or Python and their distribution,
cross-platform, SBOM, and trust surfaces.

## Complete-kit receipts

The exact staged tree passed complete `npm run test:kit`:

- native exit: `0`;
- elapsed: `345,873 ms`;
- stdout: 1,999 lines, SHA-256
  `7d7a34f13c9ce5803ab15cd713f873f54826e12f53c4dc34525a05aa6599a5d9`;
- stderr: 10 known lesson-coercion warnings, SHA-256
  `f25c87f7941dec1b07a5a85085ea1fa9c93113f9af422643c6b6cb49377d94fb`; and
- terminal lesson sync: `60/60`.

The immutable source commit independently passed complete `npm run test:kit`:

- native exit: `0`;
- elapsed: `339,823 ms`;
- stdout: 1,999 lines, SHA-256
  `f11acecf4c537ca79432fb7785b25bb6da9c0360111c3304f474311dfce143b0`;
- stderr: the same 10 known warnings and SHA-256
  `f25c87f7941dec1b07a5a85085ea1fa9c93113f9af422643c6b6cb49377d94fb`;
- terminal lesson sync: `60/60`; and
- exact HEAD/tree plus clean worktree/index after the run.

## Version decision

R4E does not bump version 3.25.0 or `PROMPT_VERSION: v3.25`. It removes private identities from
public operational examples without adding a capability, changing runtime behavior, altering a
provider contract, or introducing a compatibility break. The broader public product line and any
release candidate version remain separately gated by zero-marker, packaging, clean-clone,
supply-chain, nightly, dashboard, and authorized publication evidence.

## External-effect nonclaims

R4E performed no sync, target edit, dashboard/database/provider mutation, package publication,
marketplace submission, repository visibility change, tag, release, or direct-main push. The source
commit is local at the time this evidence candidate is written. A retained branch, draft PR,
exact-head Linux/Windows/aggregate CI, PR-only merge, version/tag, and publication each remain
separate verified actions.

## Conclusion

The R4E source is locally qualified and the release candidate is honestly blocked at nine remaining
historical-design/evidence bindings. This evidence does not claim P17-018 complete or public-ready.
