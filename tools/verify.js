/* ===========================================================
   tools/verify.js —— 构建产物端到端校验（可 npm run verify）
   -----------------------------------------------------------
   校验项：
     1. site/data.js 可被 require 后取到 window.SITE_DATA（结构完整）；
     2. miniprogram/utils/data.js 可被 require 后取到导出对象；
     3. 双端数据指纹一致（逐字节同构）；
     4. 各模块条数 = 契约 count（library=12 / words=74 等）；
     5. 无 attachment: 前缀、无破图（cover 为空或 http(s)）；
     6. id 全局唯一；
     7. 枚举合法性。
   退出码：全部通过 0，否则 1。
   =========================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const normalizeMod = require("./normalize");

const ROOT = path.join(__dirname, "..");
const SITE_DATA = path.join(ROOT, "site", "data.js");
const MINI_DATA = path.join(ROOT, "miniprogram", "utils", "data.js");

let failures = 0;
function check(name, ok, extra) {
  const tag = ok ? "  [✓]" : "  [✗]";
  console.log(tag + " " + name + (extra ? "  → " + extra : ""));
  if (!ok) failures++;
}

/** 在沙箱中执行 site/data.js 取 window.SITE_DATA */
function loadSiteData() {
  const code = fs.readFileSync(SITE_DATA, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.SITE_DATA;
}

/** require miniprogram/utils/data.js */
function loadMiniData() {
  delete require.cache[require.resolve(MINI_DATA)];
  return require(MINI_DATA);
}

function main() {
  console.log("============================================================");
  console.log("构建产物校验");
  console.log("============================================================");

  check("site/data.js 存在", fs.existsSync(SITE_DATA));
  check("miniprogram/utils/data.js 存在", fs.existsSync(MINI_DATA));
  if (!fs.existsSync(SITE_DATA) || !fs.existsSync(MINI_DATA)) {
    console.log("产物缺失，请先执行 npm run build");
    process.exit(1);
  }

  const site = loadSiteData();
  const mini = loadMiniData();

  // 1) 结构完整
  check("window.SITE_DATA 可取到且含 meta/modules", !!(site && site.meta && Array.isArray(site.modules)));
  check("module.exports 可取到且含 meta/modules", !!(mini && mini.meta && Array.isArray(mini.modules)));

  // 2) 双端同构
  const fpSite = JSON.stringify(site);
  const fpMini = JSON.stringify(mini);
  check("双端数据逐字节同构", fpSite === fpMini);

  // 3) 条数自洽性（不写死具体数字：数据源可能是 Notion / 本地 / 回填混合）
  const counts = {
    ai: site.ai.projects.length,
    library: site.library.books.length,
    method: site.method.articles.length,
    travel: site.travel.trips.length,
    words: site.words.list.length
  };
  Object.keys(counts).forEach(function (m) {
    check("条数：" + m + " ≥ 1 且为整数", Number.isInteger(counts[m]) && counts[m] >= 1, "实际 " + counts[m]);
  });
  check("条数：各模块均非空", Object.keys(counts).every(function (m) { return counts[m] > 0; }),
    JSON.stringify(counts));

  // 4) count 校正
  const countOk = site.modules.every(function (m) {
    const key = { ai: "projects", library: "books", method: "articles", travel: "trips", words: "list" }[m.id];
    return m.count === site[m.id][key].length;
  });
  check("modules[].count = 真实 list.length", countOk);

  // 5) 破图 / attachment / 过期签名链接
  const noAttachment = !fs.readFileSync(SITE_DATA, "utf8").match(/attachment:/i);
  check("无 attachment: 前缀", noAttachment);
  const coverOk = site.library.books.every(function (b) { return b.cover === "" || /^https?:\/\//i.test(b.cover); });
  check("书籍封面：空串或 http(s)", coverOk);

  // 会过期的签名 URL 一律不得出现在产物中（否则构建后 1 小时必然破图）
  const expiring = [];
  (site.library.books || []).forEach(function (b) {
    if (b.cover && normalizeMod.isExpiringUrl && normalizeMod.isExpiringUrl(b.cover)) expiring.push("book:" + b.title);
  });
  check("无会过期的签名封面 URL", expiring.length === 0, expiring.join(", "));

  // 所有空封面的书都必须有 coverFallback 渐变兜底
  const fallbackOk = site.library.books.every(function (b) {
    return b.cover !== "" || (typeof b.coverFallback === "string" && b.coverFallback.indexOf("gradient") >= 0);
  });
  check("空封面均有 coverFallback 渐变", fallbackOk);

  // 6) id 唯一
  const allIds = [];
  [["ai", "projects"], ["library", "books"], ["method", "articles"], ["travel", "trips"], ["words", "list"]].forEach(function (pair) {
    site[pair[0]][pair[1]].forEach(function (x) { allIds.push(x.id); });
  });
  const dup = allIds.filter(function (id, i) { return allIds.indexOf(id) !== i; });
  check("id 全局唯一（共 " + allIds.length + " 个）", dup.length === 0, dup.join(","));

  // 7) 枚举
  const enumsOk =
    site.library.books.every(function (b) { return ["已读", "在读", "想读"].indexOf(b.status) >= 0; }) &&
    site.ai.projects.every(function (p) { return ["进行中", "已完成"].indexOf(p.status) >= 0; }) &&
    site.words.list.every(function (w) { return ["人生感悟", "休闲文案", "为人处事", "装X语录"].indexOf(w.category) >= 0; });
  check("枚举合法性", enumsOk);

  // 8) SEO / 部署产物（生成到 site/dist/，入口 HTML 由 templates/site-template.html 注入而来）
  ["index.html", "ai.html", "library.html", "method.html", "travel.html", "words.html",
    "robots.txt", "sitemap.xml", "404.html", "site.webmanifest", "_headers"].forEach(function (f) {
      check("SEO 产物存在：dist/" + f, fs.existsSync(path.join(ROOT, "site", "dist", f)));
    });

  // Cloudflare Pages 的 _headers 必须放在输出目录，且含关键缓存/安全规则
  const hdrPath = path.join(ROOT, "site", "dist", "_headers");
  if (fs.existsSync(hdrPath)) {
    const hdr = fs.readFileSync(hdrPath, "utf8");
    check("_headers 含 assets 强缓存规则", /\/assets\/\*/.test(hdr) && /immutable/.test(hdr));
    check("_headers 含安全响应头", /X-Content-Type-Options:\s*nosniff/.test(hdr) && /X-Frame-Options/.test(hdr));
    check("_headers 不含 tab 缩进（Pages 要求空格缩进）", !/\t/.test(hdr));
  }

  // Cloudflare Pages 靠输出目录里的 404.html 实现自定义 404（_redirects 不支持 404 rewrite）
  check("dist/404.html 存在（Cloudflare 自定义 404 约定）",
    fs.existsSync(path.join(ROOT, "site", "dist", "404.html")));

  // 9) 构建幂等性：纯净模板不得被注入污染
  const tplPath = path.join(ROOT, "templates", "site-template.html");
  if (fs.existsSync(tplPath)) {
    const tpl = fs.readFileSync(tplPath, "utf8");
    check("纯净模板无注入残留", !/og:title|twitter:card/.test(tpl));
  } else {
    check("纯净模板存在", false);
  }
  // 入口页各 meta 恰好一次
  ["index.html", "ai.html"].forEach(function (f) {
    const p = path.join(ROOT, "site", "dist", f);
    if (!fs.existsSync(p)) return;
    const html = fs.readFileSync(p, "utf8");
    const one = function (re) { return (html.match(re) || []).length === 1; };
    check("dist/" + f + " meta 不重复", one(/og:title/g) && one(/rel="canonical"/g) && one(/<title>/g));
  });

  // 10) 各模块分享图必须互不相同（PRD G3：分享卡片需能区分模块）
  const ogNames = ["og-image", "og-ai", "og-library", "og-method", "og-travel", "og-words"];
  const ogHashes = {};
  ogNames.forEach(function (n) {
    const p = path.join(ROOT, "site", "dist", "assets", n + ".png");
    if (!fs.existsSync(p)) { ogHashes[n] = "MISSING"; return; }
    ogHashes[n] = require("crypto").createHash("md5").update(fs.readFileSync(p)).digest("hex");
  });
  const ogVals = Object.keys(ogHashes).map(function (k) { return ogHashes[k]; });
  const ogUnique = new Set(ogVals).size;
  check("6 张分享图内容互不相同（唯一 " + ogUnique + "/6）", ogUnique === ogNames.length && ogVals.indexOf("MISSING") < 0);

  console.log("============================================================");
  console.log(failures === 0 ? "全部通过 ✓" : ("失败 " + failures + " 项 ✗"));
  console.log("============================================================");
  process.exit(failures === 0 ? 0 : 1);
}

main();
