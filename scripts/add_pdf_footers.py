#!/usr/bin/env python3
import argparse
import io
import json

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--ranges", required=True)
    return parser.parse_args()


def section_for_page(ranges, page_no):
    for item in ranges:
        if item["start"] <= page_no <= item["end"]:
            return item["title"]
    return ""


def overlay_page(width, height, page_no, total, section):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(width, height))
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    font = "STSong-Light"

    c.setStrokeColor(colors.HexColor("#d8e2ef"))
    c.setLineWidth(0.5)
    c.line(45, 38, width - 45, 38)

    c.setFont(font, 8)
    c.setFillColor(colors.HexColor("#64748b"))
    if section:
        c.drawString(48, 22, section[:28])

    center = f"第 {page_no} 页 / 共 {total} 页"
    c.drawCentredString(width / 2, 22, center)

    c.setFillColor(colors.HexColor("#1d6ff2"))
    c.drawRightString(width - 48, 22, "可达智灵 · Coda Loom")
    c.save()
    buffer.seek(0)
    return PdfReader(buffer).pages[0]


def main():
    args = parse_args()
    with open(args.ranges, "r", encoding="utf-8") as f:
        ranges = json.load(f)

    reader = PdfReader(args.input)
    writer = PdfWriter(clone_from=reader)
    total = len(reader.pages)

    for index, page in enumerate(writer.pages):
        page_no = index + 1
        if page_no != 1:
            width = float(page.mediabox.width)
            height = float(page.mediabox.height)
            section = section_for_page(ranges, page_no)
            page.merge_page(overlay_page(width, height, page_no, total, section))

    with open(args.output, "wb") as f:
        writer.write(f)


if __name__ == "__main__":
    main()
