/* ===========================================================
   pages/trip-detail —— 行程详情（T07）
   -----------------------------------------------------------
   入参：?id=trip-001
   内容：渐变 banner（地点 + 标题）、摘要、
         sections（图标 + 标题 + items 列表）、
         checklists（勾选芯片，含「（待补）」虚线样式）、tip 提示框。
   sections / checklists 互斥（契约定型）。
   查找：utils/store.findById('travel', id)；找不到 → 错误态。
   分享：onShareAppMessage → {title: 标题, path: '.../trip-detail/index?id=xxx'}。
   =========================================================== */
"use strict";

const store = require("../../utils/store.js");
const format = require("../../utils/format.js");

const SHARE_IMAGE = "/assets/og-default.png";

Page({
  data: {
    id: "",
    trip: null,
    cover: format.DEFAULT_GRADIENT,
    sections: [],
    checklists: [],
    tip: "",
    notFound: false,
    ready: false
  },

  onLoad(options) {
    const id = options && options.id ? decodeURIComponent(options.id) : "";
    this.setData({ id: id });
    this._load(id);
  },

  /**
   * 按 id 加载行程详情。
   * @param {string} id 行程 id
   */
  _load(id) {
    const trip = id ? store.findById("travel", id) : null;
    if (!trip) {
      this.setData({ notFound: true, ready: true });
      wx.setNavigationBarTitle({ title: "未找到行程" });
      return;
    }
    wx.setNavigationBarTitle({ title: trip.title || "行程详情" });
    this.setData({
      trip: trip,
      cover: trip.cover || format.DEFAULT_GRADIENT,
      sections: buildSections(trip.sections),
      checklists: buildChecklists(trip.checklists),
      tip: trip.tip || "",
      notFound: false,
      ready: true
    });
  },

  /** 错误态重试 */
  onRetry() {
    this.setData({ ready: false, notFound: false });
    this._load(this.data.id);
  },

  onShareAppMessage() {
    const t = this.data.trip;
    if (!t) {
      return { title: "贼贼接", path: "/pages/travel/index", imageUrl: SHARE_IMAGE };
    }
    return {
      title: t.title + (t.location ? " · " + t.location : ""),
      path: "/pages/trip-detail/index?id=" + encodeURIComponent(t.id),
      imageUrl: SHARE_IMAGE
    };
  }
});

/**
 * sections 规范化：图标 + 标题 + items。
 * @param {Array} sections 契约章节数组
 * @returns {Array<{icon:string,title:string,items:string[]}>}
 */
function buildSections(sections) {
  return (sections || []).map(function (s) {
    return {
      icon: s.icon || "route",
      title: s.title || "",
      items: s.items || []
    };
  });
}

/**
 * checklists 规范化：二维数组 → 勾选芯片（含「（待补）」→ 待办样式）。
 * @param {Array<Array<string>>} checklists 契约清单
 * @returns {Array<Array<{text:string,pending:boolean}>>}
 */
function buildChecklists(checklists) {
  return (checklists || []).map(function (group) {
    return (group || []).map(function (item) {
      const r = format.checklistItem(item);
      return { text: r.text, pending: r.pending };
    });
  });
}
