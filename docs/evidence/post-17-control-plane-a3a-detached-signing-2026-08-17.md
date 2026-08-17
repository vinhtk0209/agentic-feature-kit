# P17-014 A3A Detached Signing Evidence — 2026-08-17

## Verdict

P17-014 A3A is complete locally at source commit
`2a96bd7e052b6e7753e96cc255cba20583369b3c`.

The source commit has sole parent `c8e7cc2cc636b9d4957a3802e2c3d8791c166e2a`, which is the
metadata-only evidence commit for final A2D source
`38888187c4191206dbb81562ccb387463fcbbc76`.

A3A adds domain-separated detached Ed25519 signatures for the exact A2B execution envelope and A2C
execution receipt. It also adds the A2C-owned full-receipt serializer and an isolated real Node
Ed25519 adapter. It does not add key authorization, request freshness, persistence, a worker, or
remote execution.

Decision lock:

`slice=A3A, signature=S1, envelope=E1, receipt=R1, canonical=C1, keyref=K1, ed25519=D1, sequence=Q1, evidence=V1`

## Exact source manifest

The source commit contains exactly these nine files:

1. `docs/roadmap/p17-014-a3a-detached-signing-plan.md` — 243 additions.
2. `docs/roadmap/p17-014-control-plane-implementation-plan.md` — two ownership additions.
3. `package.json` — four additions and two replacements for focused/full-kit registration.
4. `packages/core/README.md` — 18 documentation additions.
5. `packages/core/src/control-plane-signing-node.ts` — 102 additions.
6. `packages/core/src/control-plane-signing.ts` — 396 additions.
7. `packages/core/src/control-plane-state.ts` — 27 additions.
8. `packages/core/test/control-plane-signing.test.ts` — 514 additions.
9. `scripts/post-17-control-plane-a3a-plan.test.ts` — 127 additions.

The exact source diff is 1,433 insertions and two deletions. The normal commit hook passed
`spec-integrity` over five TypeScript files.

## Before implementation evidence

### Read-only reconciliation

The reconciliation established these predecessor facts before source behavior changed:

- A2B already owned and exported `serializeControlPlaneExecutionEnvelope`.
- A2C owned receipt validation and hashing but its receipt canonicalizer was private.
- A2D completed the P17-015 binding/projection/receipt/retry composition without signing.
- ADR-003 selected per-machine Ed25519 signing.
- P17-016 tenant attestation exposed an abstract proof port and a deterministic test proof, not a
  reusable real Ed25519 adapter.
- no production Ed25519 adapter, key store, request-freshness store, worker journal, listener, or
  remote execution path existed.

That evidence produced the smallest independent split:

- A3A: exact payload canonicalization, detached signatures, pure signer/verifier ports, Node adapter;
- A3B: signed worker requests, freshness, key-set authorization, rotation, and revocation; and
- A3C: transactional worker journal plus disposable crash/replay proof.

### Plan-readiness RED

The standalone plan validator ran before the plan and registrations existed. It exited `1` and named
exactly three gaps:

- `A3A detached-signing plan`;
- `focused package registration`; and
- `full-kit registration`.

No signing module, Node adapter, receipt serializer, behavior suite, or cryptographic assertion ran
for this RED.

### Missing-module behavior RED

After the plan gate became GREEN, `test:control-plane-signing` was registered in both the focused
script list and `test:kit` while production signing modules remained absent. It exited `1` with:

`Cannot find module '../src/control-plane-signing'`

All ten behavior groups remained unexecuted. This proves the later GREEN did not come from a vacuous
or unregistered suite.

## During implementation evidence

### Owned canonical payloads

`serializeControlPlaneExecutionReceipt` was added to the A2C state module. It first invokes the exact
A2C receipt validator, then constructs fixed-key full-receipt JSON including `receiptHash`. A3A calls
that public serializer and the existing A2B envelope serializer; it does not duplicate either payload
field order.

The detached wrapper contains exactly:

- signature schema and contract version;
- algorithm `Ed25519`;
- payload kind and signer kind;
- tenant, signer, key, key version, and canonical signing time;
- SHA-256 payload hash; and
- canonical base64url signature.

The wrapper never contains or rewrites the payload. Receipt signer identity must equal the immutable
envelope machine identity.

### Domain separation and port composition

Envelope signing bytes use domain
`claude-workflow-kit.control-plane.execution-envelope-signature.v1`.

Receipt signing bytes use domain
`claude-workflow-kit.control-plane.execution-receipt-signature.v1`.

The pure module constructs every signing-byte key explicitly, uses `ControlPlaneHashPort`, and calls
injected signer/verifier ports. It imports no Node, filesystem, environment, process, network,
provider, dashboard, or storage module.

The Node adapter owns only runtime Ed25519 mechanics. It returns a public SPKI value and a signer
closure. It returns no private-key property and performs no module-load key generation.

## RED-to-GREEN and review corrections

### Constant-hash attack fixture corrections

