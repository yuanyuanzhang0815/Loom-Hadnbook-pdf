#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { PDFDocument } = require("pdf-lib");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_START =
  "https://loom.aicoda.tech/handbook/docs/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D";
const args = parseArgs(process.argv.slice(2));
const startUrl = args["start-url"] || DEFAULT_START;
const workDir = path.resolve(args["work-dir"] || path.join(ROOT, "work-template"));
const outputDir = path.resolve(args["output-dir"] || path.join(ROOT, "output"));
const sourceHtml = path.resolve(args["source-html"] || path.join(ROOT, "work-online", "online-handbook.html"));
const orderPath = path.resolve(args["order"] || path.join(ROOT, "work-online", "online-order.json"));
const headerImage = path.join(ROOT, "assets", "company-logo.png");
const samplePages = args["sample-pages"] ? Number(args["sample-pages"]) : 0;
const filename =
  args.filename ||
  (samplePages > 0 ? `织灵产品使用手册-模板版前${samplePages}页样稿.pdf` : "织灵产品使用手册.pdf");
const lastUpdated = args["last-updated"] || "2026.05.28";
const sourceHanRegular = path.join(ROOT, "assets", "fonts", "SourceHanSansCN-Regular.ttf");
const sourceHanBold = path.join(ROOT, "assets", "fonts", "SourceHanSansCN-Bold.ttf");
const appleColorEmoji = path.join(ROOT, "assets", "fonts", "AppleColorEmoji.ttf");

fs.mkdirSync(workDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});

