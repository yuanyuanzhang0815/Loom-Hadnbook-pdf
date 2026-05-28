# Loom Handbook PDF Troubleshooting

Use this file when generation succeeds but the PDF is wrong, or when a command fails.

## Table of Contents

- Network and Access
- Wrong Page Order
- Missing Images or Blank Image Areas
- Blurry Cover
- TOC Does Not Jump
- TOC Missing Page Numbers
- Footer Problems
- File Too Large
- Text Extraction Looks Weird
- Commands and Environment

## Network and Access

### Symptom

```text
curl: (6) Could not resolve host: loom.aicoda.tech
```

### Cause

The sandbox blocks network access or DNS resolution.

### Fix

Rerun the generator with the required network permission in the host environment. In Codex, use escalation when the command fails because of network sandboxing.

Do not switch sources just because network failed. The online handbook remains the source of truth.

## Wrong Page Order

### Symptom

`产品介绍` is followed by `名词解释` or another unexpected page. The expected start is:

```text
封面
目录
产品介绍
首页
新用户登录
```

### Cause

The source order came from Feishu node-list or an unordered tree rather than the online handbook's published order.

### Fix

Follow the Docusaurus next-page pagination link:

```html
pagination-nav__link pagination-nav__link--next
```

Verify `work-online/online-order.json` or the generation report `order`.

## Missing Images Or Blank Image Areas

### Symptom

The PDF has text and blank areas where screenshots should appear. File size may be suspiciously small.

### Cause

Images remained remote and lazy-loaded. Chrome printed before the later images loaded.

### Fix

The generator should:

- strip `loading`, `decoding`, `srcset`, and `sizes`;
- download remote image `src` values to local files;
- replace image sources with `file://` URLs;
- wait for `document.images` before printing;
- fail if any image has zero natural dimensions.

Run the verifier. Expect many image objects:

```bash
python scripts/verify_handbook_pdf.py --pdf output/织灵产品使用手册.pdf
```

If image count is very low, do not ship.

## Blurry Cover

### Symptom

Cover title/logo/card look fuzzy, especially when zooming in.

### Cause

A full-page bitmap cover was stretched to A4, or the image was lower resolution than expected.

### Fix

Prefer generated cover:

```bash
node scripts/generate_handbook_pdf.mjs --filename "织灵产品使用手册.pdf"
```

Avoid `--cover-image` unless the user insists and the image is truly high-resolution.

Check bitmap cover dimensions:

```bash
sips -g pixelWidth -g pixelHeight cover.png
```

A4 at 300 DPI should be around:

```text
2480 x 3508 px
```

If the image is around `1055 x 1491`, explain that direct replacement will look worse than generated text.

## TOC Does Not Jump

### Symptom

TOC text is blue, but clicking it no longer jumps to sections.

### Cause

Post-processing, usually footer overlay, destroyed named destinations. This happens if the PDF is rewritten with:

```python
writer = PdfWriter()
writer.add_page(page)
```

### Fix

Preserve the original document root:

```python
reader = PdfReader(input_pdf)
writer = PdfWriter(clone_from=reader)
for page in writer.pages:
    page.merge_page(overlay)
```

Verify:

```bash
python scripts/verify_handbook_pdf.py --pdf output/织灵产品使用手册.pdf
```

Expected:

```text
docDestinations >= document count
namedDestinations nonzero
```

For current Loom handbook, expect `docDestinations: 41`.

## TOC Missing Page Numbers

### Symptom

TOC has titles only, no page numbers.

### Cause

The HTML TOC was generated before the final PDF pagination was known.

### Fix

Use a two-pass render:

1. Render a preflight PDF.
2. Extract `/doc-N` destination page numbers with `extract_pdf_dest_pages.py`.
3. Rebuild HTML with page numbers.
4. Render final PDF.

Do not guess page numbers from extracted text. Image-heavy section starts can be missed.

## Footer Problems

### Symptom

Footer appears on the cover.

### Fix

Skip page 1 when adding footers.

### Symptom

Footer section labels are too specific or inconsistent.

### Fix

Use top-level sections:

```text
目录
产品介绍
功能介绍
使用案例
常见问题Q&A
```

Child title detection can be imperfect. The footer goal is current top-level section, not every child page title.

### Symptom

Footer broke TOC jump.

### Fix

See "TOC Does Not Jump"; clone the reader before merging overlays.

## File Too Large

### Symptom

PDF exceeds 50 MB.

### Cause

Large screenshots are embedded at full resolution.

### Fix Options

1. Ask the user whether the 50 MB limit is hard.
2. Compress only if needed, and verify screenshots remain readable.
3. Prefer not to downsample below readable quality because screenshots are core handbook content.

The current expected size is roughly 29-35 MB, so exceeding 50 MB suggests new content or duplicate assets.

## Text Extraction Looks Weird

### Symptom

Extracted text shows glyph variants like:

```text
⾸⻚
⽤
⼯
```

### Cause

PDF font extraction normalizes Chinese compatibility glyphs imperfectly.

### Fix

This is usually not a visual problem. For detection scripts, normalize with `unicodedata.normalize("NFKC")` and translate known glyphs:

```text
⾸ -> 首
⻚ -> 页
⽤ -> 用
⼯ -> 工
```

Do not reject the PDF solely because extracted text has compatibility glyphs if the rendered PDF is visually correct.

## Commands and Environment

### Node Cannot Find Playwright or pdf-lib

Use bundled Node packages:

```bash
NODE_PATH="/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" \
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" \
scripts/generate_handbook_pdf.mjs
```

### Python Cannot Import pypdf or reportlab

Use bundled Python:

```bash
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" \
scripts/verify_handbook_pdf.py --pdf output/织灵产品使用手册.pdf
```

### Python Bytecode Cache Permission Error

If `py_compile` tries writing under a blocked user cache:

```bash
PYTHONPYCACHEPREFIX=/private/tmp/codex-pycache python3 -m py_compile scripts/*.py
```

This only matters while validating scripts, not while generating the PDF.
