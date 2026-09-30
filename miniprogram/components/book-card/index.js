/* ===========================================================
   components/book-card —— 书籍卡片（T05 骨架，T06 列表页消费）
   -----------------------------------------------------------
   properties:
     book   {object}  契约 Book 实体（含 id/title/author/rating/status/cover/coverFallback/noteAvailable）
     showMeta {boolean} 是否显示作者/评分/笔记提示（默认 true）
   events:
     tap    detail: { id }  点击卡片
   内建封面降级：cover 为空 → 渐变 + 书名；binderror → 切换渐变 + 书名（永不破图）。
   =========================================================== */
"use strict";

const format = require("../../utils/format.js");

Component({
  properties: {
    book: {
      type: Object,
      value: {}
    },
    showMeta: {
      type: Boolean,
      value: true
    }
  },

  data: {
    coverOk: true,       // 图片是否可用（加载成功）
    hasCover: false,     // 契约层是否有可用封面
    fallback: "",        // 兜底渐变
    starStr: "",         // 星号字符串
    statusText: ""       // 状态文案
  },

  observers: {
    /**
     * book 变化时重算展示态；cover 变化时重置 coverOk，
     * 保证列表复用（virtual list / wx:key）时状态正确。
     */
    "book": function (book) {
      const b = book || {};
      const cov = format.coverOf(b);
      this.setData({
        hasCover: cov.hasCover,
        fallback: cov.fallback,
        coverOk: true,
        starStr: format.stars(b.rating),
        statusText: b.status || ""
      });
    }
  },

  methods: {
    /** 封面加载失败：切渐变 + 书名 */
    onCoverError() {
      this.setData({ coverOk: false });
    },

    /** 点击卡片：冒泡 id 给列表页 */
    onTap() {
      const b = this.data.book || {};
      this.triggerEvent("tap", { id: b.id });
    }
  }
});