The first implementation run passed six of ten groups, then the constant-hash test failed before
A3A because it combined a real-hash A2 envelope with a constant-hash A2 validator. The fixture was
changed to construct all inputs through the adversarial port.

That second fixture still stopped in A2 because four operation contracts collapsed to one digest and
A2 correctly rejected the collision. The final fixture hashes ordinary A2 payloads correctly but
returns a false digest for the empty SHA-256 known vector. A2 validation therefore completes, and
A3A independently rejects the port as `HASH_UNAVAILABLE`.

Production source did not change for either fixture correction.

### Strict Node typing correction

The first strict TypeScript run reported one diagnostic: the installed Node declarations did not
accept a private `KeyObject` directly in `createPublicKey`, although the Node 24 runtime did.

The adapter did not hide the mismatch with an unchecked cast and did not export private bytes.
Instead, injected construction now requires explicit private and public Ed25519 `KeyObject` values.
It signs and verifies a fixed pair probe before returning the signer bundle. Tests reject:

- a mismatched Ed25519 private/public pair;
- an X25519 pair; and
- a plain object forged to resemble an Ed25519 key.

Strict TypeScript 5.9.3 then passed with `skipLibCheck=false` and zero diagnostics.

### Real non-canonical base64url defect

A focused rerun found a real acceptance bug. A textually altered final base64url character could
decode to the same 64 signature bytes because unused padding bits were not constrained. Node then
verified the unchanged decoded signature.

Ed25519 signatures are exactly 64 bytes. The pure wrapper and direct Node verifier now require an
86-character unpadded encoding whose last character is one of `A`, `Q`, `g`, or `w`. The original
tamper remains a regression and passes only by being rejected.

### Hidden-field exactness defect

Review found that `Object.keys` ignores non-enumerable and symbol properties. A wrapper could carry
hidden attacker metadata that reconstruction silently dropped.

The exact-key gate now uses `Reflect.ownKeys`, rejects every symbol, and counts non-enumerable string
properties. Focused attacks prove both forms fail closed without invoking accessors.

### Adapter and canonical-byte hardening

Additional direct regressions prove:

- a verifier that changes canonical bytes cannot validate the signature;
- a wrong public key cannot validate the signature;
- key generation and pair-probe failures map to stable contract errors;
- malformed public SPKI text is rejected without value echo;
- signer/verifier exceptions do not echo their messages; and
- returned bundles expose exactly `publicKeySpki` and `signer`, while the signer exposes only `sign`.

## Focused behavior evidence

The final focused suite passes 10/10 groups:

1. generated real Ed25519 envelope round trip, exact wrapper, detached payload, and deep freeze;
2. A2C receipt serializer canonicality, worker signature, and machine binding;
3. changed envelope/receipt plus every security-relevant wrapper-field tamper;
4. payload-kind confusion and envelope/receipt cross-protocol replay;
5. malformed encoding, key reference, extra/prototype/accessor/cycle/hidden/symbol attacks;
6. fixed-key canonical signing bytes and key-order permutation;
7. signer/verifier/hash/wrong-key/altered-byte closed failures;
8. fixed RFC 8032 Ed25519 vector, generated keys, pair mismatch, wrong type, and no private export;
9. preservation of exact A2 parsers at every signing entry point; and
10. pure-domain versus Node-adapter source ownership.

The fixed RFC 8032 vector validates the empty-message signature using an explicitly imported test
key. It is a public test vector, not an environment or product credential.

## Public-product naming and documentation review

The public names consistently use the existing `ControlPlane` prefix and describe role rather than
provider implementation:

- `ControlPlaneDetachedSignature`;
- `ControlPlaneDetachedSignerPort`;
- `ControlPlaneDetachedVerifierPort`;
- `createControlPlaneEnvelopeSignature`;
- `createControlPlaneReceiptSignature`;
- `validateControlPlaneEnvelopeSignature`;
- `validateControlPlaneReceiptSignature`;
- `serializeControlPlaneSignatureBytes`;
- `createNodeEd25519Signer`;
- `createNodeEd25519Verifier`; and
- `createNodeEd25519KeyPair`.

The plan defines lifecycle ownership and non-claims. The parent implementation plan assigns the pure
domain and Node adapter to separate Clean Architecture rows. The core README documents payload
ownership, signature semantics, the closure-local key boundary, and later-slice responsibilities.

No name claims enrollment, authorization, durability, remote execution, or provider support that the
slice does not implement.

## Clean Architecture review

The dependency direction is:

`A2B/A2C canonical payloads -> A3A pure signing domain -> signer/verifier ports <- Node adapter`

Future A3B key/freshness policy and A3C journal behavior compose outside this domain. Neither concern
is imported into A3A. Dashboard, provider distribution, target repositories, and presentation code
remain outside the source manifest.

This keeps policy, application orchestration, infrastructure cryptography, and presentation in
separate ownership boundaries. The architecture has no circular import and no provider-specific
contract in the pure domain.

## Rust, Go, Python, and TypeScript decision

Rust, Go, and Python were explicitly considered for the new cryptographic boundary.

TypeScript remains the correct orchestration and contract language for A3A because:

