# Contributing to Agentic Feature Kit

Thank you for helping improve Agentic Feature Kit. Contributions should preserve its provider-neutral
core, deterministic evidence contracts, and fail-closed safety boundaries.

By submitting a contribution for inclusion, you agree that it is provided under the repository's
[Apache-2.0 license](LICENSE).

## Development setup

Use a clean clone with Node 24 for the same runtime exercised by release qualification. Node 20 is
the documented minimum.

```bash
git clone https://github.com/vinhtk0209/agentic-feature-kit.git
cd agentic-feature-kit
npm ci
npm run test:kit
```

Provider package work should also run:

```bash
npm run build:providers
npm run test:provider-distribution
```

Do not install a development bundle into a real user or administrator directory for testing. Use an
isolated temporary root and preserve the existing lockfile.

## Architecture boundaries

- Shared business rules belong in [`packages/core`](packages/core/README.md).
- Provider packages remain thin discovery and transport adapters; start with
  [`providers/README.md`](providers/README.md).
- Repository discovery must prefer deterministic facts and keep uncertainty explicit.
- Provider capabilities cannot weaken shared validation, evidence, privacy, or replay rules.
- External services and credentials are optional capabilities, never hidden defaults.
- Public examples must use synthetic data and repository-relative paths.

Keep a single owner for each contract. Link to the owning document instead of copying rules into a
second file.

## Plan and readiness

Non-trivial changes require a bounded plan before implementation. The plan should name:

- the problem and intended outcome;
- exact inputs and unresolved decisions;
- scope and explicit non-goals;
- acceptance criteria and attack cases;
- source and evidence manifests;
- rollback and external-effect boundaries.

Missing input is a `needs_input` result, not permission to invent a provider, framework, credential,
security policy, or release claim. A narrow passing test cannot support a broader completion claim.

## Verification ladder

Use the smallest focused test first, then expand evidence in proportion to risk:

1. Prove a meaningful RED or negative control.
2. Implement only the locked boundary.
3. Run focused behavior and adversarial tests.
4. Run strict TypeScript where applicable and keep skipped library diagnostics disabled.
5. Check formatting, links, generated drift, sensitive-data denials, and the exact changed manifest.
6. Run `npm run test:kit` before requesting merge.
7. Record durable evidence that identifies the exact commit and commands.

Tests must exercise failure behavior, not only happy paths. A zero-result detector needs a positive
control that proves the detector can find a known fixture.

## Generated files

Do not edit generated provider output by hand. Change the owning source or generator, rebuild the
artifacts, and run the corresponding drift and distribution tests. A pull request must state which
generated surfaces changed or why they are unaffected.

Do not commit dependencies, build output, credentials, local backups, private specifications, or
temporary evidence logs.

## Code and documentation style

- Product code, comments, prompts, templates, tests, filenames, commits, and public documentation use
  English.
- Prefer explicit types and deterministic pure functions at trust boundaries.
- Keep provider-specific logic behind an adapter and keep shared-core imports provider-neutral.
- Preserve public compatibility or provide a versioned migration and deprecation path.
- Do not introduce Rust, Go, Python, a sidecar, or a new dependency without a measured capability or
  performance need and an explicit distribution/trust review.

## Pull request requirements

Use the repository pull request template and provide:

- a linked plan, roadmap task, or issue;
- the exact scope and non-goals;
- commands and durable evidence for verification;
- generated-file and drift results;
- security, privacy, and compatibility impact;
- **External effects**, enumerating every network, credential, database, provider, publication,
  release, tag, sync, or target action, or explicitly declaring none.

Keep commits reviewable. Do not combine an unrelated refactor, version bump, publication action, or
generated rewrite with a feature merely because both are locally available.

## Reporting and conduct

Use the [support policy](SUPPORT.md) for routing, the [security policy](SECURITY.md) for private
vulnerability reports, and the [Code of Conduct](CODE_OF_CONDUCT.md) for community expectations.
Never place sensitive findings in a public issue or pull request.
