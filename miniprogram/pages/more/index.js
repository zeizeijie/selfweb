/* ===========================================================
   pages/more —— 更多（T06）
   -----------------------------------------------------------
   内容：旅行 + Words 两个入口 + 站点信息（meta.owner / subtitle）。
   无筛选。分享：onShareAppMessage。
   =========================================================== */
"use strict";

const SHARE_IMAGE = "/assets/og-default.png";
const LIST_KEY = { travel: "trips", words: "list" };

Page({
  data: {
    meta: null,
    entries: [],
    ready: false
  },

  onLoad() {
    const app = getApp();
    const data = app && app.globalData ? app.globalData.data : null;
    if (!data) {
      this.setData({ ready: false });
      return;
    }
    const meta = data.meta || {};
    const travelMod = findModule(data, "travel");
    const wordsMod = findModule(data, "words");
    const entries = [
      {
        id: "travel",
        name: travelMod ? travelMod.name : "旅行",
        tagline: travelMod ? travelMod.tagline : "记录走过的路",
        count: countOf(data, "travel"),
        unit: "段旅程",
        color: travelMod ? travelMod.color : "#0f8a6a",
        path: "/pages/travel/index"
      },
      {
        id: "words",
        name: wordsMod ? wordsMod.name : "Words",
        tagline: wordsMod ? wordsMod.tagline : "收藏喜欢的句子",
        count: countOf(data, "words"),
        unit: "句收藏",
        color: wordsMod ? wordsMod.color : "#c2405f",
        path: "/pages/words/index"
      }
    ];
    this.setData({
      meta: meta,
      entries: entries,
      ready: true
    });
  },

  /** 点击入口：navigateTo 对应模块页 */
  onTapEntry(e) {
    const path = e.currentTarget.dataset.path;
    if (!path) return;
    wx.navigateTo({ url: path });
  },

  onShareAppMessage() {
    const meta = this.data.meta || {};
    return {
      title: meta.name ? meta.name + " · 更多" : "知识花园",
      path: "/pages/more/index",
      imageUrl: SHARE_IMAGE
    };
  },

  onShareTimeline() {
    const meta = this.data.meta || {};
    return {
      title: meta.name ? meta.name + " · 更多" : "知识花园",
      imageUrl: SHARE_IMAGE
    };
  }
});

/**
 * 在 modules[] 中查找模块。
 * @param {object} data 契约
 * @param {string} id 模块 id
 * @returns {object|null}
 */
function findModule(data, id) {
  const list = (data && data.modules ? data.modules : []).filter(function (m) {
    return m.id === id;
  });
  return list[0] || null;
}

/**
 * 取模块真实条数：优先 modules[].count，回退集合长度。
 * @param {object} data 契约
 * @param {string} mod 模块 id
 * @returns {number}
 */
function countOf(data, mod) {
  const key = LIST_KEY[mod];
  const real = data && data[mod] && data[mod][key] ? data[mod][key].length : 0;
  const m = findModule(data, mod);
  return m && typeof m.count === "number" ? m.count : real;
}
