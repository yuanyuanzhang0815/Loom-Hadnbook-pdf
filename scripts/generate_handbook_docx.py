#!/usr/bin/env python3
import argparse
import base64
import copy
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse
from xml.etree import ElementTree as ET

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "assets/company-template.docx"
SOURCE_HTML = ROOT / "work-online/online-handbook.html"
ORDER_JSON = ROOT / "work-online/online-order.json"
OUT_DIR = ROOT / "dist"
OUT_DOCX = OUT_DIR / "织灵产品使用手册.docx"
SAMPLE_DOCS = 0
REFRESH_SOURCE = False

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "pic": "http://schemas.openxmlformats.org/drawingml/2006/picture",
}
for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)


COMPAT_MAP = str.maketrans({
    "⽤": "用",
    "⼯": "工",
    "⼈": "人",
    "⼊": "入",
    "⻓": "长",
    "⾸": "首",
    "⻚": "页",
    "⽬": "目",
    "⽂": "文",
    "⼿": "手",
    "⽌": "止",
})


def wtag(name):
    return f"{{{NS['w']}}}{name}"


def rtag(name):
    return f"{{{NS['r']}}}{name}"


def el(tag, attrs=None, text=None):
    node = ET.Element(tag, attrs or {})
    if text is not None:
        node.text = text
    return node


class Node:
    def __init__(self, tag="root", attrs=None):
        self.tag = tag
        self.attrs = attrs or {}
        self.children = []


class BodyParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag.lower(), dict(attrs))
        self.stack[-1].children.append(node)
        if tag.lower() not in {"img", "br", "hr", "meta", "link", "input"}:
            self.stack.append(node)

    def handle_endtag(self, tag):
        tag = tag.lower()
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if data:
            self.stack[-1].children.append(data)


def clean_text(text):
    text = html.unescape(text).translate(COMPAT_MAP)
    text = re.sub(r"[0-9#*]\ufe0f?\u20e3", "", text)
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", text)
    text = re.sub(
        r"[\ufe0e\ufe0f\u200d\u20e3"
        r"\U0001F000-\U0001FAFF"
        r"\U00002700-\U000027BF"
        r"\U00002600-\U000026FF"
        r"]",
        "",
        text,
    )
    text = text.replace("**", "").replace("`", "")
    text = re.sub(r"[ \t]+", " ", text)
    return text


def get_text(node):
    if isinstance(node, str):
        return clean_text(node)
    if node.tag == "img":
        return ""
    return "".join(get_text(child) for child in node.children)


def normalize_for_compare(text):
    return re.sub(r"\s+", "", clean_text(text)).strip()


def prune_page_chrome(node, page_title):
    """Remove cached page title/source chrome while keeping real article content."""
    title_key = normalize_for_compare(page_title)
    pruned = []
    removed_title = False
    for child in node.children:
        if isinstance(child, str):
            if clean_text(child).strip():
                pruned.append(child)
            continue
        text = get_text(child).strip()
        text_key = normalize_for_compare(text)
        if not removed_title and child.tag in {"header", "h1", "h2", "h3", "h4"} and text_key == title_key:
            removed_title = True
            continue
        if child.tag == "p" and re.match(r"^来源[:：]\s*https?://", text):
            continue
        prune_page_chrome(child, page_title)
        if child.children or child.tag in {"img", "br", "hr"}:
            pruned.append(child)
    node.children = pruned


def parse_sections():
    ensure_source_cache()
    text = SOURCE_HTML.read_text("utf-8")
    order = json.loads(ORDER_JSON.read_text("utf-8")) if ORDER_JSON.exists() else []
    pattern = re.compile(
        r'<section class="([^"]*)" id="doc-(\d+)" data-title="([^"]*)">\s*'
        r'<div class="online-article markdown">([\s\S]*?)</div>\s*</section>'
    )
    pages = []
    for match in pattern.finditer(text):
        index = int(match.group(2))
        title = html.unescape(match.group(3))
        body = match.group(4)
        parser = BodyParser()
        parser.feed(body)
        title = clean_text(title).strip()
        prune_page_chrome(parser.root, title)
        ordered = order[index] if index < len(order) else {}
        pages.append({
            "index": index,
            "title": title,
            "depth": int(ordered.get("depth") or 1),
            "root": parser.root,
        })
    return pages[:SAMPLE_DOCS] if SAMPLE_DOCS else pages


