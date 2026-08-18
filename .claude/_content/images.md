### Process

1. Parse all image URLs and iframe embeds from the B0 raw spec (`docs/specs/<FeatureName>/raw-spec.md`)
2. Create `docs/specs/<FeatureName>/images/` if it does not exist

### Step 3 — Classify content type (before download)

For each image URL, determine `CONTENT_TYPE` from **3 signals** (in priority order):

| Signal | Condition | `CONTENT_TYPE` |
| ------ | --------- | -------------- |
| URL pattern | URL contains `diagram`, `flow`, `chart` | `DIAGRAM_FLOW` |
| URL pattern | URL contains `screenshot`, `screen`, `ui-` | `UI_SCREENSHOT` |
| Heading context | Nearest heading contains **EN** "Flow", "Diagram", "Process" / **VI** "Luồng", "Quy trình", "Sơ đồ" / **JP** "フロー", "図", "プロセス" | `DIAGRAM_FLOW` |
| Heading context | Nearest heading contains **EN** "Screen", "UI", "Interface", "Page" / **VI** "Màn hình", "Giao diện", "Trang" / **JP** "画面", "ページ" | `UI_SCREENSHOT` |
| Heading context | Nearest heading contains **EN** "Button", "Action", "CTA" / **VI** "Nút", "Hành động" / **JP** "ボタン" | `BUTTON_DESCRIPTION` |
| No match | — | `UNKNOWN` |

> **(v3.8 — Change L.3 i18n classification)** Heading regex must match patterns case-insensitively across EN/VI/JP. Use Unicode-aware regex (e.g. `\p{L}` boundaries). Both editions emit the same `CONTENT_TYPE` assignments — locked.

Log classification: `[timestamp] [B2-classify] url=<url> type=<CONTENT_TYPE>`

> **Note**: `DIAGRAM_FLOW` has the highest priority because these images are needed for B5 (generate diagram.md).

### Step 4 — Deduplication

Before downloading each URL: check whether the URL already exists in the `downloaded_urls` set (in this session).

- URL already present → skip, log `[B2-dedup] skipped duplicate: <url>`
- New URL → add to the set, proceed to download

### Step 5 — Batch download (parallel by URL strategy)

**Pre-check (run before any HTTP download):** For Confluence input, the B2 hand-off already called the
`save_confluence_images` MCP tool, which wrote the page's embedded images into
`docs/specs/<FeatureName>/images/` (Confluence auth + embedded-page workaround already applied). Check
that folder — for every URL whose image is already present there, **skip HTTP download** and proceed
directly to Step 7 (annotate). Only fall through to the download strategies below for images the MCP
tool could not save (or for non-Confluence inputs).

Log: `[timestamp] [B2-prefetch] found N MCP-saved images in docs/specs/<FeatureName>/images/ — skipping download`

Classify each URL by **download strategy**, then download all in parallel:

| URL pattern | Strategy |
| ----------- | -------- |
| Contains `figma.com` | Figma strategy |
| Contains Confluence domain (e.g. `your-confluence.example.com`) | Confluence strategy |
| Any other external URL | Generic strategy |

| Strategy | Attempt 1 | Attempt 2 | Attempt 3 |
| --- | --- | --- | --- |
| **Confluence** | Re-fetch via MCP: call `fetch_confluence_page` with the original Confluence URL — MCP has auth. Save any new base64 image blocks returned. | Attachment/export API via direct HTTP + auth header (`CONFLUENCE_USER/PASS`) | GET no auth |
| **Figma** | Playwright screenshot → `images/figma-<hash>.png` | Figma REST `GET /v1/images/<key>?ids=<ids>` + `$FIGMA_TOKEN` (401 → log `"FIGMA_TOKEN missing"`) | Chromium screenshot direct |
| **Generic** | HTTP GET no auth | HEAD check then GET | GET + User-Agent |

*Attempt 3 = last real attempt for all strategies — no placeholder created on fail.*

