/* ===========================================================
   tools/sim-miniprogram.js —— 页面逻辑运行时模拟（T06/T07 语义校验）
   -----------------------------------------------------------
   在 Node 中以 mock 的 Page/wx/getApp/Component 加载每个页面 .js，
   真实执行 onLoad / onShow / 事件处理，断言 data 产物正确：
     · 首页 modules/stats
     · ai/library/method/travel/words/more 列表与芯片计数
     · 图书馆筛选（onChip）与空态（onEmptyAction）
     · 详情页 findByld → 命中/未命中（错误态）
     · 文章正文 kind 分类 + **粗体** richNodes
     · 行程 sections/checklists（含「待判」pending）
   运行：node tools/sim-miniprogram.js
   =========================================================== */
"use strict";

const path = require("path");
const DATA = require("../miniprogram/utils/data.js");

let failures = 0;
let checks = 0;
function assert(cond, msg) {
  checks++;
  if (cond) { /* pass */ }
  else { failures++; console.error("  ✗ " + msg); }
}

/* ---------- mock 运行时 ---------- */
const storage = {};
const globalWx = {
  getStorageSync: function (k) { return storage[k]; },
  setStorageSync: function (k, v) { storage[k] = v; },
  removeStorageSync: function (k) { delete storage[k]; },
  setNavigationBarTitle: function () {},
  navigateTo: function () {},
  switchTab: function () {},
  showLoading: function () {},
  hideLoading: function () {},
  showToast: function () {},
  setClipboardData: function () {},
  createIntersectionObserver: function () {
    return { relativeToViewport: function () { return this; }, observe: function () {}, disconnect: function () {} };
  }
};
const appObj = {
  globalData: { data: DATA, ready: true },
  getModule: function (id) {
    return (DATA.modules || []).filter(function (m) { return m.id === id; })[0] || null;
  }
};

global.wx = globalWx;
global.getApp = function () { return appObj; };

/** 加载页面模块，捕获 Page(config) 的 config */
function loadPage(rel) {
  const f = path.resolve(__dirname, "..", "miniprogram", rel);
  delete require.cache[f];
  let cfg = null;
  global.Page = function (c) { cfg = c; };
  global.Component = function (c) { cfg = c; };
  require(f);
  return cfg;
}

/** 构造可 setData 的页面实例 */
function makeInstance(cfg) {
  const inst = Object.assign({}, cfg);
  inst.data = JSON.parse(JSON.stringify(cfg.data || {}));
  inst.setData = function (patch) {
    Object.keys(patch).forEach(function (k) { inst.data[k] = patch[k]; });
  };
  // 绑定方法到实例
  Object.keys(cfg).forEach(function (k) {
    if (typeof cfg[k] === "function") inst[k] = cfg[k].bind(inst);
  });
  return inst;
}

/* ---------- 首页 ---------- */
console.log("== 首页 ==");
{
  const inst = makeInstance(loadPage("pages/index/index.js"));
  inst.onLoad();
  assert(inst.data.ready === true, "index ready");
  assert(inst.data.modules.length === 5, "index 模块卡 5 张，实际 " + inst.data.modules.length);
  const counts = inst.data.modules.map(function (m) { return m.count; });
  assert(JSON.stringify(counts) === JSON.stringify([3, 12, 7, 3, 74]), "index 模块计数 = 3/12/7/3/74，实际 " + counts.join("/"));
  assert(inst.data.stats.length === 4, "index 统计 4 项");
  const shareOk = inst.onShareAppMessage();
  assert(shareOk.path === "/pages/index/index", "index 分享路径");
  assert(typeof shareOk.title === "string" && shareOk.title.length > 0, "index 分享标题非空");
}

/* ---------- AI ---------- */
console.log("== AI ==");
{
  const inst = makeInstance(loadPage("pages/ai/index.js"));
  inst.onLoad();
  assert(inst.data.projects.length === 3, "ai 项目 3 个，实际 " + inst.data.projects.length);
  assert(inst.data.projects[0].done === (DATA.ai.projects[0].status === "已完成"), "ai done 标记");
  assert(inst.onShareAppMessage().path === "/pages/ai/index", "ai 分享路径");
}

