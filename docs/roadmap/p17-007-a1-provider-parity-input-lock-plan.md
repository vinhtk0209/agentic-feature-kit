# P17-007 A1 Provider-Parity Input Lock

**Status:** Approved input/readiness preparation; provider execution has not started.
**Parent:** Exact qualified main `68f080257b1180f0ea0754f3f872c84be177f5be`.
**Decision lock:** `golden=G1, boundary=B1, identity=I1, execution=E1, providers=P1, semantics=S1, verification=V1, cost=C1, repetition=R1, failure=F1, privacy=D1, language=T1, scope=N1`.

## Outcome

A1 supplies the two inputs that previously kept P17-007 fail-closed: one versioned public synthetic
golden and one approved boundary for later bounded external-provider runs. The golden contains a
normalized semantic specification, exact B3/B10/B11 phase identities, a dependency-free Node 20
repository seed, an initially failing trusted test, one byte-identical task prompt, and closed
evaluation thresholds for Codex, Claude, and GitHub Copilot.

The operator's 2026-08-21 standing continuation authorization accepts the bounded boundary defined
here as `operator-approved bounded external-provider execution boundary (2026-08-21)`. That approval
makes roadmap input preparation complete; it does not create provider authentication, runtime
entitlement, model availability, a cost receipt, a candidate output, or parity evidence. No Codex,
Claude, or Copilot model execution is performed by A1.

## Current evidence and official boundaries

- The shared orchestrator golden is a conservation baseline for the historic canonical workflow; it
  explicitly does not prove three-provider execution.
- The phase-model contract already requires fixture, phase-contract, adapter-capability, runtime-
  entitlement, model, evidence, freshness, cost, and latency identities. Transport smoke cannot
  populate phase qualification.
- The local environment currently exposes Codex CLI `0.147.0` and Claude Code `2.1.227`; GitHub
  Copilot CLI is absent. Presence and version are capability inventory only, not authorization or
  parity evidence.
- Codex documents stable non-interactive `exec`, JSONL output, sandbox selection, and response-schema
  validation at <https://developers.openai.com/codex/cli/reference/>.
- Claude Code documents print mode, JSON/stream-JSON output, bounded turns, and explicit permission
  controls at <https://docs.anthropic.com/en/docs/claude-code/cli-usage>.
- GitHub documents programmatic Copilot CLI prompts, JSONL, model selection, permission controls,
  secret redaction, and transcript sensitivity at
  <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference>.

Official documentation proves only that a future adapter can be designed around supported surfaces.
It grants no login, subscription, token, model, repository, cost, network, or data-retention right.

## Architecture decision record

### G1 — One public synthetic golden

`docs/roadmap/fixtures/p17-007-provider-parity-golden.json` is the sole A1 golden. It is Apache-2.0,
synthetic, contains no customer, credential, private-specification, tenant, or personal data, and is
safe for public source. Its normalized `SemanticSpec`, task prompt, five-file repository seed, phase
bindings, file hashes, seed-tree hash, and evaluation policy are content-addressed.

The feature is deliberately small but not trivial: implement deterministic CSV rendering for three
acceptance criteria, preserve the public API, write a plan, and pass a dependency-free trusted test.
The initial implementation throws a fixed marker, so materializing the fixture must begin RED.

Changing any prompt, spec, phase, file byte, path, threshold, or permission creates a new fixture
revision and new hashes. A run on a different revision is not comparable.

### B1 — Pure core and provider adapters stay separate

A later pure evaluator owns exact schemas, canonical hashing, evidence conservation, deterministic
semantic/AC/artifact/gate comparison, closed status/reason codes, and report aggregation. It performs
no process, network, provider, credential, clock, environment, filesystem, dashboard, or model call.

Provider-specific infrastructure adapters own CLI discovery, opaque authenticated-session use,
direct argv, timeout/output termination, event parsing, and provider metadata normalization. They
depend inward on core ports. The core never imports a provider SDK or knows a login/config path.

### I1 — Exact input and execution identity

Every candidate binds all of the following before execution:

- fixture ID, revision, fixture SHA, semantic-spec SHA, prompt SHA, and seed-tree SHA;
- exact B3, B10, and B11 phase-contract SHA values;
- provider, runner, CLI version, model, reasoning effort, adapter-capability SHA, and runtime-
  entitlement evidence SHA;
- fresh materialized-tree SHA, allowed-write paths, exact test argv, execution-policy SHA, and one
  run ID; and
- source commit, observed UTC time, timeout, output cap, attempt ordinal, and authorization receipt.

Unknown, stale, missing, duplicated, reordered, or mismatched identity returns `needs_input` or a
closed failure before a model call. A provider label, login success, prior run, or transport smoke
cannot substitute for the full identity tuple.

### E1 — Per-run external execution authority

The 2026-08-21 boundary approval permits later implementation of the runner contract. Every actual
run must still materialize a metadata-only authorization receipt from that standing grant containing
the exact provider/model/fixture/phase set, maximum cost when the provider exposes cost, bounded time
window, and evidence destination. Missing runtime entitlement, unavailable model, absent CLI,
expired authority, or unknown cost policy is `needs_input` with zero model calls.

