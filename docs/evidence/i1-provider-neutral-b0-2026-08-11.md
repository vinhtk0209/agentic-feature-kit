# I1 Provider-Neutral B0 Evidence — 2026-08-11

## Scope

This evidence closes the provider-specific Confluence intake gap discovered by live Codex run
`eda1631b-dc0e-4c00-b1a1-ddeaa44404ce`. That run produced trusted `meta` and `B0` kit events but
could not call Claude's registered `fetch_confluence_page` tool.

The new B0 CLI invokes the existing scheduler-owned refetch actor, parses its output with the exact
continuous-assurance `@@SPEC_REFETCH_RESULT@@` parser, verifies source identity and SHA-256, and
runs the canonical raw-US Spec-IR adapter before writing staging artifacts. The workflow prompt no
longer asks Codex, Copilot, Gemini, or another provider to call a provider-specific MCP tool.

The refetch parser now lives in one shared contract module used by both continuous assurance and
interactive B0. B0 does not import the assurance scheduler or unrelated PDF/Word/Excel adapters.
The MCP child inherits only the current Node TypeScript-loader flag pairs and rejects a missing
loader; eval, print, and debug arguments are not propagated. This removes the prior assumption that
every target has a root-local `node_modules/tsx` while keeping the child direct and `shell:false`.

## Fail-closed canary

`confluence-b0-intake.test.ts` proves byte-identical source staging, canonical Spec-IR generation,
credential non-disclosure, and rejection of missing, ordinary, malformed, duplicate, and
hash-forged refetch output before either staging file is written.

The initial RED run failed with `MODULE_NOT_FOUND` because the B0 boundary did not exist. The GREEN
run passed and the existing continuous-assurance suite remained 17/17 green.

## Live source proof

The exact O2-approved page URL was fetched using the already-configured runner token and bounded
local browser transport. No credential, header, response body, or source text was printed.

- exit code: `0`
- source reference: `confluence:830569842`
- source bytes: `19,310`
- source SHA-256: `dd36b30b0c1c162bafac9f6b464105da6ad3310014a13ce81931f02d41c9ea93`
- staged file SHA-256: `dd36b30b0c1c162bafac9f6b464105da6ad3310014a13ce81931f02d41c9ea93`
- validated paragraphs: `95`
- validated acceptance criteria: `19`
- generated Spec-IR file SHA-256: `d663c541ab2e3c1eee327a1bfd7efe3d1d4d2d58685a5c32b9d2dc6a690c7524`

A short origin-only URL was also tested and returned HTTP 301. The boundary emitted no result
sentinel and wrote neither source nor IR. The live workflow therefore uses the exact canonical
`/conf/spaces/.../pages/830569842/...` URL already preserved in the O2 baseline.

## Completion-gate companion fix

The dashboard workflow evidence gate now requires a successful `feature-from-confluence` run to
contain trusted `B12` state evidence. Trusted `meta` plus `B0` alone yields
`missing_terminal_phase`; transport diagnostics and other kit commands retain their prior rules.
The focused dashboard test suite covers the partial-B0 rejection and B12 success case.