def ensure_source_cache():
    if SOURCE_HTML.exists() and ORDER_JSON.exists() and not REFRESH_SOURCE:
        return
    raw_script = ROOT / "scripts/generate_raw_handbook_pdf.mjs"
    if not raw_script.exists():
        raise FileNotFoundError(
            f"Cached source is missing and raw crawler is not available: {raw_script}"
        )
    subprocess.run(
        [
            "node",
            str(raw_script),
            "--work-dir",
            str(ROOT / "work-online"),
            "--output-dir",
            str(ROOT / "output"),
        ],
        cwd=ROOT,
        check=True,
    )


def get_style_ids(styles_xml):
    styles = ET.fromstring(styles_xml)
    ids = {}
    for st in styles.findall(wtag("style")):
        sid = st.get(wtag("styleId"))
        name = st.find(wtag("name"))
        if name is not None:
            ids[name.get(wtag("val"))] = sid
    return ids


def p_style(style_id):
    ppr = el(wtag("pPr"))
    ppr.append(el(wtag("pStyle"), {wtag("val"): style_id}))
    return ppr


def paragraph(style_id=None, runs=None):
    p = el(wtag("p"))
    if style_id:
        p.append(p_style(style_id))
    for run in runs or []:
        p.append(run)
    return p


def run_text(text, bold=False, italic=False, style_id=None):
    r = el(wtag("r"))
    rpr = el(wtag("rPr"))
    if style_id:
        rpr.append(el(wtag("rStyle"), {wtag("val"): style_id}))
    if bold:
        rpr.append(el(wtag("b")))
    if italic:
        rpr.append(el(wtag("i")))
    if len(rpr):
        r.append(rpr)
    t = el(wtag("t"), {f"{{http://www.w3.org/XML/1998/namespace}}space": "preserve"}, text)
    r.append(t)
    return r


def hyperlink(rel_id, text, style_id):
    h = el(wtag("hyperlink"), {rtag("id"): rel_id})
    h.append(run_text(text, style_id=style_id))
    return h


def flatten_runs(node, rels, style_ids, bold=False, italic=False):
    runs = []
    if isinstance(node, str):
        text = clean_text(node)
        if text:
            runs.append(run_text(text, bold=bold, italic=italic))
        return runs
    tag = node.tag
    if tag in {"strong", "b"}:
        bold = True
    if tag in {"em", "i"}:
        italic = True
    if tag == "code":
        text = get_text(node)
        if text:
            runs.append(run_text(text, style_id=style_ids.get("行内代码")))
        return runs
    if tag == "a":
        href = node.attrs.get("href", "")
        text = get_text(node).strip() or href
        if href and not href.lower().startswith("javascript:"):
            rel_id = rels.add_hyperlink(href)
            runs.append(hyperlink(rel_id, text, style_ids.get("Hyperlink", "30")))
        else:
            runs.append(run_text(text, bold=bold, italic=italic))
        return runs
    if tag == "br":
        runs.append(run_text("\n"))
        return runs
    for child in node.children:
        runs.extend(flatten_runs(child, rels, style_ids, bold=bold, italic=italic))
    return runs


class Relationships:
    def __init__(self, root):
        self.root = root
        max_id = 0
        for rel in root:
            rid = rel.get("Id", "")
            if rid.startswith("rId") and rid[3:].isdigit():
                max_id = max(max_id, int(rid[3:]))
        self.next_id = max_id + 1

    def _add(self, typ, target, mode=None):
        rid = f"rId{self.next_id}"
        self.next_id += 1
        attrs = {"Id": rid, "Type": typ, "Target": target}
        if mode:
            attrs["TargetMode"] = mode
        self.root.append(ET.Element("Relationship", attrs))
        return rid

    def add_hyperlink(self, url):
        return self._add(
            "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
            url,
            "External",
        )

    def add_image(self, target):
        return self._add(
            "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
            target,
        )


def local_path_from_src(src):
    src = html.unescape(src)
    if src.startswith("data:image/"):
        match = re.match(r"data:image/([a-zA-Z0-9.+-]+);base64,(.+)", src, re.DOTALL)
        if not match:
            return None
        ext = "jpg" if match.group(1).lower() == "jpeg" else match.group(1).lower()
        if ext not in {"png", "jpg", "jpeg", "gif", "webp"}:
            ext = "png"
        payload = match.group(2)
        digest = hashlib.sha1(payload.encode("ascii", "ignore")).hexdigest()[:16]
        data_dir = OUT_DIR / "_data_images"
        data_dir.mkdir(parents=True, exist_ok=True)
        target = data_dir / f"data_image_{digest}.{ext}"
        if not target.exists():
            target.write_bytes(base64.b64decode(payload))
        return target
    if src.startswith("file://"):
        return Path(unquote(urlparse(src).path))
    if src.startswith("/handbook/assets/images/"):
        name = Path(src).name
        matches = list((ROOT / "work-online/assets").glob(f"*{Path(name).suffix}"))
        for item in matches:
            if item.name == name:
                return item
    return None


