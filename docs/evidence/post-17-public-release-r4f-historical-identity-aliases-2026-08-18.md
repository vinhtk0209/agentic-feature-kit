# P17-018 R4F Historical Identity Alias Evidence

**Date:** 2026-08-18
**Task:** P17-018
**Scope lock:** `slice=R4F, surfaces=H1, aliases=A1, transition=T1, registry=R1, evidence=E1`
**Source commit:** `c1fba68dcaac8e7bd19bd230e9ebc56dadd4b9fa`
**Source parent:** `f29236c8805c36b5efa9dfb4cedf891912d847f5`
**Source tree:** `33dc5d0b7088af46fbd82f0c7a6abe059eabc67b`

## Result

R4F genericized the complete final set of ten classified identity occurrences across seven
historical design, evidence, and roadmap files. The six marker definitions, four detector kinds,
and all fingerprints remain as zero-count regression guards. The Git-index release authority moves
from a contract-valid blocked state with ten occurrences and nine unresolved bindings to
`eligible-for-later-gates` with zero classified occurrences and zero blockers.

This result clears only the manifest/marker gate. It is not a claim that the repository is
public-ready, released, published, tagged, deployed, or available through a package registry,
plugin marketplace, or provider catalog.

## Rollback authority and starting state

The verified 2026-08-18 rollback authorities were present before any R4F source edit:

- tag `backup/2026-08-18` at `88005e5bd14764c2d57bd02a261dcc637307bf02`;
- kit worktree ZIP SHA-256
  `468184283a30dd995f8513bea6e262d66fe93242ab75c19397c9def1fae812c0`; and
- dashboard ZIP SHA-256
  `4ca35874243a3b0081d7be7f3be9d813d2a16f7ac154aa36bbc803c6b2b3fd70`.

Exact read-only reconciliation on merged R4E `main` proved:

- 620 tracked candidate paths, 620 included, and zero excluded;
- ten classified occurrences across nine `genericize` bindings;
- contract mode exit zero and eligibility-mode exit one; and
- identical path-scoped sentinels with `candidateStatus=blocked`.

The nine bindings covered one live project reference, one local Windows user path, six authoring
target occurrences, and two learning target occurrences. No application row bodies, credentials,
or retired raw identities were copied into this evidence.

## Locked aliases and exact transformations

R4F uses the stable role aliases `example-learning-app` and `example-authoring-app`, the placeholder
`<supabase-project-ref>`, and the synthetic Windows evidence path
`%TEMP%\agentic-feature-kit linked worktree Ω`.

The final canonical transformed SHA-256 authorities are:

| Path | Lines | Transformed SHA-256 |
|---|---:|---|
| `docs/design/_review/section-10-clean.md` | 263 | `7d04f0b4c16186645854380973441a556fd7c5f985c3b00e4f3319579643b34c` |
| `docs/design/measurement-layer-b11-gate-and-version-bootstrap.md` | 148 | `3b5eb4ec1eac502cb3e94abd3fd690fbcf51e3826ede223c6e469d76026c04f1` |
| `docs/design/measurement-layer-b11-wire.md` | 211 | `031fded2528de9bf49179746c67fe12aaff8e9decea02cb3af5eff7a94373954` |
| `docs/design/measurement-layer-tier-b-environment.md` | 874 | `0da19c4a22a5dcfdb9b3b61fca7a735aecf7eeb4823b7f2a73192fe91038cfcf` |
| `docs/design/measurement-layer-v1.md` | 452 | `c69d79259b9cd7b8dd954ebe39df9a956e8c196ab5ceab71302f813a1b1ed86e` |
| `docs/evidence/post-17-worktree-browser-verification.md` | 119 | `9d7c7fc5e34b94b135189fa76fca5eaa57ab5f4848afa3b8d1cd1b78fb292696` |
| `docs/roadmap/p17-016-wave-c2-schema-inventory-migration-design-plan.md` | 369 | `a355abce17a847f8405d8d4d8103d2b89a0348c4ae60245145a1bc6ce9b6b571` |

Immutable-blob inspection found that the first and fourth files originally lacked a terminal LF.
The contract records this explicitly: reversing the aliases and removing exactly the newly added
terminal LF reconstructs each original source hash. The other five files reconstruct their original
hashes without removing a byte. This proves that the only non-identity normalization was one
terminal LF in each of those two files.

## TDD receipts and bounded corrections

The readiness validator was added and full-kit registered before its plan. Its first native run
exited one solely with the missing R4F plan. After the H1/A1/T1/R1/E1 plan was added, the first plan
run rejected one omitted single-line alias tuple; adding that exact authority phrase made the
unchanged validator pass.

The adversarial implementation contract was then added before remediation. All 14 pure attacks
passed, followed by exactly six planned current-tree gaps:

- historical alias transform;
- zero-count marker registry authority;
- remediation-safe R4E authority;
- R4F Node Git-index authority;
- R4F release-manifest paths; and
- eligible-for-later-gates worktree transition.

After implementation, the following bounded corrections were recorded rather than hidden:

- a stale R4E exact manifest-size assertion became a minimum while retaining all-include,
  zero-exclude, and exact R4E path requirements;
- the two pre-existing missing-final-LF files received explicit, reversible normalization authority;
- the new manifest row was moved into ordinal order after the parser rejected its first placement;
- R4D and R4C predecessor parsers were extended to accept explicit empty blocker arrays while
  retaining their numeric historical ceilings; and
- R4B was extended to accept exactly either its historical blocked/unresolved pair or the stronger
  eligible/empty pair while preserving contract-valid and zero-hostname guards.

