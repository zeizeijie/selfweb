/* ===========================================================
   tools/seo.js —— SEO 注入与站点资产生成
   -----------------------------------------------------------
   职责：
     1. 读取「纯净模板」templates/site-template.html，生成 6 个入口 HTML
        到 site/dist/：index.html（首页）+ ai/library/method/travel/words.html，
        每个注入独立 <title>/description/OG/Twitter/canonical，
        并在模块入口内联 window.__INITIAL_VIEW__ = "<mod>"；
     2. 生成 site/dist/robots.txt（含 Sitemap 绝对 URL）；
     3. 生成 site/dist/sitemap.xml（首页 + 5 模块入口）；
     4. 生成 site/dist/site.webmanifest（PWA manifest）；
     5. 生成 site/dist/404.html（同风格兜底页，含返回首页链接）。
   绝对 URL 依赖 SITE_URL（缺省 https://example.com）。
   幂等保证：模板只读不写；applyToTemplate 先剥离旧注入片段再注入。
   =========================================================== */
"use strict";

const fs = require("fs");
const path = require("path");

/** 模块 SEO 文案表（title / desc 由契约的 modules[] 覆盖 name/tagline） */
const MODULE_SEO = {
  ai: { path: "ai.html", icon: "chip" },
  library: { path: "library.html", icon: "book" },
  method: { path: "method.html", icon: "compass" },
  travel: { path: "travel.html", icon: "mountain" },
  words: { path: "words.html", icon: "quote" }
};

/** HTML 转义 */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 从契约提取某模块的 SEO 文案。
 * @param {object} contract 契约
 * @param {string} mod 模块 id（"home" 表示首页）
 * @returns {{title:string, description:string, shareImage:string, path:string, view:string}}
 */
function seoFor(contract, mod) {
  const meta = contract.meta || {};
  if (mod === "home") {
    return {
      title: (meta.name || "知识花园") + " · 个人知识站",
      description: meta.subtitle || meta.tagline || "个人知识花园",
      shareImage: meta.shareImage || "",
      path: "index.html",
      view: ""
    };
  }
  const m = (contract.modules || []).filter(function (x) { return x.id === mod; })[0] || {};
  const name = m.name || mod;
  const tagline = m.tagline || "";
  const desc = m.desc || tagline;
  return {
    title: name + " · " + (meta.name || "知识花园"),
    description: desc,
    shareImage: m.shareImage || meta.shareImage || "",
    path: (MODULE_SEO[mod] || { path: mod + ".html" }).path,
    view: mod
  };
}

/**
 * 构造 SEO 注入片段（HTML 字符串），供插入 </head> 之前。
 * @param {object} info seoFor 的返回结果
 * @param {string} siteUrl 站点绝对根（无尾斜杠）
 * @returns {string} HTML 片段
 */
function buildHeadFragment(info, siteUrl) {
  const url = siteUrl + "/" + info.path;
  const ogImage = info.shareImage
    ? (/^https?:\/\//i.test(info.shareImage) ? info.shareImage : siteUrl + "/" + info.shareImage.replace(/^\//, ""))
    : siteUrl + "/assets/og-" + (info.view || "image") + ".png";
  const lines = [
    '<meta name="description" content="' + esc(info.description) + '">',
    '<link rel="canonical" href="' + esc(url) + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="知识花园">',
    '<meta property="og:title" content="' + esc(info.title) + '">',
    '<meta property="og:description" content="' + esc(info.description) + '">',
    '<meta property="og:url" content="' + esc(url) + '">',
    '<meta property="og:image" content="' + esc(ogImage) + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + esc(info.title) + '">',
    '<meta name="twitter:description" content="' + esc(info.description) + '">',
    '<meta name="twitter:image" content="' + esc(ogImage) + '">'
  ];
  if (info.view) {
    lines.unshift('<script>window.__INITIAL_VIEW__ = ' + JSON.stringify(info.view) + ';</script>');
  }
  return lines.join("\n");
}

/**
 * 读取「纯净模板」。
 * 模板位于 templates/site-template.html，构建脚本只读不写，保证构建幂等
 * （避免把注入过 meta 的 index.html 再次当作模板，导致标签累积）。
 * 若纯净模板缺失，回退到 site/index.html，并剥离历史注入片段。
 * @param {string} root 项目根目录
 * @returns {string} 模板 HTML
 */
function readTemplate(root) {
  const tplPath = path.join(root, "templates", "site-template.html");
  if (fs.existsSync(tplPath)) return fs.readFileSync(tplPath, "utf8");
  // 回退：读取 site/index.html 并清洗
  const fallback = path.join(root, "site", "index.html");
  return stripInjected(fs.readFileSync(fallback, "utf8"));
}

/**
 * 剥离此前注入的 SEO 片段，使任意 HTML 还原为可重复注入的干净状态。
 * 用于兜底与自愈（老版本构建产物、被污染的模板）。
 * @param {string} html
 * @returns {string}
 */
function stripInjected(html) {
  return String(html)
    .replace(/^[ \t]*<link\s+rel="canonical"[^>]*>[ \t]*\r?\n?/gim, "")
    .replace(/^[ \t]*<meta\s+property="og:[^"]*"[^>]*>[ \t]*\r?\n?/gim, "")
    .replace(/^[ \t]*<meta\s+name="twitter:[^"]*"[^>]*>[ \t]*\r?\n?/gim, "")
    .replace(/^[ \t]*<meta\s+name="description"[^>]*>[ \t]*\r?\n?/gim, "")
    .replace(/^[ \t]*<script>window\.__INITIAL_VIEW__[\s\S]*?<\/script>[ \t]*\r?\n?/gim, "")
    .replace(/\r?\n{3,}/g, "\n\n");
}

/**
 * 在模板 HTML 中替换 title / description / 注入 head 片段。
 * 幂等：先剥离既有注入片段，再注入，重复调用结果一致。
 * @param {string} tpl site/index.html 原始内容
 * @param {object} info seoFor 结果
 * @param {string} siteUrl 站点绝对根
 * @returns {string} 生成的 HTML
 */
function applyToTemplate(tpl, info, siteUrl) {
  let html = stripInjected(tpl);
  // 1) 替换 <title>
  html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + esc(info.title) + "</title>");
  // 2) 在 </head> 前注入 SEO 片段
  const frag = buildHeadFragment(info, siteUrl);
  html = html.replace(/<\/head>/i, frag + "\n</head>");
  return html;
}