Log each attempt to `docs/specs/<FeatureName>/recovery.log`.

### Step 6 — Handle the result after all images have been processed

After **all** images have been processed (success or fail), check the `failed_images` list.

**If NO image failed** → continue normally.

**If at least one image failed all 3 attempts** → **STOP GATE**:

```text
⚠️  IMAGES REQUIRED FOR CORRECT UI IMPLEMENTATION

The following images were tried 3 times but failed:

| Type             | File name        | Reason        |
| ---------------- | ---------------- | ------------- |
| UI_SCREENSHOT    | screen1.png      | 403 Forbidden |
| DIAGRAM_FLOW     | flow.png         | Timeout       |

⚠️  UI_SCREENSHOT images are required for B10 to implement the UI with the correct
    layout, button labels and column order. Without them the UI is implemented from
    the text spec — which may not match the actual design.

Please provide these images:
  [1] Copy the files into docs/specs/<FeatureName>/images/ then type "done"
  [2] Paste the path to the source file
  [3] Type "skip" — I accept the UI may not match the spec exactly
```

**STOP — DO NOT continue until you receive the user's response.**

- User types `"done"` → verify the files exist in `images/`, continue
- User types `"skip"` → mark all failed images as `⚠️ [IMAGE MISSING]` inline in processed.md and continue
- User provides a path → copy/rename the file into `images/`, verify, continue

If the user provided images (done/path), do **not** append an Error Report. If the user chose skip, append an Error Report:

```markdown
---
## ⚠️ Image Error Report (user skipped)
| File | Type | Strategy | Attempts | Final Reason |
| ---- | ---- | -------- | -------- | ------------ |
| image1.png | UI_SCREENSHOT | Confluence | 3/3 | 403 Forbidden |
| flow.png | DIAGRAM_FLOW | Generic | 3/3 | Timeout |
```

**NEVER skip failed images silently — always ask the user first.**

### Step 7 — Annotate successfully downloaded images

After Step 6 completes, read each successfully downloaded image with the Read tool and create `docs/specs/<FeatureName>/image-annotations.md`.

For each file in `docs/specs/<FeatureName>/images/` (skip failed images):

1. Read the image file: `Read({ file_path: "docs/specs/<FeatureName>/images/<filename>" })`
2. Append a section to image-annotations.md:

```markdown
### <filename>
**Type:** <CONTENT_TYPE>
**Path:** docs/specs/<FeatureName>/images/<filename>

- [3–8 bullets describing: layout regions, visible components, button labels, field labels,
  states shown, column order, distinctive colors]
  - UI_SCREENSHOT: focus on what a developer needs to match the visual
  - DIAGRAM_FLOW: numbered sequence + decision nodes in order
  - BUTTON_DESCRIPTION: exact label text + enabled/disabled state
```

Log: `[timestamp] [B2-annotate] images_annotated=N` → `recovery.log`

**Resume**: if `image-annotations.md` already exists (resume session), only annotate images that have no entry yet.
**Zero images downloaded**: skip Step 7 silently.

---

## B2.5 — Extract Design Tokens *(v3.6 — REQUIRED if ≥ 1 UI_SCREENSHOT)*

**Purpose**: extract authoritative design tokens (colors, typography, spacing) from spec images to prevent B10 from inventing CSS values, and to enable B11 CSS audit.

**Skip silently** if `image-annotations.md` has 0 UI_SCREENSHOT entries.

### Step 0 — Figma-sourced tokens (PREFERRED — try this before visual estimation) *(v3.20 — Change V.1)*

**Trigger**: the raw spec (`raw-spec.md`) contains a `figma.com/design/` or `figma.com/file/` URL.

