#!/usr/bin/env python3
import argparse
import json
import re
import unicodedata

from pypdf import PdfReader


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--titles", required=True)
    parser.add_argument("--skip-pages", type=int, default=0)
    return parser.parse_args()


def normalize(value):
    text = unicodedata.normalize("NFKC", value or "")
    text = text.translate(
        str.maketrans(
            {
                "⻅": "见",
                "⺫": "目",
                "⾸": "首",
                "⻚": "页",
                "⼯": "工",
                "⼿": "手",
                "⽤": "用",
                "⼾": "户",
                "⽂": "文",
                "⼊": "入",
                "⼀": "一",
            }
        )
    )
    return re.sub(r"\s+", "", text)


def first_meaningful_line(text):
    for line in (text or "").splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return ""


def main():
    args = parse_args()
    titles = json.loads(args.titles)
    reader = PdfReader(args.pdf)
    page_lines = [first_meaningful_line(page.extract_text() or "") for page in reader.pages]
    normalized_lines = [normalize(line) for line in page_lines]

    starts = []
    search_from = max(0, args.skip_pages)
    for title_index, title in enumerate(titles):
        target = normalize(title)
        found = None
        for index in range(search_from, len(normalized_lines)):
            current = normalized_lines[index]
            if current == target or (current and (target.startswith(current) or current.startswith(target))):
                found = index + 1
                break
        if found is not None:
            starts.append({"index": title_index, "title": title, "start": found})
            search_from = found

    ranges = []
    for index, item in enumerate(starts):
        end = starts[index + 1]["start"] - 1 if index + 1 < len(starts) else len(reader.pages)
        ranges.append({"index": item["index"], "title": item["title"], "start": item["start"], "end": end})

    print(json.dumps(ranges, ensure_ascii=False))


if __name__ == "__main__":
    main()
