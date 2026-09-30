/* ===========================================================
   个人知识花园 · 小程序 App（T05 基础设施）
   -----------------------------------------------------------
   职责：
     1. 应用生命周期；
     2. 启动时把契约数据加载到 globalData.data（供各页面/工具读取）；
     3. 预置模块元信息索引（modulesMap），并提供全局辅助方法；
     4. 埋全局错误处理（只提示，不阻断）。
   数据来源：utils/data.js（构建产物，与网站 site/data.js 逐字节同构）。
   =========================================================== */
"use strict";

const DATA = require("./utils/data.js");

App({
  /**
   * 全局数据容器。
   * data 为完整契约对象，页面通过 getApp().globalData.data 读取。
   */
  globalData: {
    data: null,          // 完整契约（SITE_DATA）
    modulesMap: null,    // { [moduleId]: Module }
    ready: false,        // 数据是否就绪
    error: ""            // 全局错误信息
  },

  onLaunch() {
    const app = this;
    try {
      app.globalData.data = DATA;
      app.globalData.modulesMap = buildModulesMap(DATA);
      app.globalData.ready = true;
    } catch (e) {
      app.globalData.error = (e && e.message) ? e.message : String(e);
      // 数据加载失败仅告警，页面各自展示错误态
      // eslint-disable-next-line no-console
      console.error("[app] 数据加载失败：", app.globalData.error);
    }
  },

  onError(err) {
    // eslint-disable-next-line no-console
    console.error("[app] 未捕获错误：", err);
    this.globalData.error = String(err);
  },

  onUnhandledRejection(res) {
    // eslint-disable-next-line no-console
    console.error("[app] 未处理的 Promise 拒绝：", res && res.reason);
  },

  /**
   * 取契约数据（便捷方法）。
   * @returns {object|null}
   */
  getData() {
    return this.globalData.data;
  },

  /**
   * 取某模块的元信息。
   * @param {string} id 模块 id（ai|library|method|travel|words）
   * @returns {object|null}
   */
  getModule(id) {
    return (this.globalData.modulesMap || {})[id] || null;
  }
});

/**
 * 构建模块 id → Module 的映射。
 * @param {object} data 契约
 * @returns {object}
 */
function buildModulesMap(data) {
  const map = {};
  (data && data.modules ? data.modules : []).forEach(function (m) {
    map[m.id] = m;
  });
  return map;
}
