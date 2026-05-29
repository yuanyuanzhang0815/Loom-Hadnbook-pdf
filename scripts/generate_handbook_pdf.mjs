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
  ensureSourceCache();
  const pages = readCachedPages(sourceHtml, orderPath);
  if (!pages.length) throw new Error("No cached handbook sections were found.");

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
  const pdfPath = path.join(outputDir, filename);
  fs.writeFileSync(htmlPath, html, "utf8");

  await renderPdf(htmlPath, fullDraftPath);
  if (samplePages > 0) {
    await slicePdf(fullDraftPath, sampleDraftPath, samplePages);
    addTemplateHeaderFooter(sampleDraftPath, pdfPath);
  } else {
    addTemplateHeaderFooter(fullDraftPath, pdfPath);
  }

  const outputDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
  const fullDoc = await PDFDocument.load(fs.readFileSync(fullDraftPath));
  const report = {
    output: pdfPath,
    html: htmlPath,
    source: startUrl,
    sourceHtml,
    documents: pages.length,
    renderedFullPages: fullDoc.getPageCount(),
    outputPages: outputDoc.getPageCount(),
    samplePages: samplePages > 0 ? outputDoc.getPageCount() : null,
    tocPageNumbers: Object.keys(tocPageNumbers).length,
    template: {
      source: "可达智灵通用文档模板.html / Section0 cover and document styles",
      margins: "top/bottom 72pt, left/right 90pt",
      headerFooterMargin: "header 42.55pt, footer 49.6pt",
      bodyFont: "华文楷体 10.5pt, line-height 1.5",
      heading: "黑体 h1 22pt, h2 16pt, h3 15pt, h4 14pt",
      toc: "single-column vertical, dotted leaders, page numbers",
      logo: "assets/company-logo.png only",
    },
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
      article: sanitizeArticle(match[4]),
    });
  }

  return pages.sort((a, b) => a.index - b.index);
}

