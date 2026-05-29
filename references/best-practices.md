# Loom Handbook PDF Best Practices

This playbook explains how to reproduce the current accepted `织灵产品使用手册.pdf`.

The authoritative visual spec is `current-template-spec.md`. If there is any conflict, follow that file.

## Objective

Generate a polished A4 PDF from the published Coda Loom online handbook:

```text
https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D
```

The final PDF should:

- use the online handbook content and order,
- use the company template first page as the cover,
- use only the official company logo asset,
- include a single-column clickable TOC with page numbers,
- preserve images, tables, links, and code blocks,
- reduce blank space by letting short sections flow,
- use template header/footer,
- stay below 50 MB unless the user changes the limit.

## Source Order

Use the online handbook as source of truth. Do not use Feishu wiki tree order for chapter sequence.

Follow the Docusaurus next-page pagination link:

```html
pagination-nav__link pagination-nav__link--next
```

Expected opening order:

```text
产品介绍
首页
新用户登录
工作空间
会话&工作区
```

If `名词解释` appears immediately after `产品介绍`, the order source is wrong.

## Pipeline

Use `scripts/generate_handbook_pdf.mjs`.

It does the following:

1. Checks that `assets/company-logo.png` exists.
2. Uses cached online handbook HTML when present.
3. If cache is missing or `--refresh` is passed, calls `generate_raw_handbook_pdf.mjs` to crawl the online handbook and localize images.
4. Reads cached sections from `work-online/online-handbook.html` and order from `work-online/online-order.json`.
5. Builds template-styled HTML with the confirmed cover, TOC, and body layout.
6. Renders a preflight PDF.
7. Extracts exact page numbers from `/doc-N` PDF destinations.
8. Rebuilds the HTML with TOC page numbers.
9. Renders the draft PDF.
10. Optionally slices the first N pages when `--sample-pages` is provided.
11. Adds template headers/footers while preserving destinations and links.
12. Writes a JSON generation report.

## Sample First

For layout iteration, use:

```bash
node scripts/generate_handbook_pdf.mjs \
  --sample-pages 10 \
  --filename "织灵产品使用手册-模板版前10页样稿.pdf"
```

Use this to check:

- cover,
- TOC,
- fonts,
- header/footer,
- body density,
- image placement.

After approval, generate the full PDF without `--sample-pages`.

## Cover Rules

The cover must follow the company template first page (`Section0`):

- A4.
- Top/bottom margin `72pt`.
- Left/right margin `90pt`.
- First header with right-aligned official company logo.
- First paragraph: `编号：` plus blank underline.
- Second paragraph: `密级：` plus blank underline.
- Two blank spacer paragraphs.
- Centered title `织灵产品使用手册`.
- Title style: `黑体`, bold, `42pt`.
- First footer:
  - `内部资料  禁止公开`
  - `Coda Intellect Tech Co., Ltd Confidential`

Do not add decorative corners, dots, product metadata cards, date pills, generated blue graphics, or old marketing-style cover elements.

## Logo Rules

Only use:

```text
assets/company-logo.png
```

Never:

- redraw the Logo,
- OCR the Logo,
- trace it,
- rebuild it with text or shapes,
- generate a substitute,
- use `header147.png` or screenshots as fallback,
- change the Logo ratio.

If `assets/company-logo.png` is missing or unreadable, stop and tell the user. Do not improvise.

## TOC Rules

The TOC must be:

- single-column,
- vertical,
- clickable,
- formal/business-like,
- dotted leader lines,
- right-aligned page numbers.

Do not use the old two-column TOC.

Never guess page numbers. Render a preflight PDF and extract destination page numbers.

## Body Rules

Use the template document feel, not the website screen layout:

- A4.
- Margins: top/bottom `72pt`, left/right `90pt`.
- Body font: `华文楷体`, `10.5pt`, line-height around `1.5`.
- H1: `黑体`, `22pt`.
- H2: `黑体`, `16pt`.
- H3: `黑体`, about `15pt`.
- H4: `黑体`, `14pt`.

Pagination:

- Do not force every online doc page to start a new PDF page.
- Let short sections flow to reduce blank space.
- Top-level sections may start on a new page.
- Avoid breaking screenshots, tables, and code blocks.

## Image Rules

Before PDF rendering:

- strip lazy loading attributes,
- turn relative URLs into absolute URLs,
- download images locally,
- replace `src` with file URLs,
- wait for every image to finish loading,
- fail if any image is broken or has zero natural size.

Do not ship a PDF with blank image placeholders.

## Header And Footer Rules

Cover page:

- uses first header/footer from the template cover structure,
- does not get normal page overlay.

TOC/body pages:

- header left: `织灵产品使用手册`
- header right: official company logo from `assets/company-logo.png`
- footer left: `版本：v1.0.0`
- footer center: `Coda Intellect Tech Co., Ltd Confidential`
- footer right: plain page number only

Do not output footer text like `第 2 页 / 共 10 页`.

## Verification

Run `verify_handbook_pdf.py` after full generation.

Also visually inspect:

- page 1 cover,
- page 2 TOC,
- one text-heavy page,
- one image-heavy page,
- last page.

Check that:

- cover title and fields match template first page,
- official Logo is present and proportionally scaled,
- TOC page numbers exist,
- TOC clicks jump,
- images render,
- footer positions are correct,
- file size is under limit.

## Expected Current Signals

For the current online handbook, a healthy full run is roughly:

```text
documents: 41
pages: about 85
toc page numbers: 41
file size: under 50 MB
image objects: high enough to confirm screenshots are embedded
```

These are sanity ranges. The online handbook can change.