Execution uses a fresh sanitized copy outside the source worktree. The adapter launches a fixed
executable plus enumerated argv with `shell:false`, one attempt, no automatic retry, no resume, no
fallback, and a 20-minute hard deadline. It may read/write only the fixture copy, create only the
declared paths, and invoke only the exact `node --test test/report.test.js` command. Package install,
git write, arbitrary shell, browser, MCP, URL fetch, network tool, user-directory traversal, parent
workspace access, sync, and target access are denied. The provider control channel is the sole
network exception and remains adapter-owned.

The adapter may use an already-authenticated opaque provider session; it never reads, copies, logs,
hashes, serializes, refreshes, or stores credential bytes. Provider authentication is not inherited
as evidence and does not widen filesystem or tool authority.

### P1 — Three providers without ranking shortcuts

The comparison set is exactly `codex`, `claude`, and `copilot`, matching the released bundle IDs.
Each provider must produce its own fresh receipt against identical fixture bytes and phase contracts.
One provider cannot proxy, replay, or relabel another provider's output.

Provider ranking is forbidden when any provider, semantic receipt, trusted verification, token/cost
field, or minimum comparable sample is missing. A partial report may describe closed availability
facts but must be labelled `incomplete`; it cannot claim parity or superiority.

### S1 — Semantic, artifact, and gate conservation

Byte-identical generated source is neither expected nor rewarded. The deterministic comparator
requires instead:

1. all three acceptance-criterion IDs covered by admitted implementation/test evidence;
2. all required plan, implementation, test, and trusted-verification artifact classes present;
3. B3/B10/B11 phase and gate decisions conserved without provider weakening;
4. the exact locked API contract preserved;
5. the trusted test command exit `0` in the materialized candidate tree; and
6. no locked-path edit, undeclared path, external dependency, secret/path disclosure, or permission
   widening.

Semantic coverage is computed from normalized requirement IDs and content-addressed evidence, not a
model's prose confidence. Diff layout may vary only inside the declared write allowlist.

### V1 — Trusted verification, never model self-attestation

Candidate final text, self-reported tests, checkmarks, or claimed AC coverage are untrusted inputs.
The harness independently inventories the tree, recomputes every hash, validates locked paths and
allowed writes, runs the fixed Node test with bounded output/time, and derives the verdict. A model-
supplied `passed`, successful action click, login, or transport smoke cannot qualify.

The admitted receipt contains closed status/reasons, identities, counts, hashes, exit status, and
bounded metrics only. Raw prompts, reasoning, diffs, source files, transcripts, exception text, local
paths, usernames, session IDs, and provider response bodies are excluded from durable evidence.

### C1 — Cost and latency remain truthful and nullable

Wall-clock duration is measured by the adapter's monotonic clock and reported separately from model-
reported latency. Input/output/cache tokens, provider price basis, and cost are admitted only when
the provider returns or an exact dated price catalog can derive them. Unknown data stays `null` with
`unpriced`; it is never estimated from characters or silently treated as zero.

Quality, cost, and latency are separate report dimensions. A lower cost or latency cannot compensate
for failed semantic, artifact, gate, or trusted-verification requirements.

### R1 — Qualification and performance evidence are distinct

One successful fresh run per provider may establish fixture qualification for its exact identity.
Performance ranking requires at least five comparable completed runs per provider/model/effort with
the same fixture and execution policy. Failed, retried, resumed, cached-from-another-run, stale, or
permission-different observations are not comparable.

A1 creates neither kind of run. Its fixture declares these floors so later code cannot optimize or
rank from one anecdotal result.

### F1 — Missing or malformed evidence fails closed

Closed top-level states are `needs_input`, `passed`, `failed`, and `incomplete`. Later schemas own a
finite reason vocabulary for absent CLI/runtime entitlement/authority, identity drift, timeout,
output overflow, provider refusal, malformed event, unauthorized write/tool/network attempt, locked-
path drift, test failure, semantic/artifact/gate loss, missing cost, and insufficient samples.

Provider diagnostics may be observed ephemerally for operator debugging but never enter the durable
receipt. Unknown fields, inherited/accessor-backed objects, duplicate IDs, non-canonical order,
oversized values, invalid timestamps/hashes, and contradictory states fail validation.

### D1 — Data minimization and bounded retention

Only the public synthetic fixture may enter A1/A2/A3 tests. Later real provider runs use the same
fixture, not a private repository or specification. The environment starts from an explicit
allowlist; secret-like variable names and all values are excluded from captured evidence. Content
capture, transcript sharing, telemetry payload capture, and provider session export are disabled.

Durable evidence retains only closed status, counts, hashes, timings, token usage, and cost. Scratch
copies and raw provider output are deleted after receipt derivation and zero-residue readback. A
failed cleanup makes the run failed and quarantines its evidence identity.

### T1 — TypeScript first with measured thresholds

