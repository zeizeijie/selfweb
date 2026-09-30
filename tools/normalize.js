/* ===========================================================
   tools/normalize.js —— 唯一契约实现（Unique Contract Implementation）
   -----------------------------------------------------------
   职责：
     1. 接收「异构原始源」（Notion 快照 / 本地 JSON / 内置兜底），
        输出「统一契约对象」；
     2. 修复三大数据缺陷：
        · cover 以 attachment: 开头 / 非 http(s) / 空 → 清空为 ""，
          并确保有 coverFallback；
        · modules[].count 一律以真实 list.length 校正；
        · 所有条目按「模块前缀 + 3 位序号」生成确定性稳定 id；
     3. 枚举 / 必填校验：非法值降级为默认并 warn，绝不抛错中断。
   -----------------------------------------------------------
   设计约束（架构 §3.2）：
     · 本模块是唯一知道契约的地方，generate.js 只做序列化，不做字段增删改；
     · 校验级一律 warn，保证「源脏数据不阻断部署」。
   =========================================================== */
"use strict";

/* ---------------- 契约常量（跨文件共享的唯一真源） ---------------- */

/** 模块 id 枚举（架构 §10.1） */
const MODULE_IDS = ["ai", "library", "method", "travel", "words"];

/** 模块 id → 模块图标枚举 */
const MODULE_ICON = {
  ai: "chip",
  library: "book",
  method: "compass",
  travel: "mountain",
  words: "quote"
};

/** 模块 id → 条目列表字段名 */
const ID_FIELD = {
  ai: "projects",
  library: "books",
  method: "articles",
  travel: "trips",
  words: "list"
};

/** 模块 id → 稳定 id 前缀（架构 §10.2） */
const ID_PREFIX = {
  ai: "ai",
  library: "book",
  method: "article",
  travel: "trip",
  words: "word"
};

/** 枚举值全表（架构 §10.1） */
const ENUMS = {
  moduleId: MODULE_IDS,
  moduleIcon: ["chip", "book", "compass", "mountain", "quote"],
  aiStatus: ["进行中", "已完成"],
  bookStatus: ["已读", "在读", "想读"],
  noteType: ["quote", "comment"],
  methodCategory: ["learn", "theory", "project", "life"],
  bodyKeys: ["h2", "p", "li", "quote"],
  sectionIcon: ["route", "clock", "bag", "wallet", "sun", "drop", "device", "pill"],
  wordsCategory: ["人生感悟", "休闲文案", "为人处事", "装X语录"]
};

/** 默认值 */
const DEFAULTS = {
  coverFallback: "linear-gradient(135deg,#86868b,#48484a)",
  travelCover: "linear-gradient(135deg,#2c3e50,#4b6584)",
  bookStatus: "想读",
  aiStatus: "进行中",
  noteType: "quote",
  methodCategory: "learn",
  wordsCategory: "人生感悟",
  sectionIcon: "bag"
};

/** 分类显示名映射（method） */
const METHOD_CAT_NAME = {
  learn: "学习方法",
  theory: "理论知识",
  project: "项目管理",
  life: "为人处事"
};

/** 无效封面占位符前缀 */
const INVALID_COVER = /^attachment:/i;

/** 是否 http(s) 绝对地址 */
const HTTP_URL = /^https?:\/\//i;

