# Current Template PDF Spec

This is the current accepted target for `织灵产品使用手册.pdf`.

## Priority Rules

The source webpage is content only. The company template is visual style.

Keep from the source webpage:

- body text,
- title text,
- title hierarchy,
- images,
- tables,
- code blocks,
- links,
- chapter order,
- previous/next document order.

Never keep from the source webpage:

- Docusaurus layout,
- Docusaurus header/footer/nav/sidebar,
- website fonts,
- website sizes,
- website colors,
- website spacing,
- website cards,
- website TOC,
- website CSS classes,
- website inline styles,
- theme CSS,
- website pagination behavior.

When source and template conflict, use source for content and template for visual style.

## Source

Default source URL:

```text
https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D
```

Use the online published order by following the Docusaurus next-page pagination link. Do not use Feishu node order for chapter sequence.

Expected start after cover and TOC:

```text
产品介绍
首页
新用户登录
工作空间
会话&工作区
```

If `名词解释` appears immediately after `产品介绍`, the order source is wrong.

## Required Assets

Only these local assets are allowed for final rendering:

```text
assets/company-logo.png
assets/fonts/SourceHanSansCN-Regular.ttf
assets/fonts/SourceHanSansCN-Bold.ttf
assets/fonts/AppleColorEmoji.ttf
```

Logo rules:

- Use only `assets/company-logo.png`.
- Only equal-ratio scaling is allowed.
- Do not redraw, OCR, trace, rebuild with text or shapes, generate, substitute, crop, stretch, or recolor.
- If the file is missing or unreadable, stop.

Font rules:

- Final PDF font table must contain only `SourceHanSansCN-Regular`, `SourceHanSansCN-Bold`, `AppleColorEmoji`.
- The generator should embed these fonts through `@font-face`.
- The normalizer may rename embedded subset font names to the accepted names.
- Never ship a PDF whose font table includes `STKaiti`, `STHeiti`, `DengXian-Light`, `Helvetica`, `Times`, `Arial`, or other fallback fonts.

## Cover

The cover is based on the first page of `可达智灵通用文档模板(2).docx`, not on a screenshot approximation.

Current accepted cover rules:

- A4 page.
- Uses company template first-page margins and positioning.
- Right-aligned official logo in the first header.
- `编号：` field is blank.
- `密级：` field is blank.
- Two blank spacer paragraphs before the title area.
- Center title: `织灵产品使用手册`.
- Cover footer:
  - `内部资料  禁止公开`
  - `Coda Intellect Tech Co., Ltd Confidential`
- Cover page does not receive the normal body header/footer overlay.

Do not add old marketing cover graphics, metadata cards, date pills, generated blue shapes, decorative corners, or dot patterns.

## TOC

The TOC must be formal and business-like:

- single-column vertical layout,
- no two-column layout,
- dotted leaders,
- right-aligned page number,
- clickable link for each entry,
- enough pages if the TOC grows.

Never guess page numbers. The generator must:

1. Render a preflight PDF.
2. Extract `/doc-N` destination page numbers.
3. Rebuild the HTML with exact page numbers.
4. Render the final PDF.

## Body Layout

The body follows the company document template feel, but the accepted font implementation is Source Han Sans.

Page setup:

- A4.
- Margins: top/bottom `72pt`, left/right `90pt`.
- Header/footer margins follow the current accepted template layout.
- Body font: `SourceHanSansCN-Regular`, `10.5pt`, line-height about `1.5`.
- Bold text and headings: `SourceHanSansCN-Bold`.
- Emoji/symbol fallback: `AppleColorEmoji`.
- H1: about `22pt`.
- H2: about `16pt`.
- H3: about `15pt`.
- H4: about `14pt`.

Do not use template font names directly if the local machine lacks them. The final accepted substitute is Source Han Sans, and the PDF font table must prove it.

Pagination:

- Do not force every online handbook page to become a new PDF page.
- Let short sections flow continuously to reduce blank space.
- Top-level sections may start on a new page.
- Avoid breaking screenshots, tables, and code blocks when practical.

Image handling:

- Strip lazy attributes before rendering.
- Localize remote image `src` values to file URLs.
- Preserve image aspect ratio and current accepted image sizing.
- Wait for all images to render.
- Fail if any image is broken or has zero natural dimensions.

## Header And Footer

Cover page:

- first-page header with official logo,
- first-page confidentiality footer,
- no normal page overlay.

TOC/body pages:

- Header left: `织灵产品使用手册`.
- Header right: official company logo from `assets/company-logo.png`.
- Header line: current accepted horizontal rule position and weight.
- Footer left: `版本：v1.0.0`.
- Footer center: `Coda Intellect Tech Co., Ltd Confidential`.
- Footer right: plain page number only, for example `2`.

Wrong footer examples:

- `第 2 页`
- `第 2 页 / 共 84 页`
- `2 / 84`
- company English on the right
- page number in the center

## Text And Punctuation

Preserve source text and punctuation. Do not run broad normalization over all text.

Allowed text normalization:

- non-breaking spaces to normal spaces,
- remove emoji variation selector `U+FE0F` if it breaks PDF rendering,
- normalize CJK compatibility/radical glyph ranges only when needed for font coverage.

Forbidden text normalization:

- converting `，` to `,`,
- converting `。` to `.`,
- converting `：` to `:`,
- converting `；` to `;`,
- converting `、` to `,`,
- converting `（ ）` to `( )`,
- adding/removing spaces in mixed Chinese/English phrases,
- rewriting source copy for readability.

Regression example:

```text
Correct: 织灵，Coda Loom，是一款……
Wrong:   织灵,Coda Loom,是一款……
```

## Review Samples

For layout review, generate only the first 10 pages:

```bash
node scripts/generate_handbook_pdf.mjs --sample-pages 10 --filename "织灵产品使用手册-模板版前10页样稿.pdf"
```

After approval, generate full PDF without `--sample-pages`.

## Hard Failure Conditions

Stop instead of shipping when:

- `assets/company-logo.png` is missing or unreadable,
- any required font file is missing,
- online crawl returns zero documents,
- source order is wrong,
- image download/render fails,
- TOC page-number extraction returns too few destinations,
- generated PDF has no link annotations,
- post-processing destroys named destinations,
- font table includes disallowed fonts,
- Chinese punctuation is converted to ASCII punctuation,
- file size exceeds the agreed maximum,
- output is blank or visibly broken.