TypeScript/Node remains authoritative because the fixture, hashing, schemas, process controls, test
runner, and current shared core are already Node-native. Reconsider Rust or Go only if a profiled pure
comparison of 10,000 admitted receipts exceeds p95 50 ms, incremental RSS exceeds 64 MiB, or Node
lacks a required safe process/termination primitive. Python remains suitable only for later offline
analysis after the same schemas and privacy boundary exist. Any language change requires a separate
ADR covering FFI/sidecar, packaging, SBOM, cross-platform, and trust-surface costs.

### N1 — A1 prepares inputs only

A1 adds the plan, golden fixture, fail-closed validator, roadmap transition, package registration,
and public-source manifest entries. It does not implement the evaluator, process adapters, run store,
dashboard route, or provider packages. It does not invoke a model or claim parity.

P17-007 becomes `in_progress` with roadmap readiness complete because its golden and approved
execution boundary now exist. It does not become `done`; acceptance still requires A2 pure evaluator,
A3 attacked adapters, A4 fresh three-provider receipts, and the dashboard/evidence closeout.

## Golden fixture contract

The golden is a single exact JSON object with:

- synthetic public provenance and exactly three ordered provider targets;
- one byte-identical prompt and its SHA-256;
- one validated normalized `SemanticSpec` and its SHA-256;
- exact B3 planning, B10 implementation, and B11 verification contract hashes;
- ordinal, traversal-safe seed files with per-file and aggregate tree hashes;
- locked and allowed-write paths plus fixed Node test argv;
- an independently executed initial RED marker; and
- complete qualification, performance, coverage, timeout, output, attempt, ranking, and retention
  policy.

The A1 validator materializes the seed into a new temporary directory, runs the fixed test through
the current Node executable, requires exit `1` and the exact missing-implementation marker, then
deletes the directory. No dependency install or provider operation is involved.

## Provider execution boundary

Future adapters must use the documented programmatic surfaces but normalize them behind one core
port. A capability table in A2/A3 must pin executable identity and exact supported flags from fresh
official docs and local `--version` output. Unsupported flags or missing structured output fail
closed; adapters cannot silently switch to an API, browser, interactive session, another provider,
or a different model.

The first external run remains prohibited until A2/A3 prove: fixed argv and `shell:false`; isolated
materialization; environment/tool/path/network deny controls; timeout/output/process-tree cleanup;
opaque session handling; provider event redaction; exact identity binding; trusted verification;
metadata-only receipts; and fake-process attacks. Copilot absence is a normal `needs_input`, never a
reason to compare only two providers and declare parity.

## Implementation sequence

1. Register the validator while the plan and fixture are absent; record the expected missing-plan RED.
2. Add this plan and the public synthetic golden; repair only deterministic hash/oracle mismatches.
3. Transition canonical P17-007 from `backlog`/readiness false to `in_progress`/readiness true, remove
   only its two resolved missing inputs, and register exact input paths and approval reference.
4. Add the package command, full-suite token, and JavaScript-ordinal public-manifest rows.
5. Run the focused validator, roadmap validator, strict TypeScript, public/provider/privacy gates,
   adversarial review, and a complete native kit suite.
6. Commit the exact seven-path source inventory, then add only metadata evidence and its public-
   manifest row in a separate commit; rerun all affected and complete gates.

## Exact source manifest

The A1 source commit may change exactly:

1. `docs/roadmap/fixtures/p17-007-provider-parity-golden.json`
2. `docs/roadmap/p17-007-a1-provider-parity-input-lock-plan.md`
3. `docs/roadmap/post-17-roadmap.json`
4. `docs/roadmap/post-17-roadmap.md`
5. `package.json`
6. `release/public-release-manifest.json`
7. `scripts/post-17-provider-parity-input-lock-plan.test.ts`

The evidence checkpoint adds only
`docs/evidence/post-17-provider-parity-a1-input-lock-2026-08-21.md` and its ordered public-manifest
row.

## Rollback and next gates

Before commit, restore the seven paths from exact main or today's verified backup if a source update
fails partially. After commit, revert evidence then source without resetting unrelated work. A1 has
no provider, credential, model, database, dashboard, target, package-install, or scratch residue.

A2 may implement only the pure evaluator and schemas. A3 may add fake-process-tested provider
adapters without model calls. A4 may perform exact bounded provider runs only when every runtime
entitlement, executable/version/flag contract, authorization receipt, cost cap, isolated fixture,
cleanup boundary, and evidence sink is concrete. Dashboard work begins only after trustworthy local
receipts exist and uses the dashboard's separately verified backup/branch rules.

## Non-claims

A1 does not claim cross-provider parity is proven, any provider is installed or authenticated,
runtime entitlement exists, a model is available, an external prompt ran, a candidate changed code,
tests passed after implementation, cost or latency was measured, performance ranking is valid, the
dashboard displays parity, provider bundles changed, or P17-007 is done.

No Codex, Claude, or Copilot model execution is performed by A1. No credential read/write/refresh,
network provider call, process adapter, package install, dashboard/database change, target edit,
target `.Codex` edit, sync, push, merge, version bump, tag, release, publication, or visibility
change occurs in this source scope.
