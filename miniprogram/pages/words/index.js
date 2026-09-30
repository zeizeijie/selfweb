/* ===========================================================
   pages/words —— Words 列表 + 分类筛选（T06）
   -----------------------------------------------------------
   内容：intro + 分类筛选芯片（全部 + 4 分类，含计数）+ 单列卡片流。
   筛选态：utils/store.js 持久化；onShow 回填。
   words.categories 已含 {id:'all',name:'全部'}。
   空态：筛选无结果用 empty-state。
   =========================================================== */
"use strict";

const store = require("../../utils/store.js");

const MOD = "words";
const SHARE_IMAGE = "/assets/og-default.png";

Page({
  data: {
    intro: "",
    chips: [],
    filter: "all",
    words: [],
    ready: false
  },

  onLoad() {
    const app = getApp();
    const data = app && app.globalData ? app.globalData.data : null;
    if (!data || !data.words) {
      this.setData({ ready: false });
      return;
    }
    const words = data.words;
    const allList = words.list || [];
    const filter = store.getFilter(MOD);
    this.setData({
      intro: words.intro || "",
      chips: buildChips(allList, words.categories || []),
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
   * 应用筛选。
   * @param {string} filter 筛选值（all / 人生感悟 / 休闲文案 / 为人处事 / 装X语录）
   */
  _apply(filter) {
    const app = getApp();
    const data = app && app.globalData ? app.globalData.data : null;
    const allList = data && data.words ? (data.words.list || []) : [];
    const list = filter === "all"
      ? allList
      : allList.filter(function (w) { return w.category === filter; });
    this.setData({
      words: list,
      chips: buildChips(allList, (data && data.words ? data.words.categories : []) || []),
      filter: filter
    });
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

  /** 长按复制文案（P2：长按可复制） */
  onCopy(e) {
    const text = e.currentTarget.dataset.text;
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success() {
        wx.showToast({ title: "已复制", icon: "none" });
      }
    });
  },

  onShareAppMessage() {
    const app = getApp();
    const mod = app && app.getModule ? app.getModule(MOD) : null;
    return {
      title: mod ? mod.name + " · " + (mod.tagline || "") : "Words",
      path: "/pages/words/index",
      imageUrl: SHARE_IMAGE
    };
  },

  onShareTimeline() {
    const app = getApp();
    const mod = app && app.getModule ? app.getModule(MOD) : null;
    return {
      title: mod ? mod.name + " · " + (mod.tagline || "") : "Words",
      imageUrl: SHARE_IMAGE
    };
  }
});

/**
 * 构建分类筛选芯片（直接使用契约 categories，含 all；补计数）。
 * @param {Array} list 全部文案
 * @param {Array<{id:string,name:string}>} cats 契约分类（含 all）
 * @returns {Array<{id:string,name:string,count:number}>}
 */
function buildChips(list, cats) {
  const arr = list || [];
  const categories = (cats && cats.length)
    ? cats
    : [{ id: "all", name: "全部" }];
  return categories.map(function (c) {
    const count = c.id === "all"
      ? arr.length
      : arr.filter(function (w) { return w.category === c.id; }).length;
    return { id: c.id, name: c.name, count: count };
  });
}