def image_run(rel_id, image_path, doc_pr_id):
    with Image.open(image_path) as img:
        px_w, px_h = img.size
    max_cx = int(5.7 * 914400)
    cx = max_cx
    cy = int(cx * px_h / px_w)
    if cy > int(4.8 * 914400):
        cy = int(4.8 * 914400)
        cx = int(cy * px_w / px_h)
    xml = f'''
    <w:r xmlns:w="{NS['w']}" xmlns:r="{NS['r']}" xmlns:wp="{NS['wp']}" xmlns:a="{NS['a']}" xmlns:pic="{NS['pic']}">
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0">
          <wp:extent cx="{cx}" cy="{cy}"/>
          <wp:docPr id="{doc_pr_id}" name="Picture {doc_pr_id}"/>
          <wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic>
                <pic:nvPicPr><pic:cNvPr id="{doc_pr_id}" name="{image_path.name}"/><pic:cNvPicPr/></pic:nvPicPr>
                <pic:blipFill><a:blip r:embed="{rel_id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
                <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
    '''
    return ET.fromstring(xml)


def list_paragraph(text, ordered, style_ids, level=0, in_quote=False):
    prefix = "1. " if ordered else "• "
    return paragraph(style_ids.get("引用块" if in_quote else "LoomList"), [run_text(prefix + text.strip())])


def quote_block_from_node(node, style_ids, rels, media):
    tbl = el(wtag("tbl"))
    tblpr = el(wtag("tblPr"))
    tblpr.append(el(wtag("tblW"), {wtag("w"): "0", wtag("type"): "auto"}))
    tblpr.append(el(wtag("tblInd"), {wtag("w"): "0", wtag("type"): "dxa"}))
    tblpr.append(el(wtag("tblCellMar")))
    borders = el(wtag("tblBorders"))
    for side in ["top", "right", "bottom", "insideH", "insideV"]:
        borders.append(el(wtag(side), {wtag("val"): "nil"}))
    borders.append(el(wtag("left"), {wtag("val"): "single", wtag("sz"): "18", wtag("space"): "0", wtag("color"): "2F7DFF"}))
    tblpr.append(borders)
    tbl.append(tblpr)

    tr = el(wtag("tr"))
    tc = el(wtag("tc"))
    tcpr = el(wtag("tcPr"))
    tcpr.append(el(wtag("tcW"), {wtag("w"): "8200", wtag("type"): "dxa"}))
    tcpr.append(el(wtag("shd"), {wtag("val"): "clear", wtag("color"): "auto", wtag("fill"): "F3F7FF"}))
    tcpr.append(el(wtag("tcMar")))
    margins = tcpr.find(wtag("tcMar"))
    margins.extend([
        el(wtag("top"), {wtag("w"): "180", wtag("type"): "dxa"}),
        el(wtag("left"), {wtag("w"): "260", wtag("type"): "dxa"}),
        el(wtag("bottom"), {wtag("w"): "180", wtag("type"): "dxa"}),
        el(wtag("right"), {wtag("w"): "260", wtag("type"): "dxa"}),
    ])
    tc.append(tcpr)
    inner = blocks_from_node(node, style_ids, rels, media, in_quote=True)
    for block in inner:
        if block.tag == wtag("p"):
            tc.append(block)
    if len(tc) == 1:
        tc.append(paragraph(style_ids.get("引用块"), [run_text("")]))
    tr.append(tc)
    tbl.append(tr)
    return tbl


