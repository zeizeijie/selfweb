/* ===========================================================
   components/chip-bar —— 筛选芯片组（T05 骨架，T06 列表页消费）
   -----------------------------------------------------------
   properties:
     items  {Array<{id:string,name:string,count:number}>} 芯片定义（含 all）
     active {string}  当前选中 id
   events:
     pick   detail: { value }  点击芯片，回传其 id
   横向可滚动（scroll-view）。
   =========================================================== */
"use strict";

Component({
  properties: {
    items: {
      type: Array,
      value: []
    },
    active: {
      type: String,
      value: "all"
    }
  },

  data: {
    // 预计算带 active 标记的渲染列表，避免 WXML 内做逻辑
    renderItems: []
  },

  observers: {
    "items, active": function (items, active) {
      const list = (items || []).map(function (it) {
        return {
          id: it.id,
          name: it.name,
          count: typeof it.count === "number" ? it.count : 0,
          on: it.id === active
        };
      });
      this.setData({ renderItems: list });
    }
  },

  methods: {
    onPick(e) {
      const value = e.currentTarget.dataset.value;
      if (value == null || value === this.data.active) return;
      this.triggerEvent("pick", { value: value });
    }
  }
});
