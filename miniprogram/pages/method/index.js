/* ===========================================================
   pages/method —— 方法论列表 + 分类筛选（T06）
   -----------------------------------------------------------
   内容：intro + 分类筛选芯片（全部 + 4 分类，含计数）+ 方法论卡网格。
   筛选态：utils/store.js 持久化；onShow 回填。
   分类名：utils/format.js categoryName()（learn→学习方法 等）。
   空态：筛选无结果用 empty-state。
   =========================================================== */
"use strict";

const store = require("../../utils/store.js");
const format = require("../../utils/format.js");

const MOD = "method";
const SHARE_IMAGE = "/assets/og-default.png";

Page({
  data: {
    intro: "",
    chips: [],
    filter: "all",
    articles: [],
    allArticles: [],
    catName: {},
    ready: false
  },

  onLoad() {
    const app = getApp();
    const data = app && app.globalData ? app.globalData.data : null;
    if (!data || !data.method) {
      this.setData({ ready: false });
      return;
    }
    const method = data.method;
    const allArticles = method.articles || [];
    const cats = method.categories || [];
    // 分类 id → 显示名（用契约分类的 name，回退 format.categoryName）
    const catName = {};
    cats.forEach(function (c) { catName[c.id] = c.name; });

    const filter = store.getFilter(MOD);
    this.setData({
      intro: method.intro || "",
      allArticles: allArticles,
      catName: catName,
      chips: buildChips(allArticles, cats),
      filter: filter,
      ready: true
    });
    this._apply(filter);
  },

  onShow() {
    if (!this.data.ready) return;
    const filter = store.getFilter(MOD);
    if (filter !== this.data.filter) {
      this.setData({ filter: filter });
    }
    this._apply(filter);
  },

  /**
   * 应用筛选：更新文章列表。
   * @param {string} filter 筛选值（all / learn / theory / project / life）
   */
  _apply(filter) {
    const all = this.data.allArticles || [];
    const articles = filter === "all"
      ? all
      : all.filter(function (a) { return a.category === filter; });
    const cats = this._cats();
    this.setData({
      articles: articles,
      chips: buildChips(all, cats),
      filter: filter
    });
  },

  /** 从已有 chips 反推分类定义（用于计数） */
  _cats() {
    return (this.data.chips || [])
      .filter(function (c) { return c.id !== "all"; })
      .map(function (c) { return { id: c.id, name: c.name }; });
  },

  /** 取某文章的分类显示名 */
  _nameOf(id) {
    return this.data.catName[id] || format.categoryName(id);
  },

  /** 点击芯片 */
  onChip(e) {
    const value = e.detail.value;
    if (!value) return;
    store.setFilter(MOD, value);
    this._apply(value);
  },

  /** 空态「查看全部」 */
  onEmptyAction() {
    store.setFilter(MOD, "all");
    this._apply("all");
  },

  /** 点击方法论卡：进入详情 */
  onTapCard(e) {
    const id = e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: "/pages/article-detail/index?id=" + encodeURIComponent(id) });
  },

  onShareAppMessage() {
    const app = getApp();
    const mod = app && app.getModule ? app.getModule(MOD) : null;
    return {
      title: mod ? mod.name + " · " + (mod.tagline || "") : "方法论",
      path: "/pages/method/index",
      imageUrl: SHARE_IMAGE
    };
  },

  onShareTimeline() {
    const app = getApp();
    const mod = app && app.getModule ? app.getModule(MOD) : null;
    return {
      title: mod ? mod.name + " · " + (mod.tagline || "") : "方法论",
      imageUrl: SHARE_IMAGE
    };
  }
});

/**
 * 构建分类筛选芯片（全部 + 4 分类，各含计数）。
 * @param {Array} articles 全部文章
 * @param {Array<{id:string,name:string}>} cats 分类定义
 * @returns {Array<{id:string,name:string,count:number}>}
 */
function buildChips(articles, cats) {
  const arr = articles || [];
  const head = { id: "all", name: "全部", count: arr.length };
  const rest = (cats || []).map(function (c) {
    const count = arr.filter(function (a) { return a.category === c.id; }).length;
    return { id: c.id, name: c.name, count: count };
  });
  return [head].concat(rest);
}
