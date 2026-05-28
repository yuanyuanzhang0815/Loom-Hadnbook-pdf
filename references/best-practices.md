# Loom Handbook PDF Best Practices

This reference is the detailed playbook for reproducing a high-quality Coda Loom / 织灵 online handbook PDF. It captures the lessons learned from the full iteration: wrong source, wrong order, broken formatting, missing images, blurry cover, lost TOC jumps, and missing TOC page numbers.

## Table of Contents

- Objective
- Source Strategy
- Output Contract
- Recommended Pipeline
- Implementation Details
- Cover Best Practice
- TOC Best Practice
- Image Best Practice
- Footer Best Practice
- Verification Best Practice
- What Not To Do
- Example Delivery Summary

## Objective

Produce a polished, printable A4 PDF named like `织灵产品使用手册.pdf` from the current online handbook.

The PDF should:

- Use `https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D` as default source.
- Preserve the online handbook's information, page order, typography direction, images, tables, code blocks, and links as much as possible.
- Start with a clear cover page.
- Include a clickable TOC with page numbers.
- Include footers on TOC and content pages, not on the cover.
- Keep file size under 50 MB unless the user explicitly relaxes the requirement.
- Never output a known-bad PDF just because the command completed.

## Source Strategy

### Use Online Handbook As Source Of Truth

The authoritative source is the published handbook under `loom.aicoda.tech`, not the Feishu node tree.

Reason:

- The online handbook reflects the actual user-facing order and formatting.
- Feishu/wiki node-list order can differ from the published sidebar/page order.
- In the failed attempt, `名词解释` appeared before `首页` because the source order came from Feishu structure rather than the online published order.

### Follow Next-Page Pagination

For Docusaurus-style docs, the most reliable order source is the bottom "next page" pagination link:

```html
pagination-nav__link pagination-nav__link--next
```

The script starts at 产品介绍 and follows `next` until no next page remains. This produces the desired order:

```text
产品介绍
首页
新用户登录
工作空间
会话&工作区
...
名词解释
使用案例
如何在织灵Loom中实现一个MVP开发流程
常见问题Q&A
```

Do not scrape only the sidebar unless you also prove it matches the next-page chain.

## Output Contract

The current good run has these approximate characteristics:

```text
documents: 41
pages: 104
size: about 35 MB
links: 112 annotations
doc destinations: 41
image objects: about 100
```

These numbers may change as the handbook changes. Treat them as sanity ranges, not immutable constants.

## Recommended Pipeline

Use the bundled script `scripts/generate_handbook_pdf.mjs`.

Internally it does this:

1. Crawl pages by following next-page pagination from the start URL.
2. Extract each article from `theme-doc-markdown markdown`.
3. Absolutize `src` and `href` values.
4. Strip lazy image attributes such as `loading=lazy`, `decoding=async`, `srcset`, and `sizes`.
5. Download remote images into a local assets directory.
6. Build a combined HTML document with:
   - generated cover,
   - TOC,
   - all handbook pages,
   - stable print CSS.
7. Pre-render a draft PDF without TOC page numbers.
8. Read PDF named destinations `/doc-0`, `/doc-1`, etc. from the draft to calculate exact page numbers.
9. Rebuild HTML with TOC page numbers.
10. Render final draft PDF.
11. Detect section page ranges for footer labels.
12. Add footer overlays while preserving internal PDF destinations.
13. Write a JSON report.

## Implementation Details

### Article Extraction

Use the page's article body, not the whole app shell:

```js
/<div class="theme-doc-markdown markdown">([\s\S]*?)<\/div><\/article>/
```

This keeps the main content and avoids copying the live website navigation chrome into every PDF page.

### Link And Image Absolutization

Every relative `href` and `src` should be turned into an absolute URL using the source page URL as base. Also normalize:

```text
https://handbook.loom.aicoda.tech -> https://loom.aicoda.tech
```

### Print Layout

Use A4:

```css
@page { size: A4; margin: 15mm 18mm 17mm; }
```

Use a special cover page:

```css
@page coverPage { size: A4; margin: 0; }
.cover { page: coverPage; width: 210mm; height: 297mm; }
```

Make doc sections page-break cleanly:

```css
.doc-page { break-before: page; page-break-before: always; }
.toc + .doc-page { break-before: auto; page-break-before: auto; }
```

The second rule prevents an accidental blank page between TOC and the first article.

## Cover Best Practice

### Prefer Generated Cover, Not Full-Page Bitmap

A user may provide a beautiful cover image. Do not automatically use it as a full-page image.

Why:

- If the file is lower than true print resolution, it becomes blurry.
- Even if the preview looks nice, PDF text is no longer selectable or vector-sharp.
- In the iteration, a file thought to be "4K A4" was actually `1055 x 1491`; direct placement looked worse than a generated cover.

Prefer a generated cover using:

