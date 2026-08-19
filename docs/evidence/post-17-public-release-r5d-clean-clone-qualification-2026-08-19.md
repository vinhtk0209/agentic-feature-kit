# P17-018 R5D — Clean-Clone Cross-Platform Qualification Evidence

Date: 2026-08-19
Scope: `scope=R5D, source=C1, platforms=P1, install=I1, determinism=D1, runtime=R1, browser=B1, evidence=E1`
Status: source and exact-head platform qualification complete; evidence-head PR qualification pending

## Claim boundary

This evidence proves committed clean-clone qualification on native Windows and GitHub-hosted Linux,
two physical no-junction installs per platform, deterministic provider outputs, strict final archive
admission, extracted runtime smokes, exact receipt aggregation, and visible in-app corroboration of the
documented source quickstart at one exact source commit.

It does not claim that a real user installed a plugin, that a provider executed or endorsed a task,
that a package or marketplace entry exists, or that any artifact is released or published. No sync,
target edit, dashboard or database mutation, provider credential use, direct-main push, tag, release,
publication, signing, package upload, marketplace submission, or visibility change occurred.

## Exact source authority

- Branch: `p17-018-r5d-clean-clone-qualification`
- Qualified base / PR #20 merge: `b35406978e581060eb4c240ea9272ac848878cc3`
- Initial committed-clone source: `05ca5b449b213d8f5524fc8533b5cea1c194e35e`
- Aggregate-root correction: `5da2b6fa9e2dffadcdbd4b7e34c5e3d5972ece15`
- Final source commit: `277827bdf981bf62a513b5b306ddaf9f05da7fcb`
- Final source tree: `57823fafc3790a2337f0aabee9a7105144d1729f`
- Final subject: `fix(ci): make clean-clone matrix npm route portable`
- Source paths: 19
- Source path-manifest SHA-256:
  `acccc9e7996524db324961c89860b50503ac526a8ba7c92bc6d3b5f4ae4733d8`
- Final local and retained remote branch identity: exact `277827bdf981bf62a513b5b306ddaf9f05da7fcb`
- Final source worktree residue: zero unstaged paths and zero untracked paths

Versions remain root/prompt/provider/shared-core `3.25.0 / v3.25 / 0.5.0 / 1.3.0`.

## Delivered qualification architecture

The pure receipt contract owns canonical platform receipt and aggregate-matrix validation without
filesystem, process, child-process, network, or archive-adapter imports. The Node adapter owns exact
committed-clone creation, bounded environment and process execution, two independent physical npm
installs, provider builds, distribution tests, final-admission capture, atomic receipts, cleanup,
and the matrix CLI boundary.

Windows invokes npm through the resolved Node executable and npm CLI JavaScript entry with
`shell:false`. Each clone receives separate one-byte-LF user and global npm config files. The
qualifier rejects junctions, hardlink-sharing assumptions, dirty or wrong Git identities, unexpected
release-root entries, incomplete admission, output drift, receipt drift, and retained temp residue.

The aggregate workflow downloads platform artifacts into one exact common root. Its retained legacy
matrix consumes `artifacts/cross-platform/`; R5D consumes `artifacts/public-release/r5d/`. The npm
workflow route passes the artifact root through the non-secret `CLEAN_CLONE_MATRIX_DIR` binding,
while direct `matrix --dir` remains available for diagnostics.

## RED/GREEN ladder and corrections

1. Readiness RED reported only the absent R5D plan; the completed plan locked C1/P1/I1/D1/R1/B1/E1.
2. Pure receipt/matrix contracts reached GREEN with two canonical receipts, 42 receipt attacks, and
   nine matrix attacks.
3. Node orchestration reached GREEN with two clones, six commands, 18 orchestration attacks, seven
   CLI attacks, five npm-invocation controls, four npm-config controls, and four release-root controls.
4. Native Windows exposed and fixed npm long-flag stripping, `npm.cmd` shell-free launch failure,
   npm user/global-config alias rejection, and intentional expanded provider-directory handling.
5. First exact-head CI proved both platforms GREEN but exposed a doubled aggregate artifact root;
   the workflow changed to the exact common destination and added a mutation attack.
6. The next exact-head CI was GREEN but local npm exposed matrix argument stripping; the environment-
   bound no-argument npm route was added and proven on Windows before the final exact-head run.

No correction weakened source identity, admission counts, receipt shape, filesystem isolation,
runtime smokes, cleanup, or the non-release boundary.

## Native Windows committed-clone receipt

Exact initial source commit `05ca5b449b213d8f5524fc8533b5cea1c194e35e` passed the native Windows
qualifier in `180,869 ms`. Its canonical LF receipt is `4,456` bytes with SHA-256
`db98e092fe3d202c0818e6aa16e1cffbf875475a62cb4d92317fcf7aa75b8e95`.

The receipt proves two detached clean clones, two physical no-junction installs, six successful
commands, strict admission `3/71/8/11/79/15/10`, twelve receipt output files, one shared output-set
identity, and zero owned temp residue. The subsequent two commits affect aggregate routing and the
portable matrix invocation; final platform proof for those changes is the exact-head CI below.

## Final exact-head Linux/Windows qualification

Workflow Kit CI run `32248302090` is bound to final source commit
`277827bdf981bf62a513b5b306ddaf9f05da7fcb`:

| Gate | Job | Result |
|---|---:|---|
| Linux qualification | `96053538504` | `success` |
| Windows qualification | `96053538911` | `success` |
| Release qualification gate | `96055892221` | `success` |