async function main() {
  if (!fs.existsSync(headerImage)) {
    throw new Error(`Required company logo asset is missing: ${headerImage}`);
  }
  if (!fs.existsSync(sourceHanRegular) || !fs.existsSync(sourceHanBold) || !fs.existsSync(appleColorEmoji)) {
    throw new Error(`Required PDF fonts are missing: ${sourceHanRegular}, ${sourceHanBold}, ${appleColorEmoji}`);
  }
  ensureSourceCache();
  const pages = readCachedPages(sourceHtml, orderPath);
  if (!pages.length) throw new Error("No cached handbook sections were found.");
  const semanticClean = await cleanPagesToSemanticHtml(pages);

  const preflightHtml = buildHtml(pages, lastUpdated, {});
  const preflightHtmlPath = path.join(workDir, "template-review-preflight.html");
  const preflightPdfPath = path.join(workDir, "template-review-preflight.pdf");
  fs.writeFileSync(preflightHtmlPath, preflightHtml, "utf8");

  await renderPdf(preflightHtmlPath, preflightPdfPath);
  const tocPageNumbers = extractDestinationPageNumbers(preflightPdfPath, pages.length);

  const html = buildHtml(pages, lastUpdated, tocPageNumbers);
  const htmlPath = path.join(workDir, "template-review.html");
  const fullDraftPath = path.join(workDir, "template-review-draft.pdf");
  const sampleDraftPath = path.join(workDir, "template-review-sample-draft.pdf");
  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(htmlPath, html, "utf8");

  await renderPdf(htmlPath, fullDraftPath);
  if (samplePages > 0) {
    await slicePdf(fullDraftPath, sampleDraftPath, samplePages);
    await addTemplateHeaderFooter(sampleDraftPath, outputPath);
  } else {
    await addTemplateHeaderFooter(fullDraftPath, outputPath);
  }
  normalizePdfFontNames(outputPath);

  const outputDoc = await PDFDocument.load(fs.readFileSync(outputPath));
  const fullDoc = await PDFDocument.load(fs.readFileSync(fullDraftPath));
  const report = {
    output: outputPath,
    html: htmlPath,
    source: startUrl,
    sourceHtml,
    documents: pages.length,
    renderedFullPages: fullDoc.getPageCount(),
    outputPages: outputDoc.getPageCount(),
    samplePages: samplePages > 0 ? outputDoc.getPageCount() : null,
    tocPageNumbers: Object.keys(tocPageNumbers).length,
    template: {
      source: "/Users/yuanyuanzhang/Desktop/可达智灵通用文档模板(2).docx",
      margins: "top/bottom 72pt, left/right 90pt",
      headerFooterMargin: "header 42.55pt, footer 49.6pt",
      bodyFont: "SourceHanSansCN-Regular 10.5pt, line-height 1.5",
      heading: "模板标题层级：h1 22pt, h2 16pt, h3 15pt, h4 14pt",
      toc: "single-column vertical, dotted leaders, page numbers",
      headerLogo: "matches cover header: img width 63pt, top 32pt, header line top 55pt",
    },
    semanticClean,
  };
  fs.writeFileSync(
    path.join(outputDir, "template-review-generation-report.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(report, null, 2));
}

function ensureSourceCache() {
  const hasCache = fs.existsSync(sourceHtml) && fs.existsSync(orderPath);
  if (hasCache && !args.refresh) return;
  if (args["source-html"] || args.order) {
    throw new Error(
      `Cached source files are missing. sourceHtml=${sourceHtml}, order=${orderPath}. ` +
        "Do not invent content; provide valid cached files or omit --source-html/--order to let the raw crawler refresh.",
    );
  }

  const rawScript = path.join(__dirname, "generate_raw_handbook_pdf.mjs");
  if (!fs.existsSync(rawScript)) {
    throw new Error(`Raw crawler script is missing: ${rawScript}`);
  }

  fs.mkdirSync(path.dirname(sourceHtml), { recursive: true });
  fs.mkdirSync(path.join(workDir, "raw-output"), { recursive: true });
  execFileSync(
    process.execPath,
    [
      rawScript,
      "--start-url",
      startUrl,
      "--work-dir",
      path.dirname(sourceHtml),
      "--output-dir",
      path.join(workDir, "raw-output"),
      "--filename",
      "_raw-cache.pdf",
      "--no-footer",
      "--last-updated",
      lastUpdated,
    ],
    { stdio: "inherit", maxBuffer: 1024 * 1024 * 50 },
  );

  if (!fs.existsSync(sourceHtml) || !fs.existsSync(orderPath)) {
    throw new Error(`Raw crawler finished but cache is still missing: ${sourceHtml}, ${orderPath}`);
  }
}

function readCachedPages(htmlPath, orderJsonPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const order = fs.existsSync(orderJsonPath) ? JSON.parse(fs.readFileSync(orderJsonPath, "utf8")) : [];
  const pages = [];
  const sectionPattern =
    /<section class="([^"]*)" id="doc-(\d+)" data-title="([^"]*)">\s*<div class="online-article markdown">([\s\S]*?)<\/div>\s*<\/section>/g;

  for (const match of html.matchAll(sectionPattern)) {
    const index = Number(match[2]);
    const ordered = order[index] || {};
    pages.push({
      index,
      title: decodeHtml(match[3]),
      depth: Number(ordered.depth || 1),
      topTitle: topTitleForUrl(ordered.url, decodeHtml(match[3])),
      article: stripPageChrome(match[4]),
    });
  }

  return pages.sort((a, b) => a.index - b.index);
}

function stripPageChrome(article) {
  return article
    .replace(/<header>\s*<h1>[\s\S]*?<\/h1>\s*<\/header>/g, "")
    .replace(/<p>\s*来源：[\s\S]*?<\/p>/g, "");
}

async function cleanPagesToSemanticHtml(pages) {
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
    args: ["--allow-file-access-from-files"],
  });
  const page = await browser.newPage();

  for (const handbookPage of pages) {
    handbookPage.article = await page.evaluate(
      ({ html, title }) => {
        const template = document.createElement("template");
        template.innerHTML = html;

        const allowedTags = new Set([
          "h1",
          "h2",
          "h3",
          "h4",
          "p",
          "ul",
          "ol",
          "li",
          "table",
          "thead",
          "tbody",
          "tr",
          "th",
          "td",
          "img",
          "pre",
          "code",
          "a",
        ]);
        const dropTags = new Set([
          "script",
          "style",
          "noscript",
          "iframe",
          "button",
          "nav",
          "form",
          "input",
          "select",
          "textarea",
          "svg",
          "canvas",
        ]);

        function appendCleanChildren(source, target) {
          for (const child of Array.from(source.childNodes)) {
            const cleaned = cleanNode(child);
            if (cleaned) target.appendChild(cleaned);
          }
        }

        function isEmptyElement(element) {
          if (element.tagName === "IMG") return false;
          return !element.textContent.replace(/\s+/g, "").trim() && !element.querySelector?.("img,table");
        }

        function normalizeTextForPdfFonts(text) {
          return text
            .replace(/\u00a0/g, " ")
            .replace(/\uFE0F/g, "")
            .replace(/[\u2E80-\u2EFF\u2F00-\u2FDF\uF900-\uFAFF]/g, (char) => char.normalize("NFKC"));
        }

        function cleanNode(node) {
          if (node.nodeType === Node.TEXT_NODE) {
            return document.createTextNode(normalizeTextForPdfFonts(node.textContent));
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return null;

          const sourceTag = node.tagName.toLowerCase();
          if (dropTags.has(sourceTag)) return document.createDocumentFragment();

          if (sourceTag === "br") {
            return document.createTextNode("\n");
          }

          if (/^h[1-6]$/.test(sourceTag)) {
            const level = Math.min(Number(sourceTag.slice(1)), 4);
            const heading = document.createElement(`h${level}`);
            appendCleanChildren(node, heading);
            return isEmptyElement(heading) ? document.createDocumentFragment() : heading;
          }

          if (sourceTag === "img") {
            const src = node.getAttribute("src") || node.currentSrc || "";
            if (!src) return document.createDocumentFragment();
            const img = document.createElement("img");
            img.setAttribute("src", src);
            const alt = node.getAttribute("alt");
            if (alt) img.setAttribute("alt", alt);
            return img;
          }

          if (sourceTag === "a") {
            const href = node.getAttribute("href") || "";
            const link = href ? document.createElement("a") : document.createDocumentFragment();
            if (href && !href.toLowerCase().startsWith("javascript:")) {
              link.setAttribute("href", href);
            }
            appendCleanChildren(node, link);
            return link;
          }

          if (sourceTag === "pre") {
            const pre = document.createElement("pre");
            const code = document.createElement("code");
            code.textContent = node.textContent.replace(/\n+$/g, "");
            pre.appendChild(code);
            return pre;
          }

          if (sourceTag === "code") {
            const code = document.createElement("code");
            code.textContent = node.textContent;
            return code;
          }

          if (allowedTags.has(sourceTag)) {
            const element = document.createElement(sourceTag);
            if (sourceTag === "td" || sourceTag === "th") {
              for (const attrName of ["colspan", "rowspan"]) {
                const value = node.getAttribute(attrName);
                if (/^[1-9]\d*$/.test(value || "")) element.setAttribute(attrName, value);
              }
            }
            appendCleanChildren(node, element);
            return isEmptyElement(element) ? document.createDocumentFragment() : element;
          }

          const fragment = document.createDocumentFragment();
          appendCleanChildren(node, fragment);
          return fragment;
        }

        const output = document.createElement("div");
        appendCleanChildren(template.content, output);

        const firstHeading = output.querySelector("h1,h2,h3,h4");
        if (firstHeading && firstHeading.textContent.trim() === title.trim()) {
          firstHeading.remove();
        }

        output.querySelectorAll("p,li,th,td,h1,h2,h3,h4").forEach((element) => {
          element.normalize();
        });

        return output.innerHTML;
      },
      { html: handbookPage.article, title: handbookPage.title },
    );
  }

  await browser.close();

  const allowedTags = [
    "h1",
    "h2",
    "h3",
    "h4",
    "p",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "img",
    "pre",
    "code",
    "a",
  ];
  const violations = findSemanticViolations(pages, allowedTags);
  if (violations.length) {
    throw new Error(`Semantic HTML cleanup failed: ${JSON.stringify(violations.slice(0, 12), null, 2)}`);
  }
  return {
    enabled: true,
    allowedTags,
    removed: ["class", "style", "data-*", "Docusaurus containers", "navigation/header/footer/theme css"],
    violations,
  };
}

function findSemanticViolations(pages, allowedTags) {
  const allowed = new Set(allowedTags);
  const violations = [];
  for (const page of pages) {
    const html = page.article;
    for (const match of html.matchAll(/<\s*(\/)?\s*([a-z0-9-]+)([^>]*)>/gi)) {
      if (match[1]) continue;
      const tag = match[2].toLowerCase();
      if (!allowed.has(tag)) violations.push({ page: page.title, type: "tag", tag });
      for (const attrMatch of match[3].matchAll(/\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)=/g)) {
        const attr = attrMatch[1].toLowerCase();
        const allowedAttr =
          (tag === "a" && attr === "href") ||
          (tag === "img" && ["src", "alt"].includes(attr)) ||
          (["td", "th"].includes(tag) && ["colspan", "rowspan"].includes(attr));
        if (!allowedAttr) violations.push({ page: page.title, type: "attribute", tag, attr });
      }
    }
  }
  return violations;
}

