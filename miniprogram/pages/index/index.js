/* ===========================================================
   pages/index —— 首页（T06 列表页实现）
   -----------------------------------------------------------
   内容：hero（站点名 + subtitle + tagline）+ 数据统计 + 5 张模块卡 + 页脚。
   数据：meta.* / modules[]（读 count，不硬编码）。
   交互：点击模块卡 → navigateTo 对应列表页；tabBar 页用 switchTab。
   分享：onShareAppMessage（标题=站点名 + tagline，图=og-default.png）。
   =========================================================== */
"use strict";

const LIST_KEY = {
  ai: "projects",
  library: "books",
  method: "articles",
  travel: "trips",
  words: "list"
};

/** tabBar 已注册的页面路径（点击需 switchTab，否则 navigateTo 会失败） */
const TAB_PAGES = {
  "pages/ai/index": true,
  "pages/library/index": true,
  "pages/method/index": true,
  "pages/more/index": true
};

/** 默认分享图（与站点资源一致性：assets/og-default.png） */
const SHARE_IMAGE = "/assets/og-default.png";

Page({
  data: {
    meta: null,
    modules: [],
    stats: [],
    owner: "",
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
    const modules = (data.modules || []).map(function (m) {
      return {
        id: m.id,
        name: m.name,
        icon: m.icon,
        color: m.color,
        tagline: m.tagline,
        desc: m.desc,
        count: typeof m.count === "number" ? m.count : 0,
        path: "/pages/" + m.id + "/index"
      };
    });
    this.setData({
      meta: meta,
      modules: modules,
      owner: meta.owner || "",
      stats: this._buildStats(data),
      ready: true
    });
  },

  /**
   * 构建首页数据统计（图书馆/方法论/旅行/Words 的真实条数）。
   * @param {object} data 契约
   * @returns {Array<{label:string,value:number}>}
   */
  _buildStats(data) {
    const self = this;
    const defs = [
      { id: "library", label: "本书" },
      { id: "method", label: "条方法" },
      { id: "travel", label: "段旅程" },
      { id: "words", label: "句收藏" }
    ];
    return defs.map(function (d) {
      return { label: d.label, value: self._countOf(data, d.id) };
    });
  },

  /**
   * 取某模块真实条数：优先 modules[].count，回退集合长度。
   * @param {object} data 契约
   * @param {string} mod 模块 id
   * @returns {number}
   */
  _countOf(data, mod) {
    const key = LIST_KEY[mod];
    const real = data && data[mod] && data[mod][key] ? data[mod][key].length : 0;
    const list = (data && data.modules ? data.modules : []).filter(function (m) {
      return m.id === mod;
    });
    const m = list[0];
    return m && typeof m.count === "number" ? m.count : real;
  },

  /** 点击模块卡：tabBar 页用 switchTab，其余 navigateTo */
  onTapModule(e) {
    const path = e.currentTarget.dataset.path;
    if (!path) return;
    if (TAB_PAGES[path.replace(/^\//, "")]) {
      wx.switchTab({ url: path });
    } else {
      wx.navigateTo({ url: path });
    }
  },

  /** 分享：标题 = 站点名 + tagline，路径 = 首页 */
  onShareAppMessage() {
    const meta = this.data.meta || {};
    return {
      title: meta.name ? meta.name + " · " + (meta.tagline || "") : "知识花园",
      path: "/pages/index/index",
      imageUrl: SHARE_IMAGE
    };
  },

  /** 分享到朋友圈 */
  onShareTimeline() {
    const meta = this.data.meta || {};
    return {
      title: meta.name ? meta.name + " · " + (meta.tagline || "") : "知识花园",
      imageUrl: SHARE_IMAGE
    };
  }
});