def table_from_node(node, style_ids, rels, media):
    tbl = el(wtag("tbl"))
    tblpr = el(wtag("tblPr"))
    tblpr.append(el(wtag("tblStyle"), {wtag("val"): style_ids.get("Table Grid", "25")}))
    tbl.append(tblpr)
    rows = [child for child in walk_children(node) if isinstance(child, Node) and child.tag == "tr"]
    for tr_node in rows:
        tr = el(wtag("tr"))
        cells = [c for c in tr_node.children if isinstance(c, Node) and c.tag in {"th", "td"}]
        for cell in cells:
            tc = el(wtag("tc"))
            tcpr = el(wtag("tcPr"))
            tcw = el(wtag("tcW"), {wtag("w"): "2400", wtag("type"): "dxa"})
            tcpr.append(tcw)
            if cell.tag == "th":
                tcpr.append(el(wtag("shd"), {wtag("val"): "clear", wtag("color"): "auto", wtag("fill"): "D0CECE"}))
            tc.append(tcpr)
            runs = flatten_runs(cell, rels, style_ids)
            text = get_text(cell).strip()
            imgs = [c for c in walk_children(cell) if isinstance(c, Node) and c.tag == "img"]
            if text:
                tc.append(paragraph(style_ids.get("LoomTableHeader" if cell.tag == "th" else "LoomTableCell"), runs))
            for img in imgs:
                p = image_paragraph(img, rels, media, style_ids)
                if p is not None:
                    tc.append(p)
            if len(tc) == 1:
                tc.append(paragraph(None, [run_text("")]))
            tr.append(tc)
        tbl.append(tr)
    return tbl


def walk_children(node):
    for child in node.children:
        yield child
        if isinstance(child, Node):
            yield from walk_children(child)


def image_paragraph(node, rels, media, style_ids):
    src = node.attrs.get("src", "")
    image_path = local_path_from_src(src)
    if not image_path or not image_path.exists():
        return None
    ext = image_path.suffix.lower() or ".png"
    name = f"sample_image_{len(media) + 1}{ext}"
    target = f"media/{name}"
    media.append((image_path, target))
    rel_id = rels.add_image(target)
    return paragraph(None, [image_run(rel_id, image_path, len(media) + 100)])


def blocks_from_node(node, style_ids, rels, media, in_quote=False):
    blocks = []
    for child in node.children:
        if isinstance(child, str):
            text = clean_text(child).strip()
            if text:
                blocks.append(paragraph(style_ids.get("引用块") if in_quote else style_ids.get("LoomBody"), [run_text(text)]))
            continue
        tag = child.tag
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            level = min(int(tag[1]), 4)
            blocks.append(paragraph(style_ids.get(f"LoomHeading{level}"), flatten_runs(child, rels, style_ids)))
        elif tag == "p":
            text = get_text(child).strip()
            if text:
                blocks.append(paragraph(style_ids.get("引用块") if in_quote else style_ids.get("LoomBody"), flatten_runs(child, rels, style_ids)))
            for img in [c for c in child.children if isinstance(c, Node) and c.tag == "img"]:
                p = image_paragraph(img, rels, media, style_ids)
                if p is not None:
                    blocks.append(p)
        elif tag in {"ul", "ol"}:
            ordered = tag == "ol"
            for li in [c for c in child.children if isinstance(c, Node) and c.tag == "li"]:
                text = get_text(li)
                if text.strip():
                    blocks.append(list_paragraph(text, ordered, style_ids, in_quote=in_quote))
                for img in [c for c in walk_children(li) if isinstance(c, Node) and c.tag == "img"]:
                    p = image_paragraph(img, rels, media, style_ids)
                    if p is not None:
                        blocks.append(p)
        elif tag == "blockquote":
            blocks.append(quote_block_from_node(child, style_ids, rels, media))
        elif tag == "pre":
            text = get_text(child).strip()
            if text:
                blocks.append(paragraph(style_ids.get("代码块"), [run_text(text)]))
        elif tag == "table":
            blocks.append(table_from_node(child, style_ids, rels, media))
        elif tag == "img":
            p = image_paragraph(child, rels, media, style_ids)
            if p is not None:
                blocks.append(p)
        elif tag == "hr":
            blocks.append(paragraph(None, [run_text("")]))
        else:
            blocks.extend(blocks_from_node(child, style_ids, rels, media, in_quote=in_quote))
    return blocks