/* ---------- 图书馆（筛选） ---------- */
console.log("== 图书馆 ==");
{
  storage["filter:library"] = undefined;
  const inst = makeInstance(loadPage("pages/library/index.js"));
  inst.onLoad();
  assert(inst.data.ready === true, "library ready");
  assert(inst.data.books.length === 12, "library 默认全部 12，实际 " + inst.data.books.length);
  assert(inst.data.chips.length === 4, "library 芯片 4 个（全部+3）");
  assert(inst.data.chips[0].count === 12, "library 芯片 all 计数 12");
  const read = inst.data.chips.filter(function (c) { return c.id === "已读"; })[0];
  assert(read && read.count === 8, "library 已读计数 8，实际 " + (read && read.count));

  // 点击「在读」芯片
  inst.onChip({ detail: { value: "在读" } });
  assert(inst.data.filter === "在读", "library filter=在读");
  assert(inst.data.books.length === 3, "library 在读 3 本，实际 " + inst.data.books.length);
  assert(storage["filter:library"] === "在读", "library 筛选态已持久化");

  // onShow 回填（模拟重进）
  const inst2 = makeInstance(loadPage("pages/library/index.js"));
  inst2.onLoad();
  assert(inst2.data.filter === "在读", "library onLoad 回填筛选态");
  assert(inst2.data.books.length === 3, "library 回填后仍为在读 3 本");

  // 空态 → 查看全部
  inst.onEmptyAction();
  assert(inst.data.filter === "all" && inst.data.books.length === 12, "library 空态动作回到全部");
  assert(inst.onShareAppMessage().path === "/pages/library/index", "library 分享路径");
}

/* ---------- 方法论（筛选） ---------- */
console.log("== 方法论 ==");
{
  const inst = makeInstance(loadPage("pages/method/index.js"));
  inst.onLoad();
  assert(inst.data.articles.length === 7, "method 全部 7，实际 " + inst.data.articles.length);
  assert(inst.data.chips.length === 5, "method 芯片 5 个（全部+4）");
  inst.onChip({ detail: { value: "theory" } });
  assert(inst.data.articles.length === 3, "method theory 3，实际 " + inst.data.articles.length);
  assert(inst.data.catName.learn === "学习方法", "method 分类名映射 learn→学习方法");
  assert(inst.onShareAppMessage().path === "/pages/method/index", "method 分享路径");
}

/* ---------- 旅行 ---------- */
console.log("== 旅行 ==");
{
  const inst = makeInstance(loadPage("pages/travel/index.js"));
  inst.onLoad();
  assert(inst.data.trips.length === 3, "travel 3 段，实际 " + inst.data.trips.length);
  assert(inst.data.trips[0].cover.indexOf("linear-gradient") === 0, "travel cover 是渐变值");
  assert(inst.onShareAppMessage().path === "/pages/travel/index", "travel 分享路径");
}

/* ---------- Words（筛选） ---------- */
console.log("== Words ==");
{
  const inst = makeInstance(loadPage("pages/words/index.js"));
  inst.onLoad();
  assert(inst.data.words.length === 74, "words 全部 74，实际 " + inst.data.words.length);
  assert(inst.data.chips.length === 5, "words 芯片 5 个（all+4）");
  assert(inst.data.chips[0].count === 74, "words all 计数 74");
  inst.onChip({ detail: { value: "装X语录" } });
  assert(inst.data.words.length === 18, "words 装X语录 18，实际 " + inst.data.words.length);
  assert(inst.onShareAppMessage().path === "/pages/words/index", "words 分享路径");
}

/* ---------- 更多 ---------- */
console.log("== 更多 ==");
{
  const inst = makeInstance(loadPage("pages/more/index.js"));
  inst.onLoad();
  assert(inst.data.entries.length === 2, "more 入口 2 个（旅行+Words）");
  assert(inst.data.entries[0].count === 3, "more 旅行计数 3");
  assert(inst.data.entries[1].count === 74, "more Words 计数 74");
  assert(inst.onShareAppMessage().path === "/pages/more/index", "more 分享路径");
}