**Why this runs first**: two independent failure modes were confirmed in a live worked example
(US-LE-019 `CourseHeader`, 2026-07-09) when tokens were extracted by LLM visual estimation from a
flattened screenshot instead of the live Figma source:
  1. **Spec prose lies.** The spec's own component description quoted an exact hex
     ("navy blue (#1C2B4A) hero background") that did not match the current Figma file at all — the
     real hero background was a `linear-gradient(180deg, #1569ae, #00569c)`. Trusting a hex quoted in
     prose without checking the live source produced a visibly wrong color.
  2. **Screenshot estimation is imprecise for exact values.** The H1 title was judged "≈28px" by eye;
     the real Figma value was `32px` (`letterSpacing: -0.64px`). A flattened raster image cannot be
     measured precisely — colors flatten gradients into an apparent average, and font sizes are a guess.
  Every mismatch found traced to one of these two causes. Neither is specific to one feature — it's a
  structural gap whenever a Figma link exists in the spec but the live file is never actually fetched.

**Process** (only when the trigger fires):

1. Check `FIGMA_TOKEN` is set in the environment. If missing → log
   `[B2.5-figma] skipped reason=FIGMA_TOKEN-missing` and fall through to the screenshot-based Process
   below (Step 0 is a best-effort upgrade, never a hard blocker).
2. Run the existing `FigmaRestSource` integration (already built, previously unwired —
   `.claude/integrations/figma-rest-source.ts`):
   ```bash
   FIGMA_TOKEN=$FIGMA_TOKEN npx tsx .claude/integrations/figma-rest-source.ts "<figma-url-from-spec>"
   ```
   This resolves the file key + node id from the URL (`parseRef`), fetches `GET /v1/files/:key/nodes`,
   and normalizes fills/text styles into a `DesignModel` (`screens[].tokens.colors`,
   `screens[].tokens.textStyles`). Treat every color/font value returned here as **ground truth** —
   it overrides both the spec prose AND any prior screenshot-based estimate.
3. Map the resolved tokens into the same LOCKED `visual-properties.md` schema (below). If the Figma
   node exposes more than 5 semantically distinct colors (e.g. a gradient's two stops, a status-pill
   fill, a badge fill that are each genuinely different tokens — not the same 5 slots), prefer
   **fidelity over the exactly-5 count**: list the real distinct tokens with descriptive names (e.g.
   `primary` / `secondary` for gradient stops, plus extra named tokens like `section-badge`,
   `pill-not-started`) rather than collapsing distinct real colors into one of the 5 slots to satisfy
   the count. Note each token's exact source (e.g. "hero gradient top stop") as an inline comment.
4. If the spec prose quotes an exact hex/px value that CONTRADICTS the live Figma value → the Figma
   value wins. Log the contradiction: `[B2.5-figma] prose-vs-figma-mismatch field=<name>
   prose=<value> figma=<value>` → `recovery.log`. Do not silently pick one — the log entry is what
   lets a future run (or a human) notice the spec text itself needs updating.
5. Log: `[timestamp] [B2.5-figma] source=figma-rest tokens=N mismatches=M` → `recovery.log`.

### Step 0.5 — Figma-sourced icon identity (REQUIRED whenever Step 0 runs and the design has icons) *(v3.20 — Change V.4)*