def add_custom_styles(styles_root):
    existing = {st.get(wtag("styleId")) for st in styles_root.findall(wtag("style"))}
    def add_para_style(style_id, name, based_on="1", fill=None, mono=False):
        if style_id in existing:
            return
        st = el(wtag("style"), {wtag("type"): "paragraph", wtag("styleId"): style_id})
        st.append(el(wtag("name"), {wtag("val"): name}))
        st.append(el(wtag("basedOn"), {wtag("val"): based_on}))
        st.append(el(wtag("qFormat")))
        ppr = el(wtag("pPr"))
        if fill:
            ppr.append(el(wtag("shd"), {wtag("val"): "clear", wtag("color"): "auto", wtag("fill"): fill}))
        ppr.append(el(wtag("spacing"), {wtag("before"): "120", wtag("after"): "120", wtag("line"): "360", wtag("lineRule"): "auto"}))
        st.append(ppr)
        rpr = el(wtag("rPr"))
        if mono:
            rpr.append(el(wtag("rFonts"), {wtag("ascii"): "SourceHanSansCN-Regular", wtag("hAnsi"): "SourceHanSansCN-Regular", wtag("eastAsia"): "SourceHanSansCN-Regular", wtag("cs"): "SourceHanSansCN-Regular"}))
            rpr.append(el(wtag("sz"), {wtag("val"): "18"}))
        else:
            rpr.append(el(wtag("rFonts"), {wtag("ascii"): "SourceHanSansCN-Regular", wtag("hAnsi"): "SourceHanSansCN-Regular", wtag("eastAsia"): "SourceHanSansCN-Regular", wtag("cs"): "SourceHanSansCN-Regular"}))
            rpr.append(el(wtag("sz"), {wtag("val"): "21"}))
        st.append(rpr)
        styles_root.append(st)
    def add_loom_para_style(style_id, name, size, bold=False, italic=False, before=0, after=0, line=360, outline=None, fill=None):
        if style_id in existing:
            return
        st = el(wtag("style"), {wtag("type"): "paragraph", wtag("styleId"): style_id})
        st.append(el(wtag("name"), {wtag("val"): name}))
        st.append(el(wtag("basedOn"), {wtag("val"): "1"}))
        st.append(el(wtag("qFormat")))
        ppr = el(wtag("pPr"))
        if outline is not None:
            ppr.append(el(wtag("outlineLvl"), {wtag("val"): str(outline)}))
            ppr.append(el(wtag("keepNext")))
        if fill:
            ppr.append(el(wtag("shd"), {wtag("val"): "clear", wtag("color"): "auto", wtag("fill"): fill}))
        ppr.append(el(wtag("spacing"), {
            wtag("before"): str(before),
            wtag("after"): str(after),
            wtag("line"): str(line),
            wtag("lineRule"): "auto",
        }))
        st.append(ppr)
        rpr = el(wtag("rPr"))
        font = "SourceHanSansCN-Bold" if bold else "SourceHanSansCN-Regular"
        rpr.append(el(wtag("rFonts"), {wtag("ascii"): font, wtag("hAnsi"): font, wtag("eastAsia"): font, wtag("cs"): font}))
        if bold:
            rpr.append(el(wtag("b")))
        if italic:
            rpr.append(el(wtag("i")))
        rpr.append(el(wtag("color"), {wtag("val"): "111827"}))
        rpr.append(el(wtag("sz"), {wtag("val"): str(size)}))
        st.append(rpr)
        styles_root.append(st)
    def add_char_style(style_id, name):
        if style_id in existing:
            return
        st = el(wtag("style"), {wtag("type"): "character", wtag("styleId"): style_id})
        st.append(el(wtag("name"), {wtag("val"): name}))
        rpr = el(wtag("rPr"))
        rpr.append(el(wtag("rFonts"), {wtag("ascii"): "Menlo", wtag("hAnsi"): "Menlo"}))
        rpr.append(el(wtag("color"), {wtag("val"): "1F2937"}))
        st.append(rpr)
        styles_root.append(st)

    add_loom_para_style("LoomBody", "织灵正文", 21, after=180, line=360)
    add_loom_para_style("LoomList", "织灵列表", 21, after=120, line=360)
    add_loom_para_style("LoomDocTitle1", "织灵文档标题1", 44, bold=True, after=260, line=504, outline=0)
    add_loom_para_style("LoomDocTitle2", "织灵文档标题2", 32, bold=True, after=180, line=415, outline=1)
    add_loom_para_style("LoomDocTitle3", "织灵文档标题3", 30, bold=True, after=160, line=384, outline=2)
    add_loom_para_style("LoomDocTitle4", "织灵文档标题4", 28, bold=True, after=140, line=360, outline=3)
    add_loom_para_style("LoomHeading1", "织灵正文标题1", 44, bold=True, before=320, after=200, line=504, outline=0)
    add_loom_para_style("LoomHeading2", "织灵正文标题2", 32, bold=True, before=280, after=160, line=415, outline=1)
    add_loom_para_style("LoomHeading3", "织灵正文标题3", 30, bold=True, before=240, after=140, line=384, outline=2)
    add_loom_para_style("LoomHeading4", "织灵正文标题4", 28, bold=True, before=220, after=120, line=360, outline=3)
    add_loom_para_style("LoomTableHeader", "织灵表格头", 21, bold=True, after=0, line=360)
    add_loom_para_style("LoomTableCell", "织灵表格正文", 20, after=0, line=360)
    add_loom_para_style("LoomTocTitle", "织灵目录标题", 44, bold=True, after=260, line=504)
    add_loom_para_style("LoomToc1", "织灵目录1", 20, bold=True, after=80, line=300)
    add_loom_para_style("LoomToc2", "织灵目录2", 20, after=70, line=300)
    add_loom_para_style("LoomToc3", "织灵目录3", 20, italic=True, after=60, line=300)
    add_loom_para_style("LoomToc4", "织灵目录4", 18, after=50, line=300)
    add_para_style("引用块", "引用块", fill="F3F6FA")
    add_para_style("提示块", "提示块", fill="EEF6FF")
    add_para_style("小贴士", "小贴士", fill="F1F8F2")
    add_para_style("注意块", "注意块", fill="FFF7E6")
    add_para_style("警告块", "警告块", fill="FDECEC")
    add_para_style("代码块", "代码块", fill="F6F8FA", mono=True)
    add_char_style("行内代码", "行内代码")


