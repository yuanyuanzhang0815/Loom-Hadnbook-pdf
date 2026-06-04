#!/usr/bin/env python3
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET


NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
}
W = f"{{{NS['w']}}}"


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Verify the generated Loom handbook DOCX.")
    parser.add_argument("--docx", required=True, help="Path to generated DOCX.")
    parser.add_argument("--expected-docs", type=int, default=41)
    parser.add_argument("--min-images", type=int, default=90)
    parser.add_argument("--max-size-mb", type=float, default=50)
    return parser.parse_args(argv)


def text_nodes(root):
    return root.findall(".//w:t", NS)


def paragraph_texts(root):
    result = []
    for paragraph in root.findall(".//w:p", NS):
        text = "".join(t.text or "" for t in text_nodes(paragraph)).strip()
        style = paragraph.find("w:pPr/w:pStyle", NS)
        style_id = style.get(W + "val") if style is not None else None
        if text:
            result.append((style_id, text))
    return result


def has_suspicious_char(text):
    bad = []
    for char in text:
        code = ord(char)
        category = unicodedata.category(char)
        if char in {"\u20e3", "\ufffd"}:
            bad.append((char, f"U+{code:04X}", unicodedata.name(char, "?")))
        elif 0x1F000 <= code <= 0x1FAFF:
            bad.append((char, f"U+{code:04X}", unicodedata.name(char, "?")))
        elif 0x2600 <= code <= 0x27BF:
            bad.append((char, f"U+{code:04X}", unicodedata.name(char, "?")))
        elif category in {"Co", "Cf"}:
            bad.append((char, f"U+{code:04X}", unicodedata.name(char, "?")))
    return bad


