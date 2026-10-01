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
    years: [],
    activeYear: "",
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
      years: buildYears(data.library.years || [], allBooks),
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
   * 应用筛选：状态与年份叠加过滤，更新书籍列表与芯片计数。
   * @param {string} filter 筛选值（all / 已读 / 在读 / 想读）
   */
  _apply(filter) {
    const all = this.data.allBooks || [];
    const year = this.data.activeYear || "";
    const books = all.filter(function (b) {
      return (filter === "all" || b.status === filter) && (!year || b.year === year);
    });
    this.setData({ books: books, chips: buildChips(all, year), filter: filter });
  },

  /** 点击芯片：持久化 + 重新过滤 */
  onChip(e) {
    const value = e.detail.value;
    if (!value) return;
    store.setFilter(MOD, value);
    this._apply(value);
  },

  /** 点击年报卡：切换该年筛选，再次点击取消 */
  onToggleYear(e) {
    const year = e.currentTarget.dataset.year;
    if (!year) return;
    const next = this.data.activeYear === year ? "" : year;
    this.setData({ activeYear: next });
    this._apply(this.data.filter);
  },

  /** 空态「查看全部」：回到 all 并取消年份筛选 */
  onEmptyAction() {
    store.setFilter(MOD, "all");
    this.setData({ activeYear: "" });
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
 * @param {string} [year] 年份筛选（空 = 不限），计数随年份过滤
 * @returns {Array<{id:string,name:string,count:number}>}
 */
function buildChips(books, year) {
  const arr = (books || []).filter(function (b) { return !year || b.year === year; });
  const head = { id: "all", name: "全部", count: arr.length };
  const rest = STATUS_DEFS.map(function (s) {
    const count = arr.filter(function (b) { return b.status === s.id; }).length;
    return { id: s.id, name: s.name, count: count };
  });
  return [head].concat(rest);
}

/**
 * 构建年报渲染数据：进度百分比 + 总结文案 + 选中态。
 * @param {Array} years 契约 library.years（已按 year 降序）
 * @param {Array} books 全部书籍（年份筛选态用）
 * @returns {Array<{year,goalText,read,total,percent,summary,done}>}
 */
function buildYears(years, books) {
  return (years || []).map(function (y) {
    const hasGoal = typeof y.goal === "number" && y.goal > 0;
    const denom = hasGoal ? y.goal : (y.total || y.read || 1);
    const percent = Math.max(0, Math.min(100, denom ? Math.round((y.read / denom) * 100) : 0));
    let summary;
    if (hasGoal) {
      summary = y.read >= y.goal ? "已达成年度目标 🎉" : "距目标还差 " + (y.goal - y.read) + " 本";
    } else {
      summary = "已读 " + y.read + " 本";
    }
    return {
      year: y.year,
      goalText: hasGoal ? "目标 " + y.goal + " 本" : "未设目标",
      read: y.read,
      total: y.total,
      percent: percent,
      summary: summary,
      done: hasGoal && y.read >= y.goal
    };
  });
}
