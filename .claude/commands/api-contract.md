---
description: Generate an .http API contract from an existing feature's data layer
---

Feature folder: **$ARGUMENTS**

Read the feature's data layer and generate a `.http` contract file.

## Steps

1. **Read** these files from `$ARGUMENTS/data/`:
   - `api.ts` — extract every exported async function, its URL, method, params, and body shape
   - `types.ts` — extract request/response type definitions (the **domain** shape)
   - `transform.ts` *(if present — v3.16 anti-corruption layer)* — each `mapXxx(raw)` shows the **wire** shape the server actually returns (often snake_case, different nesting). When it exists, derive `### EXPECTED RESPONSE SHAPES` from the mapper's `raw` input, not only from the camelCase domain types — this captures the true on-the-wire field names.
   - `apiHooks.ts` — note query keys and mutation patterns

2. **Derive** the output path: `docs/components/<feature-folder-name>/<FeatureName>.full.http`
   - If the docs folder doesn't exist yet, create it.

3. **Write** the `.full.http` file with one `###` block per endpoint, following the canonical format in [`.claude/templates/http-contract.template.md`](../templates/http-contract.template.md). When `data/transform.ts` is present, derive `### EXPECTED RESPONSE SHAPES` from each mapper's **`raw` (wire)** input (true on-the-wire field names); otherwise from `types.ts`.

4. **Report** the generated file path and a one-line summary of endpoints covered.
