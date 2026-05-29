# Loom Handbook PDF Best Practices

This playbook is intentionally detailed so another agent can reproduce the accepted `织灵产品使用手册.pdf` without rediscovering the same mistakes.

The authoritative spec is `current-template-spec.md`. If this playbook and the spec conflict, follow the spec.

## Goal

Generate a polished A4 PDF from:

```text
https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D
```

The output must:

- use online handbook content and order,
- use company template visual rules,
- use the official company logo asset only,
- embed only the accepted Source Han Sans / Apple emoji fonts,
- preserve Chinese punctuation,
- include a single-column clickable TOC with page numbers,
- preserve images, tables, links, and code blocks,
- reduce blank space by allowing short source pages to flow,
- pass automated verification and visual inspection,
- stay under 50 MB unless the user changes the limit.

## What Went Wrong Before

Avoid these known failures:

- Reading Feishu/wiki tree order produced `产品介绍 -> 名词解释`, which was wrong.
- Treating each website page as a forced PDF page created many blank areas.
- Reusing Docusaurus visual CSS made the PDF look like a webpage screenshot, not a formal document.
- Remote lazy-loaded images produced blank image areas.
- A two-column TOC looked informal and made page numbers harder to read.
- Footer post-processing once broke clickable TOC destinations.
- Missing fonts caused WPS/macOS fallback fonts such as `STKaiti`, `STHeiti`, `DengXian-Light`, or `Helvetica`.
- Broad text normalization changed Chinese punctuation into ASCII punctuation.
- A screenshot/logo approximation violated the official logo rule.

## Correct Pipeline

Run `scripts/generate_handbook_pdf.mjs`.

It should perform this pipeline:

1. Check `assets/company-logo.png`.
2. Check all three font files.
3. Build or read the cached online source.
4. Crawl order from Docusaurus next-page pagination, not Feishu tree order.
5. Download all remote images locally.
6. Convert source HTML to clean semantic body HTML.
7. Remove source classes, inline styles, `data-*`, nav, header, footer, sidebars, Docusaurus wrappers, and theme layout.
8. Build template-styled HTML with cover, TOC, body, header/footer placeholders, and named destinations.
9. Render a preflight PDF.
10. Extract exact page numbers for `/doc-N` destinations.
11. Rebuild TOC with page numbers.
12. Render draft PDF.
13. Slice first N pages only if `--sample-pages` is provided.
14. Apply the accepted header/footer overlay without destroying links/destinations.
15. Normalize PDF font names to the accepted allowlist.
16. Write a generation report.
17. Verify the PDF.

## Source Order

Use the online handbook as the source of truth. Follow:

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

If the order starts with `产品介绍 -> 名词解释`, stop and fix the crawler/source. Do not manually reorder random pages.

## Semantic Cleaning

The final render should use only semantic elements:

```text
h1 h2 h3 h4
p
ul ol li
table thead tbody tr th td
img
pre code
a
```

Remove:

- `class`,
- `style`,
- `data-*`,
- Docusaurus `theme-doc-*`,
- Docusaurus sidebar/sidebar collapse state,
- website header/nav/footer,
- page breadcrumbs,
- website next/previous cards,
- website TOC,
- website theme CSS,
- empty wrappers.

Preserve:

- text,
- heading levels,
- list structure,
- table content,
- image sources after localization,
- code text,
- links.

Do not clean by flattening everything into plain text. That destroys lists, headings, links, tables, and code blocks.

## Font Rules

The accepted font implementation is strict:

```text
SourceHanSansCN-Regular
SourceHanSansCN-Bold
AppleColorEmoji
```

The final PDF font table must contain only these names.

Implementation guidance:

- Use bundled `assets/fonts/*.ttf` through `@font-face`.
- Body text uses `SourceHanSansCN-Regular`.
- Headings and bold text use `SourceHanSansCN-Bold`.
- Emoji/special symbols use `AppleColorEmoji`.
- Run `normalize_pdf_font_names.py` after PDF generation.
- Verify with `verify_handbook_pdf.py`.

Do not rely on system fonts. The user's machine may have WPS or Office fonts, but another agent's machine may not.

Disallowed final PDF fonts:

```text
STKaiti
STHeiti
DengXian-Light
Helvetica
Times
Arial
PingFang
Songti
Kaiti
SimSun
```

If any disallowed font appears, do not ship.

## Punctuation Rules

Preserve source Chinese punctuation exactly.

Correct:

```text
织灵，Coda Loom，是一款……
```

Wrong:

```text
织灵,Coda Loom,是一款……
```

