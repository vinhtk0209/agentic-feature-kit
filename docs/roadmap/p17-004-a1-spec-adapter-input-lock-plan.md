# P17-004 A1: Provider-Neutral Specification Adapter Input Lock

**Status:** In progress under standing Post-17 continuation authority; input fixtures only
**Date:** 2026-08-21
**Roadmap task:** P17-004
**Parent:** P17-003 provider-neutral semantic specification model
**Decision lock:** `schema=S1, fixtures=F1, provenance=P1, mapping=M1, unsupported=U1, config=C1, discovery=D1, privacy=R1, failure=E1, scope=N1`

## Outcome

P17-004 removes the assumption that a specification must originate in Confluence. A1 supplies the
previously missing, approved Jira and Azure DevOps fixture inputs and locks the application contract
that later adapters must implement. It does not implement or invoke an adapter.

The two fixtures are synthetic, structurally representative provider exports. They normalize to the
same title and acceptance-criterion meanings while retaining different provider anchors and raw
shapes. This makes later parity mechanical without collecting a real tenant export.

## Reconciled starting state

P17-003 already owns the canonical shared-core semantic model in
`packages/core/src/semantic-spec.ts`. Its `SemanticSourceInput` accepts arbitrary non-empty source
kinds, byte identity, source references, anchored paragraphs, anchored acceptance criteria, and
optional contract observations. `normalizeSemanticSpec` produces one strict `SemanticSpec` with
separate semantic and provenance hashes.

The older `.claude/integrations/spec-ir.ts` contract is a file-ingestion transport for raw user
stories, Word, PDF, and Excel. The current Confluence staging adapter preserves MCP response bytes
and reuses that raw-US transport. A1 does not rename, replace, or version either contract.

There is no Jira or Azure DevOps adapter, fixture, capability registry, provider call, or credential
contract in the current tree. P17-004 is therefore still `backlog` and its readiness input is
truthfully missing before this source checkpoint.

## Official provider shape references

- Jira Cloud REST API v3 issue resources expose issue identity and a `fields` object:
  https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/
- Azure DevOps REST 7.1 work-item responses expose `id`, `rev`, `fields`, and `url`:
  https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-item?view=azure-devops-rest-7.1

These links justify only the minimal fixture envelopes. They do not authorize network access or
promise compatibility with unlisted provider fields.

## Locked decisions

### S1 — SemanticSourceInput remains the canonical content contract

A later adapter returns one additive application wrapper named `SpecAdapterResult`. The wrapper has
one version, one adapter ID, one provider ID, deterministic capability metadata, one unchanged
P17-003 `SemanticSourceInput`, and an ordered list of unsupported field names. It does not introduce
`SpecIR v2`, change `SemanticSpec` v1.0.0, or fork normalization rules by provider.

The wrapper is an application boundary. Provider JSON types remain in infrastructure adapters;
shared semantic core never imports Jira, Azure DevOps, Confluence, HTTP, auth, environment, or
filesystem clients.

### F1 — Approved synthetic exports only

A1 admits exactly two JSON fixtures:

- `p17-004-jira-minimal.json` mirrors a Jira issue with `id`, `key`, and `fields`; and
- `p17-004-azure-devops-minimal.json` mirrors an Azure DevOps work item with `id`, `rev`, `fields`,
  and `url`.

Both use reserved `*.example.invalid` hosts, synthetic IDs, generic product language, and no real
account, project, repository, employee, email, token, comment, attachment, history, or tenant row.
The fixture envelope records raw `payload`, field `mapping`, and exact `expected` paragraphs and
criteria. The envelope itself is test input, not a provider wire format.

### P1 — Byte identity and field anchors are mandatory

The later adapter hashes the exact UTF-8 provider response bytes before parsing. `sourceSha256` in
`SemanticSourceInput` identifies those bytes, not reserialized JSON. `sourceRef` is an explicitly
provided opaque item reference and never embeds a credential, instance URL, organization, project,
or query string.

Every expected paragraph has a provider-qualified, deterministic field anchor. Every acceptance
criterion points to one real paragraph anchor and carries a literal source quote. An adapter may
normalize provider markup into paragraph text only through its provider parser; it cannot invent or
summarize acceptance criteria.

