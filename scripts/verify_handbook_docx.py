#!/usr/bin/env python3
import argparse
import hashlib
import json
import posixpath
import re
import sys
import unicodedata
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET


NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
W = f"{{{NS['w']}}}"
R = f"{{{NS['r']}}}"


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Verify the generated Loom handbook DOCX.")
    parser.add_argument("--docx", required=True, help="Path to generated DOCX.")
    parser.add_argument(
        "--template",
        default=str(Path(__file__).resolve().parents[1] / "assets/company-template.docx"),
        help="Authoritative company Word template used to lock header Logo geometry and image.",
    )
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


def position_signature(position):
    if position is None:
        return None
    child = next(iter(position), None)
    return {
        "relativeFrom": position.get("relativeFrom"),
        "mode": child.tag.rsplit("}", 1)[-1] if child is not None else None,
        "value": child.text if child is not None else None,
    }


def header_logo_signatures(docx_path):
    signatures = {}
    with ZipFile(docx_path) as z:
        names = set(z.namelist())
        for header_name in sorted(
            name for name in names if name.startswith("word/header") and name.endswith(".xml")
        ):
            header_root = ET.fromstring(z.read(header_name))
            rels_name = f"word/_rels/{Path(header_name).name}.rels"
            rel_targets = {}
            if rels_name in names:
                rels_root = ET.fromstring(z.read(rels_name))
                for relationship in rels_root:
                    rel_targets[relationship.get("Id")] = relationship.get("Target")

            drawings = []
            for drawing in header_root.findall(".//w:drawing", NS):
                extent = drawing.find(".//wp:extent", NS)
                xfrm_extent = drawing.find(".//a:xfrm/a:ext", NS)
                pos_h = drawing.find(".//wp:positionH", NS)
                pos_v = drawing.find(".//wp:positionV", NS)
                blip = drawing.find(".//a:blip", NS)
                rel_id = blip.get(R + "embed") if blip is not None else None
                target = rel_targets.get(rel_id)
                media_hash = None
                if target:
                    media_name = posixpath.normpath(posixpath.join("word", target))
                    if media_name in names:
                        media_hash = hashlib.sha256(z.read(media_name)).hexdigest()
                drawings.append({
                    "extent": dict(extent.attrib) if extent is not None else None,
                    "xfrmExtent": dict(xfrm_extent.attrib) if xfrm_extent is not None else None,
                    "positionH": position_signature(pos_h),
                    "positionV": position_signature(pos_v),
                    "mediaSha256": media_hash,
                })
            signatures[Path(header_name).name] = drawings
    return signatures


def template_header_locked_entries(template_zip):
    entries = {
        name
        for name in template_zip.namelist()
        if (
            name.startswith("word/header") and name.endswith(".xml")
        ) or (
            name.startswith("word/_rels/header") and name.endswith(".xml.rels")
        )
    }
    for rels_name in [name for name in entries if name.startswith("word/_rels/header")]:
        rels_root = ET.fromstring(template_zip.read(rels_name))
        for relationship in rels_root:
            target = relationship.get("Target", "")
            if target.startswith("media/"):
                entries.add(f"word/{target}")
    return entries


def compare_locked_header_parts(template_path, docx_path):
    mismatches = []
    with ZipFile(template_path) as template_zip, ZipFile(docx_path) as docx_zip:
        docx_names = set(docx_zip.namelist())
        for name in sorted(template_header_locked_entries(template_zip)):
            if name not in docx_names:
                mismatches.append({"part": name, "reason": "missing"})
            elif docx_zip.read(name) != template_zip.read(name):
                mismatches.append({"part": name, "reason": "byte-mismatch"})
    return mismatches


def main(argv):
    args = parse_args(argv)
    docx = Path(args.docx).expanduser().resolve()
    template = Path(args.template).expanduser().resolve()
    checks = {}
    failures = []
    if not docx.exists():
        raise FileNotFoundError(docx)
    if not template.exists():
        raise FileNotFoundError(template)

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

        expected_header_logos = header_logo_signatures(template)
        actual_header_logos = header_logo_signatures(docx)
        checks["headerLogoGeometryAndAssetLocked"] = actual_header_logos == expected_header_logos
        checks["headerLogoSignatures"] = actual_header_logos
        if not checks["headerLogoGeometryAndAssetLocked"]:
            failures.append(
                "Header Logo geometry or image asset differs from the company template. "
                "Do not change Logo width, height, aspect ratio, position, or image."
            )
        header_part_mismatches = compare_locked_header_parts(template, docx)
        checks["headerPartsByteIdenticalToTemplate"] = not header_part_mismatches
        checks["headerPartMismatches"] = header_part_mismatches
        if header_part_mismatches:
            failures.append(
                "Header parts are not byte-identical to the company template. "
                "Generate by extending the template body and leave all header XML, relationships, "
                "Logo media, and header line data untouched."
            )

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
