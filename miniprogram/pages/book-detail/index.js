/* ===========================================================
   pages/book-detail —— 书籍详情（T07）
   -----------------------------------------------------------
   入参：?id=book-001
   内容：封面（+降级）、书名、作者、状态/标签/阅读时间徽标、评分星、
         读书笔记（quote 引用块 / comment 点评样式）。
   查找：utils/store.findById('library', id)；找不到 → 错误态。
   正文：**粗体** 用 utils/format.richNodes() 渲染（rich-text）。
   分享：onShareAppMessage → {title: 书名, path: '.../book-detail/index?id=xxx'}。
   =========================================================== */
"use strict";

const store = require("../../utils/store.js");
const format = require("../../utils/format.js");

const SHARE_IMAGE = "/assets/og-default.png";

Page({
  data: {
    id: "",
    book: null,
    notes: [],
    coverOk: true,
    hasCover: false,
    fallback: format.DEFAULT_GRADIENT,
    starStr: "",
    notFound: false,
    ready: false
  },

  onLoad(options) {
    const id = options && options.id ? decodeURIComponent(options.id) : "";
    this.setData({ id: id });
    this._load(id);
  },

  /**
   * 按 id 加载书籍详情。
   * @param {string} id 书籍 id
   */
  _load(id) {
    const book = id ? store.findById("library", id) : null;
    if (!book) {
      this.setData({ notFound: true, ready: true });
      wx.setNavigationBarTitle({ title: "未找到书籍" });
      return;
    }
    const cov = format.coverOf(book);
    wx.setNavigationBarTitle({ title: book.title || "书籍详情" });
    this.setData({
      book: book,
      notes: buildNotes(book),
      hasCover: cov.hasCover,
      fallback: cov.fallback,
      coverOk: true,
      starStr: format.stars(book.rating),
      notFound: false,
      ready: true
    });
  },

  /** 封面加载失败：切渐变 + 书名 */
  onCoverError() {
    this.setData({ coverOk: false });
  },

  /** 错误态重试：重新按 id 加载 */
  onRetry() {
    this.setData({ ready: false, notFound: false });
    this._load(this.data.id);
  },

  onShareAppMessage() {
    const b = this.data.book;
    if (!b) {
      return { title: "知识花园", path: "/pages/library/index", imageUrl: SHARE_IMAGE };
    }
    return {
      title: b.title + (b.author ? " · " + b.author : ""),
      path: "/pages/book-detail/index?id=" + encodeURIComponent(b.id),
      imageUrl: SHARE_IMAGE
    };
  }
});

/**
 * 构建读书笔记渲染数据：quote → {kind:'quote', nodes, source}；
 * comment → {kind:'comment', nodes}。
 * @param {object} book 书籍实体
 * @returns {Array<{kind:string,nodes:Array,source:string}>}
 */
function buildNotes(book) {
  if (!book || !book.noteAvailable || !book.note || !book.note.length) return [];
  return book.note.map(function (n) {
    const kind = n.type === "comment" ? "comment" : "quote";
    return {
      kind: kind,
      nodes: format.richNodes(n.text),
      source: n.source || ""
    };
  });
}