### M1 — One mapping contract for every provider

Each adapter receives an immutable mapping with exactly one title field, one or more paragraph
fields, and one or more explicitly unsupported fields. Every field present in a fixture is accounted
for by exactly one of those categories. Duplicate ownership, a missing mapped field, and an unknown
mapping key fail closed.

Jira ADF and Azure DevOps HTML are provider infrastructure concerns. The A2 adapter tests must prove
their supported minimal node/tag subset, ordering, entity handling, and refusal of malformed or
truncated content before any normalized source input is returned.

### U1 — Every unconsumed field is explicit

An adapter emits unsupported field names only, sorted by JavaScript ordinal comparison. It never
copies unsupported values into adapter output, expected output, logs, warnings, exceptions, or
evidence. A controlled A1 raw fixture may contain one generic synthetic placeholder solely to prove
field conservation; that value must not enter its `expected` result. An unconfigured field cannot
silently influence title, paragraphs, criteria, contracts, or capability selection.

Required mapped fields that are absent or structurally invalid are errors. Optional future fields
may be surfaced as unsupported names, but supporting them requires a versioned mapping and tests.

### C1 — Instance URLs are injected configuration

The adapter constructor receives one HTTPS base URL with no userinfo, query, or fragment. No
production instance URL is hardcoded. The provider payload cannot redirect or override the configured
base URL, and the URL does not enter `SemanticSourceInput`, hashes, logs, or durable evidence.

The A1 fixtures use reserved example hosts only. A2 will attack non-HTTPS URLs, root confusion,
userinfo, query/fragment smuggling, payload URL mismatch, and provider cross-wiring.

### D1 — Capability discovery is deterministic and offline

Discovery operates only over an explicitly registered list of adapter descriptors. It performs no
network request, environment lookup, credential probe, dynamic package installation, or tenant
crawl. Results are exact-shape, frozen, unique by adapter ID, and JavaScript-ordinal sorted.

Each descriptor declares provider ID, accepted input kind, output schema version, configuration
requirements, and unsupported behavior. Discovery describes availability; it does not authenticate,
fetch, or execute an adapter.

### R1 — Fixtures contain no tenant or person data

Fixture privacy gates positively control email, credential-assignment, private-IP, and URL-host
detectors before requiring zero findings. All URLs must use `*.example.invalid`. Content must be
generic English and must not contain customer specifications, private requirement bodies, usernames,
emails, raw tokens, API keys, cookies, authorization headers, provider comments, attachments, or
history.

Later live provider evidence, if separately authorized, may persist only adapter ID, provider ID,
closed outcome, exact source hash, counts, semantic hash, provenance hash, unsupported field names,
and duration. Raw payloads and normalized requirement text do not enter durable public evidence.

### E1 — Malformed or partial inputs fail closed

Invalid JSON, extra envelope keys, wrong provider, invalid URL, duplicate mapping, absent required
field, malformed ADF/HTML, over-budget bytes/nodes/text, non-string field content, duplicate anchor,
unresolved quote, and provider mismatch return typed closed errors. No partial `SemanticSourceInput`
or `SemanticSpec` is returned.

Error messages contain stable adapter/reason labels only. They do not echo payload values, provider
responses, URLs, paths, credentials, or source text.

### N1 — Input lock only; adapters remain a later slice

A1 changes the plan, two synthetic fixture inputs, roadmap readiness/status, validator registration,
public manifest, the evergreen R6 repository proof, and evidence. The R6 repair reconstructs the
historical public-readiness transition from its accepted merge instead of freezing unrelated future
roadmap statuses; it still requires the current roadmap to preserve the completed P17-018 closure.
It does not add Jira, Azure DevOps, Confluence, or local-file runtime adapters,
capability-discovery runtime, provider bundle surface, CLI route, or dashboard UI.

No credential refresh, tenant-wide crawl, network request, or provider execution is authorized.
There is no sync, target `.Codex` edit, version bump, provider call, push, merge, tag, release,
publication, or visibility change in the local source checkpoint.

## Fixture contract

Each fixture envelope has exactly:

- `fixtureVersion: 1`;
- `sourceKind: jira | azure-devops`;
- a synthetic `sourceRef`;
- a reserved HTTPS `baseUrl`;
- a minimal provider-shaped `payload`;
- `mapping` with title, paragraph, and unsupported field ownership; and
- `expected` with title, exact anchored paragraphs, exact source-backed criteria, and unsupported
  field names.

The fixtures intentionally use different provider markup and anchors but the same title and
criterion IDs/text. A2 must prove that both inputs produce identical semantic hashes and distinct
provenance hashes through the unchanged P17-003 normalizer.

## Attack and test strategy

1. Prove exact plan-absent RED after validator/full-suite registration.
2. Prove fixture-absent RED after this unchanged plan is present.
3. Validate exact fixture shapes, mapping conservation, literal provenance, provider-specific
   anchors, same normalized meaning, and reserved-host-only URLs.
4. Run positive-controlled privacy detectors for email, credential assignment, private IPv4, and
   URL hosts.
5. Attack missing unsupported ownership, duplicate mapping, a non-reserved host, URL userinfo, and
   a payload URL whose origin differs from the injected base URL.
6. Require roadmap JSON/human status agreement and remove only P17-004 from the missing-input list.
7. Require all four new public paths in the ordered public manifest.
8. Run roadmap, semantic-spec, public-source, provider-distribution, and complete native kit tests.

## Implementation sequence

1. Register the validator and full-suite route; preserve exact plan-absent RED.
2. Add this plan; preserve exact Jira-fixture-absent RED.
3. Add the two synthetic fixtures and make fixture/privacy/attack checks pass.
4. Change P17-004 from `backlog` to `in_progress`, mark only its readiness input complete, and keep
   task acceptance criteria open.
5. Add the four new source paths to the public manifest in JavaScript ordinal order.
6. Repair the R6 repository assertion so its immutable transition proof permits later unrelated
   roadmap progress while current P17-018 closure remains exact.
7. Qualify the exact source index, then run the full kit suite.
8. Commit source and metadata-only evidence separately. Remote PR work remains a later exact-head
   action.

## Exact source manifest

The A1 source checkpoint changes exactly nine paths:

- `docs/roadmap/p17-004-a1-spec-adapter-input-lock-plan.md`;
- `docs/roadmap/fixtures/p17-004-azure-devops-minimal.json`;
- `docs/roadmap/fixtures/p17-004-jira-minimal.json`;
- `docs/roadmap/post-17-roadmap.json`;
- `docs/roadmap/post-17-roadmap.md`;
- `package.json`;
- `release/public-release-manifest.json`; and
- `scripts/post-17-spec-adapter-input-lock.test.ts`; and
- `scripts/public-release-readiness-contract.test.ts`.

The separate evidence checkpoint adds only
`docs/evidence/post-17-spec-adapter-input-lock-2026-08-21.md` and its ordered public-manifest entry.

## Failure and rollback behavior

| Failure | Required behavior | Forbidden behavior |
|---|---|---|
| Plan missing or drifted | Validator exits nonzero | Infer decisions from a fixture |
| Fixture malformed or privacy-positive | Reject the source checkpoint | Redact in place and call it representative |
| Provider field unaccounted | Fail mapping conservation | Silently drop or guess the field |
| Source/provenance mismatch | Return no adapter result | Fabricate an anchor or quote |
| Roadmap/public manifest drift | Block commit | Leave status or public authority stale |
| Source update fails partially | Restore the 2026-08-21 backup | Continue on a half-updated tree |

## A2 entry gate

A2 may implement provider-neutral adapter contracts and the Jira/Azure DevOps local parsers only
after A1 source/evidence qualification and merge. It must write tests before runtime, keep provider
I/O behind injected ports, preserve P17-003 hashes/provenance, and separately decide how existing
Confluence and local-file paths enter the new wrapper. Live provider execution remains separately
input- and credential-gated.

## Non-claims

A1 does not claim P17-004 complete, adapter runtime exists, a provider was contacted, a real Jira or
Azure DevOps export was read, Confluence was migrated, capability discovery executes, provider parity
was proven, credential refresh exists, or P17-019 is ready.
