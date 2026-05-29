#!/usr/bin/env python3
import argparse
import os
import re
import tempfile

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject


ALLOWED_PREFIXED = re.compile(r"^/[A-Z]{6}\+(SourceHanSansCN-Regular|SourceHanSansCN-Bold|AppleColorEmoji)$")


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    return parser.parse_args()


def clean_name(value):
    if not isinstance(value, NameObject):
        return value
    match = ALLOWED_PREFIXED.match(str(value))
    if not match:
        return value
    return NameObject(f"/{match.group(1)}")


def normalize_font_dict(font):
    if not isinstance(font, DictionaryObject):
        return
    if "/BaseFont" in font:
        font[NameObject("/BaseFont")] = clean_name(font["/BaseFont"])
    descriptor = font.get("/FontDescriptor")
    if descriptor:
        descriptor = descriptor.get_object()
        if "/FontName" in descriptor:
            descriptor[NameObject("/FontName")] = clean_name(descriptor["/FontName"])
    descendants = font.get("/DescendantFonts")
    if isinstance(descendants, ArrayObject):
        for descendant in descendants:
            normalize_font_dict(descendant.get_object())


def walk_resources(resources, seen):
    if not resources:
        return
    resources = resources.get_object()
    fonts = resources.get("/Font") or {}
    for font in fonts.values():
        normalize_font_dict(font.get_object())
    xobjects = resources.get("/XObject") or {}
    for xobject in xobjects.values():
        obj = xobject.get_object()
        obj_id = id(obj)
        if obj_id in seen:
            continue
        seen.add(obj_id)
        walk_resources(obj.get("/Resources"), seen)


def main():
    args = parse_args()
    reader = PdfReader(args.pdf)
    writer = PdfWriter(clone_from=reader)
    for page in writer.pages:
        walk_resources(page.get("/Resources"), set())
    directory = os.path.dirname(os.path.abspath(args.pdf))
    with tempfile.NamedTemporaryFile(delete=False, dir=directory, suffix=".pdf") as tmp:
        temp_path = tmp.name
        writer.write(tmp)
    os.replace(temp_path, args.pdf)


if __name__ == "__main__":
    main()
