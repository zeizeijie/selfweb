/* ===========================================================
   tools/verify-miniprogram.js —— T06/T07 静态校验（可重复执行）
   -----------------------------------------------------------
   校验项：
     1. 10 个页面 4 件套（.js/.json/.wxml/.wxss）齐全
     2. app.json 注册的页面与磁盘实际文件一致
     3. 各页 .js 可被 node 解析（无语法错误）
     4. 所有 require(...) 路径存在
     5. WXML 标签闭合（简易栈匹配）
     6. app.json / 页面 .json 中 usingComponents 声明的组件文件存在
     7. WXML 无裸 `**` 文本直接输出
     8. 每个页面均定义 onShareAppMessage
   运行：node tools/verify-miniprogram.js
   =========================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "miniprogram");
let failures = 0;
let checks = 0;

function ok(msg) { checks++; }
function fail(msg) {
  checks++;
  failures++;
  console.error("  ✗ " + msg);
}
function pass(msg, verbose) {
  checks++;
  if (verbose) console.log("  ✓ " + msg);
}

function read(p) { return fs.readFileSync(p, "utf8"); }
function exists(p) { return fs.existsSync(p); }

console.log("== 1. 页面 4 件套 ==");
const appJson = JSON.parse(read(path.join(ROOT, "app.json")));
const pagePaths = appJson.pages || [];
const EXTS = [".js", ".json", ".wxml", ".wxss"];
pagePaths.forEach(function (p) {
  EXTS.forEach(function (ext) {
    const f = path.join(ROOT, p + ext);
    if (exists(f)) pass(p + ext);
    else fail("缺失文件: " + p + ext);
  });
});
console.log("  页面数: " + pagePaths.length + "（期望 10）");
if (pagePaths.length !== 10) fail("app.json 页面数应为 10，实际 " + pagePaths.length);

console.log("== 2. app.json 注册 vs 磁盘实际 ==");
const pagesDir = path.join(ROOT, "pages");
fs.readdirSync(pagesDir).forEach(function (dir) {
  const idx = path.join(pagesDir, dir, "index.js");
  if (!exists(idx)) return;
  const rel = "pages/" + dir + "/index";
  if (pagePaths.indexOf(rel) < 0) fail("磁盘存在但 app.json 未注册: " + rel);
});

console.log("== 3. 页面 .js 语法解析 ==");
const pageCodes = {};
pagePaths.forEach(function (p) {
  const f = path.join(ROOT, p + ".js");
  const code = read(f);
  try {
    new vm.Script(code, { filename: f });
    pass("语法 OK: " + p + ".js");
  } catch (e) {
    fail("语法错误 " + p + ".js: " + e.message);
  }
  pageCodes[p] = code;
});

console.log("== 4. require 路径存在 ==");
function checkRequires(filePath, code) {
  const re = /require\(\s*["']([^"']+)["']\s*\)/g;
  let m = re.exec(code);
  while (m !== null) {
    const spec = m[1];
    if (spec.indexOf(".") === 0) {
      const resolved = path.resolve(path.dirname(filePath), spec);
      if (exists(resolved)) pass("require OK: " + spec);
      else fail("require 路径不存在: " + spec + "（" + filePath + "）");
    }
    m = re.exec(code);
  }
}
pagePaths.forEach(function (p) {
  const f = path.join(ROOT, p + ".js");
  checkRequires(f, pageCodes[p]);
});
// utils 自身
["utils/format.js", "utils/store.js", "app.js", "utils/data.js"].forEach(function (rel) {
  const f = path.join(ROOT, rel);
  if (exists(f)) checkRequires(f, read(f));
});

console.log("== 5. WXML 标签闭合（简易栈匹配）==");
const SELF_CLOSE = { image: true, input: true, icon: true };
function checkWxml(file) {
  const src = read(file);
  const re = /<\/?([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  const stack = [];
  let m = re.exec(src);
  while (m !== null) {
    const whole = m[0];
    const tag = m[1];
    const selfClose = m[3] === "/" || SELF_CLOSE[tag];
    const isClose = whole.charAt(1) === "/";
    if (isClose) {
      if (stack.length === 0) { fail("WXML 多余闭合标签 </" + tag + "> in " + file); return; }
      const top = stack.pop();
      if (top !== tag) { fail("WXML 标签不匹配: 期望 </" + top + "> 得到 </" + tag + "> in " + file); return; }
    } else if (!selfClose) {
      stack.push(tag);
    }
    m = re.exec(src);
  }
  if (stack.length > 0) { fail("WXML 未闭合标签: " + stack.join(",") + " in " + file); return; }
  pass("WXML 闭合 OK: " + file);
}
pagePaths.forEach(function (p) {
  checkWxml(path.join(ROOT, p + ".wxml"));
});
// 组件 wxml
const compDir = path.join(ROOT, "components");
fs.readdirSync(compDir).forEach(function (c) {
  const f = path.join(compDir, c, "index.wxml");
  if (exists(f)) checkWxml(f);
});

console.log("== 6. usingComponents 声明 vs 组件文件存在 ==");
function checkUsingComponents(jsonPath) {
  const j = JSON.parse(read(jsonPath));
  const uc = j.usingComponents || {};
  Object.keys(uc).forEach(function (name) {
    let rel = uc[name];
    if (rel.charAt(0) === "/") rel = rel.slice(1);
    const abs = path.join(ROOT, rel);
    [".js", ".json", ".wxml", ".wxss"].forEach(function (ext) {
      if (!exists(abs + ext)) fail("组件文件缺失: " + rel + ext + "（声明于 " + jsonPath + "）");
    });
    // 组件 json 必须 component:true
    if (exists(abs + ".json")) {
      const cj = JSON.parse(read(abs + ".json"));
      if (cj.component !== true) fail("组件未声明 component:true: " + rel);
    }
  });
}
checkUsingComponents(path.join(ROOT, "app.json"));
pagePaths.forEach(function (p) {
  checkUsingComponents(path.join(ROOT, p + ".json"));
});

console.log("== 7. WXML 无裸 ** 文本 ==");
pagePaths.forEach(function (p) {
  const f = path.join(ROOT, p + ".wxml");
  const src = read(f);
  // 检查双花括号插值之外是否出现 ** 成对
  if (/\*\*[^*]+\*\*/.test(src)) {
    fail("WXML 出现裸 ** 文本（应用 rich-text 渲染）: " + f);
  } else {
    pass("无裸 ** : " + f);
  }
});

