#!/usr/bin/env python3
import argparse
import json
import re
import unicodedata
from pathlib import Path

from pypdf import PdfReader


EXTRACTED_TEXT_MAP = str.maketrans(
    {
        "⽬": "目",
        "⾸": "首",
        "⻚": "页",
        "⽤": "用",
        "⼾": "户",
        "⼯": "工",
        "⼀": "一",
        "⾼": "高",
        "⽂": "文",
        "⼿": "手",
        "⽌": "止",
        "⼈": "人",
        "⻅": "见",
        "⻛": "风",
        "ﬁ": "fi",
    }
)


def normalize_extracted_text(text):
    return unicodedata.normalize("NFKC", text).translate(EXTRACTED_TEXT_MAP)


def normalize_extracted_text_preserve_punctuation(text):
    return text.translate(EXTRACTED_TEXT_MAP)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--max-size-mb", type=float, default=50)
    parser.add_argument("--expected-docs", type=int, default=41)
    parser.add_argument("--min-images", type=int, default=90)
    parser.add_argument("--min-links", type=int, default=40)
    parser.add_argument(
        "--allowed-font",
        action="append",
        default=["SourceHanSansCN-Regular", "SourceHanSansCN-Bold", "AppleColorEmoji"],
    )
    return parser.parse_args()


def walk_resources(resources, seen):
    if not resources:
        return
    try:
        resources = resources.get_object()
    except Exception:
        pass
    yield resources
    xobjects = resources.get("/XObject") or {}
    count = 0
    try:
        items = xobjects.items()
    except Exception:
        items = []
    for _, obj in items:
        try:
            xobject = obj.get_object()
        except Exception:
            continue
        object_id = id(xobject)
        if object_id in seen:
            continue
        seen.add(object_id)
        yield from walk_resources(xobject.get("/Resources"), seen)


def page_resource_stats(page):
    fonts = set()
    images = 0
    for resources in walk_resources(page.get("/Resources"), set()):
        font_dict = resources.get("/Font") or {}
        for _, font_ref in getattr(font_dict, "items", lambda: [])():
            font = font_ref.get_object()
            name = str(font.get("/BaseFont", "")).lstrip("/")
            if "+" in name:
                name = name.split("+", 1)[1]
            if name:
                fonts.add(name)
        xobjects = resources.get("/XObject") or {}
        for _, obj in getattr(xobjects, "items", lambda: [])():
            try:
                if obj.get_object().get("/Subtype") == "/Image":
                    images += 1
            except Exception:
                pass
    return fonts, images


def text_lines(reader, page_index, head=3, tail=3):
    lines = (reader.pages[page_index].extract_text() or "").splitlines()
    return {"head": lines[:head], "tail": lines[-tail:] if lines else []}


def main():
    args = parse_args()
    pdf_path = Path(args.pdf)
    reader = PdfReader(str(pdf_path))

    links = 0
    images = 0
    fonts = set()
    for page in reader.pages:
        links += len(page.get("/Annots") or [])
        page_fonts, page_images = page_resource_stats(page)
        fonts.update(page_fonts)
        images += page_images

    named_destinations = getattr(reader, "named_destinations", {}) or {}
    doc_dests = [name for name in named_destinations if str(name).startswith("/doc-")]

    toc_text = reader.pages[1].extract_text() or "" if len(reader.pages) > 1 else ""
    toc_text_normalized = normalize_extracted_text(toc_text)
    toc_lines = toc_text.splitlines()
    toc_has_page_numbers = bool(re.search(r"产品介绍\s+4", toc_text_normalized)) and bool(
        re.search(r"首页\s+4", toc_text_normalized)
    )
    page4_text = reader.pages[3].extract_text() or "" if len(reader.pages) > 3 else ""
    page4_text_joined = re.sub(r"\s+", "", page4_text)
    has_required_cn_punctuation = "织灵，CodaLoom，是" in page4_text_joined
    has_ascii_punctuation_regression = "织灵,CodaLoom,是" in page4_text_joined
    all_text = "\n".join(page.extract_text() or "" for page in reader.pages)
    all_text_joined = re.sub(r"\s+", "", normalize_extracted_text_preserve_punctuation(all_text))
    has_required_key_phrase = "少量人工负责指导和审核，主要工作由ADE来完成" in all_text_joined

    result = {
        "pdf": str(pdf_path),
        "pages": len(reader.pages),
        "sizeMb": round(pdf_path.stat().st_size / 1024 / 1024, 2),
        "links": links,
        "namedDestinations": len(named_destinations),
        "docDestinations": len(doc_dests),
        "imageXObjects": images,
        "fonts": sorted(fonts),
        "tocHasPageNumbers": toc_has_page_numbers,
        "textChecks": {
            "page4HasChineseCommaPhrase": has_required_cn_punctuation,
            "page4HasAsciiCommaRegression": has_ascii_punctuation_regression,
            "page4HasRequiredKeyPhrase": has_required_key_phrase,
        },
        "samples": {
            "cover": text_lines(reader, 0) if len(reader.pages) >= 1 else {},
            "toc": text_lines(reader, 1, head=12, tail=3) if len(reader.pages) >= 2 else {},
            "firstDoc": text_lines(reader, 2) if len(reader.pages) >= 3 else {},
            "secondDoc": text_lines(reader, 3) if len(reader.pages) >= 4 else {},
            "lastPage": text_lines(reader, len(reader.pages) - 1) if reader.pages else {},
        },
    }

    failures = []
    if result["pages"] <= 0:
        failures.append("PDF has no pages")
    if result["sizeMb"] > args.max_size_mb:
        failures.append(f"PDF size {result['sizeMb']} MB exceeds {args.max_size_mb} MB")
    if result["docDestinations"] < args.expected_docs:
        failures.append(
            f"Only {result['docDestinations']} / {args.expected_docs} handbook doc destinations remain; TOC jumps may be broken"
        )
    if result["links"] < args.min_links:
        failures.append(f"Only {result['links']} link annotations found")
    if result["imageXObjects"] < args.min_images:
        failures.append(f"Only {result['imageXObjects']} image objects found; images may be missing")
    disallowed_fonts = sorted(set(result["fonts"]) - set(args.allowed_font))
    if disallowed_fonts:
        failures.append(f"Unexpected PDF fonts found: {disallowed_fonts}")
    if not result["tocHasPageNumbers"]:
        failures.append("TOC page numbers were not detected on page 2")
    if not has_required_cn_punctuation:
        failures.append("Page 4 Chinese punctuation phrase was not detected: 织灵，Coda Loom，是")
    if has_ascii_punctuation_regression:
        failures.append("Page 4 contains ASCII comma punctuation regression: 织灵,Coda Loom,是")
    if not has_required_key_phrase:
        failures.append("Page 4 key phrase is missing: 少量人工负责指导和审核，主要工作由ADE来完成")

    result["ok"] = not failures
    result["failures"] = failures
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
