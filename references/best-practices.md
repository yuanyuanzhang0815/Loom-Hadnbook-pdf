# Best Practices: Reproduce The Accepted Loom Handbook DOCX

This playbook describes the current best path for generating the accepted `织灵产品使用手册.docx`.

Read `current-template-spec.md` first. If this file and the spec conflict, follow `current-template-spec.md`.

## Goal

Generate an editable Word document from the online Loom handbook:

```text
dist/织灵产品使用手册.docx
```

The user will export PDF manually if needed. Do not optimize the default workflow around direct PDF generation.

## Mental Model

There are three separate authorities:

1. Online handbook: content and order.
2. Company Word template: cover/header/footer/page-number furniture only.
3. Confirmed handbook body style: body typography, TOC style, block conversion, image sizing.

Do not collapse these into one source. Most previous failures came from confusing these boundaries.

## Required Assets

The skill must include:

```text
assets/company-template.docx
assets/company-logo.png
```

Rules:

- `company-template.docx` is the template. It is not a visual suggestion.
- `company-logo.png` is the only logo asset.
- Do not redraw or regenerate the logo.
- If either file is missing, stop and report the missing file.

## Source Cache

The DOCX generator reads:

```text
work-online/online-handbook.html
work-online/online-order.json
work-online/assets/*
```

If these are missing, run with `--refresh`. Refresh uses the existing Docusaurus crawler script:

```bash
NODE_PATH="/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" \
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" \
scripts/generate_handbook_docx.py --refresh
```

In Codex Desktop, prefer bundled Node/Python runtime paths. If outside Codex, install compatible Python packages and Node dependencies before running refresh.

## Generation Commands

Full document:

```bash
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" \
scripts/generate_handbook_docx.py \
  --filename "织灵产品使用手册.docx"
```

Fast sample:

```bash
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" \
scripts/generate_handbook_docx.py \
  --sample-docs 8 \
  --filename "织灵产品使用手册-前8篇样稿.docx"
```

Custom template:

```bash
python3 scripts/generate_handbook_docx.py \
  --template "/path/to/可达智灵通用文档模板(2).docx" \
  --filename "织灵产品使用手册.docx"
```

## Verification Command

Run after full generation:

```bash
"/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" \
scripts/verify_handbook_docx.py \
  --docx "dist/织灵产品使用手册.docx" \
  --expected-docs 41 \
  --min-images 90 \
  --min-source-tables 3 \
  --max-size-mb 50
```

Expected result:

```json
{
  "ok": true
}
```

For samples, lower expectations:

```bash
python3 scripts/verify_handbook_docx.py \
  --docx "dist/织灵产品使用手册-前8篇样稿.docx" \
  --expected-docs 8 \
  --min-images 1
```

## Implementation Details That Must Stay

### Page Content

The script parses each cached section from:

```html
<section id="doc-N" data-title="...">
```

It removes:

- duplicated article header title;
- source URL lines;
- web navigation;
- Markdown residue;
- emoji text;
- keycap residue;
- compatibility Unicode.

It keeps:

- paragraphs;
- h1/h2/h3/h4;
- ul/ol/li;
- tables;
- images;
- pre/code;
- links.

### Source Tables

Do not trust a generic HTML parser to preserve source tables. The online HTML
uses valid HTML5 optional end tags such as:

```html
<tr><th>列 A<th>列 B<th>列 C
```

The generator's `BodyParser` must automatically close `th`, `td`, and `tr`.
Every source table must be written with:

- `tblCaption` value `LoomSourceTable`;
- `tblDescription` value `source-columns:N`;
- `tblW` equal to `8200` dxa;
- fixed `tblLayout`;
- a `tblGrid` column for every source column;
- every row preserving the expected column count.

The current source tables must verify as `4`, `3`, and `3` columns. If any
large table renders as a thin vertical strip at the left of the page, stop and
fix table parsing before delivering.

### Source Order

Use `online-order.json` to get depth and order. Do not sort alphabetically. Do not use Feishu tree order. Do not infer order from sidebar text.

The first items should be:

```text
产品介绍
首页
新用户登录
工作空间
会话&工作区
```

### Cover

Use the template body prefix from `company-template.docx`. Replace only the cover title placeholder:

```text
文档标题封面 -> 织灵产品使用手册
```

Do not rebuild the cover from HTML/CSS.

### Header

Copy every header part from `company-template.docx` without modification.
Do not replace text, move the horizontal line, move or resize the logo, rewrite
XML namespaces, or reserialize header XML.

