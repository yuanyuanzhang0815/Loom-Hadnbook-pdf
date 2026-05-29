#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
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
const outputDir = path.resolve(args["output-dir"] || path.join(ROOT, "output"));
const workDir = path.resolve(args["work-dir"] || path.join(ROOT, "work-online"));
const filename = args.filename || "织灵产品使用手册.pdf";
const maxSizeMb = Number(args["max-size-mb"] || 50);
const coverImagePath = args["cover-image"] ? path.resolve(args["cover-image"]) : "";
const shouldAddFooters = false;

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(workDir, { recursive: true });

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});

async function main() {
  console.log("Crawling online handbook pages...");
  const pages = crawlPages(startUrl);
  if (!pages.length) throw new Error("No handbook pages found.");

  console.log("Downloading handbook images...");
  const assetReport = localizeImages(pages, workDir);
  const coverLogo = coverImagePath
    ? null
    : localizeAsset("https://loom.aicoda.tech/handbook/img/logo.svg", assetReport.assetsDir);
  if (coverImagePath && !fs.existsSync(coverImagePath)) {
    throw new Error(`Cover image does not exist: ${coverImagePath}`);
  }

  const lastUpdated = args["last-updated"] || formatDate(new Date());
  const cover = coverImagePath
    ? { imageUrl: pathToFileURL(coverImagePath).href }
    : { logoUrl: coverLogo.localUrl };
  const preflightHtml = buildHtml(pages, lastUpdated, cover, { tocPageNumbers: {} });
  const preflightHtmlPath = path.join(workDir, "online-handbook-preflight.html");
  const preflightPdfPath = path.join(workDir, "online-handbook-preflight.pdf");
  fs.writeFileSync(preflightHtmlPath, preflightHtml, "utf8");

  console.log("Pre-rendering to calculate TOC page numbers...");
  await renderPdf(preflightHtmlPath, preflightPdfPath);
  const tocPageNumbers = extractDestinationPageNumbers(preflightPdfPath, pages.length);

  const html = buildHtml(pages, lastUpdated, cover, { tocPageNumbers });
  const htmlPath = path.join(workDir, "online-handbook.html");
  fs.writeFileSync(htmlPath, html, "utf8");

  console.log(`Rendering ${pages.length} page(s) to PDF...`);
  const pdfPath = path.join(outputDir, filename);
  const renderedPdfPath = shouldAddFooters ? path.join(workDir, "online-handbook-draft.pdf") : pdfPath;
  await renderPdf(htmlPath, renderedPdfPath);

  let footerReport = null;
  if (shouldAddFooters) {
    const finalSections = detectSections(renderedPdfPath, pages);
    console.log("Adding PDF footers...");
    footerReport = addFooters(renderedPdfPath, pdfPath, pages, finalSections);
  }

  const pdf = await PDFDocument.load(fs.readFileSync(pdfPath));
  const sizeMb = fs.statSync(pdfPath).size / 1024 / 1024;
  const report = {
    output: pdfPath,
    html: htmlPath,
    source: startUrl,
    pages: pdf.getPageCount(),
    documents: pages.length,
    sizeMb: Number(sizeMb.toFixed(2)),
    maxSizeMb,
    ok: pdf.getPageCount() > 0 && sizeMb <= maxSizeMb,
    images: {
      found: assetReport.found + (coverLogo ? 1 : 0),
      downloaded: assetReport.downloaded + (coverLogo?.downloaded ? 1 : 0),
      reused: assetReport.reused + (coverLogo && !coverLogo.downloaded ? 1 : 0),
      missing: assetReport.missing,
    },
    cover: coverImagePath || "generated",
    toc: {
      pageNumbers: Object.keys(tocPageNumbers).length,
    },
    footer: footerReport,
    order: pages.map((page) => page.title),
  };
  fs.writeFileSync(
    path.join(outputDir, "online-pdf-generation-report.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(workDir, "online-order.json"),
    JSON.stringify(pages.map(({ title, url, depth }) => ({ title, url, depth })), null, 2),
    "utf8",
  );

  if (!report.ok) {
    throw new Error(`PDF generated but failed checks: ${JSON.stringify(report)}`);
  }
  console.log(JSON.stringify(report, null, 2));
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

function crawlPages(start) {
  const visited = new Set();
  const pages = [];
  let current = normalizeUrl(start);

  for (let index = 0; index < 300 && current; index += 1) {
    if (visited.has(current)) break;
    visited.add(current);

    const raw = curlText(current);
    const title = extractTitle(raw);
    const article = extractArticle(raw, current);
    if (title && article) {
      pages.push({
        title,
        url: current,
        depth: depthForUrl(current),
        topTitle: topTitleForUrl(current),
        article,
      });
    }

    const next = extractNextHref(raw);
    current = next ? normalizeUrl(next) : "";
  }

  return pages;
}

function curlText(url) {
  return execFileSync("curl", ["-sS", "-L", url], {
    encoding: "utf8",
    env: cleanEnv(),
    maxBuffer: 1024 * 1024 * 20,
  });
}

function curlBinary(url) {
  return execFileSync("curl", ["-sS", "-L", "--fail", url], {
    env: cleanEnv(),
    maxBuffer: 1024 * 1024 * 150,
  });
}

function cleanEnv() {
  const env = { ...process.env };
  for (const key of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
  ]) {
    delete env[key];
  }
  return env;
}

function extractTitle(html) {
  return decodeHtml(
    html.match(/<header><h1>([\s\S]*?)<\/h1><\/header>/)?.[1] ||
      html.match(/<title[^>]*>(.*?) \|/)?.[1] ||
      "",
  );
}

function extractArticle(html, pageUrl) {
  const match = html.match(/<div class="theme-doc-markdown markdown">([\s\S]*?)<\/div><\/article>/);
  if (!match) return "";
  let article = match[1];
  article = stripImageLazyAttrs(article);
  article = absolutizeAttr(article, "src", pageUrl);
  article = absolutizeAttr(article, "href", pageUrl);
  return article;
}

function stripImageLazyAttrs(html) {
  return html
    .replace(/\s+(decoding|loading)=("[^"]*"|'[^']*'|[^\s>]+)/g, "")
    .replace(/\s+srcset=("[^"]*"|'[^']*'|[^\s>]+)/g, "")
    .replace(/\s+sizes=("[^"]*"|'[^']*'|[^\s>]+)/g, "");
}

function localizeImages(pages, baseWorkDir) {
  const assetsDir = path.join(baseWorkDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });

  const report = {
    assetsDir,
    found: 0,
    downloaded: 0,
    reused: 0,
    missing: [],
  };

  const cache = new Map();
  const srcPattern = /\ssrc=("([^"]*)"|'([^']*)'|([^\s>]+))/g;

  for (const page of pages) {
    page.article = page.article.replace(srcPattern, (full, raw, doubleQuoted, singleQuoted, bare) => {
      const source = decodeHtml(doubleQuoted || singleQuoted || bare || "");
      if (!source || source.startsWith("data:") || source.startsWith("file:")) return full;

      report.found += 1;
      try {
        const asset = localizeAsset(source, assetsDir, cache);
        if (asset.downloaded) report.downloaded += 1;
        else report.reused += 1;
        return ` src="${escapeHtml(asset.localUrl)}"`;
      } catch (error) {
        report.missing.push({ page: page.title, source, error: String(error?.message || error) });
        return full;
      }
    });
  }

  if (report.missing.length) {
    const preview = report.missing
      .slice(0, 5)
      .map((item) => `${item.page}: ${item.source} (${item.error})`)
      .join("\n");
    throw new Error(`Some handbook images could not be downloaded:\n${preview}`);
  }

  return report;
}

function localizeAsset(source, assetsDir, cache = new Map()) {
  const sourceUrl = normalizeUrl(decodeHtml(source));
  if (cache.has(sourceUrl)) return { ...cache.get(sourceUrl), downloaded: false };

  const ext = extensionForUrl(sourceUrl);
  const hash = crypto.createHash("sha1").update(sourceUrl).digest("hex").slice(0, 16);
  const filePath = path.join(assetsDir, `${hash}${ext}`);
  let downloaded = false;

  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    const data = curlBinary(sourceUrl);
    if (!data.length) throw new Error("empty image response");
    fs.writeFileSync(filePath, data);
    downloaded = true;
  }

  const asset = { localUrl: pathToFileURL(filePath).href, filePath };
  cache.set(sourceUrl, asset);
  return { ...asset, downloaded };
}

function extensionForUrl(sourceUrl) {
  const pathname = new URL(sourceUrl).pathname;
  const ext = path.extname(pathname).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"].includes(ext)) return ext;
  return ".bin";
}

function extractNextHref(html) {
  const match = html.match(
    /pagination-nav__link pagination-nav__link--next[\s\S]*?href=(?:"([^"]+)"|([^ >]+))/,
  );
  return decodeHtml(match?.[1] || match?.[2] || "");
}

