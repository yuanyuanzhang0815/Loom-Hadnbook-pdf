#!/usr/bin/env python3
import argparse
import io
import os

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--header-image", required=True)
    parser.add_argument("--document-name", default="织灵产品使用手册")
    parser.add_argument("--version", default="v1.0.0")
    parser.add_argument("--skip-pages", type=int, default=1)
    return parser.parse_args()


def overlay_page(width, height, page_no, total, args):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(width, height))
    font = register_template_font()

    left = 90
    right = width - 90

    c.setFont(font, 9)
    c.setFillColor(colors.HexColor("#1f2937"))
    c.drawString(left, height - 42, args.document_name)

    if os.path.exists(args.header_image):
        c.drawImage(
            args.header_image,
            right - 91.5,
            height - 52,
            width=91.5,
            height=25.5,
            preserveAspectRatio=True,
            mask="auto",
        )

    c.setStrokeColor(colors.HexColor("#9ca3af"))
    c.setLineWidth(0.4)
    c.line(left, height - 58, right, height - 58)

    c.setFillColor(colors.HexColor("#4472c4"))
    c.setFont(font, 9)
    c.drawString(left, 39, f"版本：{args.version}")
    c.setFont("Helvetica", 8.2)
    c.setFillColor(colors.HexColor("#1f2937"))
    c.drawCentredString(width / 2, 39, "Coda Intellect Tech Co., Ltd Confidential")
    c.setFont(font, 9)
    c.drawRightString(right, 39, str(page_no))
    c.save()
    buffer.seek(0)
    return PdfReader(buffer).pages[0]


def register_template_font():
    font_path = os.path.expanduser("~/Library/Fonts/华文楷体.ttf")
    if os.path.exists(font_path):
        try:
            pdfmetrics.registerFont(TTFont("TemplateKai", font_path))
            return "TemplateKai"
        except Exception:
            pass
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    return "STSong-Light"


def main():
    args = parse_args()
    if not os.path.exists(args.header_image):
        raise FileNotFoundError(f"Required company logo asset is missing: {args.header_image}")
    reader = PdfReader(args.input)
    writer = PdfWriter(clone_from=reader)
    total = len(writer.pages)

    for index, page in enumerate(writer.pages):
        page_no = index + 1
        if page_no <= args.skip_pages:
            continue
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        page.merge_page(overlay_page(width, height, page_no, total, args))

    with open(args.output, "wb") as f:
        writer.write(f)


if __name__ == "__main__":
    main()
