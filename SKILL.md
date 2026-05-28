---
name: loom-handbook-pdf
description: Generate a polished PDF from the Coda Loom / 织灵 online product handbook at loom.aicoda.tech, preserving the published page order, images, clickable table of contents, TOC page numbers, cover page, footer, and acceptance checks. Use when asked to export, rebuild, update, or troubleshoot the 织灵产品使用手册 / Coda Loom Product Manual PDF or a similar Docusaurus-style online handbook PDF.
---

# Loom Handbook PDF

Use this skill to generate the 织灵 / Coda Loom product handbook PDF from the published online handbook, not from Feishu node-list order. The expected deliverable is a print-friendly A4 PDF with a clear cover, clickable TOC with page numbers, complete images, correct chapter order, and footers.

## Default Goal

Generate the latest handbook from:

```text
https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D
```

Default output name:

```text
织灵产品使用手册.pdf
```

Default cover metadata:

```text
产品名称：织灵 Loom
所属公司：可达智灵
最近更新时间：today unless the user gives a date
```

## Critical Rules

1. Use the online handbook as the source of truth unless the user explicitly asks for Feishu/Lark source extraction.
2. Preserve published order by following the Docusaurus next-page pagination chain. Do not trust Feishu wiki tree order or a sidebar scrape alone.
3. Download all remote images to local files before rendering. Do not rely on browser lazy-loading remote images during PDF export.
4. Compute TOC page numbers from PDF internal destinations, not from text guessing.
5. Preserve named destinations when adding footers. If using pypdf, clone the original reader in `PdfWriter(clone_from=reader)` before merging overlays.
6. Do not ship a PDF if validation fails. Fix the cause and regenerate.
7. Prefer the generated vector/CSS cover. Avoid full-page bitmap covers unless the user insists and the image is truly high resolution for A4 printing.

## Bundled Scripts

Run these scripts from the skill directory or pass absolute paths.

- `scripts/generate_handbook_pdf.mjs`: crawls the online handbook, downloads images, pre-renders for TOC page numbers, renders the final PDF, and adds footers.
- `scripts/verify_handbook_pdf.py`: checks page count, file size, image objects, link annotations, named destinations, and TOC page numbers.
- `scripts/add_pdf_footers.py`: footer overlay helper; keeps PDF internal links by cloning the reader.
- `scripts/detect_pdf_sections.py`: page range detection for footer section names.
- `scripts/extract_pdf_dest_pages.py`: extracts exact page numbers from `/doc-N` PDF destinations.

Read the detailed references when needed:

- `references/best-practices.md`: full end-to-end playbook and rationale.
- `references/troubleshooting.md`: known failure modes and fixes.
- `references/acceptance.md`: final verification checklist.

## Quick Workflow

1. Confirm the source URL and output filename. If the user gave no URL, use the default Loom handbook URL.
2. Load workspace dependencies if available. In Codex Desktop, call `load_workspace_dependencies` to get bundled Node/Python paths.
3. Run the generator with bundled Node and `NODE_PATH` pointing at bundled Node packages.
4. Run the verifier.
5. Visually inspect at least the cover, TOC, and one image-heavy content page.
6. Return the PDF path, key verification numbers, and previews if useful.

Example command in Codex Desktop:

```bash
NODE_PATH="/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" \
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" \
scripts/generate_handbook_pdf.mjs \
  --filename "织灵产品使用手册.pdf" \
  --last-updated "2026.05.28"
```

Custom source/output:

```bash
NODE_PATH="/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" \
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" \
scripts/generate_handbook_pdf.mjs \
  --start-url "https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D" \
  --output-dir "/path/to/output" \
  --filename "织灵产品使用手册.pdf" \
  --last-updated "2026.05.28"
```

Verification:

```bash
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" \
scripts/verify_handbook_pdf.py \
  --pdf "/path/to/output/织灵产品使用手册.pdf" \
  --expected-docs 41 \
  --max-size-mb 50
```

## Expected Output Signals

A good run should normally report:

- `documents`: 41 for the current Loom handbook.
- `pages`: about 104, depending on content changes.
- `sizeMb`: under 50.
- `images.missing`: empty.
- `toc.pageNumbers`: equal to the document count.
- verifier `docDestinations`: equal to the document count.
- verifier `imageXObjects`: high enough to show images are embedded, not blank placeholders.

## Visual QA

Always inspect:

1. Cover: title and card are crisp, not a stretched screenshot.
2. TOC: every line has a page number and still looks clickable.
3. First content order: cover -> TOC -> 产品介绍 -> 首页 -> 新用户登录.
4. Image-heavy page: screenshots are visible, not empty white blocks.
5. Footer: no footer on cover; TOC and content pages have section/page/company footer.

## If Something Looks Wrong

Use `references/troubleshooting.md`. The most common issues are:

- Images missing: lazy-loaded images were not localized before render.
- TOC blue but not clickable: footer or post-processing destroyed named destinations.
- Wrong chapter order: source order came from Feishu/wiki tree instead of online next-page navigation.
- Cover blurry: a low-resolution full-page image was used as cover.
- TOC lacks page numbers: page numbers were guessed from text instead of extracted from PDF destinations.

## Final Response Pattern

Keep the user-facing response short:

- Link the PDF.
- Mention source URL.
- Mention page count, file size, images, TOC links, and page-number checks.
- Mention any unresolved caveat clearly.
- Do not describe every internal script unless the user asks.