function absolutizeAttr(html, attr, pageUrl) {
  return html.replace(new RegExp(`${attr}=("([^"]*)"|([^\\s>]+))`, "g"), (full, _raw, quoted, bare) => {
    const value = decodeHtml(quoted || bare || "");
    if (!value || value.startsWith("#") || value.startsWith("mailto:")) return full;
    const absolute = new URL(value, pageUrl).toString().replace(
      "https://handbook.loom.aicoda.tech",
      "https://loom.aicoda.tech",
    );
    return `${attr}="${escapeHtml(absolute)}"`;
  });
}

function normalizeUrl(url) {
  const absolute = url.startsWith("http") ? url : new URL(url, "https://loom.aicoda.tech").toString();
  return absolute.replace("https://handbook.loom.aicoda.tech", "https://loom.aicoda.tech");
}

function depthForUrl(url) {
  const pathName = decodeURIComponent(new URL(normalizeUrl(url)).pathname);
  const parts = pathName.replace(/^\/handbook\/docs\/?/, "").split("/").filter(Boolean);
  if (!parts.length) return 1;
  if (parts[0] === "功能介绍" || parts[0] === "使用案例") return parts.length;
  return 1;
}

function topTitleForUrl(url) {
  const pathName = decodeURIComponent(new URL(normalizeUrl(url)).pathname);
  const parts = pathName.replace(/^\/handbook\/docs\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "功能介绍") return "功能介绍";
  if (parts[0] === "使用案例") return "使用案例";
  return parts[0] || "";
}

