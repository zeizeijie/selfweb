/* ===========================================================
   utils/store.js —— 筛选态持久化 + 契约查询（T05）
   -----------------------------------------------------------
   职责（架构 §6.7）：
     · getFilter(mod) / setFilter(mod, v) / clearFilter(mod)
       使用 wx.setStorageSync 持久化，key = `filter:<mod>`；
     · findById(mod, id)  按 id 在契约中查找实体；
     · updateFilterChips(items)  基于条目 + 当前筛选计算芯片计数（可选辅助）。
   依赖：wx 同步存储 API、getApp().globalData.data。
   =========================================================== */
"use strict";

/** 模块 id → 契约集合字段名 */
const LIST_KEY = {
  ai: "projects",
  library: "books",
  method: "articles",
  travel: "trips",
  words: "list"
};

/** 默认筛选值 */
const DEFAULT_FILTER = "all";

/**
 * 生成存储 key。
 * @param {string} mod 模块 id
 * @returns {string}
 */
function keyOf(mod) {
  return "filter:" + mod;
}

/**
 * 读取某模块的筛选态（无则返回默认 "all"）。
 * @param {string} mod
 * @returns {string}
 */
function getFilter(mod) {
  try {
    const v = wx.getStorageSync(keyOf(mod));
    return v ? String(v) : DEFAULT_FILTER;
  } catch (e) {
    return DEFAULT_FILTER;
  }
}

/**
 * 写入某模块的筛选态。
 * @param {string} mod
 * @param {string} v 筛选值（如 "all" / "已读" / "learn"）
 * @returns {void}
 */
function setFilter(mod, v) {
  try {
    wx.setStorageSync(keyOf(mod), v ? String(v) : DEFAULT_FILTER);
  } catch (e) {
    // 存储失败不阻断交互
  }
}

/**
 * 清除某模块的筛选态（回到默认）。
 * @param {string} mod
 * @returns {void}
 */
function clearFilter(mod) {
  try {
    wx.removeStorageSync(keyOf(mod));
  } catch (e) {
    // 忽略
  }
}

/**
 * 取模块对应的契约集合数组。
 * @param {object} data 契约
 * @param {string} mod 模块 id
 * @returns {Array}
 */
function listOf(data, mod) {
  const key = LIST_KEY[mod];
  if (!data || !key || !data[mod]) return [];
  return data[mod][key] || [];
}

/**
 * 按 id 在契约中查找实体。
 * @param {string} mod 模块 id
 * @param {string} id 稳定 id（如 book-003）
 * @returns {object|null}
 */
function findById(mod, id) {
  let data = null;
  try {
    data = getApp().globalData.data;
  } catch (e) {
    data = null;
  }
  if (!data) return null;
  const list = listOf(data, mod);
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

/**
 * 计算芯片组的计数（可选辅助，供页面构建 chip-bar items）。
 * @param {Array} list 条目数组
 * @param {string} field 分类字段名（如 "status" / "category"）
 * @param {Array<{id:string,name:string}>} categories 分类定义（不含 all）
 * @returns {Array<{id:string,name:string,count:number}>}
 */
function buildChips(list, field, categories) {
  const arr = list || [];
  const cats = categories || [];
  const head = { id: DEFAULT_FILTER, name: "全部", count: arr.length };
  const rest = cats.map(function (c) {
    const count = arr.filter(function (x) { return x[field] === c.id; }).length;
    return { id: c.id, name: c.name, count: count };
  });
  return [head].concat(rest);
}

module.exports = {
  LIST_KEY: LIST_KEY,
  DEFAULT_FILTER: DEFAULT_FILTER,
  keyOf: keyOf,
  getFilter: getFilter,
  setFilter: setFilter,
  clearFilter: clearFilter,
  listOf: listOf,
  findById: findById,
  buildChips: buildChips
};
