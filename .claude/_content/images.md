### Quy trình

1. Parse all image URLs and iframe embeds from the raw Confluence markdown in `docs/specs/<title>.md`
2. Create `docs/specs/<FeatureName>/images/` if it does not exist

### Step 3 — Classify content type (trước khi download)

Với mỗi image URL, xác định `CONTENT_TYPE` dựa trên **3 tín hiệu** (ưu tiên theo thứ tự):

| Tín hiệu | Condition | `CONTENT_TYPE` |
| -------- | --------- | -------------- |
| URL pattern | URL chứa `diagram`, `flow`, `chart` | `DIAGRAM_FLOW` |
| URL pattern | URL chứa `screenshot`, `screen`, `ui-` | `UI_SCREENSHOT` |
| Heading context | Heading gần nhất chứa **EN** "Flow", "Diagram", "Process" / **VI** "Luồng", "Quy trình", "Sơ đồ" / **JP** "フロー", "図", "プロセス" | `DIAGRAM_FLOW` |
| Heading context | Heading gần nhất chứa **EN** "Screen", "UI", "Interface", "Page" / **VI** "Màn hình", "Giao diện", "Trang" / **JP** "画面", "ページ" | `UI_SCREENSHOT` |
| Heading context | Heading gần nhất chứa **EN** "Button", "Action", "CTA" / **VI** "Nút", "Hành động" / **JP** "ボタン" | `BUTTON_DESCRIPTION` |
| Không khớp | — | `UNKNOWN` |

> **(v3.8 — Change L.3 i18n classification)** Heading regex must match patterns case-insensitively across EN/VI/JP. Use Unicode-aware regex (e.g. `\p{L}` boundaries). Both editions emit the same `CONTENT_TYPE` assignments — locked.

Log classification: `[timestamp] [B2-classify] url=<url> type=<CONTENT_TYPE>`

> **Lưu ý**: `DIAGRAM_FLOW` có độ ưu tiên cao nhất vì ảnh này cần thiết cho B5 (generate diagram.md).

### Step 4 — Deduplication

Trước khi download mỗi URL: kiểm tra xem URL đã tồn tại trong `downloaded_urls` set (trong session này) chưa.

- URL đã có → skip, log `[B2-dedup] skipped duplicate: <url>`
- URL mới → thêm vào set, tiến hành download

### Step 5 — Batch download (song song theo URL strategy)

**Pre-check (run before any HTTP download):** Check if `docs/specs/<FeatureName>/images/` already contains files. If it does, those images were saved by the MCP server during B0 (Confluence auth already applied). Skip HTTP download for those — proceed directly to Step 7 (annotate) for pre-fetched images.

Log: `[timestamp] [B2-prefetch] found N MCP-saved images in docs/specs/<FeatureName>/images/ — skipping download`

Phân loại URL theo **download strategy**, rồi download tất cả song song:

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

Log mỗi attempt vào `docs/specs/<FeatureName>/recovery.log`.

### Step 6 — Xử lý kết quả sau khi tất cả ảnh đã được xử lý

Sau khi **tất cả** ảnh đã được xử lý (thành công hoặc fail), kiểm tra `failed_images` list.

**Nếu KHÔNG có ảnh nào fail** → tiếp tục bình thường.

**Nếu CÓ ít nhất một ảnh fail cả 3 attempt** → **STOP GATE**:

```text
⚠️  IMAGES REQUIRED FOR CORRECT UI IMPLEMENTATION

Các ảnh sau đã thử 3 lần nhưng thất bại:

| Loại             | Tên file         | Lý do         |
| ---------------- | ---------------- | ------------- |
| UI_SCREENSHOT    | screen1.png      | 403 Forbidden |
| DIAGRAM_FLOW     | flow.png         | Timeout       |

⚠️  Ảnh UI_SCREENSHOT cần thiết để B10 implement UI đúng layout, button labels
    và column order. Không có ảnh này, UI sẽ được implement từ text spec — có thể
    sai so với thiết kế thực tế.

Vui lòng cung cấp các ảnh này:
  [1] Copy file vào docs/specs/<FeatureName>/images/ rồi gõ "done"
  [2] Paste đường dẫn đến file gốc
  [3] Gõ "skip" — tôi chấp nhận UI có thể không match spec chính xác
```

**STOP — KHÔNG tiếp tục cho đến khi nhận được phản hồi của user.**

- User gõ `"done"` → verify các file tồn tại trong `images/`, tiếp tục
- User gõ `"skip"` → đánh dấu tất cả failed ảnh là `⚠️ [IMAGE MISSING]` inline trong processed.md và tiếp tục
- User cung cấp path → copy/rename file vào `images/`, verify, tiếp tục

Nếu user đã cung cấp ảnh (done/path), **không** append Error Report. Nếu user chọn skip, append Error Report:

```markdown
---
## ⚠️ Image Error Report (user skipped)
| File | Type | Strategy | Attempts | Final Reason |
| ---- | ---- | -------- | -------- | ------------ |
| image1.png | UI_SCREENSHOT | Confluence | 3/3 | 403 Forbidden |
| flow.png | DIAGRAM_FLOW | Generic | 3/3 | Timeout |
```

**NEVER skip failed images silently — luôn hỏi user trước.**

### Step 7 — Annotate successfully downloaded images

Sau khi Step 6 hoàn thành, đọc từng ảnh đã download thành công bằng Read tool và tạo `docs/specs/<FeatureName>/image-annotations.md`.

Với mỗi file trong `docs/specs/<FeatureName>/images/` (bỏ qua failed images):

1. Đọc file ảnh: `Read({ file_path: "docs/specs/<FeatureName>/images/<filename>" })`
2. Append một section vào image-annotations.md:

```markdown
### <filename>
**Type:** <CONTENT_TYPE>
**Path:** docs/specs/<FeatureName>/images/<filename>

- [3–8 bullets mô tả: layout regions, visible components, button labels, field labels,
  states shown, column order, màu sắc đặc trưng]
  - UI_SCREENSHOT: tập trung vào những gì developer cần để match visual
  - DIAGRAM_FLOW: numbered sequence + decision nodes theo thứ tự
  - BUTTON_DESCRIPTION: exact label text + trạng thái enabled/disabled
```

Log: `[timestamp] [B2-annotate] images_annotated=N` → `recovery.log`

**Resume**: nếu `image-annotations.md` đã tồn tại (resume session), chỉ annotate các ảnh chưa có entry.
**Zero images downloaded**: skip Step 7 silently.

---

## B2.5 — Extract Design Tokens *(v3.6 — REQUIRED if ≥ 1 UI_SCREENSHOT)*

**Purpose**: extract authoritative design tokens (colors, typography, spacing) from spec images to prevent B10 from inventing CSS values, and to enable B11 CSS audit.

**Skip silently** if `image-annotations.md` has 0 UI_SCREENSHOT entries.

### Quy trình

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
