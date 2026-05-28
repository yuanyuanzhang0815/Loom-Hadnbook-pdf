#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from pypdf import PdfReader


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--max-size-mb", type=float, default=50)
    parser.add_argument("--expected-docs", type=int, default=41)
    parser.add_argument("--min-images", type=int, default=90)
    parser.add_argument("--min-links", type=int, default=40)
    return parser.parse_args()


def image_count(page):
    resources = page.get("/Resources") or {}
    xobjects = resources.get("/XObject") or {}
    count = 0
    try:
        items = xobjects.items()
    except Exception:
        return 0
    for _, obj in items:
        try:
            if obj.get_object().get("/Subtype") == "/Image":
                count += 1
        except Exception:
            pass
    return count


def text_lines(reader, page_index, head=3, tail=3):
    lines = (reader.pages[page_index].extract_text() or "").splitlines()
    return {"head": lines[:head], "tail": lines[-tail:] if lines else []}


def main():
    args = parse_args()
    pdf_path = Path(args.pdf)
    reader = PdfReader(str(pdf_path))

    links = 0
    images = 0
    for page in reader.pages:
        links += len(page.get("/Annots") or [])
        images += image_count(page)

    named_destinations = getattr(reader, "named_destinations", {}) or {}
    doc_dests = [name for name in named_destinations if str(name).startswith("/doc-")]

    toc_lines = (reader.pages[1].extract_text() or "").splitlines() if len(reader.pages) > 1 else []
    toc_has_page_numbers = any(line.strip().endswith(" 3") or line.strip().endswith("3") for line in toc_lines[:8])

    result = {
        "pdf": str(pdf_path),
        "pages": len(reader.pages),
        "sizeMb": round(pdf_path.stat().st_size / 1024 / 1024, 2),
        "links": links,
        "namedDestinations": len(named_destinations),
        "docDestinations": len(doc_dests),
        "imageXObjects": images,
        "tocHasPageNumbers": toc_has_page_numbers,
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
    if not result["tocHasPageNumbers"]:
        failures.append("TOC page numbers were not detected on page 2")

    result["ok"] = not failures
    result["failures"] = failures
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