function buildHtml(pages, lastUpdated, cover, options = {}) {
  const tocPageNumbers = options.tocPageNumbers || {};
  const toc = pages
    .map((page, index) => {
      const depth = Math.max(0, page.depth - 1);
      const pageNo = tocPageNumbers[index] || "";
      return `<li class="toc-depth-${depth}">
        <a href="#doc-${index}">
          <span class="toc-title">${escapeHtml(page.title)}</span>
          <span class="toc-leader"></span>
          <span class="toc-page">${escapeHtml(pageNo)}</span>
        </a>
      </li>`;
    })
    .join("\n");

  const body = pages
    .map((page, index) => {
      const pageClass = page.depth <= 1 ? "doc-page doc-page-top" : "doc-page";
      return `<section class="${pageClass}" id="doc-${index}" data-title="${escapeHtml(page.title)}">
        <div class="online-article markdown">${page.article}</div>
      </section>`;
    })
    .join("\n");

  const cssPath = path.join(ROOT, "work", "styles.6d0a70a6.css");
  const cssLink = fs.existsSync(cssPath)
    ? `<link rel="stylesheet" href="${pathToFileURL(cssPath).href}">`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>织灵产品使用手册</title>
  ${cssLink}
  <style>
    @font-face {
      font-family: "CoverCJK";
      src: url("file:///System/Library/Fonts/STHeiti%20Medium.ttc");
      font-weight: 800;
    }
    @font-face {
      font-family: "BodyCJK";
      src: url("file:///System/Library/Fonts/Supplemental/Arial%20Unicode.ttf") format("truetype");
      font-weight: 400;
    }
    @font-face {
      font-family: "BodyCJK";
      src: url("file:///System/Library/Fonts/STHeiti%20Medium.ttc");
      font-weight: 700;
    }
    @page { size: A4; margin: 15mm 18mm 17mm; }
    @page coverPage { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #0f172a;
      font-family: "BodyCJK", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif;
      font-size: 10.5pt;
      line-height: 1.72;
      background: #fff;
    }
    a { color: #1d6ff2; text-decoration: none; }
    .cover {
      page: coverPage;
      position: relative;
      width: 210mm;
      height: 297mm;
      overflow: hidden;
      break-after: page;
      background:
        radial-gradient(circle at 98% -1%, #eaf5ff 0 32mm, rgba(234,245,255,0.0) 34mm),
        radial-gradient(circle at -3% 80%, #eaf5ff 0 35mm, rgba(234,245,255,0.0) 37mm),
        linear-gradient(168deg, transparent 0 59%, rgba(30, 111, 242, 0.11) 59.05%, transparent 59.42% 63%, rgba(30, 111, 242, 0.09) 63.05%, transparent 63.42% 67%, rgba(30, 111, 242, 0.07) 67.05%, transparent 67.42% 71%, rgba(30, 111, 242, 0.05) 71.05%, transparent 71.42%),
        #fff;
    }
    .cover-full-image {
      display: block;
      width: 210mm;
      height: 297mm;
      object-fit: cover;
    }
    .cover-inner {
      position: relative;
      z-index: 1;
      height: 100%;
      padding-top: 41mm;
      text-align: center;
    }
    .cover-logo {
      width: 34mm;
      height: auto;
      margin-bottom: 22mm;
    }
    .cover-title {
      margin: 0;
      font-family: "CoverCJK", "BodyCJK", sans-serif;
      font-size: 45pt;
      font-weight: 800;
      letter-spacing: 0;
      line-height: 1.15;
      color: #071635;
    }
    .cover-subtitle {
      margin: 6mm 0 0;
      color: #64748b;
      font-size: 18pt;
      font-weight: 700;
    }
    .cover-line {
      width: 64mm;
      height: 1mm;
      margin: 9mm auto 37mm;
      border-radius: 999px;
      background: linear-gradient(90deg, #1d6ff2, #18c3df);
    }
    .cover-card {
      width: 120mm;
      margin: 0 auto;
      border: 1px solid #dbeafe;
      border-left: 1.2mm solid #1d6ff2;
      border-radius: 3mm;
      background: rgba(255,255,255,0.88);
      box-shadow: 0 7mm 16mm rgba(15, 23, 42, 0.09);
      padding: 8mm 13mm;
      text-align: left;
    }
    .cover-row {
      display: grid;
      grid-template-columns: 40mm 1fr;
      align-items: center;
      min-height: 15mm;
      border-bottom: 1px solid #dbeafe;
    }
    .cover-row:last-child { border-bottom: 0; }
    .cover-label {
      color: #64748b;
      font-size: 13.5pt;
      font-weight: 700;
    }
    .cover-value {
      color: #071635;
      font-size: 15.5pt;
      font-weight: 800;
    }
    .cover-date {
      display: inline-block;
      padding: 1.5mm 11mm;
      border-radius: 999px;
      background: linear-gradient(180deg, #edf6ff, #dbeafe);
      color: #1d6ff2;
      font-size: 15.5pt;
      letter-spacing: 0.5px;
    }
    .toc {
      min-height: 264mm;
      break-after: page;
      padding-top: 5mm;
    }
    .toc h1 {
      margin: 0 0 8mm;
      color: #071635;
      font-size: 23pt;
    }
    .toc ol {
      list-style: none;
      margin: 0;
      padding: 0;
      column-count: 2;
      column-gap: 11mm;
    }
    .toc li {
      break-inside: avoid;
      border-bottom: 1px solid #e8eef7;
      padding: 1.8mm 0;
      font-size: 9.5pt;
      line-height: 1.45;
    }
    .toc a {
      display: flex;
      align-items: baseline;
      gap: 2mm;
      width: 100%;
      color: #1d6ff2;
    }
    .toc-title {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .toc-leader {
      flex: 1 1 auto;
      min-width: 5mm;
      border-bottom: 1px dotted #cbd5e1;
      transform: translateY(-1.2mm);
    }
    .toc-page {
      flex: 0 0 auto;
      min-width: 7mm;
      text-align: right;
      color: #64748b;
    }
    .toc-depth-1 { padding-left: 4mm !important; }
    .toc-depth-2 { padding-left: 8mm !important; font-size: 9pt !important; }
    .toc-depth-3 { padding-left: 12mm !important; font-size: 8.5pt !important; }
    .doc-page {
      break-before: page;
      page-break-before: always;
    }
    .toc + .doc-page {
      break-before: auto;
      page-break-before: auto;
    }
    .online-article {
      max-width: 100%;
      margin: 0 auto;
    }
    .online-article header h1,
    .online-article > h1:first-child {
      font-family: "CoverCJK", "BodyCJK", sans-serif;
      color: #111827;
      font-size: 27pt;
      line-height: 1.22;
      letter-spacing: 0;
      margin: 0 0 8mm;
    }
    .online-article h1 {
      font-family: "CoverCJK", "BodyCJK", sans-serif;
      font-size: 20pt;
      line-height: 1.35;
      margin: 9mm 0 4mm;
    }
    .online-article h2 { font-family: "CoverCJK", "BodyCJK", sans-serif; font-size: 16pt; margin: 7mm 0 3mm; }
    .online-article h3 { font-family: "CoverCJK", "BodyCJK", sans-serif; font-size: 13pt; margin: 6mm 0 2mm; }
    .online-article p { margin: 0 0 4mm; }
    .online-article ul,
    .online-article ol { padding-left: 7mm; margin: 0 0 4mm; }
    .online-article li { margin: 1.2mm 0; }
    .online-article img {
      display: block;
      max-width: 100%;
      max-height: 174mm;
      height: auto;
      margin: 5mm auto;
      object-fit: contain;
      page-break-inside: avoid;
    }
    .online-article table {
      border-collapse: collapse;
      width: 100%;
      margin: 5mm 0;
      font-size: 8.6pt;
      page-break-inside: avoid;
    }
    .online-article th,
    .online-article td {
      border: 1px solid #dbe3ef;
      padding: 2mm;
      vertical-align: top;
    }
    .online-article th { background: #f5f8fc; }
    .online-article blockquote {
      border-left: 3px solid #dbe3ef;
      color: #475569;
      margin: 4mm 0;
      padding-left: 4mm;
    }
    .online-article code,
    .online-article pre {
      font-family: "SFMono-Regular", Consolas, monospace;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  ${buildCover(lastUpdated, cover)}
  <section class="toc">
    <h1>目录</h1>
    <ol>${toc}</ol>
  </section>
  ${body}
</body>
</html>`;
}

function buildCover(lastUpdated, cover) {
  if (cover.imageUrl) {
    return `<section class="cover cover-image-page"><img class="cover-full-image" src="${escapeHtml(cover.imageUrl)}" alt="织灵产品使用手册"></section>`;
  }

  return `<section class="cover">
    <div class="cover-inner">
      <img class="cover-logo" src="${escapeHtml(cover.logoUrl)}" alt="织灵">
      <h1 class="cover-title">织灵产品使用手册</h1>
      <div class="cover-subtitle">Coda Loom Product Manual</div>
      <div class="cover-line"></div>
      <div class="cover-card">
        <div class="cover-row"><div class="cover-label">产品名称</div><div class="cover-value">织灵 Loom</div></div>
        <div class="cover-row"><div class="cover-label">所属公司</div><div class="cover-value">可达智灵</div></div>
        <div class="cover-row"><div class="cover-label">最近更新时间</div><div class="cover-value"><span class="cover-date">${escapeHtml(lastUpdated)}</span></div></div>
      </div>
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
    throw new Error(
      `Images failed to render before PDF export: ${JSON.stringify(imageStatus.broken.slice(0, 8), null, 2)}`,
    );
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

function detectSections(inputPdfPath, pages) {
  const pythonPath = findPython();
  const detectScript = path.join(__dirname, "detect_pdf_sections.py");
  const titles = JSON.stringify(pages.map((page) => page.title));
  const detectedRaw = execFileSync(
    pythonPath,
    [detectScript, "--pdf", inputPdfPath, "--titles", titles, "--skip-pages", "2"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 5 },
  );
  return JSON.parse(detectedRaw);
}

function addFooters(inputPdfPath, outputPdfPath, pages, detected) {
  const pythonPath = findPython();
  const footerScript = path.join(__dirname, "add_pdf_footers.py");
  const ranges = [{ title: "目录", start: 2, end: 2 }];

  for (const item of detected) {
    const page = pages[item.index] || pages.find((candidate) => candidate.title === item.title);
    ranges.push({
      title: page?.topTitle || item.title,
      start: item.start,
      end: item.end,
    });
  }

  const rangesPath = path.join(workDir, "online-footer-ranges.json");
  fs.writeFileSync(rangesPath, JSON.stringify(ranges, null, 2), "utf8");

  execFileSync(
    pythonPath,
    [footerScript, "--input", inputPdfPath, "--output", outputPdfPath, "--ranges", rangesPath],
    { stdio: "pipe", maxBuffer: 1024 * 1024 * 10 },
  );

  return {
    added: true,
    ranges: ranges.length,
    detectedDocuments: detected.length,
    missingDocuments: pages.length - detected.length,
    rangesPath,
  };
}

function extractDestinationPageNumbers(inputPdfPath, count) {
  const pythonPath = findPython();
  const extractScript = path.join(__dirname, "extract_pdf_dest_pages.py");
  const raw = execFileSync(
    pythonPath,
    [extractScript, "--pdf", inputPdfPath, "--count", String(count)],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(raw);
}

function findPython() {
  const bundled = path.join(
    os.homedir(),
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3",
  );
  return fs.existsSync(bundled) ? bundled : "python3";
}

async function waitForImages(page) {
  return page.evaluate(async () => {
    const images = Array.from(document.images);
    for (const img of images) {
      img.loading = "eager";
      img.decoding = "sync";
    }

    await Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
            setTimeout(done, 15000);
          }),
      ),
    );

    const broken = images
      .filter((img) => !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0)
      .map((img) => ({ alt: img.alt || "", src: img.currentSrc || img.src }));

    return { total: images.length, broken };
  });
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

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}
