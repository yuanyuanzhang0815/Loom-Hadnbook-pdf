# Loom Handbook PDF Acceptance Checklist

Use this checklist before telling the user the PDF is done.

## Required Checks

| Check | Expected |
| --- | --- |
| Source URL | Defaults to `https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D` |
| Source order | Follows online next-page order |
| Cover | Clear generated cover by default; no footer on cover |
| TOC | Clickable and includes page numbers |
| Body | A4, readable, no obvious blank image areas |
| Images | Remote images localized; no missing images in report |
| Footer | Present on TOC/content pages; skipped on cover |
| File size | Under 50 MB unless user says otherwise |
| First order | Cover -> TOC -> 产品介绍 -> 首页 -> 新用户登录 |
| Final output | Link the actual PDF path |

## Script Verification

Run:

```bash
python scripts/verify_handbook_pdf.py --pdf "/path/to/织灵产品使用手册.pdf" --expected-docs 41 --max-size-mb 50
```

The verifier should return:

```json
{
  "ok": true
}
```

For the current handbook, strong signals are:

```text
pages: about 104
sizeMb: under 50
links: around 112
docDestinations: 41
imageXObjects: around 100
tocHasPageNumbers: true
```

## Visual Verification

Open or screenshot:

1. Page 1 cover.
2. Page 2 TOC.
3. Page 4 or another image-heavy content page.
4. Last page.

Look for:

- cover text/logo are crisp,
- TOC shows titles, dotted leaders, page numbers,
- clicking TOC entries jumps,
- screenshots display,
- footer is visually subtle,
- footer does not overlap content.

## Manual TOC Click Test

Automated checks can confirm named destinations and link annotations, but a manual viewer click is still valuable.

Open the PDF in Chrome/Preview and click:

- `首页`,
- `飞书场景交互`,
- `MCP`,
- `常见问题Q&A`.

The viewer should jump to the corresponding pages. If not, re-check named destinations and footer post-processing.

## Final User-Facing Summary

Include:

- PDF link.
- Source URL.
- Page count and size.
- TOC jump/page-number status.
- Image status.
- Footer status.

Avoid:

- long command logs,
- irrelevant implementation details,
- claiming "4K" unless the actual image dimensions prove it.
