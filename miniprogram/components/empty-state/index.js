/* ===========================================================
   components/empty-state —— 空态 / 错误态（T05 骨架，T06 列表页消费）
   -----------------------------------------------------------
   properties:
     type {string}  'empty' | 'error'  状态类型
     text {string}  提示文案（缺省按 type 取默认）
   events:
     retry         错误态「重试」点击；空态若有 actionLabel 也复用该事件
     action        空态「查看全部」按钮点击
   =========================================================== */
"use strict";

const DEFAULT_TEXT = {
  empty: "这里还没有内容",
  error: "内容加载失败，请重试"
};

Component({
  properties: {
    type: {
      type: String,
      value: "empty"
    },
    text: {
      type: String,
      value: ""
    },
    actionLabel: {
      type: String,
      value: ""
    }
  },

  data: {
    shownText: "",
    isError: false
  },

  observers: {
    "type, text": function (type, text) {
      const isError = type === "error";
      this.setData({
        isError: isError,
        shownText: text || DEFAULT_TEXT[isError ? "error" : "empty"]
      });
    }
  },

  methods: {
    onRetry() {
      this.triggerEvent("retry");
    },
    onAction() {
      this.triggerEvent("action");
    }
  }
});