function sanitizeArticle(article) {
  return article
    .replace(/<header>\s*<h1>[\s\S]*?<\/h1>\s*<\/header>/g, "")
    .replace(/<p>\s*来源：[\s\S]*?<\/p>/g, "");
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
      <div class="online-article markdown">${page.article}</div>
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
      font-family: "TemplateKai";
      src: url("${pathToFileURL(path.join(os.homedir(), "Library/Fonts/华文楷体.ttf")).href}") format("truetype");
      font-weight: 400;
    }
    @font-face {
      font-family: "TemplateXinwei";
      src: url("${pathToFileURL(path.join(os.homedir(), "Library/Fonts/华文新魏.ttf")).href}") format("truetype");
      font-weight: 400;
    }
    @font-face {
      font-family: "TemplateDengLight";
      src: url("${pathToFileURL(path.join(os.homedir(), "Library/Fonts/等线 Light.ttf")).href}") format("truetype");
      font-weight: 400;
    }
    @font-face {
      font-family: "TemplateSimSunExtB";
      src: url("${pathToFileURL(path.join(os.homedir(), "Library/Fonts/simsunb.ttf")).href}") format("truetype");
      font-weight: 400;
    }
    @page { size: A4; margin: 72pt 90pt; }
    @page coverPage { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      color: #111827;
      background: #fff;
      font-family: "TemplateKai", "华文楷体", "STKaiti", "Kaiti SC", "KaiTi", serif;
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
      top: 42.55pt;
      height: 26pt;
    }
    .cover-first-header img {
      position: absolute;
      right: 0;
      top: -6pt;
      width: 91.5pt;
      height: auto;
    }
    .cover-section0 {
      position: absolute;
      left: 90pt;
      right: 90pt;
      top: 72pt;
      bottom: 72pt;
      color: #000;
      font-family: Arial, "Microsoft YaHei", "微软雅黑", sans-serif;
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
      font-family: "SimHei", "黑体", "STHeiti", sans-serif;
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
      font-family: "SimHei", "黑体", "STHeiti", sans-serif;
      font-size: 42pt;
      line-height: 1.25;
      font-weight: 900;
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
      font-family: "TemplateKai", "华文楷体", serif;
      font-size: 8pt;
      line-height: 1.45;
    }
    .cover-inner {
      display: none;
    }
    .cover-inner {
      position: relative;
      z-index: 1;
      height: 100%;
      padding: 48mm 0 0;
      text-align: center;
    }
    .cover-logo {
      display: block;
      width: 42mm;
      height: auto;
      margin: 0 auto 20mm;
    }
    .cover h1 {
      margin: 0;
      font-family: "SimHei", "黑体", "STHeiti", "Heiti SC", sans-serif;
      font-size: 42pt;
      line-height: 1.15;
      font-weight: 900;
      color: #071635;
      text-align: center;
      letter-spacing: 0;
    }
    .cover-subtitle {
      margin-top: 5mm;
      color: #5f6f8d;
      font-family: Arial, sans-serif;
      font-size: 17pt;
      font-weight: 700;
      text-align: center;
    }
    .cover-line {
      width: 58mm;
      height: .9mm;
      margin: 8mm auto 42mm;
      border-radius: 999px;
      background: linear-gradient(90deg, #1d6ff2, #16c6df);
    }
    .cover-card {
      width: 122mm;
      margin: 0 auto;
      border: 1px solid #dbeafe;
      border-left: 1.2mm solid #1d6ff2;
      border-radius: 2.2mm;
      background: rgba(255,255,255,.88);
      box-shadow: 0 7mm 16mm rgba(15,23,42,.10);
      padding: 7mm 13mm;
      text-align: left;
    }
    .cover-row {
      display: grid;
      grid-template-columns: 38mm 1fr;
      align-items: center;
      min-height: 13.5mm;
      border-bottom: 1px solid #dbeafe;
    }
    .cover-row:last-child { border-bottom: 0; }
    .cover-label { color: #64748b; font: 700 12.5pt "SimHei", "黑体", "STHeiti", sans-serif; }
    .cover-value { color: #071635; font: 800 14.5pt "SimHei", "黑体", "STHeiti", sans-serif; }
    .cover-date {
      display: inline-block;
      min-width: 48mm;
      text-align: center;
      padding: 1mm 8mm;
      border-radius: 999px;
      color: #1d6ff2;
      background: linear-gradient(180deg, #eef7ff, #dcecff);
      font-family: Arial, sans-serif;
      font-weight: 800;
      letter-spacing: .3px;
    }
    .toc-section {
      break-after: page;
      min-height: 153mm;
    }
    .toc-section h1 {
      margin: 0 0 18pt;
      text-align: center;
      font-family: "SimHei", "黑体", "STHeiti", "Heiti SC", sans-serif;
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
      font-family: "TemplateDengLight", "等线 Light", "DengXian", "STHeiti", "SimHei", sans-serif;
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
    .toc-depth-0 { font-weight: 700; }
    .toc-depth-1 { padding-left: 18pt !important; }
    .toc-depth-2 { padding-left: 34pt !important; font-size: 9.5pt !important; font-style: italic; }
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
      border-top: .4pt solid #e5e7eb;
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
      font-family: "SimHei", "黑体", "STHeiti", "Heiti SC", sans-serif;
      font-weight: 800;
      font-size: 22pt;
      line-height: 2.1;
      text-align: left;
      page-break-after: avoid;
    }
    .doc-section.depth-2 .doc-title { font-size: 16pt; line-height: 1.73; margin-bottom: 9pt; }
    .doc-section.depth-3 .doc-title { font-size: 15pt; line-height: 1.6; margin-bottom: 8pt; }
    .doc-section.depth-4 .doc-title { font-size: 14pt; line-height: 1.5; margin-bottom: 7pt; }
    .online-article :is(h1, h2, h3, h4):first-child { display: none; }
    .online-article h1,
    .online-article h2,
    .online-article h3,
    .online-article h4 {
      font-family: "SimHei", "黑体", "STHeiti", "Heiti SC", sans-serif;
      font-weight: 800;
      text-align: left;
      page-break-after: avoid;
    }
    .online-article h1 { font-size: 22pt; line-height: 2.1; margin: 16pt 0 10pt; }
    .online-article h2 { font-size: 16pt; line-height: 1.73; margin: 14pt 0 8pt; }
    .online-article h3 { font-size: 15pt; line-height: 1.6; margin: 12pt 0 7pt; }
    .online-article h4 { font-size: 14pt; line-height: 1.5; margin: 11pt 0 6pt; }
    .online-article p {
      margin: 0 0 9pt;
      line-height: 1.5;
      orphans: 2;
      widows: 2;
    }
    .online-article ul,
    .online-article ol {
      margin: 0 0 10pt;
      padding-left: 21pt;
    }
    .online-article li { margin: 3pt 0; }
    .online-article strong,
    .online-article b { font-family: "Arial Unicode MS", "SimHei", "黑体", "STHeiti", sans-serif; font-weight: 700; }
    .online-article img {
      display: block;
      max-width: 100%;
      max-height: 455pt;
      height: auto;
      margin: 12pt auto;
      object-fit: contain;
      page-break-inside: avoid;
    }
    .online-article table {
      width: 100%;
      border-collapse: collapse;
      margin: 12pt 0;
      font-size: 10pt;
      page-break-inside: avoid;
    }
    .online-article th,
    .online-article td {
      border: .5pt solid #111827;
      padding: 5.4pt;
      vertical-align: top;
    }
    .online-article th {
      background: rgb(208,206,206);
      font-family: "SimHei", "黑体", "STHeiti", "Heiti SC", sans-serif;
      font-size: 10.5pt;
      font-weight: 700;
    }
    .online-article table td:first-child {
      font-family: "TemplateSimSunExtB", "SimSun-ExtB", "SimSun", serif;
    }
    .online-article blockquote {
      margin: 10pt 0;
      padding: 2pt 0 2pt 12pt;
      border-left: 2pt solid #9ca3af;
      color: #374151;
    }
    .online-article pre {
      white-space: pre-wrap;
      margin: 10pt 0;
      padding: 8pt 10pt;
      border: .5pt solid #d1d5db;
      background: #f9fafb;
      font: 8.8pt/1.45 "SFMono-Regular", Consolas, monospace;
      page-break-inside: avoid;
    }
    .online-article code {
      font-family: "SFMono-Regular", Consolas, monospace;
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

function addTemplateHeaderFooter(inputPath, outputPath) {
  const pythonPath = findPython();
  const script = path.join(__dirname, "add_template_headers_footers.py");
  execFileSync(
    pythonPath,
    [
      script,
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--header-image",
      headerImage,
      "--document-name",
      "织灵产品使用手册",
      "--version",
      "v1.0.0",
      "--skip-pages",
      "1",
    ],
    { stdio: "pipe", maxBuffer: 1024 * 1024 * 10 },
  );
}

function findPython() {
  const bundled = path.join(
    os.homedir(),
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3",
  );
  return fs.existsSync(bundled) ? bundled : "python3";
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