Downloaded exact-head artifact ZIP receipts:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Windows qualification ZIP | 2,322 | `8212854f647f7c2d34c0291d6c77b9e0de11193072b2a6d370eb7e3c84ea5519` |
| Linux qualification ZIP | 2,263 | `29ed6d91cdaac8bcf993048cf21488b23a8171350b4369bd3ecc20f0f384df77` |
| Aggregate job log | 22,694 | `df8cf9a4e24031152c22a1c6f0cbd8cfb87fb0a0af58680cd6f8472a90a8e381` |

Rebuilt artifact layout passes both the retained legacy matrix and the Windows npm environment-bound
R5D route. Common source/tree are exact `277827bdf981bf62a513b5b306ddaf9f05da7fcb` /
`57823fafc3790a2337f0aabee9a7105144d1729f`; common output-set SHA-256 is
`4125c834571bd54694db84270795bb750caada1da9800dfc272007b5c5af6949`; common admission is
`3/71/8/11/79/15/10`.

| Receipt | Bytes | SHA-256 |
|---|---:|---|
| Linux cross-platform | 812 | `7d240984580b264a74ee5c456755ab0a568461509f9c74316a7f7cd083fe91aa` |
| Windows cross-platform | 814 | `4d076e76847ec17cb41997dd7dba3726ffbbbf100525e831f30de07fe224557c` |
| Linux R5D | 4,446 | `b3092566bdf7699fff806b8b6c29a4640563c16a85dccfad5d4bbb8d734fa790` |
| Windows R5D | 4,460 | `2109b1ffe780234d55d8230c4d1753d9f865ec88fffcff1566a07695983707da` |

## In-app quickstart corroboration

The exact root README inspection URL is:

`https://github.com/vinhtk0209/agentic-feature-kit/blob/277827bdf981bf62a513b5b306ddaf9f05da7fcb/README.md`

The operator returned three visible in-app GitHub-rendered captures. They show:

- `Agentic Feature Kit`, its not-yet-public release boundary, and the complete `Choose a provider`
  table with Codex, Claude Code, and GitHub Copilot selector links;
- `Quickstart from a clean clone` with the ordered commands `npm ci`,
  `npm run build:providers`, and `npm run test:provider-distribution`; and
- the complete five-item `Limitations` boundary.

| Visible capture | Pixels | Bytes | SHA-256 |
|---|---:|---:|---|
| Root/provider selector | 1110×565 | 71,695 | `927843ebcd371a97bbf35abfc79cc03baf6388ec0523d6eeab43b144830772b6` |
| Clean-clone quickstart | 1086×261 | 20,691 | `8dfc52fae05fcda3fa3534d57eb18088efdd66553245ed834fcb7dde8a129f81` |
| Limitations | 975×191 | 22,374 | `baf5cb0f8027cd550e1a13be3870429b3b6928907f5ee4baccc8055afef946be` |

All three visible selector targets resolve to the same exact source commit:

- Codex: `https://github.com/vinhtk0209/agentic-feature-kit/blob/277827bdf981bf62a513b5b306ddaf9f05da7fcb/providers/codex/agentic-feature-kit/README.md`
- Claude Code: `https://github.com/vinhtk0209/agentic-feature-kit/blob/277827bdf981bf62a513b5b306ddaf9f05da7fcb/providers/claude/agentic-feature-kit/README.md`
- GitHub Copilot: `https://github.com/vinhtk0209/agentic-feature-kit/blob/277827bdf981bf62a513b5b306ddaf9f05da7fcb/providers/copilot/agentic-feature-kit/README.md`

The visible text matches the exact local Git object whose clean local and retained remote identities
both equal that SHA and tree. Public text fetch was unavailable and was not substituted for the
required visible corroboration. This proof changes no account, repository, branch, provider,
credential, package, release, dashboard, database, target, or visibility state.

## Final source-tree qualification

Before the final source commit, the coherent 19-path candidate passed:

- R5D plan, pure receipt/matrix, Node orchestration, nightly canonical plus 17 attacks, and retained
  cross-platform 11/11 controls;
- public source readiness at `653/194/48/48/754/617/650/10`, zero issues;
- final provider admission at `3/71/8/11/79/15`;
- TypeScript 5.9.3 strict/no-emit/`skipLibCheck=false` for all changed TypeScript files; and
- `npm audit --json` with zero vulnerabilities across 46 dependencies.

One complete native `npm test` run exited `0` in `407,672 ms`. Stdout is `129,998` bytes / 2,167
PowerShell-measured lines / SHA-256
`1e674ac6ff2d5dd0846340a9924aecd3d963f3c8f24d13afa5e2f5a786e4f547`. Stderr is the ten known
lesson-registry fixture warnings, `1,074` bytes / SHA-256
`f25c87f7941dec1b07a5a85085ea1fa9c93113f9af422643c6b6cb49377d94fb`. Lesson sync ends at 60/60.

## Rollback and remote boundary

Rollback authorities are tag `backup/2026-08-19` at
`fdade1bedf9ce4798d24ccc24537637d316bfd07` and the verified 2026-08-19 kit ZIP (`2,646,278`
bytes, SHA-256 `4add6adc633cfc03c0c21e5ca1b7070ef95e13a3b70941ede66871ae3c445d11`).
Target `.Codex/` trees are not rollback sources.

At evidence authoring time PR #21 remains Draft at the exact source head. This evidence commit must
contain only this document and the one ordinal public-manifest row, then pass self-qualification and
new exact-head Linux, Windows, aggregate, artifact, identity, and no-conflict checks before a standard
PR-only merge. The retained feature branch must not be deleted.
