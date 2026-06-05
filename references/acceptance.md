# Loom Handbook DOCX Acceptance Checklist

Use this checklist before telling the user the DOCX is ready.

## Required Output

| Check | Expected |
| --- | --- |
| Output file | `dist/织灵产品使用手册.docx` |
| Source URL | `https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D` |
| Source order | Follows online order, not Feishu tree order |
| Template | Uses `assets/company-template.docx` |
| Cover title | `织灵产品使用手册` |
| Header/footer integrity | All header/footer XML and relationship parts are byte-identical to `assets/company-template.docx` |
| Logo | Uses official template asset exactly; no redraw, resizing, moving, or generated substitute |
| Footer | Preserved exactly from the current template, including dynamic `PAGE` fields |
| Page numbering | Continuous; no body section `w:start="1"` |
| TOC | Visible entries, hierarchical numbers, dotted leaders, bookmarks, dynamic `PAGEREF` fields |
| Body font | SourceHanSansCN-Regular 10.5 pt |
| Heading fonts | SourceHanSansCN-Bold 22/16/15/14 pt |
| TOC fonts | TOC 1-3 10 pt; TOC 4 9 pt; TOC 1 bold; TOC 3 italic |
| Chinese punctuation | Preserved as full-width punctuation |
| Emoji text | Removed from source text |
| Keycap residue | Removed, especially `U+20E3` |
| Markdown residue | No `**`, backticks, or fenced markers |
| Compatibility Unicode | Normalized; no `⽤`, `⼯`, `⼈`, `⼊`, `⻓` |
| Highlighter blocks | Editable one-cell Word tables with light fill and blue left border |
| Source tables | Real multi-column Word tables; current source columns are 4, 3, 3; full body width |
| Images | Embedded in `word/media`; not blank placeholders |
| Links | Preserved as hyperlinks where possible |

## Verification Command

Run:

```bash
python3 scripts/verify_handbook_docx.py \
  --docx "dist/织灵产品使用手册.docx" \
  --expected-docs 41 \
  --min-images 90 \
  --min-source-tables 3 \
  --max-size-mb 50
```

The report must include:

```json
{
  "ok": true
}
```

## Manual WPS/Word Check

Open the DOCX and check:

1. Cover page title.
2. Header line, left text, and logo match the current template exactly.
3. Footer matches the current template exactly and page number updates after field update.
4. TOC entries have dotted leaders and page numbers after field update.
5. TOC entries click to the correct sections.
6. Body font does not look like template fallback.
7. Highlighter blocks are boxed as one visual unit.
8. No garbled emoji residue appears in text.
9. Screenshots are visible.
10. Source tables use the page width instead of becoming a narrow single column.
11. Check around the large source tables; there must not be dozens of nearly empty continuation pages.

## Expected Current Signals

For the current handbook:

```text
documents: 41
tocEntries: 41
tocPageRefFields: 41
tocBookmarks: 41
mediaFiles: about 100
sourceTables: 3, preserving 4/3/3 columns
file size: under 50 MB
suspiciousTextChars: []
```

These numbers can change when the online handbook changes.

## Final User-Facing Summary

Include:

- DOCX path.
- Whether it was sample or full.
- Verification status.
- TOC/PAGE/PAGEREF status.
- Header/footer status.
- Emoji cleanup status.
- Any remaining manual step, such as WPS field update.

Do not include long command logs.
