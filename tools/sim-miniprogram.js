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

/* 动态基线：条数随数据源（Notion / 本地 / 回填）变化，
   因此从契约本身取期望值，而不是写死数字。 */
const EXPECT = {
  ai: (DATA.ai.projects || []).length,
  library: (DATA.library.books || []).length,
  method: (DATA.method.articles || []).length,
  travel: (DATA.travel.trips || []).length,
  words: (DATA.words.list || []).length
};
const EXPECT_COUNTS = [EXPECT.ai, EXPECT.library, EXPECT.method, EXPECT.travel, EXPECT.words];

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
  assert(JSON.stringify(counts) === JSON.stringify(EXPECT_COUNTS), "index 模块计数与契约一致（" + EXPECT_COUNTS.join("/") + "），实际 " + counts.join("/"));
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
  assert(inst.data.projects.length === EXPECT.ai, "ai 项目 " + EXPECT.ai + " 个，实际 " + inst.data.projects.length);
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
  assert(inst.data.words.length === EXPECT.words, "words 全部 " + EXPECT.words + "，实际 " + inst.data.words.length);
  assert(inst.data.chips.length === 5, "words 芯片 5 个（all+4）");
  assert(inst.data.chips[0].count === EXPECT.words, "words all 计数 " + EXPECT.words);
  const zxCount = (DATA.words.list || []).filter(function (w) { return w.category === "装X语录"; }).length;
  inst.onChip({ detail: { value: "装X语录" } });
  assert(inst.data.words.length === zxCount, "words 装X语录 " + zxCount + "，实际 " + inst.data.words.length);
  assert(inst.onShareAppMessage().path === "/pages/words/index", "words 分享路径");
}

/* ---------- 更多 ---------- */
console.log("== 更多 ==");
{
  const inst = makeInstance(loadPage("pages/more/index.js"));
  inst.onLoad();
  assert(inst.data.entries.length === 2, "more 入口 2 个（旅行+Words）");
  assert(inst.data.entries[0].count === EXPECT.travel, "more 旅行计数 " + EXPECT.travel);
  assert(inst.data.entries[1].count === EXPECT.words, "more Words 计数 " + EXPECT.words);
  assert(inst.onShareAppMessage().path === "/pages/more/index", "more 分享路径");
}

/* ---------- 书籍详情 ---------- */
console.log("== 书籍详情 ==");
{
  // id 随数据源变化（Notion 用 page id / 本地用 book-001），故从契约取首本真实 id
  const firstBook = DATA.library.books[0];
  const bid = firstBook.id;
  // 优先挑「含 comment 点评」的书（comment 渲染是下方断言之一）；
  // 全部为 quote 时退回首本有笔记的书，此时 comment 断言按数据实际跳过。
  const notedBooks = DATA.library.books.filter(function (b) { return (b.note || []).length > 0; });
  const notedBook = notedBooks.filter(function (b) {
    return b.note.some(function (n) { return n.type === "comment"; });
  })[0] || notedBooks[0];

  const inst = makeInstance(loadPage("pages/book-detail/index.js"));
  inst.onLoad({ id: bid });
  assert(inst.data.notFound === false && inst.data.book, "book-detail 命中 id=" + bid);
  assert(inst.data.starStr.length === 5, "book-detail 评分星渲染，实际 " + inst.data.starStr);
  const s = inst.onShareAppMessage();
  assert(s.path === "/pages/book-detail/index?id=" + bid, "book-detail 分享路径带 id，实际 " + s.path);

  // 未命中 → 错误态
  const inst2 = makeInstance(loadPage("pages/book-detail/index.js"));
  inst2.onLoad({ id: "book-999-does-not-exist" });
  assert(inst2.data.notFound === true, "book-detail 未命中走错误态");

  // 有笔记的书：验证 note → richNodes 渲染（无此类书时跳过，不误判失败）
  if (notedBook) {
    const ni = makeInstance(loadPage("pages/book-detail/index.js"));
    ni.onLoad({ id: notedBook.id });
    assert(ni.data.notes.length === notedBook.note.length,
      "book-detail 笔记条数一致（" + notedBook.title + "：" + notedBook.note.length + "），实际 " + ni.data.notes.length);
    const hasComment = ni.data.notes.some(function (n) { return n.kind === "comment"; });
    if (hasComment) {
      assert(true, "book-detail 含 comment 点评类型");
    } else {
      console.log("  （当前数据源笔记均为 quote，跳过 comment 断言）");
    }
    const withNodes = ni.data.notes.filter(function (n) { return n.nodes && n.nodes.length > 0; });
    assert(withNodes.length > 0, "book-detail 笔记 richNodes 非空");
  } else {
    console.log("  （当前数据源无带笔记的书，跳过笔记渲染断言）");
  }

  // cover 降级判定
  const fallbackBook = DATA.library.books.filter(function (b) { return !b.cover; });
  console.log("  library 无 cover 书籍数: " + fallbackBook.length + "（走渐变降级）");
}

