```

```
Agent({
  description: "Implement <FeatureName> — B10 files",
  isolation: "worktree",
  prompt: """
    You are implementing a feature for a web application. Follow the project's conventions exactly.

    ╔══════════════════════════════════════════════════════════════╗
    ║  SCSS SCOPE GUARD — READ BEFORE WRITING ANY FILE            ║
    ║                                                              ║
    ║  Before writing or editing ANY .scss file:                  ║
    ║  1. Verify its full path starts with src/<feature-folder>/  ║
    ║  2. If it does NOT → DO NOT TOUCH IT. Skip silently.        ║
    ║                                                              ║
    ║  This applies even if a lint/type error points to that file. ║
    ║  Pre-existing scss errors outside the feature folder are     ║
    ║  NEVER your responsibility. List them as "Pre-existing".    ║
    ╚══════════════════════════════════════════════════════════════╝

    STACK: {{STACK_DESCRIPTION}}
    HTTP: {{PROJECT_CTX.http_client}} — use only the project's standard HTTP client, never raw fetch/axios
    RESPONSES: {{PROJECT_CTX.response_transform}} on every API response
    REQUESTS: use `PROJECT_CTX.request_transform` (if defined) for all POST/PUT/PATCH bodies — import it from your project's HTTP client module; do NOT write plain snake_case object literals; import request transform alongside response transform at the top of api.ts
    IMPORTS: {{PROJECT_CTX.import_alias}} alias — no deep cross-feature imports
    COMMIT FORMAT: {{PROJECT_CTX.commit_format}}

    FILE STRUCTURE (resolved from CLAUDE.md or framework default — use this, do NOT invent your own):
    {{FILE_STRUCTURE}}

    FEATURE: <FeatureName>
    FOLDER: src/<feature-folder>/

    CONFIRMED DESIGN (from B6.5):
    <paste component decomposition, state shape, API contract from B6.5>

    TASK BREAKDOWN (from B7 steps.md):
    <paste the full task table from steps.md>

    KEY SPEC REQUIREMENTS:
    <paste ACP items and business rules from processed.md>

    VISUAL SPEC ANNOTATIONS (from docs/specs/<FeatureName>/image-annotations.md):
    <paste full contents of image-annotations.md, or "(none — no images downloaded)" if file absent>

    DESIGN TOKENS (from docs/specs/<FeatureName>/visual-properties.md):
    <paste full contents of visual-properties.md, or "(none — B2.5 was skipped)" if file absent>

    SPEC IMAGES — Direct visual access (do this FIRST before writing any file):
    1. Glob({ pattern: "docs/specs/<FeatureName>/images/**" }) → get list of image files
    2. Read each image file with the Read tool — you will see the image visually
    3. Cross-reference what you see with the text annotations above
    If images exist: what you see visually is the authoritative spec — match layout, button labels,
    column order, and component placement exactly. Text annotations are secondary context only.

    HARD CONSTRAINTS (v3.6 — Change H: visual-properties.md is authoritative):
    - **Design tokens authoritative**: visual-properties.md (if present) is the ONLY source of truth for
      colors, spacing, typography. Every hex code in your generated `.scss` MUST appear in the palette
      section. Every `padding`/`margin`/`gap` value in px MUST appear in the spacing scale. Every
      `font-size`/`font-weight` MUST match a typography role rule.
    - **NO invented values**: Do NOT use hex codes from imagination (e.g. `#4a90e2` if not in palette).
      Do NOT use arbitrary spacing (e.g. `padding: 13px` when scale is 4/8/16/24). If a needed token
      is missing, STOP and ask user to clarify rather than inventing.
    - **Use SCSS variables**: Define palette/spacing/typography as `$variable-name` at top of
      feature SCSS (or in feature `_tokens.scss` partial), reference them everywhere. No raw hex
      literals scattered across components.
    - **(W.6) Simple proportional bar → CSS, NOT a charting library**: only use recharts/chart.js when
      the design shows real chart furniture (value axis, gridlines, multiple series, legend). A per-row
      proportional bar (one bar filling `value/total %`, label one side + value the other) MUST be a
      CSS track `<div>` + fill `<div>` with `width:<pct>%` — so it carries no unwanted axes and an
      inline icon/label can share the row. **Never** render the same domain array twice (once to feed a
      chart, once as a sibling label list) — that duplication (the W-l Exam Details smell) means a chart
      was used where a row was wanted. `lint-feature.ts` W7 warns on a domain array `.map()`'d ≥2×.
    - **(W.8) State shown via a styled container must BE that container, not a minimal proxy**: when the
      design conveys a status/state through a **filled colored card** (pass=green / fail=red), a **status
      icon** (✓/✗), a **tinted panel**, or a **badge** — reproduce that container (background fill + value
      color + icon), NOT a cheaper proxy (a 1px border instead of a fill, plain text instead of a card, a
      missing icon). A rule like "Passed → green" means the card background + value color, not a border.
      Render every named section heading from the spec Component list; never hardcode a user-facing label
      inline — use an i18n descriptor with the spec's exact wording ("Learner name", not "Name"). These
      fidelity misses are invisible to testid/text assertions — stop them here, at generation time.

╔══════════════════════════════════════════════════════════════╗
║  CONTAMINATION GUARD                                         ║
║                                                              ║
║  BASELINE folder (if any): src/<BASELINE_FOLDER>/           ║
║                                                              ║
║  DO NOT read, reference, or copy from that folder.          ║
║  Implement PURELY from the spec files listed above.         ║
║  Reading the BASELINE folder invalidates this result.        ║
╚══════════════════════════════════════════════════════════════╝

    CHECKLIST PER FILE — apply to every file you write:
    - data/types.ts: no `any`, all spec fields, exported interfaces; when the API contract shows a literal numeric or string value for a field (e.g. `maxAttempts: 2`), preserve it as a TypeScript literal type — do NOT widen to `number` or `string`
    - data/api.ts: USE_MOCK = true, delay(), PROJECT_CTX.http_client, mock data covers all spec fields; every response returned via a mapXxx() from data/transform.ts — NEVER blind-cast a raw response to a type; import request transform alongside response transform; use request transform for all POST/PUT/PATCH bodies — never plain snake_case object literals. If contractStatus=PROVISIONAL, stamp the PROVISIONAL comment (HARD RULE 32) at the top of the file.
    - data/transform.ts: one mapXxx(raw): Xxx per response type (anti-corruption layer, HARD RULE 33). api.ts imports and calls these; the `as Type` cast on a raw HTTP response is banned.
    - utils/: every Business-Rule / display-format row in checklist.md → a pure function + co-located <name>.test.ts wired into ux-states.json unit_tests[] (HARD RULE 34), unless the row is marked enforced-by BE
    - data/apiHooks.ts: useQuery with staleTime, useMutation with invalidateQueries in onSettled (NOT onSuccess)
    - <Feature>.tsx: loading / error / empty / success states, reuse src/generic/ components, no hardcoded strings
    - messages.ts: defineMessages, all user-visible strings extracted from JSX
    - <Feature>.scss: ONLY write styles in src/<feature-folder>/. Do NOT edit SCSS of other features, src/generic/*.scss, or global stylesheets
    - All imports: @src/... alias, no deep cross-feature imports

    STOP CONDITIONS — do NOT implement; report back to coordinator instead:
    - Deleting any existing file
    - Modifying DB schema or migration files
    - Changing anything under src/generic/ (shared across features)
    - Renaming a function/component used in more than one feature folder
    - Modifying any .scss file outside src/<feature-folder>/ (including src/generic/*.scss and global stylesheets)

    For everything outside STOP CONDITIONS: implement silently. Ask nothing.

    Before reporting done, run SELF-EVAL:
    - **Code-quality gate (v3.16 — one command, replaces the old grep list):**
      `npx tsx .claude/integrations/lint-feature.ts src/<feature-folder> --code-only`
      → MUST report 0 errors. Covers: HARD RULE 33 no blind cast (`<transform>(data) as Type`), no `any`,
      no `console.log/debug`, no deep `../../../` imports, transform.ts present when api.ts makes HTTP calls,
      and no placeholder (assertion-less) tests. Fix every error before reporting done.
    - **Design-token greps (NOT covered by the script — keep these inline):**
      - Token compliance: `grep -roE '#[0-9a-fA-F]{6}' src/<feature-folder>/` — every hex MUST appear in visual-properties.md palette.
      - Spacing compliance: scan `src/<feature-folder>/**/*.scss` for `\d+px` not matching the spacing scale.
      - Typography compliance: scan for `font-size`/`font-weight` not matching a role in visual-properties.md.
    - React Query keys consistent: every `queryKey` starts with `['<feature-folder>', ...]`.

    If ANY violation: fix before reporting done (do NOT report a partial pass).

    When done, report:
    - Files created: [list]
    - Files modified: [list]
    - STOP conditions encountered: [list or "none"]
    - Any imports or packages added: [list or "none"]
    - Token / spacing / typography / quality grep results: all clean ✅ (or list any unfixable items)
  """
})
```