/**
 * 生成 robots.txt。
 * @param {string} siteUrl 站点绝对根
 * @returns {string}
 */
function buildRobots(siteUrl) {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /404.html",
    "",
    "Sitemap: " + siteUrl + "/sitemap.xml",
    ""
  ].join("\n");
}

/**
 * 生成 sitemap.xml。
 * @param {object} contract 契约
 * @param {string} siteUrl 站点绝对根
 * @returns {string}
 */
function buildSitemap(contract, siteUrl) {
  const today = new Date().toISOString().slice(0, 10);
  const paths = [""].concat(Object.keys(MODULE_SEO).map(function (m) { return MODULE_SEO[m].path; }));
  const urls = paths.map(function (p) {
    const loc = siteUrl + "/" + p;
    return [
      "  <url>",
      "    <loc>" + esc(loc) + "</loc>",
      "    <lastmod>" + today + "</lastmod>",
      "    <changefreq>weekly</changefreq>",
      "    <priority>" + (p === "" ? "1.0" : "0.8") + "</priority>",
      "  </url>"
    ].join("\n");
  }).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    ""
  ].join("\n");
}

/**
 * 生成 site.webmanifest（PWA manifest）。
 * @param {object} contract 契约
 * @returns {string} JSON 文本
 */
function buildManifest(contract) {
  const meta = contract.meta || {};
  return JSON.stringify({
    name: meta.name || "知识花园",
    short_name: meta.name || "知识花园",
    description: meta.subtitle || meta.tagline || "",
    start_url: "./",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0071e3",
    icons: [
      { src: "assets/favicon-32.png", sizes: "32x32", type: "image/png" },
      { src: "assets/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { src: "assets/og-image.png", sizes: "1200x630", type: "image/png" }
    ]
  }, null, 2) + "\n";
}

/**
 * 生成 404.html（与站点同风格的兜底页）。
 * @param {object} contract 契约
 * @returns {string} HTML
 */
function build404(contract) {
  const meta = contract.meta || {};
  const name = esc(meta.name || "知识花园");
  return [
    "<!DOCTYPE html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    "<title>页面未找到 · " + name + "</title>",
    '<meta name="robots" content="noindex">',
    '<style>',
    ":root{--bg:#fff;--text:#1d1d1f;--text-2:#6e6e73;--blue:#0071e3;--radius:18px;--ease:cubic-bezier(.28,.11,.32,1)}",
    "*{box-sizing:border-box;margin:0;padding:0}",
    "body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,\"SF Pro Display\",\"PingFang SC\",\"Helvetica Neue\",\"Microsoft YaHei\",sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;letter-spacing:-.01em;padding:24px}",
    ".wrap{max-width:560px;text-align:center}",
    ".code{font-size:clamp(64px,14vw,120px);font-weight:600;letter-spacing:-.04em;line-height:1;background:linear-gradient(135deg,var(--blue),#6e56cf);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}",
    "h1{font-size:clamp(24px,4vw,34px);font-weight:600;margin:18px 0 12px;letter-spacing:-.02em}",
    "p{color:var(--text-2);font-size:16.5px;line-height:1.6;margin-bottom:32px}",
    ".btn{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;padding:12px 26px;border-radius:980px;font-size:15px;font-weight:500;transition:transform .3s var(--ease),background .3s var(--ease)}",
    ".btn:hover{background:#0077ed;transform:translateY(-1px)}",
    "</style>",
    "</head>",
    "<body>",
    '<div class="wrap">',
    '<div class="code">404</div>',
    "<h1>这一步走到了空白页</h1>",
    "<p>你要找的页面不存在，或者链接已经失效。<br>不如回花园里逛逛？</p>",
    '<a class="btn" href="/">返回首页 →</a>',
    "</div>",
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

module.exports = {
  MODULE_SEO: MODULE_SEO,
  seoFor: seoFor,
  readTemplate: readTemplate,
  stripInjected: stripInjected,
  buildHeadFragment: buildHeadFragment,
  applyToTemplate: applyToTemplate,
  buildRobots: buildRobots,
  buildSitemap: buildSitemap,
  buildManifest: buildManifest,
  build404: build404
};