### Footer

Copy every footer part from `company-template.docx` without modification. The
template already contains the required text and dynamic `PAGE` fields. Do not
normalize or rebuild footer XML.

All sections should use continuous page numbering. Remove `w:start="1"` from generated section page-number settings.

### TOC

The TOC has:

- visible styled entries;
- bookmark target for every document title;
- dynamic `PAGEREF` page number field;
- dotted leader tab;
- right-aligned page number;
- hierarchical numbering in text.

TOC levels:

```text
1. 一级标题
1.1. 二级标题
1.1.1. 三级标题
1.1.1.1. 四级标题
```

After opening in WPS/Word, update fields so `PAGEREF` values display real pages.

### Body Styles

Use explicit custom Word styles:

```text
LoomBody
LoomList
LoomDocTitle1-4
LoomHeading1-4
LoomTableHeader
LoomTableCell
LoomTocTitle
LoomToc1-4
引用块
代码块
行内代码
```

Do not rely on Word built-in Heading styles for visual correctness. The custom styles carry the accepted SourceHanSansCN sizing.

### Highlighter Blocks

For blockquote/highlighter-like content, use a one-cell table with:

- background `F3F7FF`;
- left border `2F7DFF`;
- editable text and lists;
- no screenshot conversion.

This reproduces the visual grouping from the online handbook without inheriting web CSS.

### Emoji Removal

Remove source text emoji entirely. Do not replace them with placeholder characters.

Clean:

- common emoji ranges;
- variation selectors;
- zero-width joiner;
- keycap sequences such as `1⃣` and `2⃣`;
- leftover `U+20E3`.

Screenshots are images and must not be edited.

## Manual Field Update

DOCX field values are dynamic. A generated file can contain correct fields while not yet showing final numeric values.

In WPS/Word:

1. Open the DOCX.
2. Select all.
3. Update fields.
4. Confirm TOC page numbers and footer page numbers.
5. Export PDF manually if needed.

Do not replace dynamic fields with static numbers just to make the preview look updated.

## Common Failure Modes

### All footer pages show 1

Cause:

- static text copied from template footer, or
- section page numbering reset with `w:start="1"`.

Fix:

- footer right side must use `PAGE`;
- remove `w:start` from section `pgNumType`;
- verify with `verify_handbook_docx.py`.

### TOC has titles but no page numbers

Cause:

- missing `PAGEREF` fields, or
- fields not updated in WPS/Word.

Fix:

- ensure each TOC entry has a bookmark target and `PAGEREF`;
- open in WPS/Word and update fields.

### TOC style is wrong

Cause:

- using Word built-in TOC styles or template defaults.

Fix:

- use `LoomToc1-4`;
- verify font size, bold, italic, indent, and dotted leader tabs.

### Header Or Footer Differs From The Current Template

Cause:

- an agent edited, reserialized, normalized, moved, or rebuilt header/footer XML.

Fix:

- restore `assets/company-template.docx`;
- regenerate without touching any header/footer part;
- require byte-identical header/footer verification.

### Body font looks like template font

Cause:

- using template body styles.

Fix:

- use custom Loom styles;
- body should be SourceHanSansCN-Regular 10.5 pt;
- headings should be SourceHanSansCN-Bold 22/16/15/14 pt.

### Highlight block is not boxed

Cause:

- blockquote was converted to separate shaded paragraphs.

Fix:

- convert it to one-cell Word table with blue left border and light fill.

### Garbled symbol appears around page 10

Cause:

- keycap emoji residue such as `U+20E3` survived after emoji removal.

Fix:

- remove full keycap sequence and standalone `U+20E3`;
- verify suspicious char count is zero.

### Images are missing

Cause:

- source cache lacks localized image files;
- source `src` paths do not map to `work-online/assets`.

Fix:

- refresh cache;
- do not ship if important screenshots are missing;
- verify `mediaFiles` count is near expected.

## What To Commit

Commit:

- `SKILL.md`;
- `agents/openai.yaml`;
- `assets/company-template.docx`;
- `assets/company-logo.png`;
- `scripts/generate_handbook_docx.py`;
- `scripts/verify_handbook_docx.py`;
- `references/*.md`;
- `.gitignore`.

Do not commit:

- `node_modules/`;
- generated `dist/`;
- generated `output/`;
- temporary unzipped DOCX folders;
- `work-online/` cache unless the user explicitly wants cached source committed.
