---
name: loom-handbook-pdf
description: Generate the confirmed Coda Loom / 织灵 product handbook PDF from the online handbook. Use this when asked to export, rebuild, preview, verify, or troubleshoot 织灵产品使用手册 PDF with the company template cover, official logo asset, Source Han Sans font allowlist, single-column clickable TOC with page numbers, localized screenshots, and locked header/footer.
---

# Loom Handbook PDF

Use this skill to generate the current accepted `织灵产品使用手册.pdf`.

The online handbook is only the content source:

```text
https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D
```

The company template is the visual source. Do not copy Docusaurus layout, fonts, colors, spacing, cards, navigation, theme CSS, inline styles, or pagination into the final PDF.

## Locked Acceptance Rules

These rules are locked by user review. Do not change them during future fixes unless the user explicitly asks.

1. Source content and chapter order follow the online Docusaurus next-page chain.
2. Generate from clean semantic content only: `h1`-`h4`, `p`, `ul`, `ol`, `li`, `table`, `img`, `pre`, `code`, `a`.
3. Strip source classes, styles, `data-*`, Docusaurus wrappers, page chrome, nav, theme CSS, and website pagination style.
4. Use the company template for cover, margins, header, footer, TOC style, body typography, and PDF pagination.
5. The PDF font table must contain only:
   - `SourceHanSansCN-Regular`
   - `SourceHanSansCN-Bold`
   - `AppleColorEmoji`
6. The PDF font table must not contain `STKaiti`, `STHeiti`, `DengXian-Light`, `Helvetica`, or other body fonts.
7. Preserve original Chinese punctuation. Do not convert `，。；：、（）《》` into ASCII half-width punctuation.
8. Preserve mixed Chinese/English content. Do not add or remove spaces around English tokens unless the source already has them.
9. The official logo source is only `assets/company-logo.png`. Do not OCR, redraw, trace, rebuild with text/shapes, generate, substitute, or change its ratio.
10. If `assets/company-logo.png` or the bundled font files are missing, stop and explain. Do not improvise.
11. The TOC must be single-column, vertical, clickable, and include right-aligned page numbers.
12. Do not force every source web page to start a new PDF page. Let short pages flow to reduce blank space; only top-level sections may start on a new page.
13. Header, logo position, header line, cover, footer, image sizes, and font logic are locked to the current accepted version.
14. Header logo calibration is exact: cover and body header logo use `width: 63pt`, `top: 32pt`, with the header line at `top: 55pt`. The visible logo bbox should be about `60x16-18pt` on page 1 and about `61x17pt` on body pages.

Before changing implementation, read:

- `references/current-template-spec.md`
- `references/best-practices.md`
- `references/troubleshooting.md`
- `references/acceptance.md`

## Bundled Files

- `assets/company-logo.png`: required official company logo asset.
- `assets/fonts/SourceHanSansCN-Regular.ttf`: required regular CJK font.
- `assets/fonts/SourceHanSansCN-Bold.ttf`: required bold CJK font.
- `assets/fonts/AppleColorEmoji.ttf`: required emoji font.
- `scripts/generate_handbook_pdf.mjs`: final generator. Produces full PDF by default and supports first-N-page samples.
- `scripts/generate_raw_handbook_pdf.mjs`: source crawler/cache builder. It is not the deliverable generator.
- `scripts/normalize_pdf_font_names.py`: normalizes embedded PDF font names to the accepted allowlist names.
- `scripts/verify_handbook_pdf.py`: verifies page count, size, links, destinations, images, fonts, TOC numbers, and key text/punctuation signals.
- `references/current-template-spec.md`: exact current visual and behavioral spec.
- `references/best-practices.md`: detailed end-to-end playbook for future agents.
- `references/troubleshooting.md`: known failure modes and fixes.
- `references/acceptance.md`: final checklist.

## Commands

In Codex Desktop, load workspace dependencies first if the bundled Node/Python paths are unknown.

Generate a fast first-10-page sample:

```bash
NODE_PATH="/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" \
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" \
scripts/generate_handbook_pdf.mjs \
  --sample-pages 10 \
  --filename "织灵产品使用手册-模板版前10页样稿.pdf"
```

Generate the full PDF from cached source:

```bash
NODE_PATH="/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" \
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" \
scripts/generate_handbook_pdf.mjs \
  --filename "织灵产品使用手册.pdf"
```

Force a fresh crawl before generation:

```bash
NODE_PATH="/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" \
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" \
scripts/generate_handbook_pdf.mjs \
  --refresh \
  --filename "织灵产品使用手册.pdf"
```

Verify a generated PDF:

```bash
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" \
scripts/verify_handbook_pdf.py \
  --pdf "/path/to/织灵产品使用手册.pdf" \
  --expected-docs 41 \
  --max-size-mb 50
```

## Standard Workflow

1. Decide whether this is a first-10-page sample or full PDF.
2. Check `assets/company-logo.png` and all three font files exist.
3. If the user asks for latest content, run with `--refresh`. If only layout is being checked, cached source is acceptable.
4. Generate with `scripts/generate_handbook_pdf.mjs`.
5. Verify with `scripts/verify_handbook_pdf.py`.
6. Visually inspect page 1 cover, page 2 TOC, page 4 body, one image-heavy section, and the last page.
7. Return the PDF path plus high-signal checks only.

## Expected Current Signals

For the current online handbook, a healthy full run is expected to be close to:

```text
documents: 41
output pages: 84
file size: under 50 MB
TOC doc destinations: 41
image XObjects: high, currently around 180+
fonts: SourceHanSansCN-Regular, SourceHanSansCN-Bold, AppleColorEmoji only
header logo: cover and body headers visually match; normal body header must not use the older 91.5pt oversized logo
```

These numbers can change when the online handbook changes. Treat them as sanity checks, not fixed constants.

## Final Response Pattern

Keep the user-facing response concise:

- PDF path.
- Whether it is sample or full.
- Source URL and whether `--refresh` was used.
- Page count, file size, TOC jump/page-number status, image status, font allowlist status, logo asset status.
- Any unresolved caveat.
