/* ===========================================================
   tools/build.js —— 构建编排入口
   -----------------------------------------------------------
   流程（架构 §3 / §5①）：
     1. 三级降级链取数据源：
        ① NOTION_TOKEN 存在且请求成功 → 用 Notion 数据
        ② 无 Token / 请求失败         → 回退 data/site-data.local.json
        ③ 两者都失败                  → 内置兜底 + 警告
     2. normalize() 归一化 → 修复三大缺陷 + 枚举校验；
     3. generate.js 产出双端同源数据：site/data.js + miniprogram/utils/data.js；
     4. seo.js 注入 6 个入口 HTML + robots + sitemap + manifest + 404；
     5. make-icons.js 生成 tabBar 图标 / favicon / og / 分享图；
     6. 自检报告（条数 / 无破图 / id 唯一性 / 枚举合法性）；
     7. 复制静态资源到 site/dist（可部署发布目录）。
   硬约束：任何情况都不 process.exit(1)，构建必须成功。
   参数：--no-notion  强制禁用 Notion；--site-url=<url> 覆盖站点地址
   =========================================================== */
"use strict";

const fs = require("fs");
const path = require("path");

const normalizeMod = require("./normalize");
const generate = require("./generate");
const seo = require("./seo");

const ROOT = path.join(__dirname, "..");
const SITE_DIR = path.join(ROOT, "site");
const DIST_DIR = path.join(SITE_DIR, "dist");
const DATA_DIR = path.join(ROOT, "data");
const LOCAL_JSON = path.join(DATA_DIR, "site-data.local.json");
const MINI_UTILS = path.join(ROOT, "miniprogram", "utils");

/** 统一日志前缀 */
function log(msg) { console.log(msg); }
function warn(msg) { console.warn("[warn] " + msg); }

/**
 * 零依赖加载 .env 文件（Node 默认不会自动读取）。
 * 规则：已存在于 process.env 的变量不覆盖（便于 CI / 命令行显式注入优先）；
 *      支持 KEY=VALUE、# 注释、值两侧引号。
 * @param {string} file 绝对路径
 */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return false;
  const text = fs.readFileSync(file, "utf8");
  text.split(/\r?\n/).forEach(function (line) {
    const s = line.trim();
    if (!s || s.charAt(0) === "#") return;
    const eq = s.indexOf("=");
    if (eq < 1) return;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if ((val.charAt(0) === '"' && val.slice(-1) === '"') || (val.charAt(0) === "'" && val.slice(-1) === "'")) {
      val = val.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = val;
  });
  return true;
}

/** 解析命令行参数 */
function parseArgs(argv) {
  const args = { noNotion: false, siteUrl: "" };
  (argv || []).forEach(function (a) {
    if (a === "--no-notion") args.noNotion = true;
    else if (a.indexOf("--site-url=") === 0) args.siteUrl = a.slice("--site-url=".length);
  });
  if (process.env.NO_NOTION === "1") args.noNotion = true;
  return args;
}

/** 计算站点绝对根（无尾斜杠） */
function resolveSiteUrl(args) {
  let url = args.siteUrl || process.env.SITE_URL || process.env.VERCEL_URL || process.env.URL || "";
  if (!url) return "https://example.com";
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url.replace(/\/+$/, "");
}

/** 读取本地 JSON 源（可能不存在） */
function readLocalSource() {
  const raw = fs.readFileSync(LOCAL_JSON, "utf8");
  return JSON.parse(raw);
}

/** 确保目录存在 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** 写入文件（自动建目录） */
function writeFile(p, content) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content);
}

/** 递归复制目录（Node 16+ fs.cpSync） */
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
}

/* ---------------- 三级降级链 ---------------- */

/** 模块 → 各自的列表字段名（来自 normalize 的 ID_FIELD 约定，此处显式列出便于阅读） */
const MODULE_LIST_KEY = {
  ai: "projects",
  library: "books",
  method: "articles",
  travel: "trips",
  words: "list"
};

/**
 * 模块级合并：把 notion 结果中失败的模块，用本地数据逐模块补齐。
 * 这样单个模块同步失败不会拖垮其余模块（模块级降级粒度）。
 * @param {object} notionData Notion 拉取的契约（可能部分模块为空）
 * @param {string[]} failedMods 同步失败的模块 id 列表
 * @param {object} localData 本地契约数据
 * @returns {{merged:object, patched:string[]}} 合并结果与被补齐的模块
 */
