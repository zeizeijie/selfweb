/* ===========================================================
   pages/library —— 图书馆列表 + 状态筛选（T06）
   -----------------------------------------------------------
   内容：intro + 状态筛选芯片（全部/已读/在读/想读，含计数）+ 2 列书籍网格。
   筛选态：utils/store.js 持久化；onLoad/onShow 回填，详情返回后不丢。
   封面降级：book-card 内建 binderror → 渐变 + 书名。
   空态：筛选无结果用 empty-state（「查看全部」按钮重置为 all）。
   分享：onShareAppMessage。
   =========================================================== */
"use strict";

const store = require("../../utils/store.js");

const MOD = "library";
const SHARE_IMAGE = "/assets/og-default.png";
/** 状态定义（顺序即展示顺序） */
const STATUS_DEFS = [
  { id: "已读", name: "已读" },
  { id: "在读", name: "在读" },
  { id: "想读", name: "想读" }
];

Page({
  data: {
    intro: "",
    chips: [],
    filter: "all",
    books: [],
    allBooks: [],
    ready: false
  },

  onLoad() {
    const app = getApp();
    const data = app && app.globalData ? app.globalData.data : null;
    if (!data || !data.library) {
      this.setData({ ready: false });
      return;
    }
    const allBooks = data.library.books || [];
    const filter = store.getFilter(MOD);
    this.setData({
      intro: data.library.intro || "",
      allBooks: allBooks,
      chips: buildChips(allBooks),
      filter: filter,
      ready: true
    });
    this._apply(filter);
  },

  onShow() {
    // tabBar 切换/详情返回后回填筛选态（Page 实例可能被复用）
    if (!this.data.ready) return;
    const filter = store.getFilter(MOD);
    if (filter !== this.data.filter) {
      this.setData({ filter: filter });
    }
    this._apply(filter);
  },

  /**
   * 应用筛选：更新书籍列表与芯片计数。
   * @param {string} filter 筛选值（all / 已读 / 在读 / 想读）
   */
  _apply(filter) {
    const all = this.data.allBooks || [];
    const books = filter === "all"
      ? all
      : all.filter(function (b) { return b.status === filter; });
    this.setData({ books: books, chips: buildChips(all), filter: filter });
  },

  /** 点击芯片：持久化 + 重新过滤 */
  onChip(e) {
    const value = e.detail.value;
    if (!value) return;
    store.setFilter(MOD, value);
    this._apply(value);
  },

  /** 空态「查看全部」：回到 all */
  onEmptyAction() {
    store.setFilter(MOD, "all");
    this._apply("all");
  },

  /** 点击书籍卡：进入详情页（携带 id） */
  onTapBook(e) {
    const id = e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: "/pages/book-detail/index?id=" + encodeURIComponent(id) });
  },

  onShareAppMessage() {
    const app = getApp();
    const mod = app && app.getModule ? app.getModule(MOD) : null;
    return {
      title: mod ? mod.name + " · " + (mod.tagline || "") : "图书馆",
      path: "/pages/library/index",
      imageUrl: SHARE_IMAGE
    };
  },

  onShareTimeline() {
    const app = getApp();
    const mod = app && app.getModule ? app.getModule(MOD) : null;
    return {
      title: mod ? mod.name + " · " + (mod.tagline || "") : "图书馆",
      imageUrl: SHARE_IMAGE
    };
  }
});

/**
 * 构建状态筛选芯片（全部 + 3 状态，各含计数）。
 * @param {Array} books 全部书籍
 * @returns {Array<{id:string,name:string,count:number}>}
 */
function buildChips(books) {
  const arr = books || [];
  const head = { id: "all", name: "全部", count: arr.length };
  const rest = STATUS_DEFS.map(function (s) {
    const count = arr.filter(function (b) { return b.status === s.id; }).length;
    return { id: s.id, name: s.name, count: count };
  });
  return [head].concat(rest);
}