def main(argv):
    args = parse_args(argv)
    docx = Path(args.docx).expanduser().resolve()
    checks = {}
    failures = []
    if not docx.exists():
        raise FileNotFoundError(docx)

    checks["sizeMb"] = round(docx.stat().st_size / 1024 / 1024, 2)
    if checks["sizeMb"] > args.max_size_mb:
        failures.append(f"File is too large: {checks['sizeMb']} MB")

    with ZipFile(docx) as z:
        names = set(z.namelist())
        document = ET.fromstring(z.read("word/document.xml"))
        styles = ET.fromstring(z.read("word/styles.xml"))
        settings = ET.fromstring(z.read("word/settings.xml")) if "word/settings.xml" in names else ET.Element("missing")

        all_text = ""
        for name in names:
            if name.startswith("word/") and name.endswith(".xml"):
                try:
                    root = ET.fromstring(z.read(name))
                except ET.ParseError:
                    continue
                all_text += "".join(t.text or "" for t in text_nodes(root))

        checks["markdownResidue"] = any(token in all_text for token in ["**", "```", "`"])
        if checks["markdownResidue"]:
            failures.append("Markdown residue found.")

        compat_chars = ["⽤", "⼯", "⼈", "⼊", "⻓", "⾸", "⻚", "⽬", "⽂", "⼿", "⽌"]
        checks["compatUnicodeResidue"] = [c for c in compat_chars if c in all_text]
        if checks["compatUnicodeResidue"]:
            failures.append(f"Compatibility Unicode residue found: {checks['compatUnicodeResidue']}")

        suspicious = has_suspicious_char(all_text)
        checks["suspiciousTextChars"] = suspicious[:20]
        if suspicious:
            failures.append(f"Suspicious text chars found: {suspicious[:5]}")

        checks["headerTextOk"] = True
        header_texts = {}
        for name in sorted(n for n in names if n.startswith("word/header") and n.endswith(".xml")):
            root = ET.fromstring(z.read(name))
            text = "".join(t.text or "" for t in text_nodes(root))
            header_texts[name] = text
            if "文档名称" in text or "产品文档名称" in text:
                checks["headerTextOk"] = False
        checks["headers"] = header_texts
        if not checks["headerTextOk"]:
            failures.append("Header still contains 文档名称 or 产品文档名称.")

        footer_page_fields = 0
        footer_bad_static = []
        for name in sorted(n for n in names if n.startswith("word/footer") and n.endswith(".xml")):
            root = ET.fromstring(z.read(name))
            instr = "".join(t.text or "" for t in root.findall(".//w:instrText", NS))
            text = "".join(t.text or "" for t in text_nodes(root))
            if "PAGE" in instr:
                footer_page_fields += 1
            if re.search(r"(第\s*\d+\s*页|共\s*\d+\s*页)", text):
                footer_bad_static.append(name)
        checks["footerPageFieldFiles"] = footer_page_fields
        checks["footerBadStaticText"] = footer_bad_static
        if footer_page_fields < 1:
            failures.append("No PAGE field found in footer.")
        if footer_bad_static:
            failures.append(f"Footer contains forbidden static page text: {footer_bad_static}")

        sections = document.findall(".//w:sectPr", NS)
        bad_starts = []
        for idx, section in enumerate(sections, 1):
            pg = section.find("w:pgNumType", NS)
            if pg is not None and pg.get(W + "start"):
                bad_starts.append(idx)
        checks["sections"] = len(sections)
        checks["sectionsWithStartPage"] = bad_starts
        if bad_starts:
            failures.append(f"Sections reset page numbering: {bad_starts}")

        pageref = [
            fld.get(W + "instr")
            for fld in document.findall(".//w:fldSimple", NS)
            if fld.get(W + "instr") and "PAGEREF" in fld.get(W + "instr")
        ]
        checks["tocPageRefFields"] = len(pageref)
        if len(pageref) < min(args.expected_docs, 1):
            failures.append(f"Too few TOC PAGEREF fields: {len(pageref)}")

        paragraphs = paragraph_texts(document)
        toc_entries = [(style, text) for style, text in paragraphs if style in {"LoomToc1", "LoomToc2", "LoomToc3", "LoomToc4"}]
        checks["tocEntries"] = len(toc_entries)
        checks["firstTocEntries"] = toc_entries[:8]
        if len(toc_entries) < min(args.expected_docs, 1):
            failures.append(f"Too few TOC entries: {len(toc_entries)}")

        style_map = {style.get(W + "styleId"): style for style in styles.findall("w:style", NS)}
        expected_styles = {
            "LoomToc1": ("20", True, False),
            "LoomToc2": ("20", False, False),
            "LoomToc3": ("20", False, True),
            "LoomToc4": ("18", False, False),
            "LoomBody": ("21", False, False),
            "LoomDocTitle1": ("44", True, False),
        }
        style_checks = {}
        for style_id, (size, bold, italic) in expected_styles.items():
            style = style_map.get(style_id)
            if style is None:
                style_checks[style_id] = "missing"
                continue
            rpr = style.find("w:rPr", NS)
            actual_size = rpr.find("w:sz", NS).get(W + "val") if rpr is not None and rpr.find("w:sz", NS) is not None else None
            actual_bold = rpr.find("w:b", NS) is not None if rpr is not None else False
            actual_italic = rpr.find("w:i", NS) is not None if rpr is not None else False
            style_checks[style_id] = {
                "size": actual_size,
                "bold": actual_bold,
                "italic": actual_italic,
            }
            if (actual_size, actual_bold, actual_italic) != (size, bold, italic):
                failures.append(f"Style {style_id} mismatch: {style_checks[style_id]}")
        checks["styleChecks"] = style_checks

        bookmarks = [
            b.get(W + "name")
            for b in document.findall(".//w:bookmarkStart", NS)
            if b.get(W + "name", "").startswith("_LoomToc")
        ]
        checks["tocBookmarks"] = len(bookmarks)
        if len(bookmarks) < min(args.expected_docs, 1):
            failures.append(f"Too few TOC bookmarks: {len(bookmarks)}")

        quote_tables = 0
        for table in document.findall(".//w:tbl", NS):
            shd = table.find(".//w:tcPr/w:shd", NS)
            left = table.find("w:tblPr/w:tblBorders/w:left", NS)
            if shd is not None and shd.get(W + "fill") == "F3F7FF" and left is not None:
                quote_tables += 1
        checks["quoteTables"] = quote_tables

        image_count = sum(1 for name in names if name.startswith("word/media/"))
        checks["mediaFiles"] = image_count
        if image_count < args.min_images:
            failures.append(f"Too few media files: {image_count}")

        update_fields = settings.find("w:updateFields", NS)
        checks["updateFields"] = update_fields is not None and update_fields.get(W + "val") == "true"
        if not checks["updateFields"]:
            failures.append("settings.xml does not request field updates.")

    report = {
        "ok": not failures,
        "docx": str(docx),
        "checks": checks,
        "failures": failures,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
