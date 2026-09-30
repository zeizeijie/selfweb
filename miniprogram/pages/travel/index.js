/* ===========================================================
   pages/travel —— 旅行列表（T06）
   -----------------------------------------------------------
   内容：intro + 行程卡（渐变 banner + 标题 + 地点 + 摘要 + 统计）。
   无筛选。cover 是 CSS 渐变值（非图片 URL）。
   分享：onShareAppMessage。
   =========================================================== */
"use strict";

const format = require("../../utils/format.js");

const SHARE_IMAGE = "/assets/og-default.png";

Page({
  data: {
    intro: "",
    trips: [],
    ready: false
  },

  onLoad() {
    const app = getApp();
    const data = app && app.globalData ? app.globalData.data : null;
    if (!data || !data.travel) {
      this.setData({ ready: false });
      return;
    }
    const trips = (data.travel.trips || []).map(function (t) {
      return {
        id: t.id,
        title: t.title,
        location: t.location || "",
        date: t.date || "",
        altitude: t.altitude || "—",
        cover: t.cover || format.DEFAULT_GRADIENT,
        summary: t.summary || ""
      };
    });
    this.setData({
      intro: data.travel.intro || "",
      trips: trips,
      ready: true
    });
  },

  /** 点击行程卡：进入详情 */
  onTapTrip(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: "/pages/trip-detail/index?id=" + encodeURIComponent(id) });
  },

  onShareAppMessage() {
    const app = getApp();
    const mod = app && app.getModule ? app.getModule("travel") : null;
    return {
      title: mod ? mod.name + " · " + (mod.tagline || "") : "旅行",
      path: "/pages/travel/index",
      imageUrl: SHARE_IMAGE
    };
  },

  onShareTimeline() {
    const app = getApp();
    const mod = app && app.getModule ? app.getModule("travel") : null;
    return {
      title: mod ? mod.name + " · " + (mod.tagline || "") : "旅行",
      imageUrl: SHARE_IMAGE
    };
  }
});