console.log("== 8. onShareAppMessage 已定义 ==");
pagePaths.forEach(function (p) {
  const code = pageCodes[p];
  if (/onShareAppMessage\s*[:(]/.test(code)) pass(p + " 有 onShareAppMessage");
  else fail("缺少 onShareAppMessage: " + p);
});

console.log("== 9. 数据查找逻辑（按 id 能查到 / 查不到走错误态）==");
const DATA = require(path.join(ROOT, "utils", "data.js"));
function findById(mod, id) {
  const map = { ai: "projects", library: "books", method: "articles", travel: "trips", words: "list" };
  const list = (DATA[mod] && DATA[mod][map[mod]]) || [];
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}
const samples = [
  ["library", "book-001"],
  ["method", "article-001"],
  ["travel", "trip-001"]
];
samples.forEach(function (s) {
  const hit = findById(s[0], s[1]);
  if (hit) pass("findById(" + s[0] + "," + s[1] + ") → " + hit.title);
  else fail("findById 应命中: " + s[0] + " " + s[1]);
});
[["library", "book-999"], ["method", "article-999"], ["travel", "trip-999"]].forEach(function (s) {
  const hit = findById(s[0], s[1]);
  if (!hit) pass("findById 未命中（→错误态）: " + s[0] + " " + s[1]);
  else fail("findById 不应命中: " + s[0] + " " + s[1]);
});

console.log("== 10. 计数一致性（渲染芯片计数）==");
function countBy(list, field, val) { return list.filter(function (x) { return x[field] === val; }).length; }
console.log("  library 全部=" + DATA.library.books.length +
  " 已读=" + countBy(DATA.library.books, "status", "已读") +
  " 在读=" + countBy(DATA.library.books, "status", "在读") +
  " 想读=" + countBy(DATA.library.books, "status", "想读"));
console.log("  method 全部=" + DATA.method.articles.length +
  " learn=" + countBy(DATA.method.articles, "category", "learn") +
  " theory=" + countBy(DATA.method.articles, "category", "theory") +
  " project=" + countBy(DATA.method.articles, "category", "project") +
  " life=" + countBy(DATA.method.articles, "category", "life"));
DATA.words.categories.forEach(function (c) {
  const n = c.id === "all" ? DATA.words.list.length : countBy(DATA.words.list, "category", c.id);
  console.log("  words " + c.name + "=" + n);
});

console.log("");
console.log("================ 结果 ================");
console.log("检查项: " + checks + "，失败: " + failures);
console.log("IS_PASS: " + (failures === 0 ? "YES" : "NO"));
process.exit(failures === 0 ? 0 : 1);
