/* ===========================================================
   utils/format.js —— 纯函数格式化工具（T05）
   -----------------------------------------------------------
   供各页面 / 组件复用，无副作用、无依赖、可单测：
     · richNodes(text)  把 `**粗体**` 文本解析为 rich-text nodes 数组
     · stars(n)         0..5 → "★★★★☆"，n===0 → ""
     · coverOf(entity)  统一封面降级判定 {cover, fallback, hasCover}
     · truncate(s, n)   截断文本并追加省略号
     · categoryName()   分类 id → 显示名（含方法论的枚举映射）
     · gradientOf()     取渐变兜底色（旅行 / 书籍）
   约束（架构 §6.5）：仅支持 `**粗体**`，禁止内联 HTML/脚本，天然防 XSS。
   =========================================================== */
"use strict";

/** 默认渐进兜底渐变（与网站 DEFAULT_GRADIENT 一致） */
const DEFAULT_GRADIENT = "linear-gradient(135deg,#86868b,#48484a)";

/** 方法论分类 id → 显示名（架构 §10.1） */
const METHOD_CATEGORY_NAME = {
  learn: "学习方法",
  theory: "理论知识",
  project: "项目管理",
  life: "为人处事"
};

/**
 * 将含 `**粗体**` 的文本解析为小程序 rich-text 所需的 nodes 数组。
 * 纯函数：输入字符串，输出 {type:'text',text,attrs?} 数组；无匹配则返回单段。
 * @param {string} s 原文（可为 null/undefined）
 * @returns {Array<{type:string,text:string,attrs?:{style:string}}>}
 */
function richNodes(s) {
  const out = [];
  const str = String(s == null ? "" : s);
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m = re.exec(str);
  while (m !== null) {
    if (m.index > last) out.push({ type: "text", text: str.slice(last, m.index) });
    out.push({ type: "text", text: m[1], attrs: { style: "font-weight:600" } });
    last = m.index + m[0].length;
    m = re.exec(str);
  }
  if (last < str.length) out.push({ type: "text", text: str.slice(last) });
  if (out.length === 0) out.push({ type: "text", text: "" });
  return out;
}

/**
 * 评分 → 星号字符串。
 * @param {number} n 整数 0..5
 * @returns {string} 如 "★★★★☆"；n===0 或非法时返回 ""
 */
function stars(n) {
  const v = Math.round(Number(n) || 0);
  if (v <= 0) return "";
  const capped = Math.min(v, 5);
  let out = "";
  for (let i = 0; i < 5; i++) out += i < capped ? "★" : "☆";
  return out;
}

/**
 * 判断封面值是否可作为图片渲染。
 * 空串 / attachment: 残留 / 非 http(s) 或本地路径 一律判为不可用。
 * @param {string} cover
 * @returns {boolean}
 */
function isUsableCover(cover) {
  const c = String(cover == null ? "" : cover).trim();
  if (!c) return false;
  if (/^attachment:/i.test(c)) return false;
  if (/^https?:\/\//i.test(c)) return true;
  if (c.charAt(0) === "/" || c.indexOf("./") === 0) return true;
  return false;
}

/**
 * 统一封面降级判定。
 * @param {{cover?:string,coverFallback?:string,title?:string}} entity
 * @returns {{cover:string, fallback:string, hasCover:boolean}}
 */
function coverOf(entity) {
  const e = entity || {};
  const hasCover = isUsableCover(e.cover);
  return {
    cover: hasCover ? String(e.cover) : "",
    fallback: e.coverFallback || DEFAULT_GRADIENT,
    hasCover: hasCover
  };
}

/**
 * 取实体应使用的封面兜底渐变（封面可用时也返回兜底值，供加载失败时切换）。
 * @param {{cover?:string,coverFallback?:string}} entity
 * @returns {string} CSS 渐变值
 */
function gradientOf(entity) {
  const e = entity || {};
  return e.coverFallback || DEFAULT_GRADIENT;
}

/**
 * 截断文本。
 * @param {string} s 原文
 * @param {number} n 最大长度
 * @returns {string}
 */
function truncate(s, n) {
  const str = String(s == null ? "" : s);
  const max = Number(n) || 0;
  if (max <= 0 || str.length <= max) return str;
  return str.slice(0, max) + "…";
}

/**
 * 分类 id → 显示名（方法论 4 分类）。
 * @param {string} id
 * @returns {string}
 */
function categoryName(id) {
  return METHOD_CATEGORY_NAME[id] || String(id || "");
}

/**
 * 移除「（待补）」并返回是否为待办项。
 * @param {string} text
 * @returns {{text:string, pending:boolean}}
 */
function checklistItem(text) {
  const str = String(text == null ? "" : text);
  const pending = str.indexOf("（待补）") >= 0;
  return { text: str.replace("（待补）", ""), pending: pending };
}

module.exports = {
  DEFAULT_GRADIENT: DEFAULT_GRADIENT,
  METHOD_CATEGORY_NAME: METHOD_CATEGORY_NAME,
  richNodes: richNodes,
  stars: stars,
  isUsableCover: isUsableCover,
  coverOf: coverOf,
  gradientOf: gradientOf,
  truncate: truncate,
  categoryName: categoryName,
  checklistItem: checklistItem
};
