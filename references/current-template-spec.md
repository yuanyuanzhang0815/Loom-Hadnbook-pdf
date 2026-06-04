# Current Accepted DOCX Specification

This file is the authoritative spec for the current `织灵产品使用手册.docx`.

## Output

Default output:

```text
dist/织灵产品使用手册.docx
```

The DOCX is the accepted deliverable. PDF export is user/manual unless explicitly requested.

## Source

Use the online handbook:

```text
https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D
```

Follow the online order from `work-online/online-order.json`. The expected opening sequence is:

```text
产品介绍
首页
新用户登录
工作空间
会话&工作区
如何使用会话
开始一个新会话
借助织灵内置的微场景，快速开启高效工作
```

If `名词解释` appears immediately after `产品介绍`, the source order is wrong.

## Template Boundary

The Word template controls only:

- cover page structure;
- page header;
- page footer;
- company logo placement;
- header horizontal rule;
- footer version text;
- footer company text;
- footer page-number position.

The Word template does not control:

- body font size;
- body heading scale;
- TOC item font rules;
- highlighter block conversion;
- source content order.

## Cover

Use `assets/company-template.docx`.

Cover title:

```text
织灵产品使用手册
```

Do not redesign the cover. Do not rebuild the logo. Do not add the old marketing cover.

## Header

Header document name must be:

```text
织灵产品手册
```

Replace any template placeholder:

```text
文档名称
产品文档名称
```

with `织灵产品手册`.

Keep the template logo, line, and position. Do not manually redraw header furniture.

## Footer

Footer format:

```text
left:   版本：v1.0.0
center: Coda Intellect Tech Co., Ltd Confidential
right:  PAGE field
```

The right page number must be a Word dynamic `PAGE` field. It must not be static text.

Do not output:

```text
第 2 页
第 2 页 / 共 10 页
共 10 页
```

Do not set page numbering restart on body sections:

```xml
<w:pgNumType w:start="1"/>
```

Remove `w:start`, `w:chapStyle`, and `w:chapSep` from generated section page-number settings.

## Body Typography

Use the confirmed handbook style system:

| Role | Font | Size | Weight | Italic |
| --- | --- | ---: | --- | --- |
| Body | SourceHanSansCN-Regular | 10.5 pt | regular | no |
| Page title depth 1 | SourceHanSansCN-Bold | 22 pt | bold | no |
| Page title depth 2 | SourceHanSansCN-Bold | 16 pt | bold | no |
| Page title depth 3 | SourceHanSansCN-Bold | 15 pt | bold | no |
| Page title depth 4 | SourceHanSansCN-Bold | 14 pt | bold | no |
| Body H1 | SourceHanSansCN-Bold | 22 pt | bold | no |
| Body H2 | SourceHanSansCN-Bold | 16 pt | bold | no |
| Body H3 | SourceHanSansCN-Bold | 15 pt | bold | no |
| Body H4 | SourceHanSansCN-Bold | 14 pt | bold | no |
| Table header | SourceHanSansCN-Bold | 10.5 pt | bold | no |
| Table body | SourceHanSansCN-Regular | 10 pt | regular | no |
| Code block | SourceHanSansCN-Regular | 9 pt | regular | no |

Do not fall back to STKaiti, STHeiti, DengXian-Light, Helvetica, or template body fonts for the handbook body.

## TOC

The TOC is visible Word content plus dynamic fields:

- each entry is a paragraph;
- each entry links to a Word bookmark on the target section title;
- page number is a `PAGEREF` field;
- fields are marked dirty/updateable;
- `settings.xml` includes `<w:updateFields w:val="true"/>`.

TOC style rules:

| TOC Level | Font | Size | Weight | Italic | Indent | Leader | Page Number |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| TOC 1 | SourceHanSansCN-Bold | 10 pt | bold | no | 0 | dotted | right-aligned |
| TOC 2 | SourceHanSansCN-Regular | 10 pt | regular | no | +420 dxa | dotted | right-aligned |
| TOC 3 | SourceHanSansCN-Regular | 10 pt | regular | yes | +840 dxa | dotted | right-aligned |
| TOC 4 | SourceHanSansCN-Regular | 9 pt | regular | no | +1260 dxa | dotted | right-aligned |

TOC text must include hierarchical numbering:

```text
1. 一级标题 ........ 1
1.1. 二级标题 ........ 1
1.1.1. 三级标题 ........ 1
1.1.1.1. 四级标题 ........ 1
```

## Content Cleaning

Remove:

- Docusaurus navigation/header/footer/sidebar;
- Docusaurus classes and inline styles;
- source `来源：https://...` lines;
- duplicate page title at the top of each source article;
- Markdown residue: `**`, backticks, fenced markers;
- source emoji in text;
- keycap residue such as `U+20E3`;
- zero-width characters;
- private-use characters;
- replacement character `U+FFFD`.

Normalize:

```text
⽤ -> 用
⼯ -> 工
⼈ -> 人
⼊ -> 入
⻓ -> 长
⾸ -> 首
⻚ -> 页
⽬ -> 目
⽂ -> 文
⼿ -> 手
⽌ -> 止
```

Preserve:

- Chinese punctuation;
- mixed Chinese/English text;
- links;
- tables;
- screenshots;
- code blocks;
- lists.

## Highlighter And Quote Blocks

Do not inherit web CSS. Do not screenshot highlighter blocks.

Convert blockquote/highlighter-like blocks into a one-cell Word table:

- fill color `F3F7FF`;
- left border blue `2F7DFF`;
- no top/right/bottom borders;
- inner padding around 180/260 dxa;
- all text remains editable;
- bullet/numbered content remains text.

This is required because plain shaded paragraphs do not visually group the whole block.

## Images

Images must be copied into `word/media` and inserted as Word drawing objects.

Rules:

- preserve aspect ratio;
- keep within body width;
- do not stretch;
- do not render text as one giant image;
- screenshots may contain emoji because they are product UI images.

## Field Update Requirement

The generated DOCX must contain dynamic fields, but their displayed page numbers may not materialize until WPS/Word updates fields.

Required field types:

- footer page number: `PAGE`;
- TOC page number: `PAGEREF`;
- settings update: `<w:updateFields w:val="true"/>`.

When visual finalization matters, open the file in WPS/Word and update fields before exporting PDF.
