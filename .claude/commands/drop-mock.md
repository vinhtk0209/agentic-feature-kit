---
description: Remove USE_MOCK flag and all mock infrastructure from an api.ts file
---

Target file: **$ARGUMENTS**

Remove all mock infrastructure from the file without changing real API logic.

## Steps

1. **Read** the target `api.ts` file fully. Also note whether a sibling `data/transform.ts` exists (v3.16 anti-corruption layer).

1.5. **PROVISIONAL contract pre-check** *(v3.16 — HARD RULE 32)*: if `api.ts` carries a `// CONTRACT: PROVISIONAL` stamp, the real backend shapes have NOT been verified against the inferred ones. Before dropping mock:
   - Check for `docs/components/<FeatureName>/RECONCILE.md` (written at B4/B12.8).
   - WARN the user: *"This api.ts is PROVISIONAL. Verify `data/transform.ts` mappers match the real backend response shapes (see RECONCILE.md) before going live — otherwise the real path will mis-map fields."*
   - Proceed only after the user confirms the mappers are reconciled, then remove the `// CONTRACT: PROVISIONAL` stamp as part of this run.

2. **Delete** these constructs:
   - `export const USE_MOCK = ...` line
   - `const delay = ...` line
   - All `const MOCK_*` arrays and their contents
   - Every `if (USE_MOCK) { ... }` block (including the braces and contents)
   - Any `await delay(...)` calls that remain
   - Unused imports introduced only for mock (e.g. types only used in mock arrays)

3. **Keep** everything else: real API calls, response/request transform helpers, `getAppUrl`, interfaces, exports — and CRITICALLY keep `data/transform.ts` and every `mapXxx(...)` call in the real branch. The mappers are the real-path mapping, NOT mock. Do NOT inline them, do NOT replace `mapXxx(transformResponse(data))` with a blind cast.

4. Run `npm run types` and report any errors. Fix TypeScript errors that result directly from the removal (e.g. narrowing that was only needed because of the mock branch).

4.5. **Mapping-layer gate** *(v3.16 — HARD RULE 33)*: grep for `<PROJECT_CTX.response_transform>([^)]*)\s+as ` in `src/<feature-folder>/` — MUST return 0 matches. If the mock removal exposed or introduced a blind cast, route that response through its `mapXxx()` in `transform.ts` instead.

5. Report a summary:
   - Lines removed
   - PROVISIONAL stamp removed? (yes/no — only if step 1.5 applied)
   - Mapping-layer gate: 0 blind casts ✅ (or list violations fixed)
   - Any errors found and fixed
   - Any manual cleanup needed (e.g. `apiHooks.ts` imports of `USE_MOCK`)
