#!/usr/bin/env python3
import argparse
import json
import re

from pypdf import PdfReader


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--count", type=int, required=True)
    return parser.parse_args()


def main():
    args = parse_args()
    reader = PdfReader(args.pdf)
    page_numbers = {}

    for name, destination in reader.named_destinations.items():
        match = re.fullmatch(r"/doc-(\d+)", str(name))
        if not match:
            continue
        index = int(match.group(1))
        if 0 <= index < args.count:
            page_numbers[str(index)] = reader.get_destination_page_number(destination) + 1

    print(json.dumps(page_numbers, ensure_ascii=False))


if __name__ == "__main__":
    main()
