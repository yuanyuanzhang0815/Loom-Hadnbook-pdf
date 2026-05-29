# Loom Handbook PDF Acceptance Checklist

Use this checklist before saying the PDF is done.

## Required Checks

| Check | Expected |
| --- | --- |
| Source URL | `https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D` |
| Source role | Content only, not visual style |
| Template role | Cover, margins, header/footer, TOC style, typography, pagination |
| Source order | Online next-page order |
| First body order | `产品介绍 -> 首页 -> 新用户登录 -> 工作空间 -> 会话&工作区` |
| Semantic cleanup | No source classes/styles/data/theme/nav/sidebar in final render |
| Cover | Company template first page; title `织灵产品使用手册`; `编号` and `密级` blank |
| Logo | Only `assets/company-logo.png`; equal-ratio scaling; no redraw/OCR/generated substitute |
| Fonts | Only `SourceHanSansCN-Regular`, `SourceHanSansCN-Bold`, `AppleColorEmoji` |
| Forbidden fonts | No `STKaiti`, `STHeiti`, `DengXian-Light`, `Helvetica`, or other fallbacks |
| Chinese punctuation | Preserved; no Chinese comma/period/colon/bracket conversion to ASCII |
| Key page-4 phrase | `少量人工负责指导和审核，主要工作由ADE来完成` is present |
| TOC | Single-column, clickable, dotted leaders, page numbers |
| Body | A4, template margins, reduced blank space, readable |
| Images | Localized and visible; no blank screenshot areas |
| Header | Current accepted layout, right official logo, horizontal line intact |
| Header logo size | Cover and body header logo visually match; body header does not use the old oversized `91.5pt` logo |
| Footer | Left version, center company English, right plain page number only |
| File size | Under 50 MB unless user changes the limit |
| Final output | Actual PDF path returned |

## Script Verification

Run:

```bash
python scripts/verify_handbook_pdf.py \
  --pdf "/path/to/织灵产品使用手册.pdf" \
  --expected-docs 41 \
  --max-size-mb 50
```

The verifier must return:

```json
{
  "ok": true
}
```

Current healthy full-output signals:

```text
pages: about 84
sizeMb: under 50
links: 70+
docDestinations: 41
imageXObjects: 180+
tocHasPageNumbers: true
fonts: AppleColorEmoji, SourceHanSansCN-Bold, SourceHanSansCN-Regular
headerLogo: page 1 and body page visible logo bbox both about 60-61pt wide
```

## Manual Visual Verification

Open or screenshot:

1. Page 1 cover.
2. Page 2 TOC.
3. Page 4 body text.
4. One image-heavy page.
5. Last page.

Look for:

- company-template cover,
- official logo is clear and proportionally scaled,
- TOC is one vertical list with page numbers,
- TOC entries jump,
- screenshots display,
- Chinese punctuation is full-width where the source uses full-width punctuation,
- header line/logo position did not shift,
- body header logo is the same apparent size as the cover header logo,
- footer has center company English and plain right page number,
- no large accidental blank areas.

## Manual TOC Click Test

Automated checks confirm annotations and named destinations, but manual click testing is still valuable.

Click:

- `首页`,
- `飞书场景交互`,
- `MCP`,
- `常见问题Q&A`.

The viewer should jump to the corresponding pages.

## Final User-Facing Summary

Include:

- PDF path,
- source URL,
- full or sample,
- page count and size,
- font allowlist status,
- TOC jump/page-number status,
- image status,
- footer status,
- any unresolved caveat.

Avoid:

- long command logs,
- low-level implementation detail unless asked,
- claiming a logo/image was recreated,
- claiming "latest" if `--refresh` was not used.