function topTitleForUrl(url, fallback) {
  if (!url) return fallback || "";
  const pathName = decodeURIComponent(new URL(url).pathname);
  const parts = pathName.replace(/^\/handbook\/docs\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "功能介绍") return "功能介绍";
  if (parts[0] === "使用案例") return "使用案例";
  return parts[0] || fallback || "";
}

function buildHtml(pages, updatedAt, tocPageNumbers) {
  const tocItems = pages
    .map((page) => {
      const depth = Math.max(0, page.depth - 1);
      const pageNo = tocPageNumbers[String(page.index)] || "";
      return `<li class="toc-depth-${depth}">
        <a href="#doc-${page.index}">
          <span class="toc-title">${escapeHtml(page.title)}</span>
          <span class="toc-leader"></span>
          <span class="toc-page-number">${escapeHtml(pageNo)}</span>
        </a>
      </li>`;
    })
    .join("\n");

  const body = pages
    .map((page) => `<section class="doc-section depth-${Math.min(page.depth, 4)}" id="doc-${page.index}">
      <h1 class="doc-title">${escapeHtml(page.title)}</h1>
      <div class="article-body">${page.article}</div>
    </section>`)
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>织灵产品使用手册</title>
  <style>${templateCss()}</style>
</head>
<body>
  ${buildCover(updatedAt)}
  <section class="toc-section">
    <h1>目录</h1>
    <ol>${tocItems}</ol>
  </section>
  <main class="content-flow">${body}</main>
</body>
</html>`;
}

function templateCss() {
  return `
    @font-face {
      font-family: "SourceHanSansCN-Regular";
      src: url("${pathToFileURL(sourceHanRegular).href}") format("truetype");
      font-weight: 400;
    }
    @font-face {
      font-family: "SourceHanSansCN-Bold";
      src: url("${pathToFileURL(sourceHanBold).href}") format("truetype");
      font-weight: 700;
    }
    @font-face {
      font-family: "AppleColorEmoji";
      src: url("${pathToFileURL(appleColorEmoji).href}") format("truetype");
      font-weight: 400;
    }
    @font-face {
      font-family: "AppleColorEmoji";
      src: url("${pathToFileURL(appleColorEmoji).href}") format("truetype");
      font-weight: 700;
    }
    @page { size: A4; margin: 72pt 90pt; }
    @page coverPage { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      color: #111827;
      background: #fff;
      font-family: "SourceHanSansCN-Regular", "AppleColorEmoji";
      font-weight: 400;
      font-size: 10.5pt;
      line-height: 1.5;
      text-align: justify;
      text-justify: inter-ideograph;
    }
    a { color: #1d4ed8; text-decoration: none; }
    .cover {
      page: coverPage;
      position: relative;
      width: 210mm;
      height: 297mm;
      overflow: hidden;
      break-after: page;
      background: #fff;
    }
    .cover-first-header {
      position: absolute;
      left: 90pt;
      right: 90pt;
      top: 0;
      height: 72pt;
    }
    .cover-first-header img {
      position: absolute;
      right: 0;
      top: 32pt;
      width: 63pt;
      height: auto;
    }
    .cover-first-header::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 55pt;
      height: 0;
      border-top: .4pt solid #9ca3af;
    }
    .cover-section0 {
      position: absolute;
      left: 90pt;
      right: 90pt;
      top: 72pt;
      bottom: 72pt;
      color: #000;
      font-family: "SourceHanSansCN-Bold", "AppleColorEmoji";
      font-weight: 700;
      font-size: 24pt;
      line-height: 2;
      text-align: center;
    }
    .cover-doc-title-p {
      margin: 18pt 0 9pt;
      line-height: 200%;
      text-align: center;
      font-size: 24pt;
      font-weight: 700;
    }
    .cover-doc-title-p.cover-number {
      text-align: right;
      word-break: break-all;
    }
    .cover-doc-title-p.cover-secret-row {
      margin-left: 252pt;
      text-indent: 31.55pt;
      text-align: justify;
      text-justify: inter-ideograph;
    }
    .cover-field-label {
      font-family: "SourceHanSansCN-Bold", "AppleColorEmoji";
      font-size: 10.5pt;
      font-weight: 700;
      line-height: 200%;
    }
    .cover-underline {
      display: inline-block;
      width: 84pt;
      height: 0;
      border-bottom: 1pt solid #000;
      vertical-align: middle;
    }
    .cover-title-template {
      margin: 0;
      text-align: center;
      color: #000;
      font-family: "SourceHanSansCN-Bold", "AppleColorEmoji";
      font-size: 42pt;
      line-height: 1.25;
      font-weight: 700;
      letter-spacing: 0;
    }
    .cover-template-spacer {
      margin: 18pt 0 9pt;
      line-height: 200%;
      font-size: 24pt;
      font-weight: 700;
    }
    .cover-first-footer {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 49.6pt;
      color: #777;
      text-align: center;
      font-family: "SourceHanSansCN-Regular", "AppleColorEmoji";
      font-size: 8pt;
      line-height: 1.45;
    }
    .toc-section {
      break-after: page;
      min-height: 153mm;
    }
    .toc-section h1 {
      margin: 0 0 18pt;
      text-align: center;
      font-family: "SourceHanSansCN-Bold", "AppleColorEmoji";
      font-size: 22pt;
      line-height: 2.4;
      color: #111827;
    }
    .toc-section ol {
      list-style: none;
      margin: 0;
      padding: 0;
      column-count: 1;
    }
    .toc-section li {
      break-inside: avoid;
      padding: 4pt 0 3pt;
      font-family: "SourceHanSansCN-Regular", "AppleColorEmoji";
      font-size: 10pt;
      line-height: 1.35;
    }
    .toc-section a {
      display: flex;
      align-items: baseline;
      gap: 7pt;
      color: #111827;
    }
    .toc-title { min-width: 0; overflow-wrap: anywhere; }
    .toc-leader {
      flex: 1 1 auto;
      min-width: 28pt;
      border-bottom: 1px dotted #9ca3af;
      transform: translateY(-3pt);
    }
    .toc-page-number {
      flex: 0 0 auto;
      width: 22pt;
      text-align: right;
      color: #111827;
    }
    .toc-section li.toc-depth-0 { font-family: "SourceHanSansCN-Bold", "AppleColorEmoji"; font-weight: 700; }
    .toc-depth-1 { padding-left: 18pt !important; }
    .toc-depth-2 { padding-left: 34pt !important; font-size: 9.5pt !important; }
    .toc-depth-3 { padding-left: 50pt !important; font-size: 9pt !important; }
    .content-flow {
      padding: 0;
    }
    .doc-section {
      margin: 0 0 18pt;
      break-inside: auto;
    }
    .doc-section + .doc-section {
      margin-top: 20pt;
      padding-top: 10pt;
    }
    .doc-section.depth-1 {
      break-before: page;
      border-top: 0;
      padding-top: 0;
    }
    .toc-section + .content-flow .doc-section:first-child {
      break-before: auto;
    }
    .doc-title {
      margin: 0 0 13pt;
      color: #111827;
      font-family: "SourceHanSansCN-Bold", "AppleColorEmoji";
      font-weight: 700;
      font-size: 22pt;
      line-height: 2.1;
      text-align: left;
      page-break-after: avoid;
    }
    .doc-section.depth-2 .doc-title { font-size: 16pt; line-height: 1.73; margin-bottom: 9pt; }
    .doc-section.depth-3 .doc-title { font-size: 15pt; line-height: 1.6; margin-bottom: 8pt; }
    .doc-section.depth-4 .doc-title { font-size: 14pt; line-height: 1.5; margin-bottom: 7pt; }
    .article-body :is(h1, h2, h3, h4):first-child { display: none; }
    .article-body h1,
    .article-body h2,
    .article-body h3,
    .article-body h4 {
      font-family: "SourceHanSansCN-Bold", "AppleColorEmoji";
      font-weight: 700;
      text-align: left;
      page-break-after: avoid;
    }
    .article-body h1 { font-size: 22pt; line-height: 2.1; margin: 16pt 0 10pt; }
    .article-body h2 { font-size: 16pt; line-height: 1.73; margin: 14pt 0 8pt; }
    .article-body h3 { font-size: 15pt; line-height: 1.6; margin: 12pt 0 7pt; }
    .article-body h4 { font-size: 14pt; line-height: 1.5; margin: 11pt 0 6pt; }
    .article-body p {
      margin: 0 0 9pt;
      line-height: 1.5;
      orphans: 2;
      widows: 2;
    }
    .article-body ul,
    .article-body ol {
      margin: 0 0 10pt;
      padding-left: 21pt;
    }
    .article-body li { margin: 3pt 0; }
    .article-body img {
      display: block;
      max-width: 100%;
      max-height: 455pt;
      height: auto;
      margin: 12pt auto;
      object-fit: contain;
      page-break-inside: avoid;
    }
    .article-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 12pt 0;
      font-size: 10pt;
      page-break-inside: avoid;
    }
    .article-body th,
    .article-body td {
      border: .5pt solid #111827;
      padding: 5.4pt;
      vertical-align: top;
    }
    .article-body th {
      background: rgb(208,206,206);
      font-family: "SourceHanSansCN-Bold", "AppleColorEmoji";
      font-size: 10.5pt;
      font-weight: 700;
    }
    .article-body table td:first-child {
      font-family: "SourceHanSansCN-Regular", "AppleColorEmoji";
    }
    .article-body pre {
      white-space: pre-wrap;
      margin: 10pt 0;
      padding: 8pt 10pt;
      border: .5pt solid #d1d5db;
      background: #f9fafb;
      font: 8.8pt/1.45 "SourceHanSansCN-Regular", "AppleColorEmoji";
      page-break-inside: avoid;
    }
    .article-body code {
      font-family: "SourceHanSansCN-Regular", "AppleColorEmoji";
      font-size: .92em;
    }
  `;
}

function buildCover(updatedAt) {
  return `<section class="cover">
    <div class="cover-first-header">
      <img src="${pathToFileURL(headerImage).href}" alt="可达智灵">
    </div>
    <div class="cover-section0">
      <p class="cover-doc-title-p cover-number"><span class="cover-field-label">编号：</span><span class="cover-underline"></span></p>
      <p class="cover-doc-title-p cover-secret-row"><span class="cover-field-label">密级：</span><span class="cover-underline"></span></p>
      <p class="cover-template-spacer">&nbsp;</p>
      <p class="cover-template-spacer">&nbsp;</p>
      <p class="cover-doc-title-p"><span class="cover-title-template">织灵产品使用手册</span></p>
    </div>
    <div class="cover-first-footer">
      <div>内部资料&nbsp;&nbsp;禁止公开</div>
      <div>Coda Intellect Tech Co., Ltd Confidential</div>
    </div>
  </section>`;
}

async function renderPdf(htmlPath, pdfPath) {
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
    args: ["--allow-file-access-from-files"],
  });
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  const imageStatus = await waitForImages(page);
  if (imageStatus.broken.length) {
    await browser.close();
    throw new Error(`Images failed to render: ${JSON.stringify(imageStatus.broken.slice(0, 8), null, 2)}`);
  }
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
  });
  await browser.close();
}

async function waitForImages(page) {
  return page.evaluate(async () => {
    const images = Array.from(document.images);
    await Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) return resolve();
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
            setTimeout(resolve, 15000);
          }),
      ),
    );
    return {
      total: images.length,
      broken: images
        .filter((img) => !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0)
        .map((img) => ({ src: img.currentSrc || img.src, alt: img.alt || "" })),
    };
  });
}

function extractDestinationPageNumbers(inputPdfPath, count) {
  const pythonPath = findPython();
  const extractScript = path.join(__dirname, "extract_pdf_dest_pages.py");
  const raw = execFileSync(pythonPath, [extractScript, "--pdf", inputPdfPath, "--count", String(count)], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(raw);
}

async function slicePdf(inputPath, outputPath, maxPages) {
  const input = await PDFDocument.load(fs.readFileSync(inputPath));
  const output = await PDFDocument.create();
  const count = Math.min(maxPages, input.getPageCount());
  const copied = await output.copyPages(input, Array.from({ length: count }, (_, index) => index));
  for (const page of copied) output.addPage(page);
  fs.writeFileSync(outputPath, await output.save());
}

async function addTemplateHeaderFooter(inputPath, outputPath) {
  const sourceBytes = fs.readFileSync(inputPath);
  const sourceDoc = await PDFDocument.load(sourceBytes);
  const pageCount = sourceDoc.getPageCount();
  const overlayHtmlPath = path.join(workDir, "template-header-footer-overlay.html");
  const overlayPdfPath = path.join(workDir, "template-header-footer-overlay.pdf");

  fs.writeFileSync(overlayHtmlPath, buildHeaderFooterOverlayHtml(pageCount), "utf8");
  await renderOverlayPdf(overlayHtmlPath, overlayPdfPath);

  const overlayBytes = fs.readFileSync(overlayPdfPath);
  for (let index = 1; index < pageCount; index += 1) {
    const page = sourceDoc.getPage(index);
    const [overlayPage] = await sourceDoc.embedPdf(overlayBytes, [index]);
    page.drawPage(overlayPage, {
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
    });
  }

  fs.writeFileSync(outputPath, await sourceDoc.save());
}

function buildHeaderFooterOverlayHtml(pageCount) {
  const pages = Array.from({ length: pageCount }, (_, index) => {
    const pageNo = index + 1;
    if (pageNo === 1) return `<section class="overlay-page"></section>`;
    return `<section class="overlay-page">
      <div class="header-title">织灵产品使用手册</div>
      <img class="header-logo" src="${pathToFileURL(headerImage).href}" alt="可达智灵">
      <div class="header-line"></div>
      <div class="footer-version">版本： v1.0.0</div>
      <div class="footer-company">Coda Intellect Tech Co., Ltd Confidential</div>
      <div class="footer-page">${pageNo}</div>
    </section>`;
  }).join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>
    @font-face {
      font-family: "SourceHanSansCN-Regular";
      src: url("${pathToFileURL(sourceHanRegular).href}") format("truetype");
      font-weight: 400;
    }
    @font-face {
      font-family: "AppleColorEmoji";
      src: url("${pathToFileURL(appleColorEmoji).href}") format("truetype");
      font-weight: 400;
    }
    @font-face {
      font-family: "AppleColorEmoji";
      src: url("${pathToFileURL(appleColorEmoji).href}") format("truetype");
      font-weight: 700;
    }
    @page { size: A4; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      font-family: "SourceHanSansCN-Regular", "AppleColorEmoji";
      font-weight: 400;
    }
    .overlay-page {
      position: relative;
      width: 210mm;
      height: 297mm;
      break-after: page;
      background: transparent;
      overflow: hidden;
    }
    .header-title {
      position: absolute;
      left: 90pt;
      top: 38.5pt;
      color: #1f2937;
      font-size: 9pt;
      line-height: 1;
      white-space: nowrap;
    }
    .header-logo {
      position: absolute;
      right: 90pt;
      top: 32pt;
      width: 63pt;
      height: auto;
    }
    .header-line {
      position: absolute;
      left: 90pt;
      right: 90pt;
      top: 55pt;
      height: 0;
      border-top: .4pt solid #9ca3af;
    }
    .footer-version {
      position: absolute;
      left: 90pt;
      bottom: 36pt;
      color: #4472c4;
      font-size: 9pt;
      line-height: 1;
      white-space: nowrap;
    }
    .footer-company {
      position: absolute;
      left: 90pt;
      right: 90pt;
      bottom: 36pt;
      color: #1f2937;
      font-size: 8.2pt;
      line-height: 1;
      text-align: center;
      white-space: nowrap;
    }
    .footer-page {
      position: absolute;
      right: 90pt;
      bottom: 36pt;
      color: #1f2937;
      font-size: 9pt;
      line-height: 1;
      text-align: right;
      white-space: nowrap;
    }
  </style>
</head>
<body>${pages}</body>
</html>`;
}

async function renderOverlayPdf(htmlPath, pdfPath) {
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
    args: ["--allow-file-access-from-files"],
  });
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  const imageStatus = await waitForImages(page);
  if (imageStatus.broken.length) {
    await browser.close();
    throw new Error(`Header/footer images failed to render: ${JSON.stringify(imageStatus.broken.slice(0, 8), null, 2)}`);
  }
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    omitBackground: true,
  });
  await browser.close();
}

function findPython() {
  const bundled = path.join(
    os.homedir(),
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3",
  );
  return fs.existsSync(bundled) ? bundled : "python3";
}

function normalizePdfFontNames(pdfPath) {
  const pythonPath = findPython();
  const script = path.join(__dirname, "normalize_pdf_font_names.py");
  execFileSync(pythonPath, [script, "--pdf", pdfPath], {
    stdio: "pipe",
    maxBuffer: 1024 * 1024 * 10,
  });
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function decodeHtml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