function mergeByModule(notionData, failedMods, localData) {
  const patched = [];
  const merged = JSON.parse(JSON.stringify(notionData));

  failedMods.forEach(function (mod) {
    const key = MODULE_LIST_KEY[mod];
    if (!key) return false;
    const localSection = localData && localData[mod];
    const localList = localSection && localSection[key];
    if (!Array.isArray(localList) || !localList.length) return; // 本地也没有 → 保持空
    merged[mod] = JSON.parse(JSON.stringify(localSection));
    patched.push(mod);
  });

  // 模块导航的 count 需要跟随实际列表长度重算（normalize 也会校正，这里提前同步）
  (merged.modules || []).forEach(function (m) {
    const key = MODULE_LIST_KEY[m.id];
    if (key && merged[m.id] && Array.isArray(merged[m.id][key])) {
      m.count = merged[m.id][key].length;
    }
  });

  // 本地与 Notion 都缺失的模块，补上模块导航项，避免导航缺项
  (localData && localData.modules || []).forEach(function (lm) {
    if (!(merged.modules || []).some(function (m) { return m.id === lm.id; })) {
      merged.modules = merged.modules || [];
      merged.modules.push(JSON.parse(JSON.stringify(lm)));
    }
  });

  return { merged: merged, patched: patched };
}

/**
 * 本地笔记回填：Notion 书页的读书笔记以「链接数据库视图」存在时，
 * 集成无权访问其源库，导致同步结果 noteAvailable 全为 false。
 * 这里对 note 为空的书按书名与本地数据精确匹配（title 全等），
 * 命中则回填 note / noteTitle / noteAvailable（只补笔记，书总数不变，
 * modules[].count 无需调整）；书名差异（如带副标题）匹配不到则跳过并 log。
 * @param {object} data Notion 拉取（或模块合并后）的契约数据，原地修改
 * @param {object} localData 本地契约数据 data/site-data.local.json
 * @returns {number} 回填成功的本数
 */
function backfillLocalNotes(data, localData) {
  if (!data || !localData) return 0;
  const books = (data.library || {}).books;
  const localBooks = (localData.library || {}).books || [];
  if (!Array.isArray(books) || !localBooks.length) return 0;

  // 本地有笔记的书：title → 书（全等匹配用）
  const byTitle = {};
  localBooks.forEach(function (b) {
    if (b && b.title && b.noteAvailable && Array.isArray(b.note) && b.note.length) {
      byTitle[String(b.title)] = b;
    }
  });

  const matched = {};
  let filled = 0;
  books.forEach(function (b) {
    if (!b) return;
    if (b.noteAvailable && Array.isArray(b.note) && b.note.length) {
      matched[String(b.title)] = true; // 已有笔记（Notion 块 / 本地替换），视为已覆盖
      return;
    }
    const hit = byTitle[String(b.title)];
    if (!hit) return; // 本地无此书笔记（或书名差异），跳过
    b.note = JSON.parse(JSON.stringify(hit.note));
    b.noteTitle = hit.noteTitle || "读书笔记";
    b.noteAvailable = true;
    matched[String(b.title)] = true;
    filled++;
    log("[backfill] 已回填读书笔记：" + b.title);
  });

  // 暴露书名差异：本地有笔记但 Notion 侧未匹配到同名书
  const unmatched = Object.keys(byTitle).filter(function (t) { return !matched[t]; });
  if (unmatched.length) {
    warn("[backfill] 本地有读书笔记但未匹配到同名书（书名可能有差异）：" + unmatched.join("、"));
  }
  return filled;
}

/**
 * 按三级降级链获取原始源。
 * @param {object} args 参数
 * @returns {Promise<{source:object, level:number, label:string, counts:object}>}
 */
