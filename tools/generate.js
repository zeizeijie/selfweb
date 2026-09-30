/* ===========================================================
   tools/generate.js —— 双端产物生成器（纯序列化）
   -----------------------------------------------------------
   约束（架构 §3.2）：本模块不做任何字段增删改，只把同一份契约对象
   序列化为两种包装语法：
     · toSiteJs(contract) -> "window.SITE_DATA = {...};"   （网站）
     · toMiniJs(contract) -> "module.exports = {...};"     （小程序）
   两端产物结构逐字节同构，仅外层包装不同。
   =========================================================== */
"use strict";

/** 站点数据文件的头部注释 */
const SITE_HEADER = [
  "/* ===========================================================",
  "   贼贼接 · 站点数据（构建产物，请勿手工编辑）",
  "   由 tools/build.js 生成：源 = Notion 同步 或 data/site-data.local.json 或 内置兜底",
  "   双端同源：与 miniprogram/utils/data.js 结构完全一致",
  "   =========================================================== */",
  ""
].join("\n");

/** 小程序数据文件的头部注释 */
const MINI_HEADER = [
  "/* ===========================================================",
  "   贼贼接 · 小程序数据（构建产物，请勿手工编辑）",
  "   由 tools/build.js 生成：与 site/data.js 结构完全一致",
  "   =========================================================== */",
  ""
].join("\n");

/**
 * 稳定的 JSON 序列化（缩进 2，保持非 ASCII 原样字符，便于人工比对）。
 * @param {object} contract 契约对象
 * @returns {string} JSON 文本
 */
function stringify(contract) {
  return JSON.stringify(contract, null, 2);
}

/**
 * 生成网站数据文件内容：window.SITE_DATA = {...};
 * @param {object} contract 契约对象
 * @returns {string} 文件内容
 */
function toSiteJs(contract) {
  return SITE_HEADER + "window.SITE_DATA = " + stringify(contract) + ";\n";
}

/**
 * 生成小程序数据文件内容：module.exports = {...};
 * @param {object} contract 契约对象
 * @returns {string} 文件内容
 */
function toMiniJs(contract) {
  return MINI_HEADER + "module.exports = " + stringify(contract) + ";\n";
}

/**
 * 生成数据指纹摘要（用于双端一致性校验 / 日志）。
 * @param {object} contract 契约对象
 * @returns {string} 契约对象的稳定 JSON（无空白差异）
 */
function fingerprint(contract) {
  return JSON.stringify(contract);
}

module.exports = {
  toSiteJs: toSiteJs,
  toMiniJs: toMiniJs,
  fingerprint: fingerprint,
  stringify: stringify
};
