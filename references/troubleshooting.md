# Troubleshooting

Use this when generated DOCX output does not match the accepted result.

## Page Numbers All Show 1

Cause:

- body sections contain `<w:pgNumType w:start="1"/>`.
- an agent rebuilt the footer and replaced the template `PAGE` field with text.

Fix:

1. Do not manually edit footer XML.
2. Restore the current `assets/company-template.docx` footer parts unchanged.
3. Remove `w:start`, `w:chapStyle`, and `w:chapSep` from generated section page-number settings.
4. Run `verify_handbook_docx.py` and confirm `changedProtectedHeaderFooterParts` is empty.
5. Open in WPS/Word and update fields.

## TOC Has No Page Numbers

Cause:

- `PAGEREF` fields are missing;
- bookmarks are missing;
- fields have not been updated in WPS/Word.

Fix:

1. Each document title must have a `_LoomTocN` bookmark.
2. Each TOC entry must include `PAGEREF _LoomTocN \h`.
3. `settings.xml` must include `<w:updateFields w:val="true"/>`.
4. Open in WPS/Word and update fields.

## TOC Looks Like The Wrong Template

Cause:

- generated content used built-in Word TOC styles;
- `LoomToc1-4` were not mapped into `style_ids`.

Fix:

- use `LoomToc1`, `LoomToc2`, `LoomToc3`, `LoomToc4`;
- check:
  - TOC 1: 10 pt bold non-italic;
  - TOC 2: 10 pt regular non-italic;
  - TOC 3: 10 pt italic non-bold;
  - TOC 4: 9 pt regular non-italic;
  - dotted leader tab;
  - right-aligned page number.

## Header Or Footer Changed

Cause:

- an agent edited or reserialized protected template header/footer parts.

Fix:

- do not repair the header/footer manually;
- restore the latest `assets/company-template.docx`;
- regenerate while leaving all header/footer parts untouched;
- require `changedProtectedHeaderFooterParts` to be empty.

## Body Font Regressed

Cause:

- template Heading/Normal styles were used for body content.

Fix:

- body paragraphs must use `LoomBody`;
- page titles must use `LoomDocTitle1-4`;
- internal headings must use `LoomHeading1-4`;
- do not use template body defaults for content.

## Highlight Block Is Not Boxed

Cause:

- blockquote/highlight content was converted to multiple shaded paragraphs.

Fix:

- convert blockquote to a one-cell Word table;
- table cell fill `F3F7FF`;
- table left border `2F7DFF`;
- no top/right/bottom borders;
- keep text editable.

## Source Table Collapses Into One Narrow Column

Symptoms:

- a table occupies only the left quarter of the page;
- text from multiple columns is repeated inside one cell;
- one source table expands into dozens of mostly empty pages.

Cause:

- the source uses valid HTML5 optional end tags such as `<tr><th>A<th>B`;
- Python `HTMLParser` does not automatically close `th`, `td`, or `tr`;
- the malformed intermediate tree makes every Word row contain one cell.

Fix:

1. Use the bundled `BodyParser` automatic-closing logic for `thead`, `tbody`, `tfoot`, `tr`, `th`, and `td`.
2. Do not replace it with a basic recursive parser unless HTML5 table behavior is preserved.
3. Write `tblW`, `tblLayout`, `tblGrid`, and matching `tcW` values for every source table.
4. Keep table images within their cell width.
5. Run `verify_handbook_docx.py --min-source-tables 3`.
6. Reject the output if any marked source table row has fewer cells than its expected column count.

For the current online handbook, the three source tables must preserve `4`, `3`, and `3` columns.

## Garbled Character Appears Where Emoji Was

Cause:

- emoji was partly removed but a combining residue remains, commonly `U+20E3`.

Fix:

- remove full keycap sequences with regex:

```text
[0-9#*]\ufe0f?\u20e3
```

- also remove standalone `\u20e3`.
- verify `suspiciousTextChars` is empty.

## Chinese Punctuation Became ASCII

Cause:

- an over-aggressive punctuation normalization step.

Fix:

- do not normalize punctuation globally;
- preserve source Chinese punctuation;
- only normalize known compatibility Unicode characters.

## Source Order Is Wrong

Cause:

- using Feishu tree order, sidebar order, or alphabetical order.

Fix:

- use `work-online/online-order.json`;
- ensure the opening order is:

```text
产品介绍
首页
新用户登录
工作空间
会话&工作区
```

## Images Missing

Cause:

- `work-online/assets` missing;
- source cache was copied without assets;
- image path mapping failed.

Fix:

1. Run generation with `--refresh`.
2. Check `work-online/assets`.
3. Verify `mediaFiles` count.
4. Do not ship if screenshots are blank or absent.

## Refresh Fails Because Node Cannot Find Playwright

Cause:

- Codex runtime `NODE_PATH` is not set;
- local npm dependencies are not installed.

Fix in Codex Desktop:

```bash
NODE_PATH="/Users/$USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" \
python3 scripts/generate_handbook_docx.py --refresh
```

Fix outside Codex:

```bash
npm install
python3 scripts/generate_handbook_docx.py --refresh
```

## Python Cannot Import PIL

Cause:

- Pillow is missing in the Python runtime.

Fix:

- in Codex Desktop, use the bundled Python runtime;
- outside Codex, install Pillow:

```bash
python3 -m pip install pillow
```

## Verifier Fails On Samples

Cause:

- verifier defaults expect full document counts.

Fix:

For an 8-document sample:

```bash
python3 scripts/verify_handbook_docx.py \
  --docx "dist/织灵产品使用手册-前8篇样稿.docx" \
  --expected-docs 8 \
  --min-images 1
```

## LibreOffice Render Fails On macOS

The Skill deliverable is DOCX. WPS is the preferred manual visual checker on
this machine. If a local visual render uses the bundled `soffice` and fails
with missing Homebrew libraries, install the exact missing direct dependencies:

```bash
HOMEBREW_NO_AUTO_UPDATE=1 brew install little-cms2 fontconfig freetype
```

If `soffice` then says `Error: source file could not be loaded`, do not rewrite
the DOCX or the template. First verify structurally with `verify_handbook_docx.py`
and open the file in WPS. The WPS-specific template may still be valid even when
LibreOffice cannot load it.
