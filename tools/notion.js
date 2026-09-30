/* ===========================================================
   tools/notion.js —— Notion REST API 封装（Node 18+ 原生 fetch）
   -----------------------------------------------------------
   仅使用 3 个端点：
     · POST /v1/databases/{id}/query   分页查询数据源
     · GET  /v1/blocks/{pageId}/children  递归取块
     · GET  /v1/pages/{pageId}          取单页属性（可选）
   设计原则：
     · 零 npm 依赖（不装 @notionhq/client）；
     · 任何失败抛错，由 build.js 的降级链捕获，不在此处 exit；
     · 映射表外置在 data/notion-map.json，无代码即可调整。
   =========================================================== */
"use strict";

const fs = require("fs");
const path = require("path");

const API_BASE_DEFAULT = "https://api.notion.com/v1";
const VERSION_DEFAULT = "2022-06-28";

/* ---------------- 映射表加载 ---------------- */

/**
 * 读取 Notion 字段映射表。
 * @param {string} [mapPath] 映射表路径，缺省 data/notion-map.json
 * @returns {object} 映射表对象
 */
function loadMap(mapPath) {
  const p = mapPath || path.join(__dirname, "..", "data", "notion-map.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/* ---------------- 属性取值助手 ---------------- */

/**
 * 从 Notion page 对象中按属性名取原始属性对象。
 * @param {object} page Notion page
 * @param {string} name 属性名
 * @returns {object|null}
 */
function prop(page, name) {
  if (!page || !page.properties || !name) return null;
  return page.properties[name] || null;
}

/**
 * 把 Notion rich_text 数组合并为纯文本。
 * @param {Array} rt rich_text 数组
 * @returns {string}
 */
function richText(rt) {
  if (!Array.isArray(rt)) return "";
  return rt.map(function (t) { return (t && t.plain_text) || ""; }).join("");
}

/**
 * 按映射描述从 page 中取值并转换为契约字段。
 * @param {object} page Notion page
 * @param {object} desc 映射描述 { prop, type, map?, default? }
 * @returns {*} 契约字段值
 */
function readField(page, desc) {
  if (!desc) return undefined;
  const raw = prop(page, desc.prop);
  const type = desc.type;
  const def = desc.default;

  if (!raw) return cloneDefault(def);

  let value;
  switch (type) {
    case "title":
      value = richText(raw.title);
      break;
    case "rich_text":
      value = richText(raw.rich_text);
      break;
    case "rich_text_lines":
      value = richText(raw.rich_text).split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      break;
    case "number":
      value = typeof raw.number === "number" ? raw.number : def;
      break;
    case "select": {
      const name = raw.select && raw.select.name;
      value = mapValue(name, desc, def);
      break;
    }
    case "multi_select": {
      const names = Array.isArray(raw.multi_select) ? raw.multi_select.map(function (o) { return o.name; }) : [];
      value = names.length ? names : cloneDefault(def);
      break;
    }
    case "date": {
      const d = raw.date && raw.date.start;
      value = d ? String(d).slice(0, 10) : cloneDefault(def);
      break;
    }
    case "files_or_url": {
      value = extractFileUrl(raw);
      break;
    }
    default:
      value = cloneDefault(def);
  }
  return value == null ? cloneDefault(def) : value;
}

/** 对 select 值应用 map，未命中时回退 map.default 或 def */
function mapValue(name, desc, def) {
  if (!name) {
    return (desc.map && desc.map.__default) || cloneDefault(def);
  }
  if (desc.map && Object.prototype.hasOwnProperty.call(desc.map, name)) {
    return desc.map[name];
  }
  // 映射表未命中：原样返回，交由 normalize 的枚举校验降级
  return name;
}

/** 从 files / url 属性中提取首个可用 URL */
function extractFileUrl(raw) {
  if (raw.type === "url" && raw.url) return raw.url;
  const files = raw.files;
  if (Array.isArray(files) && files.length) {
    const f = files[0];
    if (f.type === "external" && f.external && f.external.url) return f.external.url;
    if (f.type === "file" && f.file && f.file.url) return f.file.url;
  }
  return "";
}

/** 深拷贝默认值，避免共享引用被污染 */
function cloneDefault(def) {
  if (def === undefined || def === null) return "";
  return JSON.parse(JSON.stringify(def));
}

/* ---------------- 块递归 ---------------- */

/**
 * 递归拉取某页面的所有子块。
 * @param {string} pageId 页面 id
 * @param {object} opts { token, version, base, fetchImpl, maxDepth }
 * @param {number} [depth] 当前深度
 * @returns {Promise<Array>} 扁平块数组
 */
async function getBlocks(pageId, opts, depth) {
  const d = depth || 0;
  if (d > (opts.maxDepth || 3)) return [];
  let out = [];
  let cursor = null;
  do {
    const url = opts.base + "/blocks/" + pageId + "/children?page_size=100" +
      (cursor ? "&start_cursor=" + encodeURIComponent(cursor) : "");
    const res = await notionFetch(url, { method: "GET" }, opts);
    const list = (res && res.results) || [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      b.__children = [];
      if (b.has_children) {
        b.__children = await getBlocks(b.id, opts, d + 1);
      }
      out.push(b);
    }
    cursor = res && res.has_more ? res.next_cursor : null;
  } while (cursor);
  return out;
}

/**
 * 将块数组转为契约 note[]（quote/comment）。
 * @param {Array} blocks 扁平块数组
 * @returns {Array<{type:string,text:string,source:string}>}
 */
function blocksToNotes(blocks) {
  const out = [];
  (blocks || []).forEach(function (b) {
    if (!b) return;
    const rt = richText(b[b.type] && b[b.type].rich_text);
    if (!rt.trim()) return;
    if (b.type === "quote" || b.type === "callout") {
      out.push({ type: "quote", text: rt });
    } else if (b.type === "paragraph") {
      out.push({ type: "comment", text: rt });
    }
  });
  return out;
}

/**
 * 将块数组转为契约 body[]（h2/p/li/quote）。
 * @param {Array} blocks 扁平块数组
 * @returns {Array<object>}
 */
function blocksToBody(blocks) {
  const out = [];
  (blocks || []).forEach(function (b) {
    if (!b) return;
    if (b.type === "heading_1" || b.type === "heading_2" || b.type === "heading_3") {
      const t = richText(b[b.type].rich_text);
      if (t.trim()) out.push({ h2: t });
    } else if (b.type === "bulleted_list_item" || b.type === "numbered_list_item" || b.type === "to_do") {
      const t = richText(b[b.type].rich_text);
      if (t.trim()) out.push({ li: t });
    } else if (b.type === "quote") {
      const t = richText(b.quote.rich_text);
      if (t.trim()) out.push({ quote: t, source: "" });
    } else if (b.type === "paragraph") {
      const t = richText(b.paragraph.rich_text);
      if (t.trim()) out.push({ p: t });
    }
  });
  return out;
}

/* ---------------- HTTP ---------------- */

/**
 * 带鉴权与版本头的 fetch 包装；非 2xx 抛错。
 * @param {string} url 完整 URL
 * @param {object} init fetch init
 * @param {object} opts { token, version }
 * @returns {Promise<object>} 解析后的 JSON
 */
async function notionFetch(url, init, opts) {
  const fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!fetchImpl) throw new Error("当前 Node 无内置 fetch，请使用 Node 18+");
  const headers = Object.assign(
    {
      "Authorization": "Bearer " + opts.token,
      "Notion-Version": opts.version || VERSION_DEFAULT,
      "Content-Type": "application/json"
    },
    (init && init.headers) || {}
  );
  const res = await fetchImpl(url, Object.assign({}, init, { headers: headers }));
  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch (e) { detail = String(e && e.message); }
    throw new Error("Notion API " + res.status + " " + res.statusText + " @ " + url + " :: " + detail.slice(0, 300));
  }
  return res.json();
}

