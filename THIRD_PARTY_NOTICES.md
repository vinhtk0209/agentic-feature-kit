# Third-Party Notices

Agentic Feature Kit distribution bundles include software from the projects listed below. The
corresponding license text is included in each generated bundle under `licenses/`.

## TypeScript

- Project: TypeScript
- Copyright: Microsoft Corporation
- License: Apache License 2.0
- Source: https://github.com/microsoft/TypeScript
- Included file: `licenses/typescript-LICENSE.txt`

TypeScript is bundled into `runtime/project-intelligence.cjs` to parse JavaScript and TypeScript
configuration safely without requiring a separate installation.

## Dependency review authority

The public source workspace has four committed npm lockfile authorities. Their deterministic inventory
is recorded in `release/dependency-license-catalog.json`; the fail-closed allow/review rules and exact
metadata provenance overrides are recorded in `release/dependency-license-policy.json`. Together they
cover 616 unique name@version packages and 749 lockfile occurrences.

The unconditional engineering allowlist is 0BSD, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, and MIT.
The following exact packages have a separate reviewed decision:

- `@axe-core/playwright@4.11.3` — MPL-2.0, development-only accessibility integration;
- `axe-core@4.11.4` — MPL-2.0, development-only accessibility engine;
- `caniuse-lite@1.0.30001799` — CC-BY-4.0 browser-compatibility data;
- `dompurify@3.4.11` — Apache-2.0 selected from its dual-license expression;
- `robust-predicates@3.0.3` — Unlicense transitive geometric utility.

The provider source bundles do not vendor `node_modules`.
This catalog is an engineering control, not legal advice or a claim that every future distribution
contains the same dependency surface.
R5C2 must re-evaluate the exact final archive contents, embedded source, license files, notices, and
SBOM sidecars before any release candidate can be qualified.
