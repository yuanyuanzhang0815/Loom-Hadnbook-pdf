# Current Template PDF Spec

This is the current confirmed output target for `织灵产品使用手册.pdf`.

## Source

Default source URL:

```text
https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D
```

Use online published order by following the Docusaurus next-page pagination link. Do not use Feishu node order for chapter sequence.

## Required Asset Rule

The only allowed company logo source for cover/page headers is:

```text
assets/company-logo.png
```

Strictly prohibited:

- redrawing the Logo,
- OCRing the Logo,
- rebuilding it with text or shapes,
- generating a new Logo,
- changing the Logo ratio,
- substituting any fallback Logo,
- silently using old template PNGs such as `header147.png`.

Only equal-ratio scaling is allowed. If `assets/company-logo.png` is missing or unreadable, the script must fail and the agent must explain the problem.

`assets/company-logo.png` may be produced once from the official company SVG as a format conversion. After that, the generator must reference the PNG directly.

## Cover

The cover is based on the company template first page, `Section0`, not on a visual screenshot approximation.

Cover rules:

- A4 page, no body header/footer overlay.
- Margins match the template page section:
  - top: `72pt`
  - bottom: `72pt`
  - left: `90pt`
  - right: `90pt`
- First header:
  - right-aligned company logo from `assets/company-logo.png`
  - size is scaled proportionally to the template header footprint
- Cover body:
  - first paragraph: `编号：` plus blank underline
  - second paragraph: `密级：` plus blank underline
  - two blank spacer paragraphs
  - centered title `织灵产品使用手册`
- Title:
  - `黑体`
  - bold
  - `42pt`
- First footer:
  - centered `内部资料  禁止公开`
  - centered `Coda Intellect Tech Co., Ltd Confidential`
  - font follows template footer style, visually subtle

Do not add decorative corners, dots, generated blue shapes, metadata cards, product/company/date rows, or the old marketing-style cover unless the user explicitly changes the target.

## TOC

The TOC must be formal and business-like:

- single-column vertical layout,
- no two-column layout,
- dotted leaders,
- page number on the right,
- clickable links to PDF destinations,
- one or more TOC pages are allowed if the document grows.

Use template-like TOC fonts:

- heading: `黑体`, `22pt`
- TOC entries: `等线 Light` / `等线`, around `10pt`
- deeper levels: indented, smaller or italic only where useful

Never guess page numbers. The generator must:

1. Render a preflight PDF.
2. Extract `/doc-N` destination pages.
3. Rebuild HTML with exact page numbers.
4. Render the final PDF.

## Body Layout

The body follows the company document template rather than the website screen layout.

Page setup:

- A4.
- Margins: top/bottom `72pt`, left/right `90pt`.
- Body font: `华文楷体`, `10.5pt`, line-height about `1.5`.
- H1: `黑体`, `22pt`.
- H2: `黑体`, `16pt`.
- H3: `黑体`, about `15pt`.
- H4: `黑体`, `14pt`.

Pagination:

- Do not force every online handbook page to become a new PDF page.
- Short sections should flow continuously.
- Top-level sections may start on a new page.
- Images, tables, and code blocks should avoid page breaks when possible.

Image handling:

- Strip lazy attributes before rendering.
- Localize remote image `src` values to file URLs.
- Wait for all images to render.
- Fail if any image is broken.

## Header And Footer

Cover page uses first header/footer only and should not receive the normal overlay.

TOC/body pages:

- Header:
  - left: `织灵产品使用手册`
  - right: official company logo from `assets/company-logo.png`
  - bottom border line
- Footer:
  - left: `版本：v1.0.0`
  - center: `Coda Intellect Tech Co., Ltd Confidential`
  - right: plain page number only, such as `2`

Wrong footer examples:

- `第 2 页 / 共 10 页`
- page number in the center
- company English on the right
- missing spaces in `Coda Intellect Tech Co., Ltd Confidential`

## Review Samples

For layout review, generate only the first 10 pages:

```bash
node scripts/generate_handbook_pdf.mjs --sample-pages 10 --filename "织灵产品使用手册-模板版前10页样稿.pdf"
```

Use samples to iterate quickly on:

- cover,
- TOC,
- header/footer,
- fonts,
- body density,
- image sizing.

After approval, generate full PDF without `--sample-pages`.

## Hard Failure Conditions

Stop instead of shipping when:

- `assets/company-logo.png` is missing or unreadable,
- online crawl returns zero documents,
- any image fails to download or render,
- TOC page-number extraction returns too few destinations,
- generated PDF has no link annotations,
- footer/header post-processing destroys named destinations,
- file size exceeds the agreed maximum,
- output is blank, visibly broken, or based on the wrong page order.
