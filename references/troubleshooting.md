# Loom Handbook PDF Troubleshooting

Use this file when generation succeeds but the PDF is wrong, or when a command fails.

## Table of Contents

- Network and Access
- Wrong Page Order
- Missing Images or Blank Image Areas
- Cover Does Not Match Template
- Logo Rule Violations
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

## Cover Does Not Match Template

### Symptom

The cover looks like a marketing cover, has metadata cards, decorative blue shapes, corner marks, dots, or otherwise does not match the company template first page.

### Cause

The generator used an old custom cover or tried to approximate a screenshot instead of using the company template `Section0` first-page structure.

### Fix

Use the current `scripts/generate_handbook_pdf.mjs` cover implementation: A4 `Section0` margins, first header official logo, blank `编号`, blank `密级`, two blank spacer paragraphs, centered `织灵产品使用手册`, and the first footer confidentiality text. Do not tune the cover by eyeballing a screenshot unless the user explicitly changes the target.

## Logo Rule Violations

### Symptom

Logo appears fuzzy, redrawn, visually different, or comes from a generated PNG such as `header-hires.png`.

### Cause

The agent substituted, redrew, OCRed, traced, or generated the logo instead of using the official asset.

### Fix

Use only `assets/company-logo.png`. If the file is missing, stop generation and tell the user it is required. Do not use `header147.png`, CSS text, shapes, OCR, AI image generation, screenshots, or a hand-built replacement. Only equal-ratio scaling is allowed.

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

Footer says `第 2 页 / 共 10 页`, puts the page number in the center, or puts company English on the right.

### Fix

Use the template footer layout: left `版本：v1.0.0`, center `Coda Intellect Tech Co., Ltd Confidential`, right plain page number only, for example `2`.

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