- online logo asset,
- real text,
- CSS gradients/circles/lines,
- a styled metadata card.

This gives sharper text and a smaller, more reliable PDF.

### If User Insists On A Bitmap Cover

Check dimensions first:

```bash
sips -g pixelWidth -g pixelHeight cover.png
```

For A4 at 300 DPI, expect approximately:

```text
2480 x 3508 px
```

If the file is `1055 x 1491` or similar, tell the user it is not true 4K/print-resolution and may blur.

### Cover Content Standard

The default cover should contain:

```text
织灵产品使用手册
Coda Loom Product Manual
产品名称：织灵 Loom
所属公司：可达智灵
最近更新时间：YYYY.MM.DD
```

Do not add a footer to the cover.

## TOC Best Practice

### Clickable Links

Each TOC item links to its document section ID:

```html
<a href="#doc-13">飞书场景交互</a>
```

Chrome preserves these as PDF link annotations and named destinations.

### Page Numbers

Do not guess TOC page numbers from text extraction. Text detection can miss image-heavy or one-page sections.

Correct method:

1. Render preflight PDF.
2. Use `pypdf` to read named destinations.
3. Extract pages for `/doc-0`, `/doc-1`, ..., `/doc-N`.
4. Re-render the HTML with those page numbers in the TOC.

The helper script `extract_pdf_dest_pages.py` implements this.

### Preserve Destinations After Footer Overlay

If adding footers after PDF render, do not build a fresh writer page-by-page with `PdfWriter()` and `add_page`. That loses named destinations.

Correct:

```python
reader = PdfReader(input_pdf)
writer = PdfWriter(clone_from=reader)
for page in writer.pages:
    page.merge_page(footer_overlay)
```

This was the fix for "TOC is blue but no longer jumps."

## Image Best Practice

### The Problem

The online handbook uses lazy-loaded images:

```html
<img loading="lazy" decoding="async" ...>
```

If Chrome prints before later images load, the PDF contains blank image spaces.

### The Fix

Before rendering:

1. Strip lazy-loading attributes.
2. Download every remote image into a local `assets` directory.
3. Replace `src` with `file://...`.
4. Before `page.pdf`, wait for every `document.images` item to complete and have nonzero `naturalWidth` and `naturalHeight`.
5. Fail if any image is broken.

Good signals:

- `images.missing` is empty in the generation report.
- PDF file size grows from tiny to realistic. In the iteration, the broken image PDF was about 1.7 MB; the fixed one became about 29-35 MB.
- Verifier reports many image objects, around 100 for current content.

## Footer Best Practice

Footer content:

```text
left: current top-level section
center: 第 N 页 / 共 M 页
right: 可达智灵 · Coda Loom
```

Apply footer to page 2 onward. Skip page 1 cover.

Use section ranges to label pages:

- `目录` for page 2.
- `产品介绍` for the first article.
- `功能介绍` for all nested feature pages.
- `使用案例` for use-case pages.
- `常见问题Q&A` for FAQ.

If one child page is not detected but it belongs to the same top-level section as its neighbors, the footer can still be acceptable. Prefer exact detection, but do not block solely because a child title is missed if top-level labels remain correct.

## Verification Best Practice

Run:

```bash
python scripts/verify_handbook_pdf.py --pdf output/织灵产品使用手册.pdf --expected-docs 41 --max-size-mb 50
```

Required checks:

- PDF page count > 0.
- Size <= 50 MB.
- Internal doc destinations equal document count.
- Link annotation count is nontrivial.
- Image object count is high enough.
- TOC page numbers are visible on page 2.
- Cover -> TOC -> 产品介绍 -> 首页 -> 新用户登录 order is preserved.

Visual checks:

- Cover is crisp and aesthetically close to the desired design.
- TOC has page numbers and leaders.
- Clicking TOC entries jumps to target sections in a PDF viewer.
- Screenshots in content pages are visible.
- Footer is present but not intrusive.

## What Not To Do

Do not:

- Use Feishu CLI node order as the final source order.
- Convert rich pages through lossy Markdown if the HTML source already exists.
- Let lazy-loaded remote images print directly.
- Add footers with a fresh `PdfWriter()` that loses named destinations.
- Use a full-page cover image just because the user says it is 4K; inspect dimensions first.
- Trust that "blue TOC text" means clickable PDF destinations still work.
- Ship without opening at least cover, TOC, and one image-heavy page.

## Example Delivery Summary

Use this shape for final answers:

```text
已生成新版 PDF：
[织灵产品使用手册.pdf](/absolute/path/织灵产品使用手册.pdf)

检查结果：
- 104 页
- 35.06 MB
- 目录 41 个章节均带页码
- PDF 内部章节跳转目标 41 个，目录点击跳转保留
- 图片对象 100 个，未发现缺图
- 页脚已加，封面无页脚
```

Keep the final concise. The user wants the artifact and confidence, not a full debug log.