def toc_entry(page, style_ids):
    depth = min(max(page["depth"], 1), 4)
    p = paragraph(style_ids.get(f"LoomToc{depth}"))
    ppr = p.find(wtag("pPr"))
    if ppr is None:
        ppr = el(wtag("pPr"))
        p.insert(0, ppr)
    tabs = el(wtag("tabs"))
    tabs.append(el(wtag("tab"), {wtag("val"): "right", wtag("leader"): "dot", wtag("pos"): "8200"}))
    ppr.append(tabs)
    if depth > 1:
        ind = el(wtag("ind"), {wtag("left"): str((depth - 1) * 420)})
        ppr.append(ind)
    link = el(wtag("hyperlink"), {wtag("anchor"): page["bookmark"], wtag("history"): "1"})
    link.append(run_text(f'{page["number"]}. {page["title"]}'))
    p.append(link)
    p.append(tab_run())
    fld = el(wtag("fldSimple"), {wtag("instr"): f' PAGEREF {page["bookmark"]} \\h ', wtag("dirty"): "true"})
    fld.append(run_text(" "))
    p.append(fld)
    return p


def make_toc_field(style_ids, pages):
    p = paragraph(style_ids.get("LoomTocTitle"), [run_text("目录")])
    field = el(wtag("p"))
    for field_type, text in [
        ("begin", None),
        (None, ' TOC \\o "1-3" \\h \\z \\u '),
        ("separate", None),
        ("end", None),
    ]:
        r = el(wtag("r"))
        if field_type:
            r.append(el(wtag("fldChar"), {wtag("fldCharType"): field_type}))
        else:
            if text.startswith(" TOC"):
                r.append(el(wtag("instrText"), {f"{{http://www.w3.org/XML/1998/namespace}}space": "preserve"}, text))
            else:
                r.append(el(wtag("t"), None, text))
        field.append(r)
    return [p, field, *[toc_entry(page, style_ids) for page in pages]]


def paragraph_with_bookmark(style_id, text, bookmark_name, bookmark_id):
    p = paragraph(style_id)
    p.append(el(wtag("bookmarkStart"), {wtag("id"): str(bookmark_id), wtag("name"): bookmark_name}))
    p.append(run_text(text))
    p.append(el(wtag("bookmarkEnd"), {wtag("id"): str(bookmark_id)}))
    return p


def add_toc_numbers(pages):
    counters = [0, 0, 0, 0]
    for page in pages:
        depth = min(max(page["depth"], 1), 4)
        counters[depth - 1] += 1
        for index in range(depth, 4):
            counters[index] = 0
        page["number"] = ".".join(str(item) for item in counters[:depth] if item)


def replace_all_text(node, value):
    texts = node.findall(".//" + wtag("t"))
    if not texts:
        return
    texts[0].text = value
    for item in texts[1:]:
        item.text = ""


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


def assert_header_parts_preserved(template_path, temp_dir):
    with zipfile.ZipFile(template_path) as template_zip:
        for name in sorted(template_header_locked_entries(template_zip)):
            generated_path = temp_dir / name
            if not generated_path.exists() or generated_path.read_bytes() != template_zip.read(name):
                raise RuntimeError(
                    f"Locked template header part changed: {name}. "
                    "Do not parse, rewrite, recreate, resize, reposition, or replace any header part."
                )