/** 是否 CSS 渐变值（travel.cover 必须是渐变字符串，不是图片 URL） */
const CSS_GRADIENT = /gradient\(/i;

/* ---------------- 工具函数 ---------------- */

/**
 * 生成一条警告消息并打印到 stderr（不抛错）。
 * @param {string} msg 警告内容
 */
function warn(msg) {
  // 构建脚本统一以 [warn] 前缀输出，便于日志检索
  console.warn("[warn] " + msg);
}

/** 判断是否为普通对象（非 null / 非数组） */
function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** 安全取字符串，null/undefined → "" */
function str(v) {
  return v == null ? "" : String(v);
}

/** 安全取数组，非数组 → [] */
function arr(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * 生成稳定 id：前缀 + '-' + 3 位补零序号。
 * @param {string} prefix 模块前缀（ai/book/article/trip/word）
 * @param {number} index 0 基序号
 * @returns {string} 例如 "book-001"
 */
function makeId(prefix, index) {
  return prefix + "-" + String(index + 1).padStart(3, "0");
}

/* ---------------- 三大缺陷修复 ---------------- */

/**
 * 缺陷①：封面清理。
 * 无效（空 / attachment: 开头 / 非 http(s)）一律清空为 ""，
 * 并确保存在 coverFallback（缺省补默认渐变）。
 * 注意：仅在「无效」时清空，有效 http(s) 封面原样保留。
 * @param {object} book 书籍对象（原地修改）
 * @returns {object} 处理后的书籍
 */
function fixCover(book) {
  const c = str(book.cover).trim();
  if (!c || INVALID_COVER.test(c) || !HTTP_URL.test(c)) {
    if (c) warn('[cover] "' + str(book.title) + '" 封面无效（' + c + '），已降级为渐变');
    book.cover = "";
    if (!str(book.coverFallback).trim()) {
      book.coverFallback = DEFAULTS.coverFallback;
    }
  }
  return book;
}

/**
 * 缺陷②：模块 count 校正。
 * modules[].count 一律以真实 list.length 覆写。
 * @param {object} contract 契约对象（原地修改）
 * @returns {object} 处理后的契约对象
 */
function normalizeModules(contract) {
  arr(contract.modules).forEach(function (m) {
    const key = ID_FIELD[m.id];
    if (!key) return;
    const real = arr((contract[m.id] || {})[key]).length;
    if (m.count !== real) {
      warn("[count] " + m.id + ": 声明 " + m.count + " → 校正 " + real);
    }
    m.count = real;
  });
  return contract;
}

/**
 * 缺陷③：稳定 id 生成。
 * 按源顺序生成「前缀-序号」；若条目已自带 id（如 Notion slug）则保留，避免漂移。
 * @param {object} contract 契约对象（原地修改）
 * @returns {object} 处理后的契约对象
 */
function ensureIds(contract) {
  Object.keys(ID_FIELD).forEach(function (mod) {
    const key = ID_FIELD[mod];
    const prefix = ID_PREFIX[mod];
    arr((contract[mod] || {})[key]).forEach(function (item, i) {
      if (!str(item.id).trim()) {
        item.id = makeId(prefix, i);
      }
    });
  });
  return contract;
}

/* ---------------- 枚举 / 必填校验 ---------------- */

/**
 * 收集所有校验问题（warn 级，不抛错）。
 * 同时把非法枚举值「就地降级」为默认值。
 * @param {object} contract 契约对象（原地修改）
 * @returns {{errors: string[], warns: string[]}} 校验报告
 */
function validate(contract) {
  const errors = [];
  const warns = [];

  /** 校验枚举，非法则降级并记录 warn */
  function checkEnum(value, allowed, label, fallback) {
    if (allowed.indexOf(value) >= 0) return value;
    const msg = "[enum] " + label + " = " + JSON.stringify(value) +
      " 非法，降级为 " + JSON.stringify(fallback);
    warns.push(msg);
    warn(msg);
    return fallback;
  }

  /* ---- meta 必填 ---- */
  const meta = isObj(contract.meta) ? contract.meta : (contract.meta = {});
  ["name", "subtitle", "tagline"].forEach(function (k) {
    if (!str(meta[k]).trim()) {
      const msg = "[required] meta." + k + " 缺失";
      errors.push(msg);
      warn(msg);
    }
  });

  /* ---- modules ---- */
  const modules = arr(contract.modules);
  if (!modules.length) {
    const msg = "[required] modules 为空";
    errors.push(msg);
    warn(msg);
  }
  modules.forEach(function (m, i) {
    m.id = checkEnum(m.id, ENUMS.moduleId, "modules[" + i + "].id", "ai");
    m.icon = checkEnum(m.icon, ENUMS.moduleIcon, "modules[" + i + "].icon", MODULE_ICON[m.id] || "chip");
    if (!str(m.name).trim()) { m.name = m.id; warns.push("[required] modules[" + i + "].name 缺失"); warn("[required] modules[" + i + "].name 缺失"); }
    if (!str(m.color).trim()) { m.color = "#0071e3"; }
    m.tagline = str(m.tagline);
    m.desc = str(m.desc);
    m.count = Number(m.count) || 0;
  });

  /* ---- ai.projects ---- */
  arr((contract.ai || {}).projects).forEach(function (p, i) {
    p.status = checkEnum(p.status, ENUMS.aiStatus, "ai.projects[" + i + "].status", DEFAULTS.aiStatus);
    p.title = str(p.title);
    p.summary = str(p.summary);
    p.tags = arr(p.tags).map(str).filter(Boolean);
    p.highlights = arr(p.highlights).map(str).filter(Boolean);
    if (!str(p.color).trim() || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(str(p.color))) {
      p.color = "#0071e3";
    }
  });

  /* ---- library.books ---- */
  arr((contract.library || {}).books).forEach(function (b, i) {
    b.status = checkEnum(b.status, ENUMS.bookStatus, "library.books[" + i + "].status", DEFAULTS.bookStatus);
    let r = Math.round(Number(b.rating));
    if (!isFinite(r) || r < 0 || r > 5) {
      const msg = "[enum] library.books[" + i + "].rating = " + b.rating + " 非法，降级为 0";
      warns.push(msg); warn(msg);
      r = 0;
    }
    b.rating = r;
    b.title = str(b.title);
    b.author = str(b.author);
    b.tag = str(b.tag);
    b.cover = str(b.cover);
    b.readTime = str(b.readTime);
    b.noteAvailable = !!b.noteAvailable;
    if (b.noteAvailable && !str(b.noteTitle).trim()) {
      b.noteTitle = "读书笔记";
    }
    b.noteTitle = str(b.noteTitle);
    b.note = arr(b.note).map(function (n, j) {
      return {
        type: checkEnum(n && n.type, ENUMS.noteType, "library.books[" + i + "].note[" + j + "].type", DEFAULTS.noteType),
        text: str(n && n.text),
        source: str(n && n.source)
      };
    });
    fixCover(b);
  });
  (contract.library = contract.library || {}).favorites = arr(contract.library.favorites).map(str);

  /* ---- method.categories / articles ---- */
  const method = contract.method || (contract.method = {});
  method.categories = arr(method.categories).map(function (c) {
    const id = checkEnum(c && c.id, ENUMS.methodCategory, "method.categories[].id", DEFAULTS.methodCategory);
    return { id: id, name: str((c && c.name) || METHOD_CAT_NAME[id] || id) };
  });
  const catIds = method.categories.map(function (c) { return c.id; });
  arr(method.articles).forEach(function (a, i) {
    const fb = catIds[0] || DEFAULTS.methodCategory;
    a.category = checkEnum(a.category, catIds, "method.articles[" + i + "].category", fb);
    a.title = str(a.title);
    a.summary = str(a.summary);
    if (!str(a.readingTime).trim()) {
      const est = Math.max(1, Math.ceil(str(a.summary).length / 90));
      a.readingTime = est + " 分钟";
    }
    a.body = arr(a.body).filter(function (node, j) {
      const keys = Object.keys(node || {}).filter(function (k) { return ENUMS.bodyKeys.indexOf(k) >= 0; });
      if (!keys.length) {
        const msg = "[enum] method.articles[" + i + "].body[" + j + "] 无合法节点键，已丢弃";
        warns.push(msg); warn(msg);
        return false;
      }
      return true;
    }).map(function (node) {
      // 归一化每个节点：仅保留 {h2} | {p} | {li} | {quote,source}
      if (str(node.h2).trim()) return { h2: str(node.h2) };
      if (str(node.p).trim()) return { p: str(node.p) };
      if (str(node.li).trim()) return { li: str(node.li) };
      return { quote: str(node.quote), source: str(node.source) };
    });
  });

  /* ---- travel.trips ---- */
  arr((contract.travel || {}).trips).forEach(function (t, i) {
    t.title = str(t.title);
    t.location = str(t.location);
    t.date = str(t.date);
    t.altitude = str(t.altitude);
    t.summary = str(t.summary);
    t.tip = str(t.tip);
    // travel.cover 必须是 CSS 渐变字符串；非渐变则退回默认渐变
    const cov = str(t.cover).trim();
    if (!CSS_GRADIENT.test(cov)) {
      if (cov) warn('[cover] travel.trips[' + i + "] '" + t.title + "' cover 非渐变（" + cov + "），已退回默认渐变");
      t.cover = DEFAULTS.travelCover;
    }
    if (Array.isArray(t.sections)) {
      t.sections = t.sections.map(function (s) {
        return {
          icon: checkEnum(s && s.icon, ENUMS.sectionIcon, "travel.trips[" + i + "].sections[].icon", DEFAULTS.sectionIcon),
          title: str(s && s.title),
          items: arr(s && s.items).map(str)
        };
      });
      delete t.checklists;
    } else if (Array.isArray(t.checklists)) {
      t.checklists = t.checklists.map(function (g) { return arr(g).map(str); });
      delete t.sections;
    } else {
      // 两者皆无 → 补空 sections，保证渲染端有稳定结构
      t.sections = [];
    }
  });

  /* ---- words.categories / list ---- */
  const words = contract.words || (contract.words = {});
  if (!arr(words.categories).length) {
    words.categories = [{ id: "all", name: "全部" }].concat(
      ENUMS.wordsCategory.map(function (c) { return { id: c, name: c }; })
    );
  } else {
    words.categories = arr(words.categories).map(function (c) {
      const id = str(c && c.id);
      const isAll = id === "all";
      return { id: isAll ? "all" : (ENUMS.wordsCategory.indexOf(id) >= 0 ? id : DEFAULTS.wordsCategory), name: str((c && c.name) || id) };
    });
  }
  arr(words.list).forEach(function (w, i) {
    w.text = str(w.text);
    w.author = str(w.author);
    w.source = str(w.source);
    w.category = checkEnum(w.category, ENUMS.wordsCategory, "words.list[" + i + "].category", DEFAULTS.wordsCategory);
  });

  return { errors: errors, warns: warns };
}

/* ---------------- 内置兜底契约 ---------------- */

/**
 * 内置兜底数据：当 Notion 不可用且本地 JSON 缺失时使用。
 * 保持极小规模，仅用于「保证构建不失败」，不是完整内容副本。
 */
const FALLBACK = {
  meta: {
    name: "贼贼接",
    subtitle: "把散落在 Notion 里的思考，整理成自己的知识库。",
    tagline: "AI 学习 · 图书馆 · 方法论 · 旅行 · Words",
    owner: "个人知识库",
    shareImage: ""
  },
  modules: [
    { id: "ai", name: "AI 学习", icon: "chip", color: "#0071e3", tagline: "动手，是最好的学习方式。", desc: "用 AI 做的小项目。", count: 0 },
    { id: "library", name: "图书馆", icon: "book", color: "#bf4800", tagline: "阅读是一座随身携带的避难所。", desc: "书库与读书笔记。", count: 0 },
    { id: "method", name: "方法论", icon: "compass", color: "#6e56cf", tagline: "把踩过的坑，炼成下一次的弹药。", desc: "可执行的思维训练体系。", count: 0 },
    { id: "travel", name: "旅行", icon: "mountain", color: "#0f8a6a", tagline: "出发，就是最好的准备。", desc: "每一段旅程的清单与路线。", count: 0 },
    { id: "words", name: "Words", icon: "quote", color: "#c2405f", tagline: "记下那些击中过我的话。", desc: "收藏的句子。", count: 0 }
  ],
  ai: { intro: "", projects: [] },
  library: { intro: "", books: [], favorites: [] },
  method: { intro: "", categories: [{ id: "learn", name: "学习方法" }], articles: [] },
  travel: { intro: "", trips: [] },
  words: {
    intro: "",
    categories: [{ id: "all", name: "全部" }].concat(ENUMS.wordsCategory.map(function (c) { return { id: c, name: c }; })),
    list: []
  }
};

/* ---------------- 顶层归一化 ---------------- */

/**
 * 归一化入口：任意原始源 → 标准契约对象。
 * 顺序：结构规整 → 枚举校验（就地降级）→ fixCover → count 校正 → 生成 id。
 * @param {object} raw 原始数据（Notion 快照 / 本地 JSON / 内置兜底）
 * @returns {{contract: object, report: {errors: string[], warns: string[]}}}
 */
function normalize(raw) {
  const src = isObj(raw) ? raw : {};
  // 深拷贝，避免修改调用方持有的原始对象
  const contract = JSON.parse(JSON.stringify(src));

  // 保证五大模块容器存在
  MODULE_IDS.forEach(function (id) {
    if (!isObj(contract[id])) contract[id] = {};
    const key = ID_FIELD[id];
    if (!Array.isArray(contract[id][key])) contract[id][key] = [];
  });
  if (!Array.isArray(contract.modules)) contract.modules = [];
  if (!isObj(contract.meta)) contract.meta = {};

  // 1) 枚举 / 必填校验（就地降级，收集报告）
  const report = validate(contract);
  // 2) 缺陷①：标题/封面清理在 validate 中已处理，这里确保全部书籍封面被复查
  arr(contract.library.books).forEach(fixCover);
  // 3) 缺陷③：生成稳定 id（必须先于 count，避免 Notion 缺 id 时数量口径不一致）
  ensureIds(contract);
  // 4) 缺陷②：count 校正
  normalizeModules(contract);

  return { contract: contract, report: report };
}

/**
 * 自检：对已归一化的契约做端到端一致性检查。
 * @param {object} contract 归一化后的契约
 * @returns {{pass: boolean, checks: object}}
 */
function selfCheck(contract) {
  const checks = {};

  // 1) 各模块条数
  const counts = {};
  Object.keys(ID_FIELD).forEach(function (m) {
    counts[m] = arr((contract[m] || {})[ID_FIELD[m]]).length;
  });
  checks.counts = counts;

  // 2) count 与真实长度一致
  checks.countMatch = arr(contract.modules).every(function (m) {
    return m.count === counts[m.id];
  });

  // 3) 无破图：所有 books[].cover 要么空串、要么 http(s)
  checks.coverOk = arr(contract.library.books).every(function (b) {
    return b.cover === "" || HTTP_URL.test(b.cover);
  });
  checks.noAttachment = !JSON.stringify(contract).match(/attachment:/i);

  // 4) id 唯一性
  const allIds = [];
  Object.keys(ID_FIELD).forEach(function (m) {
    allIds.push.apply(allIds, arr((contract[m] || {})[ID_FIELD[m]]).map(function (x) { return x.id; }));
  });
  const dup = allIds.filter(function (id, i) { return allIds.indexOf(id) !== i; });
  checks.idTotal = allIds.length;
  checks.idUnique = dup.length === 0;
  checks.duplicateIds = dup;

  // 5) 枚举合法性抽查
  checks.enumsOk =
    arr(contract.library.books).every(function (b) { return ENUMS.bookStatus.indexOf(b.status) >= 0; }) &&
    arr((contract.ai || {}).projects).every(function (p) { return ENUMS.aiStatus.indexOf(p.status) >= 0; }) &&
    arr((contract.words || {}).list).every(function (w) { return ENUMS.wordsCategory.indexOf(w.category) >= 0; });

  checks.pass = checks.countMatch && checks.coverOk && checks.noAttachment && checks.idUnique && checks.enumsOk;
  return { pass: checks.pass, checks: checks };
}

module.exports = {
  // 顶层
  normalize: normalize,
  selfCheck: selfCheck,
  // 单步（供测试 / 复用）
  normalizeModules: normalizeModules,
  ensureIds: ensureIds,
  fixCover: fixCover,
  validate: validate,
  makeId: makeId,
  // 常量
  MODULE_IDS: MODULE_IDS,
  ID_FIELD: ID_FIELD,
  ID_PREFIX: ID_PREFIX,
  ENUMS: ENUMS,
  DEFAULTS: DEFAULTS,
  METHOD_CAT_NAME: METHOD_CAT_NAME,
  FALLBACK: FALLBACK
};