Never use broad `NFKC` over whole paragraphs. It can convert Chinese punctuation into half-width ASCII punctuation.

Allowed targeted normalization:

- replace `\u00a0` with a normal space,
- remove emoji variation selector `\uFE0F` only if it breaks rendering,
- normalize CJK radical/compatibility glyph ranges only:
  - `\u2E80-\u2EFF`
  - `\u2F00-\u2FDF`
  - `\uF900-\uFAFF`

Do not normalize:

- `，。；：、（）《》“”‘’`
- mixed Chinese/English phrases,
- source wording.

Regression check page 4 or equivalent:

```text
must contain: 织灵，Coda Loom，是
must not contain: 织灵,Coda Loom,是
must contain: 少量人工负责指导和审核，主要工作由ADE来完成
```

## Image Rules

Before PDF rendering:

- turn relative URLs into absolute URLs,
- download remote images locally,
- replace `src` with `file://` URLs,
- remove `loading`, `decoding`, `srcset`, `sizes`,
- wait for all images to load in Playwright,
- fail on zero natural width/height,
- preserve aspect ratio,
- keep current accepted image sizing.

Do not ship a PDF with blank screenshot areas.

The full current PDF should have many image XObjects, currently around 180+. A very low image count means the image pipeline broke.

## TOC Rules

TOC must be:

- single-column,
- vertical,
- formal,
- dotted leader lines,
- page numbers on the right,
- clickable.

Do not use a two-column TOC.

Never guess page numbers. Use two-pass rendering:

1. Render preflight PDF.
2. Read named destination page numbers.
3. Rebuild TOC.
4. Render final PDF.

After header/footer overlay, verify links and destinations still exist.

## Pagination Rules

The website has many short pages. PDF should not treat every web page as a hard page break.

Use this approach:

- Cover is page 1.
- TOC begins page 2.
- Body flows naturally.
- Top-level sections may start on a new page.
- Subpages flow unless a forced break is needed for readability.
- Avoid breaking screenshots, tables, and code blocks.
- Do not leave large blank pages just because a source web page ended.

## Header/Footer Rules

Cover:

- uses first-page template header/footer only,
- no normal overlay.

TOC/body:

- header left: `织灵产品使用手册`,
- header right: `assets/company-logo.png`,
- header line: current accepted position/weight,
- footer left: `版本：v1.0.0`,
- footer center: `Coda Intellect Tech Co., Ltd Confidential`,
- footer right: plain page number only.

Never write:

```text
第 2 页
第 2 页 / 共 84 页
2 / 84
```

## Logo Rules

The official company logo is an asset, not a visual reference.

Only use:

```text
assets/company-logo.png
```

Forbidden:

- OCR,
- redraw,
- trace,
- rebuilding with text and shapes,
- AI generation,
- screenshot replacement,
- changing proportions,
- fallback text logo,
- fallback generated logo.

If the asset cannot be read, stop and explain.

## Sample First

For visual review, generate:

```bash
node scripts/generate_handbook_pdf.mjs \
  --sample-pages 10 \
  --filename "织灵产品使用手册-模板版前10页样稿.pdf"
```

Check:

- cover,
- TOC page numbers,
- TOC click behavior,
- font table,
- page 4 text/punctuation,
- header/footer,
- image sizing,
- blank-space reduction.

Only after approval, generate the full PDF.

## Full Generation

Generate:

```bash
node scripts/generate_handbook_pdf.mjs \
  --filename "织灵产品使用手册.pdf"
```

Use `--refresh` when the user wants the latest online content. Cached source is acceptable for layout-only iteration.

## Verification

Always run:

```bash
python scripts/verify_handbook_pdf.py \
  --pdf "/path/to/织灵产品使用手册.pdf" \
  --expected-docs 41 \
  --max-size-mb 50
```

Then visually inspect:

- page 1 cover,
- page 2 TOC,
- page 4 or first real body page,
- one image-heavy page,
- last page.

Do not rely on "the command succeeded." A visually broken PDF can still be a technically valid PDF.

## Current Healthy Signals

For the current online handbook, the accepted full output is expected to be close to:

```text
documents: 41
output pages: 84
file size: about 39 MB
doc destinations: 41
link annotations: 70+
image XObjects: 180+
fonts: SourceHanSansCN-Regular, SourceHanSansCN-Bold, AppleColorEmoji
```

These numbers may shift when the handbook changes. Use them as alarms, not constants.

## User-Facing Response

Do not dump logs. Tell the user:

- PDF path,
- full or sample,
- source URL,
- whether refresh was used,
- pages and size,
- fonts passed,
- TOC page numbers/clicks passed,
- images passed,
- any caveat.