**Trigger**: Step 0 ran (a `figma.com/design/` or `figma.com/file/` URL was resolved) AND the target
screen contains icon-shaped UI (nav/meta-bar icons, button icons, list-item type icons, tool-panel
icons — i.e. anything the implementer would otherwise pick from the UI library's icon set by eye).

**Why this exists**: a live worked example (US-LE-019 `CourseOverview`, 2026-07-10) shipped with
**5 wrong icons** even though Step 0 (colors/typography) had already run correctly on the same
feature (Change V.1) — icon identity was never extracted from Figma at all, so the implementer
picked icons by guessing from generic spec prose (`ti-player-play`, `ti-file-text`, `ti-puzzle` — a
different icon-library naming convention that does not correspond 1:1 to the target UI library) and
from a low-resolution flattened screenshot. Confirmed mismatches once the live Figma node was
actually queried:
  - Quiz unit-type icon: spec said "puzzle piece" → real Figma layer is a **pencil/edit** glyph.
  - "Launch Tour" sidebar icon: spec said "lightbulb" (`ti-bulb`) → real Figma layer is a **compass**.
  - Course-level meta icon: implementation guessed "signal bars" → real Figma layer is a **bar chart**.
  - Collapse-all button: implementation used a single chevron → real Figma layer is a **double
    chevron** (visually distinct from the per-section single-chevron toggle, which WAS correct).
  - "Start Course" button: real Figma button has a **play-arrow icon** the implementation omitted
    entirely (a separate node from the banner's decorative rocket icon, which was already correct).
  This is not one bad guess — it is a **structural gap**: `FigmaRestSource.toScreenModel()`
  (`.claude/integrations/figma-rest-source.ts`) hard-codes `assets: []` (its own header calls image
  export "a later concern"), so Step 0's node-tree walk gives colors/text/fonts but NOTHING about
  icon identity. And even the metadata that IS fetched only names an icon reliably when it sits on a
  named component **INSTANCE** (e.g. `vuesax/linear/play`, `UI icon/arrow_backward/filled`) — raw
  vector art dropped directly into a frame (not componentized) comes back as `rawName: "Icon"` /
  `"Vector"` / `"Union"` with **zero semantic identity in the metadata**. In the worked example, 38 of
  60 icon-shaped nodes in one screen had no usable name — exactly the ones that were guessed wrong.

**Process** (only when the trigger fires):

1. From the Step 0 node-tree walk, collect every `VECTOR` / `BOOLEAN_OPERATION` / icon-shaped
   `INSTANCE` used by the target screen, and for each record whether it has a **named ancestor
   INSTANCE** (walk up `children` until you cross a node whose `type === 'INSTANCE'` and whose
   resolved component name is not a generic placeholder like "Icon"/"Container"/"Frame N").
2. For nodes WITH a named ancestor instance (e.g. `vuesax/linear/play`, `UI icon/notification/light`)
   → that name IS the icon identity. Map it to the closest same-meaning icon in the target UI
   library (do not substitute a same-vibe-but-different-meaning icon — "play" must map to a play
   icon, not a generic "start" icon that happens to render differently).
3. For nodes WITHOUT a named ancestor (generic `"Icon"`/`"Vector"`/`"Union"`) → metadata alone cannot
   resolve identity. Export them visually:
   ```bash
   curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
     "https://api.figma.com/v1/images/<fileKey>?ids=<id1>,<id2>,...&format=png&scale=4"
   ```
   then `Read()` the returned PNG(s) (a small labeled montage of several nodes at once is efficient)
   and visually match each shape to the closest same-meaning icon in the target UI library. This is
   the Images-API endpoint `figma-rest-source.ts` does not yet implement — call it directly with curl
   for this step; do not block Step 0.5 on that gap being closed in the shared module first.
4. **Never** assign an icon purely from the spec prose's own icon-name text (e.g. `ti-*` Tabler-style
   names) when a Figma source is available — prose icon names are frequently from a different icon
   library than the one actually used in the design file and are not a reliable cross-reference (same
   "prose lies" failure class as Change V.1's stale-hex finding, now confirmed for icon names too).
5. Log: `[timestamp] [B2.5-figma] icons_resolved=N via_named_instance=A via_image_export=B
   unresolved=C` → `recovery.log`. `unresolved` (no ancestor name AND image export inconclusive) is
   not a hard blocker — fall back to best-effort selection but flag it explicitly in `recovery.log`
   rather than silently guessing.

**If Step 0 did not run (no Figma URL, or `FIGMA_TOKEN` unavailable)**: icon selection falls back to
best-effort from the screenshot/spec prose as before — this step has no fallback path of its own
because it depends entirely on Step 0 already having resolved a Figma source.

**Verified by**: the `example-learning-app` worked example — re-fetched the same Figma node
(`QwSquTxduuodo0r4tIqiNq`, node `6713-66557`) via `figma-rest-source.ts`'s `fetchNodes`, found 60
icon-shaped nodes (22 with a named ancestor instance, 38 without), image-exported the 38 unnamed
ones via `GET /v1/images`, visually matched all of them, and corrected the 5 confirmed mismatches
above in `src/pages/course-dashboard/{CourseHeader,CourseUnitRow,CourseTools,CourseDashboard,
StartResumeBanner}.tsx` (all icons already existed in the target UI library's icon set — this was
purely a wrong-selection bug, never a missing-icon problem). `npx tsc --noEmit` clean + existing
13/13 `courseMeta.test.ts` unit tests still green after the icon swaps (icon identity does not
affect business logic). Documented in that feature's `recovery.log`. **NOT yet run through the kit's
own `test:integration` / `version:check` suite from this session** — same situation as Change V.1:
this change lives only in the source-of-truth kit until the next `npm run sync`. `PROMPT_VERSION`
left at v3.19 in the flagship command file — same deferral as Change V.1/V.2: this, V.1, and V.2
(and the in-flight D-cross-2 Change U.1) should be folded into one v3.20 release bump together
rather than each incrementing separately.

**If Step 0 did not run or FIGMA_TOKEN is unavailable**, continue with the screenshot-based Process
below unchanged — it remains the fallback path, not replaced.

### Process (fallback — screenshot-based visual estimation, used when Step 0 doesn't apply)

For each UI_SCREENSHOT entry in `image-annotations.md`:

1. Use `Read(<imagePath>)` to view the image (Claude sees pixels directly via image input)
2. Extract:
   - **Palette**: exactly 5 dominant colors (round to 5 — duplicate primary if image has fewer; pick most-used if more)
   - **Typography**: H1, H2, Body, Caption, Label (5 roles minimum) with `<size>/<weight>/<line-height>`
   - **Spacing**: dominant gap/padding values sorted ascending (look for 4px/8px grid)
   - **Component bounds**: approximate width×height of major components

3. Write `docs/specs/<FeatureName>/visual-properties.md` using this LOCKED schema:

```markdown
# Visual Properties — <FeatureName>

## Palette
- primary: #xxxxxx
- secondary: #xxxxxx
- accent: #xxxxxx
- surface: #xxxxxx
- text: #xxxxxx

## Typography
- H1: <size>/<weight>/<line-height>
- H2: <size>/<weight>/<line-height>
- Body: <size>/<weight>/<line-height>
- Caption: <size>/<weight>/<line-height>
- Label: <size>/<weight>/<line-height>

## Spacing scale
- Base unit: 4px
- 4px / 8px / 16px / 24px / 32px (sorted ascending)

## Component bounds (approximate)
- Header: 1440×64
- Card: 400×200
- ...
```

### Determinism rules (Change J.3 parity lock)

- **Screenshot-estimated palette** (Step 0 did not run): ALWAYS exactly 5 colors. ALWAYS lowercase
  6-char hex. NO 3-char shorthand, NO alpha.
- **Figma-sourced palette** (Step 0 ran): list every real distinct color token found (may be > 5) with
  a descriptive name + source comment — see Step 0.3. Fidelity to the live source overrides the
  exactly-5 count for this path only.
- Spacing: ALWAYS `px`, ALWAYS sorted ascending.
- Typography: ALWAYS include the 5 named roles. When Figma-sourced, use the exact `fontSize`/
  `fontWeight`/`lineHeightPx` from the node's `style` — do not round to a "nice" number.
- NO additional H2 sections beyond the 4 listed. NO creative formatting.

These rules ensure deterministic, run-to-run identical visual-properties.md given the same image input
(screenshot path) or the same Figma node (Figma-sourced path).

Log: `[timestamp] [B2.5-tokens] source=figma|screenshot palette=N spacing=N typography=5` → `recovery.log`.