async function loadSource(args) {
  const token = process.env.NOTION_TOKEN || "";

  // ① Notion
  if (token && !args.noNotion) {
    try {
      log("[source] 检测到 NOTION_TOKEN，尝试从 Notion 同步…");
      const notion = require("./notion");
      const res = await notion.fetchAll({ token: token, log: log });
      const failed = res.failed || [];

      // 模块级降级：失败模块回填本地数据
      if (failed.length) {
        let local = null;
        try { local = readLocalSource(); } catch (e) { /* 本地缺失则不补齐 */ }
        if (local) {
          const r = mergeByModule(res.data, failed, local);
          // 笔记回填：Notion 取不到链接数据库视图的读书笔记，用本地数据补齐
          backfillLocalNotes(r.merged, local);
          warn("[source] ① 模块级降级：[" + failed.join(", ") + "] 同步失败，已回填本地数据" +
            (r.patched.length ? "（成功回填：" + r.patched.join(", ") + "）" : "（本地亦无数据）"));
          log("[source] ① Notion 部分同步成功（" + Object.keys(res.counts).map(function (k) { return k + "=" + (failed.indexOf(k) >= 0 ? "本地" : res.counts[k]); }).join(" / ") + "）");
          return { source: r.merged, level: 1, label: "Notion API + 本地回填", counts: countOf(r.merged), failed: failed };
        }
      }

      // 笔记回填：书页读书笔记以「链接数据库视图」存在时 API 取不到，用本地数据补齐
      try {
        const local = readLocalSource();
        const filled = backfillLocalNotes(res.data, local);
        if (filled > 0) log("[source] ① 已用本地数据回填读书笔记 " + filled + " 本");
      } catch (e) { /* 本地缺失则不回填 */ }

      log("[source] ① Notion 同步成功（" + Object.keys(res.counts).map(function (k) { return k + "=" + res.counts[k]; }).join(" / ") + "）");
      return { source: res.data, level: 1, label: "Notion API", counts: res.counts, failed: failed };
    } catch (e) {
      warn("[source] ① Notion 同步失败：" + e.message + "，降级本地数据");
    }
  } else if (token && args.noNotion) {
    warn("[source] ① 已按 --no-notion 显式跳过 Notion 同步");
  } else {
    warn("[source] ① 未配置 NOTION_TOKEN，降级本地数据");
  }

  // ② 本地 JSON
  try {
    const local = readLocalSource();
    log("[source] ② 使用本地数据 " + path.relative(ROOT, LOCAL_JSON));
    return { source: local, level: 2, label: "data/site-data.local.json", counts: countOf(local) };
  } catch (e) {
    warn("[source] ② 本地数据缺失或解析失败：" + e.message);
  }

  // ③ 内置兜底
  warn("[source] ③ 使用内置兜底数据（内容不完整，请检查数据源）");
  return { source: normalizeMod.FALLBACK, level: 3, label: "内置兜底", counts: countOf(normalizeMod.FALLBACK) };
}

/** 统计各模块条数 */
function countOf(data) {
  const c = {};
  Object.keys(normalizeMod.ID_FIELD).forEach(function (m) {
    c[m] = ((data[m] || {})[normalizeMod.ID_FIELD[m]] || []).length;
  });
  return c;
}

/* ---------------- 静态资源复制 ---------------- */

/**
 * 复制站点静态文件到 site/dist（发布目录）。
 * 排除 dist 自身、以及由本脚本生成的入口 HTML（否则会覆盖 SEO 注入结果）。
 */