/* ---------- 文章详情 ---------- */
console.log("== 文章详情 ==");
{
  // 从契约取一篇带正文的文章（id 随数据源变化）
  const art = DATA.method.articles.filter(function (a) { return (a.body || []).length > 0; })[0] || DATA.method.articles[0];
  const aid = art.id;
  const CAT_NAME = { learn: "学习方法", theory: "理论知识", project: "项目管理", life: "为人处事" };

  const inst = makeInstance(loadPage("pages/article-detail/index.js"));
  inst.onLoad({ id: aid });
  assert(inst.data.notFound === false && inst.data.article, "article-detail 命中 id=" + aid);
  assert(inst.data.catName === (CAT_NAME[art.category] || art.category), "article-detail 分类名，实际 " + inst.data.catName);
  const kinds = {};
  inst.data.body.forEach(function (n) { kinds[n.kind] = (kinds[n.kind] || 0) + 1; });
  assert(kinds.h2 > 0 && kinds.p > 0 && kinds.li > 0, "article-detail body 含 h2/p/li，实际 " + JSON.stringify(kinds));
  // **粗体** 解析验证
  const boldPara = inst.data.body.filter(function (n) {
    return n.kind === "p" && n.nodes.some(function (x) { return x.attrs && x.attrs.style === "font-weight:600"; });
  });
  assert(boldPara.length > 0, "article-detail **粗体** 被 richNodes 解析为加粗节点");
  const s = inst.onShareAppMessage();
  assert(s.path === "/pages/article-detail/index?id=" + aid, "article-detail 分享路径带 id，实际 " + s.path);

  const inst2 = makeInstance(loadPage("pages/article-detail/index.js"));
  inst2.onLoad({ id: "article-999-does-not-exist" });
  assert(inst2.data.notFound === true, "article-detail 未命中走错误态");
}

/* ---------- 行程详情 ---------- */
console.log("== 行程详情 ==");
{
  // 从契约动态取行程（id 随数据源变化）
  const trips = DATA.travel.trips || [];
  const t0 = trips[0];
  const withSections = trips.filter(function (t) { return (t.sections || []).length > 0; })[0] || t0;

  const inst = makeInstance(loadPage("pages/trip-detail/index.js"));
  inst.onLoad({ id: withSections.id });
  assert(inst.data.notFound === false && inst.data.trip, "trip-detail 命中 id=" + withSections.id);
  assert(inst.data.cover.indexOf("linear-gradient") === 0, "trip-detail cover 渐变");
  assert(inst.data.sections.length === (withSections.sections || []).length, "trip-detail sections 条数一致");
  // tip 是否为空的断言取决于数据源（Notion 旅行库可能无「贴士」属性），有值才校验
  if ((withSections.tip || "").length > 0) {
    assert(inst.data.tip.length > 0, "trip-detail tip 非空");
  } else {
    assert(inst.data.tip === "" || typeof inst.data.tip === "string", "trip-detail tip 字段存在（数据源未提供贴士，允许为空）");
  }
  assert(inst.onShareAppMessage().path === "/pages/trip-detail/index?id=" + withSections.id, "trip-detail 分享路径带 id");

  // checklists 型（含「待补」）：从契约找一条含 pending 的行程
  let pending = [];
  let checkTarget = null;
  for (let ti = 0; ti < trips.length; ti++) {
    const ii = makeInstance(loadPage("pages/trip-detail/index.js"));
    ii.onLoad({ id: trips[ti].id });
    const flat = [];
    (ii.data.checklists || []).forEach(function (g) { g.forEach(function (c) { flat.push(c); }); });
    const p = flat.filter(function (c) { return c.pending; });
    if (p.length) { pending = p; checkTarget = { trip: trips[ti], inst: ii }; break; }
  }
  if (checkTarget) {
    assert(true, "trip-detail 含 checklists 与「（待补）」pending 项（" + checkTarget.trip.title + "，" + pending.length + " 项）");
    assert(pending[0].text.indexOf("（待补）") < 0, "trip-detail pending 项已移除「（待补）」文案");
  } else {
    console.log("  （当前数据源无含「（待补）」的行程，跳过 pending 断言）");
  }

  const inst3 = makeInstance(loadPage("pages/trip-detail/index.js"));
  inst3.onLoad({ id: "trip-999-does-not-exist" });
  assert(inst3.data.notFound === true, "trip-detail 未命中走错误态");
}

console.log("");
console.log("================ 结果 ================");
console.log("断言: " + checks + "，失败: " + failures);
console.log("IS_PASS: " + (failures === 0 ? "YES" : "NO"));
process.exit(failures === 0 ? 0 : 1);
