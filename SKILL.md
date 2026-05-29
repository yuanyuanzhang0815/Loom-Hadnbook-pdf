---
name: loom-handbook-pdf
description: Generate the Coda Loom / 织灵 product handbook PDF from the loom.aicoda.tech online handbook using the confirmed company document template: template Section0 cover, official company logo asset only, single-column clickable TOC with page numbers, localized images, template fonts, and template header/footer. Use when asked to export, rebuild, update, preview, or troubleshoot the 织灵产品使用手册 PDF.
---

# Loom Handbook PDF

Use this skill to generate the current confirmed version of `织灵产品使用手册.pdf`.

The source of handbook content is the published online handbook, not the Feishu tree:

```text
https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D
```

The visual target is the company Word/HTML document template, especially the template first page (`Section0`) and header/footer rules.

## Non-Negotiable Rules

1. Source order must follow the online Docusaurus `next` pagination chain.
2. Remote handbook images must be downloaded and rendered from local files before PDF export.
3. The table of contents must be single-column, vertical, clickable, and show page numbers.
4. Do not force every online doc page to start on a new PDF page. Let short sections flow to reduce blank space; only top-level sections may start on a new page.
5. The cover must use the company template first-page structure: `Section0` margins, blank `编号`, blank `密级`, two blank spacer paragraphs, title `织灵产品使用手册`, first header, and first footer.
6. Logo handling is strict: only use `assets/company-logo.png`. Do not OCR, redraw, trace, rebuild with text/shapes, generate, or substitute another logo. If `assets/company-logo.png` is missing or unreadable, stop and explain.
7. Header/footer on TOC and body pages must use the template layout: left `版本：v1.0.0`, center `Coda Intellect Tech Co., Ltd Confidential`, right plain page number only.
8. If post-processing breaks PDF links or named destinations, do not ship the PDF.

Read `references/current-template-spec.md` before changing visual output. Read `references/troubleshooting.md` when anything looks wrong.

## Bundled Files

- `assets/company-logo.png`: required official company logo asset used in cover and page headers.
- `scripts/generate_handbook_pdf.mjs`: current confirmed generator. Produces full PDF by default; supports first-N-page samples.
- `scripts/generate_raw_handbook_pdf.mjs`: raw crawler/cache builder for the online handbook.
- `scripts/add_template_headers_footers.py`: overlays template header/footer while preserving PDF links.
- `scripts/verify_handbook_pdf.py`: verifier for links, images, destinations, TOC numbers, page count, and file size.
- `references/current-template-spec.md`: exact current visual and behavioral spec.
- `references/best-practices.md`: detailed end-to-end playbook.
- `references/troubleshooting.md`: known problems and fixes.
- `references/acceptance.md`: final acceptance checklist.

## Quick Commands

In Codex Desktop, first load workspace dependencies so you can use bundled Node/Python paths.

Generate the full current PDF:

```bash
NODE_PATH="/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" \
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" \
scripts/generate_handbook_pdf.mjs \
  --filename "织灵产品使用手册.pdf"
```

Generate a fast first-10-page review sample:

```bash
NODE_PATH="/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" \
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" \
scripts/generate_handbook_pdf.mjs \
  --sample-pages 10 \
  --filename "织灵产品使用手册-模板版前10页样稿.pdf"
```

Force a fresh crawl of the online handbook:

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

## Workflow

1. Confirm whether the user wants a fast sample or the full PDF.
2. Ensure `assets/company-logo.png` exists. If not, stop. Do not generate a replacement.
3. If the user wants latest content, run with `--refresh`; otherwise cached source is acceptable for layout iteration.
4. Generate the PDF with `scripts/generate_handbook_pdf.mjs`.
5. Verify it with `scripts/verify_handbook_pdf.py`.
6. Visually inspect page 1 cover, page 2 TOC, one text page, and one image-heavy page.
7. Return only the PDF path plus high-signal checks.

## Expected Current Shape

For the current online handbook, normal full generation should be approximately:

```text
documents: 41
full pages: about 85 with the current template flow layout
sample pages: exactly the requested --sample-pages value
TOC destinations/page numbers: 41
file size: under 50 MB
```

These numbers can change when the online handbook changes. Treat them as sanity checks, not constants.

## Final Response Pattern

Keep the user-facing response concise:

- Link the generated PDF.
- Mention whether it was sample or full.
- Mention source URL and whether `--refresh` was used.
- Mention page count, file size, TOC link/page-number status, image status, and Logo asset status.
- Clearly state any unresolved caveat.