/**
 * 查询某个数据源（数据库）的全部页面（自动分页）。
 * @param {string} dataSourceId 数据源 id
 * @param {object} opts { token, version, base, fetchImpl }
 * @returns {Promise<Array>} page 数组
 */
async function queryDatabase(dataSourceId, opts) {
  const base = opts.base || API_BASE_DEFAULT;
  const all = [];
  let cursor = null;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const url = base + "/databases/" + dataSourceId + "/query";
    const res = await notionFetch(url, { method: "POST", body: JSON.stringify(body) }, opts);
    const results = (res && res.results) || [];
    all.push.apply(all, results);
    cursor = res && res.has_more ? res.next_cursor : null;
  } while (cursor);
  return all;
}

/* ---------------- 顶层拉取 ---------------- */

/**
 * 拉取全部 5 个模块并按映射转为契约形状的原始源。
 * @param {object} options { token, map?, base?, version?, fetchImpl?, log? }
 * @returns {Promise<{ok:boolean, data:object, counts:object}>}
 * @throws 当 token 缺失或请求失败时抛错（由 build.js 捕获并降级）
 */
async function fetchAll(options) {
  const opts = options || {};
  if (!opts.token) throw new Error("NOTION_TOKEN 未配置");
  const map = opts.map || loadMap(opts.mapPath);
  const base = opts.base || map.apiBase || API_BASE_DEFAULT;
  const version = opts.version || map.notionVersion || VERSION_DEFAULT;
  const log = opts.log || function () {};
  const callOpts = { token: opts.token, version: version, base: base, fetchImpl: opts.fetchImpl, maxDepth: 3 };

  const data = {
    meta: {
      name: "知识花园",
      subtitle: "把散落在 Notion 里的思考，种成一片森林。",
      tagline: "AI 学习 · 图书馆 · 方法论 · 旅行 · Words",
      owner: "个人知识库",
      shareImage: ""
    },
    modules: [],
    ai: { intro: "", projects: [] },
    library: { intro: "", books: [], favorites: [] },
    method: { intro: "", categories: [], articles: [] },
    travel: { intro: "", trips: [] },
    words: { intro: "", categories: [], list: [] }
  };

  const counts = {};
  const src = map.sources || {};

  // 模块导航与各模块容器的静态定义（与本地契约一致）
  const MODULES_META = {
    ai: { name: "AI 学习", icon: "chip", color: "#0071e3", tagline: "动手，是最好的学习方式。", desc: "用 AI 做的小项目。" },
    library: { name: "图书馆", icon: "book", color: "#bf4800", tagline: "阅读是一座随身携带的避难所。", desc: "书库与读书笔记。" },
    method: { name: "方法论", icon: "compass", color: "#6e56cf", tagline: "把踩过的坑，炼成下一次的弹药。", desc: "可执行的思维训练体系。" },
    travel: { name: "旅行", icon: "mountain", color: "#0f8a6a", tagline: "出发，就是最好的准备。", desc: "每一段旅程的清单与路线。" },
    words: { name: "Words", icon: "quote", color: "#c2405f", tagline: "记下那些击中过我的话。", desc: "收藏的句子。" }
  };

  const order = ["ai", "library", "method", "travel", "words"];

  for (let i = 0; i < order.length; i++) {
    const mod = order[i];
    const cfg = src[mod];
    if (!cfg || !cfg.dataSourceId) {
      log("[notion] 模块 " + mod + " 未配置数据源，跳过");
      data.modules.push(Object.assign({ id: mod, count: 0 }, MODULES_META[mod]));
      continue;
    }
    const pages = await queryDatabase(cfg.dataSourceId, callOpts);
    const listKey = cfg.listKey;
    const items = [];

    for (let j = 0; j < pages.length; j++) {
      const page = pages[j];
      const item = {};
      const fields = cfg.fields || {};
      Object.keys(fields).forEach(function (key) {
        item[key] = readField(page, fields[key]);
      });
      // 保留 Notion 原生 page id 作为稳定 id 优先值
      item.id = (page.id || "").replace(/-/g, "");

      // 子块（笔记 / 正文 / 章节）
      const cb = cfg.childrenBlocks;
      if (cb) {
        try {
          const blocks = await getBlocks(page.id, callOpts, 0);
          if (cb.target === "note") item.note = blocksToNotes(blocks);
          else if (cb.target === "body") item.body = blocksToBody(blocks);
          else if (cb.target === "sections") {
            item.sections = blocksToSections(blocks);
          }
        } catch (e) {
          log("[notion] 模块 " + mod + " 子块拉取失败：" + e.message);
        }
      }

      // 图书馆：noteAvailable 由 note 是否非空推导
      if (mod === "library") {
        item.note = item.note || [];
        item.noteAvailable = item.note.length > 0;
        if (!item.noteTitle) item.noteTitle = "读书笔记";
      }
      items.push(item);
    }

    data[mod][listKey] = items;
    counts[mod] = items.length;
    data.modules.push(Object.assign({ id: mod, count: items.length }, MODULES_META[mod]));
    log("[notion] " + mod + " 拉取 " + items.length + " 条");
  }

  // 方法论分类（固定枚举，与本地契约一致）
  data.method.categories = [
    { id: "learn", name: "学习方法" },
    { id: "theory", name: "理论知识" },
    { id: "project", name: "项目管理" },
    { id: "life", name: "为人处事" }
  ];
  // Words 分类（固定枚举）
  data.words.categories = [
    { id: "all", name: "全部" },
    { id: "人生感悟", name: "人生感悟" },
    { id: "休闲文案", name: "休闲文案" },
    { id: "为人处事", name: "为人处事" },
    { id: "装X语录", name: "装X语录" }
  ];

  return { ok: true, data: data, counts: counts };
}