Those predecessor corrections expanded the final source manifest from the initially planned 15
paths to 18. Each expansion was recorded in `HANDOFF.md`, added to the plan/readiness authority, and
restaged before qualification. No runtime file was added by these corrections.

Two invocation-environment failures also occurred before repository code ran: sandbox npm resolved
to a missing user-level npm module, and sandbox `tsx` could not obtain `os.userInfo()`. The exact
commands passed in the approved native environment. A sandboxed TypeScript 5.9.3 path likewise
failed access before compilation; the same compiler command passed natively.

## Source manifest and static authority

The exact source commit contains 18 ordinal paths. Its LF-final manifest identity is SHA-256
`885535372dd3b8deecc62ac33b3adf9d0cc8748a54672f394fdbd0ac51f4b4d2`.

Static staged-index audit proved:

- 18/18 strict UTF-8, LF-final, and no trailing whitespace;
- 18/18 Git-index/worktree filter-aware blob parity and zero unstaged residue;
- registry SHA-256
  `bc7cdb54acfccc08166f7facc1c5b8c412489025f18d381852e11d4a1d2d5712` bound by the manifest;
- 623 ordinal manifest entries, all included and none excluded;
- six unique marker definitions, all with zero totals and zero occurrence bindings; and
- unchanged package/prompt identity `3.25.0` / `v3.25`.

The exact staged/source tree is `33dc5d0b7088af46fbd82f0c7a6abe059eabc67b`. The normal source
commit hook passed spec-integrity for all seven affected TypeScript files.

## Focused, domain, and compiler qualification

On the final staged index and again on immutable source commit `c1fba68d...`:

- R4F historical aliases passed 14 attacks / 7 current surfaces;
- R4E operational aliases passed 10 attacks / 6 current surfaces;
- R4D private archive passed 11 assertions / 7 current surfaces;
- R4C prompt history passed 12 attacks / 5 current surfaces;
- R4B synthetic fixtures passed 11 attacks / 7 current surfaces;
- R4A legacy backend passed 7/7;
- public-release core passed 18/18 and Node Git-index authority passed 7/7;
- public entry and governance each passed 5/5; and
- both direct contract modes exited zero at exact `623 included / 0 excluded / 0 classified / 0 blockers`.

Cached TypeScript 5.9.3 compiled the seven affected TypeScript files with `strict`, `noEmit`,
`skipLibCheck=false`, ES2022, and Node16 module/resolution. It emitted no file and no diagnostic.

## Complete-kit qualification

The complete kit passed on staged source, immutable source, and the first staged evidence tree before
this receipt was bound into the evidence:

| Stage | Exit | Duration | Stdout | Stderr | Terminal check |
|---|---:|---:|---|---|---|
| exact staged source | 0 | 376,285 ms | 2,023 lines; `7dfffc247d3bed828e3859abd99c76a31fbe656a57173829feec60b28e4fefe0` | 10 known warnings; `f25c87f7941dec1b07a5a85085ea1fa9c93113f9af422643c6b6cb49377d94fb` | lessons 60/60 |
| immutable source commit | 0 | 367,670 ms | 2,023 lines; `0649f547a0eeef8bcfaef3188f4f116c19f58e2902c0ee60c04ae7a8ace8079e` | 10 known warnings; `f25c87f7941dec1b07a5a85085ea1fa9c93113f9af422643c6b6cb49377d94fb` | lessons 60/60 |
| first staged evidence tree | 0 | 362,785 ms | 2,023 lines; `7cc052287d0f85a3d6b5efacc4022870a4280ac95218f0edf0b96c1df4101c19` | 10 known warnings; `f25c87f7941dec1b07a5a85085ea1fa9c93113f9af422643c6b6cb49377d94fb` | lessons 60/60 |

The ten stderr lines are the existing lesson-registry malformed-fixture warnings. Their unchanged
digest matches the prior R4 qualification runs.

## Language and architecture decision

TypeScript and Node remain the measured implementation choice. R4F needs deterministic text
replacement, SHA-256, JSON validation, and Git-index integration already owned by the current
toolchain. No CPU, memory, concurrency, systems-API, or library threshold was breached. Rust, Go,
or Python would add packaging, cross-platform, SBOM, supply-chain, and trust boundaries without a
measured benefit.

## Version decision

Package version `3.25.0` and `PROMPT_VERSION: v3.25` remain unchanged. This slice removes public
identity coupling and strengthens release authority; it adds no end-user capability and breaks no
provider, core, prompt, CLI, sync, or runtime compatibility contract. A public release-candidate
version remains a later-gate decision.

## Evidence manifest and external-effect boundary

The evidence commit contains exactly:

- `docs/evidence/post-17-public-release-r4f-historical-identity-aliases-2026-08-18.md`; and
- `release/public-release-manifest.json`.

Its LF-final path-manifest SHA-256 is
`056adb8673aa2e08f585312a99427113a8669a789ab86a18bc3d82418915e721`.
Adding this evidence row produces 624 ordinal candidate paths, all included and none excluded. The
registry, runtime, package version, prompt version, and zero-marker result do not change.

R4F local work performed no sync, direct-main push, tag, release, publication, visibility change,
package publication, marketplace action, deployment, database write, provider write, dashboard
mutation, target mutation, target `.Codex` edit, or branch deletion. The retained remote branch,
draft PR, exact-head Linux/Windows/aggregate CI, and PR-only merge are a separate post-evidence
lifecycle.
