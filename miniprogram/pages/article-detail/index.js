/* ===========================================================
   pages/article-detail —— 文章详情（T07）
   -----------------------------------------------------------
   入参：?id=article-001
   内容：分类标签、标题、阅读时长、结构化正文
         （h2→小标题、p→段落、li→列表、quote→引用块）。
   正文 **粗体** 用 utils/format.richNodes() 渲染（rich-text），
   禁止直接输出 ** 原文。
   查找：utils/store.findById('method', id)；找不到 → 错误态。
   分享：onShareAppMessage → {title: 标题, path: '.../article-detail/index?id=xxx'}。
   =========================================================== */
"use strict";

const store = require("../../utils/store.js");
const format = require("../../utils/format.js");

const SHARE_IMAGE = "/assets/og-default.png";

Page({
  data: {
    id: "",
    article: null,
    catName: "",
    body: [],
    notFound: false,
    ready: false
  },

  onLoad(options) {
    const id = options && options.id ? decodeURIComponent(options.id) : "";
    this.setData({ id: id });
    this._load(id);
  },

  /**
   * 按 id 加载文章详情。
   * @param {string} id 文章 id
   */
  _load(id) {
    const article = id ? store.findById("method", id) : null;
    if (!article) {
      this.setData({ notFound: true, ready: true });
      wx.setNavigationBarTitle({ title: "未找到文章" });
      return;
    }
    wx.setNavigationBarTitle({ title: article.title || "文章详情" });
    this.setData({
      article: article,
      catName: this._catName(article.category),
      body: buildBody(article.body),
      notFound: false,
      ready: true
    });
  },

  /**
   * 分类 id → 显示名（优先用契约 method.categories 的 name）。
   * @param {string} id 分类 id
   * @returns {string}
   */
  _catName(id) {
    const app = getApp();
    const data = app && app.globalData ? app.globalData.data : null;
    const cats = data && data.method ? (data.method.categories || []) : [];
    const hit = cats.filter(function (c) { return c.id === id; })[0];
    return hit ? hit.name : format.categoryName(id);
  },

  /** 错误态重试 */
  onRetry() {
    this.setData({ ready: false, notFound: false });
    this._load(this.data.id);
  },

  onShareAppMessage() {
    const a = this.data.article;
    if (!a) {
      return { title: "知识花园", path: "/pages/method/index", imageUrl: SHARE_IMAGE };
    }
    return {
      title: a.title,
      path: "/pages/article-detail/index?id=" + encodeURIComponent(a.id),
      imageUrl: SHARE_IMAGE
    };
  }
});

/**
 * 把 body[] 节点预计算为渲染用数组：
 *   {h2}                → {kind:'h2', text}
 *   {p}                 → {kind:'p',  nodes}（**粗体** 已解析）
 *   {li}                → {kind:'li', nodes}
 *   {quote, source?}    → {kind:'quote', nodes, source}
 * @param {Array} body 契约正文节点
 * @returns {Array<object>}
 */
function buildBody(body) {
  return (body || []).map(function (n) {
    if (n.h2) return { kind: "h2", text: String(n.h2) };
    if (n.p) return { kind: "p", nodes: format.richNodes(n.p) };
    if (n.li) return { kind: "li", nodes: format.richNodes(n.li) };
    if (n.quote) {
      return { kind: "quote", nodes: format.richNodes(n.quote), source: n.source || "" };
    }
    return null;
  }).filter(function (x) { return !!x; });
}
