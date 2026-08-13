---
name: project-intelligence
description: Inspect a JavaScript or TypeScript repository and produce a deterministic, evidence-backed Project Profile before planning, scaffolding, or changing a feature. Use when framework, router, i18n, styling, data-layer, task-command, or nearby-reference conventions must be discovered without guessing.
license: Apache-2.0
---

# Project Intelligence

Use the provider-neutral Project Intelligence core. Do not reproduce its detection rules in the
prompt or infer a framework from missing evidence.

## Workflow

1. Resolve the repository root the user placed in scope.
2. Resolve the packaged shared-core launcher. In a distribution bundle, use
   `runtime/project-intelligence.cjs`; in a source checkout, use
   `packages/core/src/project-intelligence.ts`.
3. Run the launcher with exactly one repository-root argument. Prefer
   `node runtime/project-intelligence.cjs <repository-root>` from an extracted bundle. In a source
   checkout, use `npx tsx packages/core/src/project-intelligence.ts <repository-root>`.
4. Accept exactly one stdout line beginning with `@@PROJECT_PROFILE@@` and validate the JSON as
   Project Profile schema `1.0.0`.
5. If `status` is `needs_input`, stop feature planning and report every issue with its evidence
   paths. Ask only for inputs that can resolve those issues.
6. If `status` is `ready`, use the recorded capabilities and reference features as planning inputs.
   Keep absent gates disabled; never fabricate router, i18n, styling, or task conventions.
7. Before claiming a feature change satisfies project-specific UI quality rules, prepare one bounded
   request containing the validated profile plus `changeScope`, `desiredRoute`, and the changed
   files. Run `node runtime/conditional-quality-gates.cjs` in a distribution bundle or
   `npx tsx packages/core/src/conditional-quality-gates.ts` in a source checkout, with the request
   on stdin.
8. Accept exactly one `@@CONDITIONAL_GATES@@` schema `1.0.0` envelope. Stop on `fail` or
   `needs_input`; do not reinterpret `not_applicable`, remove evidence, or recreate gate rules in
   provider instructions.

## Safety and output

- This workflow is read-only. Do not edit application code, instructions, manifests, or lockfiles.
- Do not follow symlinks or traverse ignored dependency/build directories.
- Treat missing, malformed, duplicate, extra, or fingerprint-invalid envelopes as a hard failure.
- Summarize framework, language, package manager, capabilities, task taxonomy, reference features,
  active gates, and blocking issues. Cite the profile's evidence paths.
- If the shared core is unavailable, stop and report the missing runtime. Do not replace it with
  provider-specific heuristics.
