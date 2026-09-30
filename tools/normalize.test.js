/* ===========================================================
   tools/normalize.test.js —— normalize.js 轻量单测（node --test）
   运行：node --test tools/
   =========================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");

const N = require("./normalize");

const LOCAL = path.join(__dirname, "..", "data", "site-data.local.json");

/** 载入本地真实源 */
function localSource() {
  return JSON.parse(fs.readFileSync(LOCAL, "utf8"));
}

test("makeId：前缀 + 3 位补零序号", function () {
  assert.strictEqual(N.makeId("book", 0), "book-001");
  assert.strictEqual(N.makeId("word", 20), "word-021");
  assert.strictEqual(N.makeId("ai", 99), "ai-100");
});

test("fixCover：attachment: 前缀清空并补 coverFallback", function () {
  const b = { title: "X", cover: "attachment:1.jpg" };
  N.fixCover(b);
  assert.strictEqual(b.cover, "");
  assert.ok(b.coverFallback && b.coverFallback.indexOf("gradient") >= 0);
});

test("fixCover：有效 http(s) 封面保留", function () {
  const url = "https://img.example.com/a.jpg";
  const b = { title: "X", cover: url };
  N.fixCover(b);
  assert.strictEqual(b.cover, url);
});

test("normalizeModules：count 以真实长度校正", function () {
  const c = {
    modules: [{ id: "library", count: 14 }, { id: "words", count: 80 }],
    library: { books: new Array(12).fill({}) },
    words: { list: new Array(74).fill({}) }
  };
  N.normalizeModules(c);
  assert.strictEqual(c.modules[0].count, 12);
  assert.strictEqual(c.modules[1].count, 74);
});

test("ensureIds：按源顺序生成稳定 id，已存在 id 保留", function () {
  const c = {
    ai: { projects: [{}, { id: "custom-id" }, {}] },
    library: { books: [{}] },
    method: { articles: [] },
    travel: { trips: [] },
    words: { list: [{}] }
  };
  N.ensureIds(c);
  assert.deepStrictEqual(
    c.ai.projects.map(function (x) { return x.id; }),
    ["ai-001", "custom-id", "ai-003"]
  );
  assert.strictEqual(c.library.books[0].id, "book-001");
  assert.strictEqual(c.words.list[0].id, "word-001");
});

test("validate：非法 status 降级为「想读」且不抛错", function () {
  const c = {
    meta: { name: "n", subtitle: "s", tagline: "t" },
    modules: [{ id: "library", name: "x", icon: "book", color: "#000", tagline: "", desc: "", count: 0 }],
    library: { books: [{ title: "b", status: "乱写", rating: 99 }] },
    ai: { projects: [] }, method: { categories: [], articles: [] },
    travel: { trips: [] }, words: { categories: [], list: [] }
  };
  const r = N.validate(c);
  assert.strictEqual(c.library.books[0].status, "想读");
  assert.strictEqual(c.library.books[0].rating, 0);
  assert.ok(r.warns.length >= 1);
});

test("validate：travel.cover 非渐变退回默认渐变", function () {
  const c = {
    meta: { name: "n", subtitle: "s", tagline: "t" },
    modules: [], ai: { projects: [] }, library: { books: [] },
    method: { categories: [], articles: [] },
    travel: { trips: [{ title: "t", cover: "https://a.jpg" }] },
    words: { categories: [], list: [] }
  };
  N.validate(c);
  assert.ok(c.travel.trips[0].cover.indexOf("gradient") >= 0);
});

test("normalize：真实本地数据端到端自检通过", function () {
  const { contract, report } = N.normalize(localSource());
  const sc = N.selfCheck(contract);
  assert.strictEqual(report.errors.length, 0, "不应有 error 级问题");
  assert.strictEqual(sc.checks.counts.library, 12);
  assert.strictEqual(sc.checks.counts.words, 74);
  assert.ok(sc.pass, "自检应通过");
});

test("normalize：不修改传入的原始对象（深拷贝隔离）", function () {
  const src = localSource();
  const before = JSON.stringify(src);
  N.normalize(src);
  assert.strictEqual(JSON.stringify(src), before);
});

test("normalize：《明朝那些事》cover 被清空为 ''", function () {
  const { contract } = N.normalize(localSource());
  const b = contract.library.books.filter(function (x) { return x.title === "明朝那些事"; })[0];
  assert.ok(b, "应能找到《明朝那些事》");
  assert.strictEqual(b.cover, "");
});