def page_field_runs(rpr_template=None):
    runs = []
    begin = el(wtag("r"))
    begin.append(el(wtag("fldChar"), {wtag("fldCharType"): "begin"}))
    runs.append(begin)
    instr = el(wtag("r"))
    instr.append(el(wtag("instrText"), {f"{{http://www.w3.org/XML/1998/namespace}}space": "preserve"}, " PAGE "))
    runs.append(instr)
    end = el(wtag("r"))
    end.append(el(wtag("fldChar"), {wtag("fldCharType"): "end"}))
    runs.append(end)
    if rpr_template is not None:
        for run in runs:
            run.insert(0, copy.deepcopy(rpr_template))
    return runs


def footer_run(text, rpr_template=None):
    run = el(wtag("r"))
    if rpr_template is not None:
        run.append(copy.deepcopy(rpr_template))
    run.append(el(wtag("t"), {f"{{http://www.w3.org/XML/1998/namespace}}space": "preserve"}, text))
    return run


def tab_run(rpr_template=None):
    run = el(wtag("r"))
    if rpr_template is not None:
        run.append(copy.deepcopy(rpr_template))
    run.append(el(wtag("tab")))
    return run


def normalize_footer_page_field(footer_path):
    tree = ET.parse(footer_path)
    root = tree.getroot()
    first_para = root.find(wtag("p"))
    if first_para is None:
        first_para = el(wtag("p"))
        root.append(first_para)
    ppr = first_para.find(wtag("pPr"))
    rpr_template = first_para.find(".//" + wtag("rPr"))
    for child in list(first_para):
        if child is not ppr:
            first_para.remove(child)
    if ppr is None:
        ppr = el(wtag("pPr"))
        first_para.insert(0, ppr)
    first_para.extend([
        footer_run("版本：v1.0.0", rpr_template),
        tab_run(rpr_template),
        footer_run("Coda Intellect Tech Co., Ltd Confidential", rpr_template),
        tab_run(rpr_template),
        *page_field_runs(rpr_template),
    ])
    for extra in list(root)[1:]:
        root.remove(extra)
    tree.write(footer_path, encoding="utf-8", xml_declaration=True)


def normalize_sections_and_footers(temp_dir):
    document_path = temp_dir / "word/document.xml"
    doc_tree = ET.parse(document_path)
    doc_root = doc_tree.getroot()
    for sect in doc_root.findall(".//" + wtag("sectPr")):
        pg_num = sect.find(wtag("pgNumType"))
        if pg_num is None:
            pg_num = el(wtag("pgNumType"))
            sect.append(pg_num)
        pg_num.set(wtag("fmt"), "decimal")
        for attr in [wtag("start"), wtag("chapStyle"), wtag("chapSep")]:
            if attr in pg_num.attrib:
                del pg_num.attrib[attr]
    doc_tree.write(document_path, encoding="utf-8", xml_declaration=True)

    settings_path = temp_dir / "word/settings.xml"
    if settings_path.exists():
        settings_tree = ET.parse(settings_path)
        settings_root = settings_tree.getroot()
        update_fields = settings_root.find(wtag("updateFields"))
        if update_fields is None:
            update_fields = el(wtag("updateFields"))
            settings_root.append(update_fields)
        update_fields.set(wtag("val"), "true")
        settings_tree.write(settings_path, encoding="utf-8", xml_declaration=True)

    for footer_path in (temp_dir / "word").glob("footer*.xml"):
        if footer_path.name == "footer3.xml":
            continue
        normalize_footer_page_field(footer_path)


def parse_cli(argv):
    parser = argparse.ArgumentParser(
        description="Generate the editable 织灵 product handbook DOCX from cached/refreshed online handbook content."
    )
    parser.add_argument("--template", default=str(TEMPLATE), help="Company Word template DOCX. Default: assets/company-template.docx")
    parser.add_argument("--source-html", default=str(SOURCE_HTML), help="Cached semantic handbook HTML.")
    parser.add_argument("--order", default=str(ORDER_JSON), help="Cached online handbook order JSON.")
    parser.add_argument("--output-dir", default=str(OUT_DIR), help="Output directory. Default: dist")
    parser.add_argument("--filename", default=OUT_DOCX.name, help="Output DOCX filename.")
    parser.add_argument("--sample-docs", type=int, default=0, help="Generate only the first N document nodes for layout review.")
    parser.add_argument("--refresh", action="store_true", help="Refresh online handbook cache before generating.")
    return parser.parse_args(argv)