/**
 * 将块数组转为 travel sections（heading 作 title，list 项作 items）。
 * @param {Array} blocks 扁平块数组
 * @returns {Array<{icon:string,title:string,items:string[]}>}
 */
function blocksToSections(blocks) {
  const sections = [];
  let current = null;
  (blocks || []).forEach(function (b) {
    if (!b) return;
    if (b.type === "heading_1" || b.type === "heading_2" || b.type === "heading_3") {
      if (current) sections.push(current);
      current = { icon: "bag", title: richText(b[b.type].rich_text), items: [] };
    } else if (b.type === "bulleted_list_item" || b.type === "numbered_list_item" || b.type === "to_do" || b.type === "paragraph") {
      const t = richText(b[b.type].rich_text);
      if (!t.trim()) return;
      if (!current) current = { icon: "bag", title: "清单", items: [] };
      current.items.push(t);
    }
  });
  if (current) sections.push(current);
  return sections;
}

module.exports = {
  loadMap: loadMap,
  prop: prop,
  richText: richText,
  readField: readField,
  getBlocks: getBlocks,
  queryDatabase: queryDatabase,
  blocksToNotes: blocksToNotes,
  blocksToBody: blocksToBody,
  blocksToSections: blocksToSections,
  fetchAll: fetchAll,
  API_BASE_DEFAULT: API_BASE_DEFAULT,
  VERSION_DEFAULT: VERSION_DEFAULT
};