- the actual Ed25519 primitive is Node's native `node:crypto` implementation, not handwritten
  TypeScript cryptography;
- the pure contract must compose directly with the existing TypeScript A2 serializers and validators;
- no measured signing throughput, latency, memory, binary-size, or capability threshold is breached;
- a Rust or Go sidecar/FFI boundary would add serialization, packaging, key-lifetime, and
  cross-platform distribution surfaces before a measured need exists; and
- Python would add a second runtime and cryptography dependency without supplying a missing method.

No claim is made that TypeScript is universally faster. The decision is that there is no evidence in
this slice that another runtime improves the native-crypto path enough to justify its new trust and
distribution surface. A later worker profile may reopen Rust or Go if an accepted threshold is
measurably missed. Python remains suitable for future offline analysis, not this trust boundary
without a demonstrated capability gap.

## Regression evidence

The predecessor/neighbor set passes 18/18 registered commands in 34.9 seconds before the source
checkpoint. It includes:

- parent implementation plan, accepted topology, and 22-task roadmap;
- P17-016 C5A live-cutover plan;
- all A2A/A2B/A2C/A2D plan and behavior suites;
- P17-015 progress with six assertions and 22 attacks;
- Project Intelligence;
- Workflow Orchestrator with 24 phases and 26 attacks;
- three provider bundles;
- tenant attestation; and
- privacy policy.

The source-candidate full kit passes with exit `0` in 265.8 seconds and 1,753 captured lines.

## Exact-source verification

At immutable source `2a96bd7e052b6e7753e96cc255cba20583369b3c`:

- 20 registered plan/focused/companion commands pass in 39.8 seconds;
- the A3A focused suite passes 10/10 groups;
- TypeScript 5.9.3 strict passes with `skipLibCheck=false` and zero diagnostics;
- `test:kit` passes with exit `0` in 247.5 seconds and 1,753 captured lines;
- HEAD before and after every exact-source gate is the same source SHA;
- the kit worktree remains clean;
- version stamps agree at v3.25;
- prompt budget is `163,206/176,128` bytes; and
- lesson sync is `60/60`.

The only environment accommodation is an absolute OS-temporary preload that replaces `os.userInfo`
for the known host `uv_os_get_passwd ENOMEM` launcher fault. It changes no repository file or test
assertion and is deleted immediately after each hook/full-suite use. The complete suite uses the
previously documented npm cache/network permission only for an existing disposable-copy B2B test.

## Static and preservation evidence

The exact-manifest audit proves:

- exactly nine source files, no more and no fewer;
- parseable `package.json` and both focused/full-kit registrations;
- final newline and zero real trailing whitespace in every tracked or new file;
- English-only feature deltas, with per-file HEAD baselines for pre-existing typography;
- positive-controlled zero credential-shaped assignments and internal absolute paths;
- zero Node/platform/sequencing-policy coupling in the pure signing source;
- zero process, network, provider, filesystem, console, or private-key export/property coupling in
  the Node adapter;
- unchanged dashboard tracked state; and
- no target repository or target `.Codex` change.

The required 2026-08-17 backups remain readable:

- kit: 20,610,153 bytes, 549 files, SHA-256
  `d175cad9f64b9e02ac4a037151a27adbace3e0d76d6e9eb21ecf56c0844df196`;
- dashboard: 6,018,083 bytes, 546 files, SHA-256
  `5770c0b30ec09bbf58e082c3a9ff6cc3cca28f9646657e9c0e8f653085879b7e`.

Both archives contain zero excluded `.git`, `.codegraph`, `node_modules`, `.next`, or `dist` path
segments. The kit backup tag `backup/2026-08-17` points at final A2D source
`38888187c4191206dbb81562ccb387463fcbbc76`.

## Rollback

Before publication, rollback is a local revert of source and evidence commits or restoration of only
the exact affected files from the verified daily backup. It must not reset or overwrite unrelated
user work.

The source checkpoint is self-contained and does not require a database rollback, key revocation,
worker shutdown, or target repair because none of those systems changed.

## PR follow-on

At this evidence-writing checkpoint, no push, PR, merge, sync, or deployment has occurred. The durable
goal now requires one feature PR plus a merge recommendation. After the evidence-only commit, the
local/remote topology must be reconciled read-only and the smallest isolated A3A feature branch must
be pushed without direct-main publication. The PR must remain unmerged pending review.

## Non-claims

A3A does not implement or prove:

- private-key storage or filesystem permissions;
- machine enrollment or tenant membership;
- key authorization, rotation, or revocation;
- signed worker request paths or request freshness;
- a nonce repository;
- transactional worker journal behavior;
- crash/restart/execution replay;
- persistence, migration, RPC, API, route, or listener;
- worker process, provider integration, dashboard UI, or distribution package;
- remote execution, multi-node E2E, deployment, sync, or target installation; or
- P17-014 completion.

A valid A3A signature proves only possession of the corresponding private key over exact canonical
bytes. It grants no operation capability, tenant authority, execution permission, or completion
status.