def main():
    global TEMPLATE, SOURCE_HTML, ORDER_JSON, OUT_DIR, OUT_DOCX, SAMPLE_DOCS, REFRESH_SOURCE
    cli = parse_cli(sys.argv[1:])
    TEMPLATE = Path(cli.template).expanduser().resolve()
    SOURCE_HTML = Path(cli.source_html).expanduser().resolve()
    ORDER_JSON = Path(cli.order).expanduser().resolve()
    OUT_DIR = Path(cli.output_dir).expanduser().resolve()
    OUT_DOCX = OUT_DIR / cli.filename
    SAMPLE_DOCS = max(cli.sample_docs, 0)
    REFRESH_SOURCE = bool(cli.refresh)

    if not TEMPLATE.exists():
        raise FileNotFoundError(f"Company Word template is missing: {TEMPLATE}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    temp_dir = OUT_DIR / "_word_docx_unzip"
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    with zipfile.ZipFile(TEMPLATE) as z:
        z.extractall(temp_dir)

    document_path = temp_dir / "word/document.xml"
    styles_path = temp_dir / "word/styles.xml"
    rels_path = temp_dir / "word/_rels/document.xml.rels"

    styles_root = ET.parse(styles_path).getroot()
    add_custom_styles(styles_root)
    style_ids = get_style_ids(ET.tostring(styles_root, encoding="utf-8"))
    style_ids.update({
        "引用块": "引用块",
        "提示块": "提示块",
        "小贴士": "小贴士",
        "注意块": "注意块",
        "警告块": "警告块",
        "代码块": "代码块",
        "行内代码": "行内代码",
        "LoomBody": "LoomBody",
        "LoomList": "LoomList",
        "LoomDocTitle1": "LoomDocTitle1",
        "LoomDocTitle2": "LoomDocTitle2",
        "LoomDocTitle3": "LoomDocTitle3",
        "LoomDocTitle4": "LoomDocTitle4",
        "LoomHeading1": "LoomHeading1",
        "LoomHeading2": "LoomHeading2",
        "LoomHeading3": "LoomHeading3",
        "LoomHeading4": "LoomHeading4",
        "LoomTableHeader": "LoomTableHeader",
        "LoomTableCell": "LoomTableCell",
        "LoomTocTitle": "LoomTocTitle",
        "LoomToc1": "LoomToc1",
        "LoomToc2": "LoomToc2",
        "LoomToc3": "LoomToc3",
        "LoomToc4": "LoomToc4",
    })
    ET.ElementTree(styles_root).write(styles_path, encoding="utf-8", xml_declaration=True)

    rels_tree = ET.parse(rels_path)
    rels = Relationships(rels_tree.getroot())
    media = []

    doc_tree = ET.parse(document_path)
    body = doc_tree.getroot().find(wtag("body"))
    original_children = list(body)
    prefix = [copy.deepcopy(child) for child in original_children[:11]]
    for child in prefix:
        text = "".join(t.text or "" for t in child.findall(".//" + wtag("t")))
        if "文档标题封面" in text:
            replace_all_text(child, "织灵产品使用手册")
    final_sect = copy.deepcopy(original_children[-1])

    pages = parse_sections()
    add_toc_numbers(pages)
    for i, page in enumerate(pages, start=1):
        page["bookmark"] = f"_LoomToc{i}"
        page["bookmark_id"] = 1000 + i
    new_children = prefix + make_toc_field(style_ids, pages)
    for i, page in enumerate(pages, start=1):
        title_style = style_ids.get(f"LoomDocTitle{min(max(page['depth'], 1), 4)}")
        new_children.append(paragraph_with_bookmark(title_style, page["title"], page["bookmark"], page["bookmark_id"]))
        new_children.extend(blocks_from_node(page["root"], style_ids, rels, media))
        if i == len(pages):
            break
    new_children.append(final_sect)

    for child in list(body):
        body.remove(child)
    for child in new_children:
        body.append(child)
    doc_tree.write(document_path, encoding="utf-8", xml_declaration=True)
    rels_tree.write(rels_path, encoding="utf-8", xml_declaration=True)

    media_dir = temp_dir / "word/media"
    for source, target in media:
        shutil.copyfile(source, temp_dir / "word" / target)
    assert_header_parts_preserved(TEMPLATE, temp_dir)
    normalize_sections_and_footers(temp_dir)

    if OUT_DOCX.exists():
        OUT_DOCX.unlink()
    with zipfile.ZipFile(OUT_DOCX, "w", zipfile.ZIP_DEFLATED) as z:
        for path in temp_dir.rglob("*"):
            if path.is_file():
                z.write(path, path.relative_to(temp_dir).as_posix())
    print(OUT_DOCX)


if __name__ == "__main__":
    main()
