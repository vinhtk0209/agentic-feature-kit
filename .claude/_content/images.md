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

### Process

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

- ALWAYS exactly 5 colors. ALWAYS lowercase 6-char hex. NO 3-char shorthand, NO alpha.
- Spacing: ALWAYS `px`, ALWAYS sorted ascending.
- Typography: ALWAYS include the 5 named roles.
- NO additional H2 sections beyond the 4 listed. NO creative formatting.

These rules ensure deterministic, run-to-run identical visual-properties.md given the same image input.

Log: `[timestamp] [B2.5-tokens] palette=5 spacing=N typography=5` → `recovery.log`.
