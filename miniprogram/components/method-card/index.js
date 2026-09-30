/* ===========================================================
   components/method-card —— 方法论卡片（T05 骨架，T06 列表页消费）
   -----------------------------------------------------------
   properties:
     article {object}  契约 Article 实体（id/title/category/summary/readingTime）
     catName {string}  分类显示名（由页面传入，避免组件内依赖 data.js）
   events:
     tap     detail: { id }
   =========================================================== */
"use strict";

Component({
  properties: {
    article: {
      type: Object,
      value: {}
    },
    catName: {
      type: String,
      value: ""
    }
  },

  data: {
    title: "",
    summary: "",
    readingTime: "",
    cat: ""
  },

  observers: {
    "article": function (article) {
      const a = article || {};
      this.setData({
        title: a.title || "",
        summary: a.summary || "",
        readingTime: a.readingTime || ""
      });
    },
    "catName": function (catName) {
      this.setData({ cat: catName || "" });
    }
  },

  methods: {
    onTap() {
      const a = this.data.article || {};
      this.triggerEvent("tap", { id: a.id });
    }
  }
});