/* ---------- 书籍详情 ---------- */
console.log("== 书籍详情 ==");
{
  // 命中
  const inst = makeInstance(loadPage("pages/book-detail/index.js"));
  inst.onLoad({ id: "book-001" });
  assert(inst.data.notFound === false && inst.data.book, "book-detail 命中 book-001");
  assert(inst.data.starStr.length === 5, "book-detail 评分星渲染，实际 " + inst.data.starStr);
  assert(inst.data.notes.length === DATA.library.books[0].note.length, "book-detail 笔记条数一致");
  const hasComment = inst.data.notes.some(function (n) { return n.kind === "comment"; });
  assert(hasComment, "book-detail 含 comment 点评类型");
  assert(inst.data.notes[0].nodes && inst.data.notes[0].nodes.length > 0, "book-detail 笔记 richNodes 非空");
  const s = inst.onShareAppMessage();
  assert(s.path === "/pages/book-detail/index?id=book-001", "book-detail 分享路径带 id，实际 " + s.path);

  // 未命中 → 错误态
  const inst2 = makeInstance(loadPage("pages/book-detail/index.js"));
  inst2.onLoad({ id: "book-999" });
  assert(inst2.data.notFound === true, "book-detail 未命中走错误态");

  // cover 降级判定
  const fallbackBook = DATA.library.books.filter(function (b) { return !b.cover; });
  console.log("  library 无 cover 书籍数: " + fallbackBook.length + "（走渐变降级）");
}

/* ---------- 文章详情 ---------- */
console.log("== 文章详情 ==");
{
  const inst = makeInstance(loadPage("pages/article-detail/index.js"));
  inst.onLoad({ id: "article-001" });
  assert(inst.data.notFound === false && inst.data.article, "article-detail 命中 article-001");
  assert(inst.data.catName === "学习方法", "article-detail 分类名，实际 " + inst.data.catName);
  const kinds = {};
  inst.data.body.forEach(function (n) { kinds[n.kind] = (kinds[n.kind] || 0) + 1; });
  assert(kinds.h2 > 0 && kinds.p > 0 && kinds.li > 0, "article-detail body 含 h2/p/li，实际 " + JSON.stringify(kinds));
  // **粗体** 解析验证
  const boldPara = inst.data.body.filter(function (n) {
    return n.kind === "p" && n.nodes.some(function (x) { return x.attrs && x.attrs.style === "font-weight:600"; });
  });
  assert(boldPara.length > 0, "article-detail **粗体** 被 richNodes 解析为加粗节点");
  const s = inst.onShareAppMessage();
  assert(s.path === "/pages/article-detail/index?id=article-001", "article-detail 分享路径带 id，实际 " + s.path);

  const inst2 = makeInstance(loadPage("pages/article-detail/index.js"));
  inst2.onLoad({ id: "article-999" });
  assert(inst2.data.notFound === true, "article-detail 未命中走错误态");
}

/* ---------- 行程详情 ---------- */
console.log("== 行程详情 ==");
{
  // sections 型
  const inst = makeInstance(loadPage("pages/trip-detail/index.js"));
  inst.onLoad({ id: "trip-001" });
  assert(inst.data.notFound === false && inst.data.trip, "trip-detail 命中 trip-001");
  assert(inst.data.cover.indexOf("linear-gradient") === 0, "trip-detail cover 渐变");
  assert(inst.data.sections.length === DATA.travel.trips[0].sections.length, "trip-detail sections 条数一致");
  assert(inst.data.tip.length > 0, "trip-detail tip 非空");
  assert(inst.onShareAppMessage().path === "/pages/trip-detail/index?id=trip-001", "trip-detail 分享路径带 id");

  // checklists 型（含「待补」）
  const inst2 = makeInstance(loadPage("pages/trip-detail/index.js"));
  inst2.onLoad({ id: "trip-003" });
  assert(inst2.data.checklists.length > 0, "trip-detail trip-003 checklists 非空");
  const flat = [];
  inst2.data.checklists.forEach(function (g) { g.forEach(function (c) { flat.push(c); }); });
  const pending = flat.filter(function (c) { return c.pending; });
  assert(pending.length > 0, "trip-detail 含「（待补）」pending 项，实际 " + pending.length);
  assert(pending[0].text.indexOf("（待补）") < 0, "trip-detail pending 项已移除「（待补）」文案");

  const inst3 = makeInstance(loadPage("pages/trip-detail/index.js"));
  inst3.onLoad({ id: "trip-999" });
  assert(inst3.data.notFound === true, "trip-detail 未命中走错误态");
}

console.log("");
console.log("================ 结果 ================");
console.log("断言: " + checks + "，失败: " + failures);
console.log("IS_PASS: " + (failures === 0 ? "YES" : "NO"));
process.exit(failures === 0 ? 0 : 1);
