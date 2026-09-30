/* ===========================================================
   components/reveal —— 滚动渐入容器（T05 骨架，T06 列表页消费）
   -----------------------------------------------------------
   properties:
     delay {number}  延迟毫秒（<=340），用于逐条错峰渐入
   使用 wx.createIntersectionObserver 监听自身可见性，
   进入视口后添加 .in 触发动画；组件销毁时断开观察器。
   =========================================================== */
"use strict";

Component({
  properties: {
    delay: {
      type: Number,
      value: 0
    }
  },

  data: {
    in: false,
    style: ""
  },

  lifetimes: {
    attached() {
      const d = Math.max(0, Math.min(Number(this.data.delay) || 0, 340));
      this.setData({ style: "transition-delay:" + d + "ms;" });
      this._observe();
    },
    detached() {
      if (this._observer) {
        this._observer.disconnect();
        this._observer = null;
      }
    }
  },

  methods: {
    /** 创建交叉观察器，元素进入视口后标记 .in */
    _observe() {
      const self = this;
      try {
        this._observer = this.createIntersectionObserver({
          thresholds: [0.08],
          initialRatio: 0
        });
        this._observer
          .relativeToViewport({ bottom: -40 })
          .observe(".reveal-box", function (res) {
            if (res && res.intersectionRatio > 0) {
              self.setData({ in: true });
              if (self._observer) {
                self._observer.disconnect();
                self._observer = null;
              }
            }
          });
      } catch (e) {
        // 观察器不可用时直接展示（渐进增强）
        this.setData({ in: true });
      }
    }
  }
});
