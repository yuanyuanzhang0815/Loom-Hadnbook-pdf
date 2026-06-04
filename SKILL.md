---
name: loom-handbook-pdf
description: Generate the editable 织灵产品使用手册 DOCX from the online Loom handbook. Use the company Word template only for cover/header/footer/page-number structure, keep the confirmed handbook body typography, build a clickable Word TOC with dynamic page references, preserve screenshots/tables/links/code blocks, remove emoji text, and verify the DOCX before delivery.
---

# Loom Handbook DOCX

Use this skill when the user asks to generate, update, preview, troubleshoot, or package the `织灵产品使用手册` document.

The current accepted deliverable is an editable Word file:

```text
dist/织灵产品使用手册.docx
```

PDF export is no longer the default path. The user prefers DOCX because WPS/Word can update fields and make final manual edits.

## Source And Template Boundary

Source content:

```text
https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D
```

The online handbook is authoritative only for:

- 正文文字；
- 标题文本；
- 标题层级；
- 图片；
- 表格；
- 代码块；
- 链接；
- 章节顺序。

The company Word template is authoritative only for:

- 封面；
- 页眉；
- 页脚；
- 公司 logo；
- 页眉横线；
- 页脚版本号；
- Confidential 文案；
- 动态页码字段位置。

Do not let the Word template override the accepted handbook body typography. Do not let Docusaurus CSS override the Word output.

## Non-Negotiable Rules

1. Generate DOCX first. Do not directly generate the final PDF unless the user explicitly asks.
2. Template file must exist at `assets/company-template.docx` or be supplied with `--template`.
3. Official logo asset is `assets/company-logo.png`. Do not redraw, OCR, trace, rebuild, screenshot, generate, or substitute the logo.
4. Header document name must be `织灵产品手册`, not `文档名称` or `产品文档名称`.
5. Cover title must be `织灵产品使用手册`.
6. Footer page number must be a Word `PAGE` field, not static text.
7. Do not set `<w:pgNumType w:start="1"/>` on body sections. Page numbering must remain continuous.
8. TOC entries must be real visible Word paragraphs plus clickable bookmarks and dynamic `PAGEREF` fields.
9. TOC fields and PAGE/PAGEREF fields must request update on open via `w:updateFields`.
10. Body typography must use the confirmed SourceHanSansCN style system, not template body defaults.
11. Source emoji in text must be removed. Product screenshots are images and must not be altered.
12. Keycap emoji residue such as `U+20E3 COMBINING ENCLOSING KEYCAP` must be removed.
13. Chinese punctuation must be preserved. Do not convert `，。：“”（）` to ASCII punctuation.
14. Markdown residue such as `**`, backticks, and fenced markers must not appear in the DOCX.
15. Compatibility Unicode residue such as `⽤`, `⼯`, `⼈`, `⼊`, `⻓` must be normalized.
16. Web highlighter/blockquote content must be preserved as editable Word content, not screenshots.

## Bundled Files

- `assets/company-template.docx`: current company Word template used for cover/header/footer structure.
- `assets/company-logo.png`: official logo asset.
- `scripts/generate_handbook_docx.py`: default generator for the accepted DOCX path.
- `scripts/verify_handbook_docx.py`: structural verifier for DOCX fields, TOC, styles, emoji cleanup, headers, footers, and media.
- `scripts/generate_raw_handbook_pdf.mjs`: legacy crawler/cache builder for the online Docusaurus handbook. It can refresh `work-online/online-handbook.html` and `work-online/online-order.json`.
- `references/current-template-spec.md`: exact current output rules.
- `references/best-practices.md`: detailed reproduction playbook.
- `references/troubleshooting.md`: known issues and fixes.
- `references/acceptance.md`: final checklist.

## Quick Commands

In Codex Desktop, load workspace dependencies first. Use the bundled Python if available.

Generate the full accepted DOCX:

```bash
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" \
scripts/generate_handbook_docx.py \
  --filename "织灵产品使用手册.docx"
```

Generate a fast review sample:

```bash
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" \
scripts/generate_handbook_docx.py \
  --sample-docs 8 \
  --filename "织灵产品使用手册-前8篇样稿.docx"
```

Verify the full DOCX:

```bash
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" \
scripts/verify_handbook_docx.py \
  --docx "dist/织灵产品使用手册.docx" \
  --expected-docs 41 \
  --min-images 90 \
  --max-size-mb 50
```

If cached online source is missing, refresh it:

```bash
NODE_PATH="/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" \
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" \
scripts/generate_handbook_docx.py \
  --refresh \
  --filename "织灵产品使用手册.docx"
```

## Required Workflow

1. Confirm whether the user wants a sample or the full DOCX.
2. Check `assets/company-template.docx`.
3. Check `assets/company-logo.png`.
4. Generate with `scripts/generate_handbook_docx.py`.
5. Run `scripts/verify_handbook_docx.py`.
6. Open in WPS/Word if visual verification is needed.
7. Update fields in WPS/Word so PAGE/PAGEREF values and TOC page numbers materialize.
8. Return the DOCX path and concise verification status.

## Current Accepted Output Shape

For the current handbook cache, full generation should produce:

```text
documents: 41
output: dist/织灵产品使用手册.docx
file size: under 50 MB
TOC entries: 41
PAGEREF fields: 41
TOC bookmarks: 41
media files: about 100
emoji/text suspicious chars: 0
```

Numbers can change when the online handbook changes. Treat them as sanity checks.

## Final Response Pattern

Keep the final response short:

- Link the DOCX.
- State sample/full.
- State whether verification passed.
- Mention key checks: TOC, dynamic PAGE/PAGEREF fields, header name, emoji cleanup, media count.
- If field values are not updated because WPS/Word was not run, say so plainly.