function copySiteToDist() {
  ensureDir(DIST_DIR);
  // 这些文件由 seo.js 生成到 dist，不可被源目录同名文件覆盖
  const generated = new Set(
    Object.keys(seo.MODULE_SEO).map(function (m) { return seo.MODULE_SEO[m].path; })
      .concat(["index.html", "robots.txt", "sitemap.xml", "site.webmanifest", "404.html", "_headers"])
  );
  const entries = fs.readdirSync(SITE_DIR, { withFileTypes: true });
  entries.forEach(function (ent) {
    if (ent.name === "dist") return;
    if (!ent.isDirectory() && generated.has(ent.name)) return;
    const src = path.join(SITE_DIR, ent.name);
    const dest = path.join(DIST_DIR, ent.name);
    if (ent.isDirectory()) {
      copyDir(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  });
}

/* ---------------- 主流程 ---------------- */

/**
 * 执行完整构建。
 * @param {object} [argv] 命令行参数
 * @returns {Promise<number>} 退出码（永远 0）
 */
async function run(argv) {
  const t0 = Date.now();
  loadDotEnv(path.join(ROOT, ".env"));
  const args = parseArgs(argv || process.argv.slice(2));
  const siteUrl = resolveSiteUrl(args);
  log("============================================================");
  log("贼贼接 · 双端构建开始");
  log("site-url = " + siteUrl + (args.noNotion ? "  (--no-notion)" : ""));
  log("============================================================");

  let exitCode = 0;

  try {
    /* ---- 1. 取源（三级降级） ---- */
    const loaded = await loadSource(args);
    log("[source] 数据源级别 = " + loaded.level + "  (" + loaded.label + ")");

    /* ---- 2. 归一化 ---- */
    const normalized = normalizeMod.normalize(loaded.source);
    const contract = normalized.contract;
    log("[normalize] 枚举/必填校验：错误 " + normalized.report.errors.length + " 项，警告 " + normalized.report.warns.length + " 项");

    /* ---- 3. 双端产物 ---- */
    writeFile(path.join(SITE_DIR, "data.js"), generate.toSiteJs(contract));
    writeFile(path.join(MINI_UTILS, "data.js"), generate.toMiniJs(contract));
    log("[generate] 已写出 site/data.js 与 miniprogram/utils/data.js");

    /* ---- 4. SEO / 入口 HTML / robots / sitemap / manifest / 404 ----
       幂等性关键：模板必须来自「纯净模板」templates/site-template.html，
       且绝不回写模板本身；所有注入产物只写到 site/dist/。
       这样重复构建不会导致 meta 标签累积。 */
    const tpl = seo.readTemplate(ROOT);
    // 首页入口 → dist/index.html
    writeFile(path.join(DIST_DIR, "index.html"), seo.applyToTemplate(tpl, seo.seoFor(contract, "home"), siteUrl));
    // 5 个模块入口 → dist/<mod>.html
    Object.keys(seo.MODULE_SEO).forEach(function (mod) {
      const info = seo.seoFor(contract, mod);
      const html = seo.applyToTemplate(tpl, info, siteUrl);
      writeFile(path.join(DIST_DIR, info.path), html);
    });
    writeFile(path.join(DIST_DIR, "robots.txt"), seo.buildRobots(siteUrl));
    writeFile(path.join(DIST_DIR, "sitemap.xml"), seo.buildSitemap(contract, siteUrl));
    writeFile(path.join(DIST_DIR, "site.webmanifest"), seo.buildManifest(contract));
    writeFile(path.join(DIST_DIR, "404.html"), seo.build404(contract));
    // Cloudflare Pages 专用：响应头配置必须放在构建输出目录（Pages 不读 wrangler.toml）
    writeFile(path.join(DIST_DIR, "_headers"), seo.buildHeaders());
    log("[seo] 已生成 6 个入口 HTML + robots.txt + sitemap.xml + site.webmanifest + 404.html + _headers");

    /* ---- 5. 图标 / 站点资产 ---- */
    try {
      const icons = require("./make-icons");
      const res = icons.makeAll({ root: ROOT });
      log("[icons] 已生成 " + res.files.length + " 个图标/资产（tabBar 8 + 站点 favicon/og 7 + 小程序分享图 1）");
    } catch (e) {
      warn("[icons] 图标生成失败（不影响数据构建）：" + e.message);
      exitCode = 0; // 仍不阻断
    }

    /* ---- 6. 自检报告 ---- */
    const check = normalizeMod.selfCheck(contract);
    log("============================================================");
    log("自检报告");
    log("  模块条数 : " + Object.keys(check.checks.counts).map(function (k) { return k + "=" + check.checks.counts[k]; }).join(" / "));
    log("  count 一致: " + (check.checks.countMatch ? "通过" : "失败"));
    log("  封面无破图: " + (check.checks.coverOk ? "通过" : "失败"));
    log("  无 attachment: : " + (check.checks.noAttachment ? "通过" : "失败"));
    log("  id 唯一性 : " + (check.checks.idUnique ? "通过（共 " + check.checks.idTotal + " 个）" :
      "失败（重复：" + (check.checks.duplicateIds || []).join(", ") + "）"));
    log("  枚举合法性: " + (check.checks.enumsOk ? "通过" : "失败"));
    log("  自检结论  : " + (check.pass ? "IS_PASS" : "NEED_FIX"));
    log("============================================================");

    /* ---- 7. 复制到 dist（可部署） ---- */
    try {
      copySiteToDist();
      log("[dist] 已复制静态站到 site/dist（可作为 Vercel/Netlify 发布目录）");
    } catch (e) {
      warn("[dist] 复制发布目录失败（不影响源产物）：" + e.message);
    }

    log("构建完成，用时 " + (Date.now() - t0) + " ms，降级级别 = " + loaded.level +
      (loaded.level > 1 ? "（已降级，构建仍成功）" : ""));
  } catch (e) {
    // 终极兜底：任何未捕获异常都不阻断（写出内置兜底产物）
    warn("构建过程出现异常：" + (e && e.stack ? e.stack : e));
    try {
      const fb = normalizeMod.normalize(normalizeMod.FALLBACK).contract;
      writeFile(path.join(SITE_DIR, "data.js"), generate.toSiteJs(fb));
      writeFile(path.join(MINI_UTILS, "data.js"), generate.toMiniJs(fb));
      warn("已写出内置兜底产物，构建仍返回成功");
    } catch (e2) {
      warn("兜底产物写出失败：" + e2.message);
    }
    exitCode = 0;
  }

  return exitCode;
}

/* ---------------- CLI / 模块导出 ---------------- */

if (require.main === module) {
  run(process.argv.slice(2)).then(function (code) {
    process.exit(code);
  }).catch(function (e) {
    // 双保险：即使 run 内部 promise reject 也不返回非零
    warn("构建未预期失败：" + e.message);
    process.exit(0);
  });
}

module.exports = {
  run: run,
  loadSource: loadSource,
  mergeByModule: mergeByModule,
  backfillLocalNotes: backfillLocalNotes,
  copySiteToDist: copySiteToDist,
  resolveSiteUrl: resolveSiteUrl,
  parseArgs: parseArgs
};
