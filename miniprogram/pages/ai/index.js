/* ===========================================================
   pages/ai —— AI 学习列表（T06）
   -----------------------------------------------------------
   内容：intro + 3 个项目卡（状态徽标、标题、摘要、tags、highlights）。
   无筛选。分享：onShareAppMessage（标题=模块名 + tagline）。
   =========================================================== */
"use strict";

const SHARE_IMAGE = "/assets/og-default.png";

Page({
  data: {
    intro: "",
    projects: [],
    ready: false
  },

  onLoad() {
    const app = getApp();
    const data = app && app.globalData ? app.globalData.data : null;
    if (!data || !data.ai) {
      this.setData({ ready: false });
      return;
    }
    const ai = data.ai;
    const projects = (ai.projects || []).map(function (p) {
      return {
        id: p.id,
        title: p.title,
        status: p.status || "",
        done: p.status === "已完成",
        summary: p.summary || "",
        tags: p.tags || [],
        color: p.color || "#0071e3",
        highlights: p.highlights || []
      };
    });
    this.setData({
      intro: ai.intro || "",
      projects: projects,
      ready: true
    });
  },

  /** 分享：标题 = 模块名 / tagline，路径 = 当前页 */
  onShareAppMessage() {
    const app = getApp();
    const mod = app && app.getModule ? app.getModule("ai") : null;
    return {
      title: mod ? mod.name + " · " + (mod.tagline || "") : "AI 学习",
      path: "/pages/ai/index",
      imageUrl: SHARE_IMAGE
    };
  },

  onShareTimeline() {
    const app = getApp();
    const mod = app && app.getModule ? app.getModule("ai") : null;
    return {
      title: mod ? mod.name + " · " + (mod.tagline || "") : "AI 学习",
      imageUrl: SHARE_IMAGE
    };
  }
});
