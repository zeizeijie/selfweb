/* ===========================================================
   个人知识花园 · 应用逻辑（T04 · 契约接入与增强）
   -----------------------------------------------------------
   数据来源：window.SITE_DATA（由 tools/build.js 生成的构建产物）
   本文件不硬编码任何计数，全部读 modules[].count / list.length。
   增强点（相对初版）：
     · coverHtml() 统一封面降级（空串 / 加载失败 / attachment: 残留）
     · __INITIAL_VIEW__ 支持（模块入口页 ai.html 等直接进对应视图）
     · 详情弹层支持 hash（#/library:book-003）与 ?id= 定位
     · 空态 .empty-state / 错误态 .error-state 渲染
     · 键盘 Enter/Space 可达性保留
   =========================================================== */
(function () {
  "use strict";

  var D = window.SITE_DATA;

  /* 契约缺失时的兜底：保证后续逻辑不抛错 */
  if (!D) {
    var mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.innerHTML =
        '<div class="error-state"><div class="error-text">站点数据加载失败，请刷新重试。</div>' +
        '<button class="retry" onclick="location.reload()">重新加载</button></div>';
    }
    return;
  }

  /* ---------------- 常量 / 枚举（避免魔法字符串） ---------------- */
  var DEFAULT_GRADIENT = "linear-gradient(135deg,#86868b,#48484a)";
  var VIEWS = ["home", "ai", "library", "method", "travel", "words"];
  /* 模块 id → 契约集合字段名 */
  var LIST_KEY = { ai: "projects", library: "books", method: "articles", travel: "trips", words: "list" };
  /* 详情类模块（可弹层）与其集合键 */
  var DETAIL_MODS = { library: "books", method: "articles", travel: "trips" };

  /* ---------------- 图标库 ---------------- */
  var ICONS = {
    chip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9 1.5v4M15 1.5v4M9 18.5v4M15 18.5v4M1.5 9h4M1.5 15h4M18.5 9h4M18.5 15h4"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5A2.5 2.5 0 0 1 5.5 2H20v17H5.5A2.5 2.5 0 0 0 3 21.5z"/><path d="M3 4.5v17"/><path d="M8 6.5h8M8 10h6"/></svg>',
    compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2.3 6.1-6.1 2.3 2.3-6.1z"/></svg>',
    mountain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>',
    quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v8a3 3 0 0 1-3 3"/><path d="M20 11h-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v8a3 3 0 0 1-3 3"/></svg>',
    route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19h5a4 4 0 0 0 0-8h-3a4 4 0 0 1 0-8h3"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 7v5.2l3.2 1.9"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h16l-1.2 12H5.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M16 15h2"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2.6M12 19.9v2.6M3.2 3.2l1.9 1.9M18.9 18.9l1.9 1.9M1.5 12h2.6M19.9 12h2.6M3.2 20.8l1.9-1.9M18.9 5.1l1.9-1.9"/></svg>',
    drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5s6.5 7 6.5 11.3A6.5 6.5 0 0 1 5.5 13.8C5.5 9.5 12 2.5 12 2.5z"/></svg>',
    device: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
    pill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="20" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="m8.5 8.5 7 7"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>'
  };

  function icon(name) { return ICONS[name] || ICONS.chip; }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* 允许 **粗体** 与 `代码`（与小程序 richNodes 语义一致：仅 **粗体** 为两端共有） */
  function rich(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  }

  function stars(n) {
    if (!n) return "";
    var out = "";
    for (var i = 0; i < 5; i++) out += i < n ? "★" : "☆";
    return out;
  }

  /* ---------------- 封面降级（T04 核心：统一函数） ---------------- */
  /**
   * 判断封面是否可渲染为图片。
   * 三种必须降级的情况：空串 / 非 http(s)（含 attachment: 残留）。
   * @param {string} cover 契约 cover 字段
   * @returns {boolean}
   */
  function isUsableCover(cover) {
    var c = String(cover == null ? "" : cover).trim();
    if (!c) return false;
    if (/^attachment:/i.test(c)) return false;      /* 残留占位符一律降级 */
    if (!/^https?:\/\//i.test(c) && c.charAt(0) !== "/" && c.indexOf("./") !== 0) return false;
    return true;
  }

  /**
   * 统一封面降级：返回封面容器内应插入的 HTML（图片或书名兜底）。
   * 图片加载失败时通过 onerror 替换为 .fallback-title，绝不显示破图。
   * @param {{cover?:string,coverFallback?:string,title?:string}} entity 契约实体
   * @param {string} cls 图片类名（如 "book-cover-img"）
   * @returns {string} HTML 片段
   */
  function coverHtml(entity, cls) {
    var e = entity || {};
    var title = esc(e.title || "未命名");
    if (isUsableCover(e.cover)) {
      return '<img class="' + esc(cls || "cover-img") + '" src="' + esc(e.cover) +
        '" alt="' + title + '" loading="lazy" data-cover ' +
        'onerror="this.classList.add(\'img-broken\');var s=document.createElement(\'span\');' +
        's.className=\'fallback-title\';s.textContent=this.alt;' +
        'this.parentNode.insertBefore(s,this);this.remove();">';
    }
    return '<span class="fallback-title">' + title + '</span>';
  }

  /** 封面容器的内联背景样式：有可用图时不设背景，否则用渐变兜底 */
  function coverBg(entity) {
    var e = entity || {};
    if (isUsableCover(e.cover)) return "";
    return "background:" + (e.coverFallback || DEFAULT_GRADIENT);
  }

  /* ---------------- 空态 / 错误态 ---------------- */
  function emptyStateHtml(text, actionLabel) {
    return '<div class="empty-state"><div class="empty-text">' + esc(text || "这里还没有内容") + "</div>" +
      (actionLabel ? '<button class="empty-action" data-empty-action>' + esc(actionLabel) + "</button>" : "") +
      "</div>";
  }
  function errorStateHtml(text) {
    return '<div class="error-state"><div class="error-text">' + esc(text || "内容加载失败") + "</div>" +
      '<button class="retry" data-retry>重试</button></div>';
  }

  /* ---------------- 首页（读 modules[].count，不再硬编码） ---------------- */
  function renderHome() {
    var meta = document.getElementById("heroMeta");
    if (meta) {
      meta.innerHTML =
        "<div><b>" + countOf("library") + "</b>本书</div>" +
        "<div><b>" + countOf("method") + "</b>条方法</div>" +
        "<div><b>" + countOf("travel") + "</b>段旅程</div>" +
        "<div><b>" + countOf("words") + "</b>句收藏</div>";
    }
    var g = document.getElementById("moduleGrid");
    if (g) g.innerHTML = (D.modules || []).map(function (m) { return spaceCard(m); }).join("");
  }

  /** 取某模块的真实条数：优先 modules[].count，回退 list.length */
  function countOf(modId) {
    var key = LIST_KEY[modId];
    var real = (D[modId] && D[modId][key]) ? D[modId][key].length : 0;
    var m = (D.modules || []).filter(function (x) { return x.id === modId; })[0];
    return m && typeof m.count === "number" ? m.count : real;
  }

  /* 每个模块一种卡片气质 */
  function spaceCard(m) {
    var href = ' data-link="#/' + m.id + '"';
    var arrow = '<span class="sp-arrow">→</span>';

    if (m.id === "ai") {
      return '<div class="sp ai-sp" role="link" tabindex="0"' + href + '>' +
        '<div class="sp-glow" style="background:' + esc(m.color) + '"></div>' +
        '<span class="sp-status"><span class="sd"></span>' + m.count + ' 个在做的项目</span>' +
        '<div class="sp-top">' +
          '<div class="sp-ico" style="background:' + esc(m.color) + '">' + icon(m.icon) + '</div>' +
          '<h3>' + esc(m.name) + '</h3>' +
          '<p class="sp-tag">' + esc(m.tagline) + '</p>' +
          '<p class="sp-desc">' + esc(m.desc) + '</p>' +
        '</div>' +
        '<div class="sp-foot"><span class="sp-num">' + m.count + '</span> 个项目' + arrow + '</div>' +
      '</div>';
    }

    if (m.id === "library") {
      var noteCount = D.library.books.filter(function (b) { return b.noteAvailable; }).length;
      return '<div class="sp dark" role="link" tabindex="0"' + href + '>' +
        '<div class="sp-glow" style="background:' + esc(m.color) + '"></div>' +
        '<div class="sp-top">' +
          '<div class="sp-ico" style="background:rgba(255,255,255,.14)">' + icon(m.icon) + '</div>' +
          '<h3>' + esc(m.name) + '</h3>' +
          '<p class="sp-tag">' + esc(m.tagline) + '</p>' +
          '<p class="sp-desc">' + esc(m.desc) + '</p>' +
        '</div>' +
        '<div class="sp-foot"><span class="sp-num">' + m.count + '</span> 本书 · ' +
          noteCount + ' 篇笔记' + arrow + '</div>' +
      '</div>';
    }

    if (m.id === "method") {
      return '<div class="sp count" role="link" tabindex="0"' + href + '>' +
        '<span class="sp-mini" style="background:' + esc(m.color) + '1a">' + icon(m.icon) + '</span>' +
        '<div class="sp-top">' +
          '<h3 style="margin-top:70px">' + esc(m.name) + '</h3>' +
          '<p class="sp-tag">' + esc(m.tagline) + '</p>' +
        '</div>' +
        '<div class="sp-foot"><span class="sp-num">' + m.count + '</span> 条可执行方法' + arrow + '</div>' +
      '</div>';
    }

    if (m.id === "travel") {
      return '<div class="sp scenic" role="link" tabindex="0"' + href + '>' +
        '<div class="sp-mtn">' + ICONS.mountain + '</div>' +
        '<div class="sp-top">' +
          '<div class="sp-ico" style="background:rgba(255,255,255,.16)">' + icon(m.icon) + '</div>' +
          '<h3>' + esc(m.name) + '</h3>' +
          '<p class="sp-tag">' + esc(m.tagline) + '</p>' +
          '<p class="sp-desc">' + esc(m.desc) + '</p>' +
        '</div>' +
        '<div class="sp-foot"><span class="sp-num">' + m.count + '</span> 段旅程' + arrow + '</div>' +
      '</div>';
    }

    var samples = D.words.list.slice(0, 3).map(function (w) {
      var t = String(w.text || "");
      return "<span>" + esc(t.length > 22 ? t.slice(0, 22) + "…" : t) + "</span>";
    }).join("");
    return '<div class="sp quote-sp" role="link" tabindex="0"' + href + '>' +
      '<div class="sp-mark">“</div>' +
      '<div class="sp-body">' +
        '<div class="sp-ico" style="background:' + esc(m.color) + '">' + icon(m.icon) + '</div>' +
        '<h3>' + esc(m.name) + '</h3>' +
        '<p class="sp-tag">' + esc(m.tagline) + '</p>' +
        '<div class="sp-foot"><span class="sp-num">' + m.count + '</span> 句收藏' + arrow + '</div>' +
      '</div>' +
      '<div class="sp-samples">' + samples + '</div>' +
    '</div>';
  }

  /* ---------------- AI 学习 ---------------- */
  function renderAI() {
    var intro = document.getElementById("aiIntro");
    if (intro) intro.textContent = D.ai.intro;
    var wrap = document.getElementById("aiProjects");
    if (!wrap) return;
    if (!D.ai.projects.length) { wrap.innerHTML = emptyStateHtml("还没有记录 AI 项目"); return; }
    wrap.innerHTML = D.ai.projects.map(function (p) {
      var done = p.status === "已完成";
      var icoName = p.title.indexOf("字幕") >= 0 ? "device" : p.title.indexOf("聚餐") >= 0 ? "bag" : "chip";
      return '' +
        '<div class="project reveal" data-id="' + esc(p.id) + '">' +
          '<div class="p-visual" style="background:linear-gradient(140deg,' + esc(p.color) + ',' +
            shade(p.color, -26) + ')">' +
            '<div class="big-ico">' + icon(icoName) + '</div>' +
          '</div>' +
          '<div class="p-body">' +
            '<span class="status' + (done ? " done" : "") + '"><span class="sd"></span>' + esc(p.status) + '</span>' +
            '<h3>' + esc(p.title) + '</h3>' +
            '<p class="p-sum">' + esc(p.summary) + '</p>' +
            '<div class="p-tags">' + (p.tags || []).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + '</div>' +
            '<ul class="p-list">' + (p.highlights || []).map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("") + '</ul>' +
          '</div>' +
        '</div>';
    }).join("");
  }

  function shade(hex, pct) {
    var c = String(hex || "#0071e3").replace("#", "");
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    r = Math.max(0, Math.min(255, r + Math.round(255 * pct / 100)));
    g = Math.max(0, Math.min(255, g + Math.round(255 * pct / 100)));
    b = Math.max(0, Math.min(255, b + Math.round(255 * pct / 100)));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* ---------------- 图书馆 ---------------- */
  var libFilter = "all";
  function renderLibrary() {
    var intro = document.getElementById("libIntro");
    if (intro) intro.textContent = D.library.intro;

    var statuses = ["all"].concat(unique(D.library.books.map(function (b) { return b.status; })));
    var labels = { all: "全部" };
    var chips = document.getElementById("libChips");
    if (chips) {
      chips.innerHTML = statuses.map(function (s) {
        var n = s === "all" ? D.library.books.length : D.library.books.filter(function (b) { return b.status === s; }).length;
        return '<button class="chip' + (libFilter === s ? " active" : "") + '" data-lib="' + esc(s) + '" aria-pressed="' + (libFilter === s) + '">' +
          (labels[s] || esc(s)) + " · " + n + "</button>";
      }).join("");
    }

    var grid = document.getElementById("bookGrid");
    if (grid) {
      var list = D.library.books.filter(function (b) { return libFilter === "all" || b.status === libFilter; });
      grid.innerHTML = list.length ? list.map(function (b) {
        return '' +
          '<div class="book" data-book="' + esc(b.id) + '" data-id="' + esc(b.id) + '" role="button" tabindex="0">' +
            '<div class="cover" style="' + coverBg(b) + '">' +
              coverHtml(b, "cover-img") +
              '<span class="badge">' + esc(b.status) + "</span>" +
            "</div>" +
            '<div class="b-title">' + esc(b.title) + "</div>" +
            '<div class="b-author">' + esc(b.author || "—") + "</div>" +
            '<div class="b-stars">' + stars(b.rating) + "</div>" +
            (b.noteAvailable ? '<div class="b-note">✎ 有读书笔记</div>' : '<div class="b-note" style="visibility:hidden">·</div>') +
          "</div>";
      }).join("") : emptyStateHtml("这个状态下还没有书", "查看全部");
    }

    var favs = document.getElementById("favAuthors");
    if (favs) {
      favs.innerHTML = (D.library.favorites || []).map(function (a) { return '<span class="chip">' + esc(a) + "</span>"; }).join("");
    }
  }

  function unique(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  function openBook(id) {
    var b = findBy(D.library.books, id);
    if (!b) return;
    var notesHtml = "";
    if (b.noteAvailable && b.note && b.note.length) {
      notesHtml = '<div class="bd-notes"><h3>' + esc(b.noteTitle || "读书笔记") + "</h3>" +
        b.note.map(function (n) {
          if (n.type === "quote") {
            return '<blockquote>' + rich(n.text) +
              (n.source ? '<span class="bq-src">—— ' + esc(n.source) + "</span>" : "") + "</blockquote>";
          }
          return '<p style="font-size:15.5px;color:#48484a;line-height:1.75;margin-bottom:16px">' +
            '<strong style="color:#0071e3">点评 · </strong>' + rich(n.text) + "</p>";
        }).join("") + "</div>";
    }
    document.getElementById("modalBody").innerHTML =
      '<div class="book-detail">' +
        '<div class="bd-cover" style="' + coverBg(b) + '">' + coverHtml(b, "bd-cover-img") + "</div>" +
        "<div>" +
          "<h2>" + esc(b.title) + "</h2>" +
          '<div class="bd-auth">' + esc(b.author || "佚名") + "</div>" +
          '<div class="bd-info"><span>' + esc(b.status) + "</span><span>" + esc(b.tag) + "</span>" +
            (b.readTime ? "<span>" + esc(b.readTime) + "</span>" : "") + "</div>" +
          (b.rating ? '<div class="bd-stars">' + stars(b.rating) + "</div>" : "") +
        "</div>" +
        notesHtml +
      "</div>";
    openModal();
  }

  /* ---------------- 方法论 ---------------- */
  var methodFilter = "all";
  var catName = {};
  (D.method.categories || []).forEach(function (c) { catName[c.id] = c.name; });

  function renderMethod() {
    var intro = document.getElementById("methodIntro");
    if (intro) intro.textContent = D.method.intro;
    var chips = document.getElementById("methodChips");
    if (chips) {
      chips.innerHTML =
        '<button class="chip' + (methodFilter === "all" ? " active" : "") + '" data-method="all">全部 · ' + D.method.articles.length + "</button>" +
        D.method.categories.map(function (c) {
          var n = D.method.articles.filter(function (a) { return a.category === c.id; }).length;
          return '<button class="chip' + (methodFilter === c.id ? " active" : "") + '" data-method="' + esc(c.id) + '">' +
            esc(c.name) + " · " + n + "</button>";
        }).join("");
    }

    var grid = document.getElementById("methodGrid");
    if (grid) {
      var list = D.method.articles.filter(function (a) { return methodFilter === "all" || a.category === methodFilter; });
      grid.innerHTML = list.length ? list.map(function (a) {
        return '' +
          '<div class="card method-card card-pad" data-method-open="' + esc(a.id) + '" data-id="' + esc(a.id) + '" role="button" tabindex="0">' +
            '<span class="cat-tag">' + esc(catName[a.category] || "其他") + "</span>" +
            "<h3 class=\"card-title\">" + esc(a.title) + "</h3>" +
            "<p>" + esc(a.summary) + "</p>" +
            '<div class="meta"><span>' + esc(a.readingTime) + "</span><span>阅读全文 →</span></div>" +
          "</div>";
      }).join("") : emptyStateHtml("这个分类下还没有文章", "查看全部");
    }
  }

  function openArticle(id) {
    var a = findBy(D.method.articles, id);
    if (!a) return;
    var body = a.body.map(function (n) {
      if (n.h2) return "<h3>" + esc(n.h2) + "</h3>";
      if (n.p) return "<p>" + rich(n.p) + "</p>";
      if (n.li) return "<li>" + rich(n.li) + "</li>";
      if (n.quote) return "<blockquote>" + rich(n.quote) +
        (n.source ? '<span class="bq-src">—— ' + esc(n.source) + "</span>" : "") + "</blockquote>";
      return "";
    }).join("");
    document.getElementById("modalBody").innerHTML =
      '<div class="article-head">' +
        '<span class="cat-tag">' + esc(catName[a.category] || "方法论") + "</span>" +
        "<h2>" + esc(a.title) + "</h2>" +
        '<div class="a-meta"><span>' + esc(a.readingTime) + "</span><span>来自个人 Notion 笔记</span></div>" +
      "</div>" +
      '<div class="article-body">' + body + "</div>";
    openModal(true);
  }

  /* ---------------- 旅行 ---------------- */
  function renderTravel() {
    var intro = document.getElementById("travelIntro");
    if (intro) intro.textContent = D.travel.intro;
    var grid = document.getElementById("tripGrid");
    if (!grid) return;
    if (!D.travel.trips.length) { grid.innerHTML = emptyStateHtml("还没有旅行记录"); return; }
    grid.innerHTML = D.travel.trips.map(function (t) {
      return '' +
        '<div class="trip-card" data-trip="' + esc(t.id) + '" data-id="' + esc(t.id) + '" role="button" tabindex="0">' +
          '<div class="banner" style="background:' + esc(t.cover || DEFAULT_GRADIENT) + '">' +
            "<div>" +
              '<div class="loc">' + esc(t.location) + "</div>" +
              "<h3>" + esc(t.title) + "</h3>" +
            "</div>" +
          "</div>" +
          '<div class="body">' +
            "<p>" + esc(t.summary) + "</p>" +
            '<div class="stats">' +
              "<div><b>" + esc(t.date) + "</b>时间</div>" +
              "<div><b>" + esc(t.altitude || "—") + "</b>关键信息</div>" +
            "</div>" +
          "</div>" +
        "</div>";
    }).join("");
  }

  function openTrip(id) {
    var t = findBy(D.travel.trips, id);
    if (!t) return;
    var html = '<div class="trip-detail">' +
      '<div class="td-banner" style="background:' + esc(t.cover || DEFAULT_GRADIENT) + '">' +
        "<div><div class=\"loc\">" + esc(t.location) + "</div><h2>" + esc(t.title) + "</h2></div>" +
      "</div>" +
      '<p style="font-size:15.5px;color:#48484a;line-height:1.7;margin-bottom:30px">' + esc(t.summary) + "</p>";

    if (t.sections) {
      html += t.sections.map(function (s) {
        return '<div class="td-sec">' +
          '<h4><span class="si">' + icon(s.icon) + "</span>" + esc(s.title) + "</h4>" +
          "<ul>" + (s.items || []).map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>" +
        "</div>";
      }).join("");
    }
    if (t.checklists) {
      html += '<div class="td-sec"><h4><span class="si">' + icon("bag") + "</span>装备勾选清单</h4>" +
        '<div class="check-chips">' +
        t.checklists.map(function (group) {
          return group.map(function (i) {
            var pending = i.indexOf("（待补）") >= 0;
            return '<span class="cc"' + (pending ? ' style="opacity:.55;border-style:dashed"' : "") + ">" +
              (pending ? "○ " : "✓ ") + esc(i.replace("（待补）", "")) + "</span>";
          }).join("");
        }).join("") +
        "</div></div>";
    }
    if (t.tip) html += '<div class="tip-box">💡 ' + esc(t.tip) + "</div>";
    html += "</div>";

    document.getElementById("modalBody").innerHTML = html;
    openModal(true);
  }

  /* ---------------- Words ---------------- */
  var wordsFilter = "all";
  function renderWords() {
    var intro = document.getElementById("wordsIntro");
    if (intro) intro.textContent = D.words.intro;
    var chips = document.getElementById("wordsChips");
    if (chips) {
      chips.innerHTML = D.words.categories.map(function (c) {
        var n = c.id === "all" ? D.words.list.length
          : D.words.list.filter(function (w) { return w.category === c.id; }).length;
        return '<button class="chip' + (wordsFilter === c.id ? " active" : "") + '" data-words="' + esc(c.id) + '">' +
          esc(c.name) + " · " + n + "</button>";
      }).join("");
    }

    var listEl = document.getElementById("wordsList");
    if (listEl) {
      var list = D.words.list.filter(function (w) { return wordsFilter === "all" || w.category === wordsFilter; });
      listEl.innerHTML = list.length ? list.map(function (w) {
        var meta = [];
        if (w.author) meta.push('<span class="who">' + esc(w.author) + "</span>");
        if (w.source) meta.push("<span>" + esc(w.source) + "</span>");
        return '<div class="word-card" data-id="' + esc(w.id) + '">' +
          '<div class="quote-mark">“</div>' +
          '<div class="w-text">' + esc(w.text) + "</div>" +
          '<div class="w-meta">' + meta.join('<span style="opacity:.4">·</span>') +
            '<span class="w-cat">' + esc(w.category) + "</span>" +
          "</div>" +
        "</div>";
      }).join("") : emptyStateHtml("这个分类下还没有收藏", "查看全部");
    }
  }

  /* ---------------- 查找工具 ---------------- */
  function findBy(list, id) {
    if (!list || !id) return null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---------------- 弹层 ---------------- */
  var overlay = document.getElementById("overlay");
  var modal = document.getElementById("modal");
  var lastFocus = null;

  function openModal(wide) {
    lastFocus = document.activeElement;
    modal.classList.toggle("wide", !!wide);
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    modal.scrollTop = 0;
    var closeBtn = document.getElementById("modalClose");
    if (closeBtn && closeBtn.focus) closeBtn.focus();
  }
  function closeModal() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    /* 关闭时清理 hash 中的详情定位，避免再次前进/后退异常 */
    if (/^#\/[a-z]+:/.test(location.hash)) {
      var mod = location.hash.replace(/^#\//, "").split(":")[0];
      history.replaceState(null, "", "#/" + mod);
    }
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* noop */ } }
    lastFocus = null;
  }
  document.getElementById("modalClose").addEventListener("click", closeModal);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  /* ---------------- 详情弹层深链：支持 #/library:book-003 与 ?id= ---------------- */
  /** 用 id 打开对应模块的详情弹层 */
  function openDetailById(mod, id) {
    if (mod === "library") openBook(id);
    else if (mod === "method") openArticle(id);
    else if (mod === "travel") openTrip(id);
  }

  /** 解析当前 location 中的详情定位（hash 形如 #/library:book-003，或 ?id=book-003 配合视图） */
  function detailFromLocation() {
    var h = location.hash || "";
    var m = h.match(/^#\/([a-z]+):(.+)$/);
    if (m && DETAIL_MODS[m[1]]) return { mod: m[1], id: decodeURIComponent(m[2]) };
    return null;
  }

  /* ---------------- 路由 ---------------- */
  function route() {
    var raw = location.hash || "#/";
    /* 支持 #/library:book-003 形态：取冒号前的模块名 */
    var id = raw.replace(/^#\//, "").split(":")[0] || "home";
    if (VIEWS.indexOf(id) < 0) id = "home";
    VIEWS.forEach(function (v) {
      var el = document.getElementById("view-" + v);
      if (el) el.classList.toggle("active", v === id);
    });
    document.querySelectorAll("[data-nav]").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-nav") === id);
    });
    var navLinks = document.getElementById("navLinks");
    if (navLinks) navLinks.classList.remove("open");
    window.scrollTo({ top: 0, behavior: "auto" });
    revealInit();
  }

  window.addEventListener("hashchange", function () {
    route();
    var d = detailFromLocation();
    if (d) openDetailById(d.mod, d.id);
  });

  /* ---------------- 事件委托 ---------------- */
  document.addEventListener("click", function (e) {
    var link = e.target.closest("[data-link]");
    if (link) {
      var href = link.getAttribute("href") || link.getAttribute("data-link");
      if (href && href.indexOf("#") === 0) {
        e.preventDefault();
        location.hash = href;
        return;
      }
    }
    var emptyBtn = e.target.closest("[data-empty-action]");
    if (emptyBtn) {
      /* 空态「查看全部」：重置所有筛选 */
      libFilter = "all"; methodFilter = "all"; wordsFilter = "all";
      renderLibrary(); renderMethod(); renderWords();
      return;
    }
    var chip = e.target.closest("[data-lib]");
    if (chip) { libFilter = chip.getAttribute("data-lib"); renderLibrary(); return; }
    var mchip = e.target.closest("[data-method]");
    if (mchip) { methodFilter = mchip.getAttribute("data-method"); renderMethod(); return; }
    var wchip = e.target.closest("[data-words]");
    if (wchip) { wordsFilter = wchip.getAttribute("data-words"); renderWords(); return; }
    var bk = e.target.closest("[data-book]");
    if (bk) { openBook(bk.getAttribute("data-book")); return; }
    var ma = e.target.closest("[data-method-open]");
    if (ma) { openArticle(ma.getAttribute("data-method-open")); return; }
    var tr = e.target.closest("[data-trip]");
    if (tr) { openTrip(tr.getAttribute("data-trip")); return; }
  });

  var navToggle = document.getElementById("navToggle");
  if (navToggle) {
    navToggle.addEventListener("click", function () {
      var nl = document.getElementById("navLinks");
      if (nl) nl.classList.toggle("open");
    });
  }

  /* 键盘可达性：Enter / Space 触发卡片跳转与详情打开 */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var t = e.target;
    if (!t || !t.closest) return;

    var linkEl = t.closest("[data-link][tabindex]");
    if (linkEl) {
      var href = linkEl.getAttribute("data-link") || linkEl.getAttribute("href");
      if (href && href.indexOf("#") === 0) { e.preventDefault(); location.hash = href; }
      return;
    }
    var bk = t.closest("[data-book][tabindex]");
    if (bk) { e.preventDefault(); openBook(bk.getAttribute("data-book")); return; }
    var ma = t.closest("[data-method-open][tabindex]");
    if (ma) { e.preventDefault(); openArticle(ma.getAttribute("data-method-open")); return; }
    var tr = t.closest("[data-trip][tabindex]");
    if (tr) { e.preventDefault(); openTrip(tr.getAttribute("data-trip")); return; }
  });

  /* ---------------- 滚动效果 ---------------- */
  var nav = document.getElementById("nav");
  if (nav) {
    window.addEventListener("scroll", function () {
      nav.classList.toggle("scrolled", window.scrollY > 8);
    }, { passive: true });
  }

  var observer = ("IntersectionObserver" in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add("in"); observer.unobserve(en.target); }
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }) : null;

  function revealInit() {
    var els = document.querySelectorAll(".view.active .reveal:not(.in)");
    if (!observer) { els.forEach(function (el) { el.classList.add("in"); }); return; }
    els.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i * 55, 340) + "ms";
      observer.observe(el);
    });
  }

  /* ---------------- 分享链接（模块真实入口路径） ---------------- */
  /**
   * 生成模块的可分享绝对 URL（构建时预渲染的多入口路径）。
   * home → origin + "/"，其余 → origin + "/<mod>.html"
   */
  window.shareUrl = function (mod) {
    var origin = location.origin || (location.protocol + "//" + location.host);
    if (!mod || mod === "home") return origin + "/";
    return origin + "/" + mod + ".html";
  };

  /* ---------------- 启动 ---------------- */
  function boot() {
    renderHome();
    renderAI();
    renderLibrary();
    renderMethod();
    renderTravel();
    renderWords();

    var foot = document.getElementById("footNote");
    if (foot) {
      foot.textContent =
        "内容整理自个人 Notion 工作区（" + countOf("library") + " 本书 · " +
        countOf("method") + " 条方法论 · " + countOf("travel") + " 段旅程 · " +
        countOf("words") + " 句收藏）· 设计灵感来自 Apple";
    }

    /* __INITIAL_VIEW__：模块入口页（ai.html 等）直接进入对应视图 */
    var initView = window.__INITIAL_VIEW__ || "";
    var hashMod = (location.hash || "").replace(/^#\//, "").split(":")[0];
    if (initView && VIEWS.indexOf(initView) >= 0 && !hashMod) {
      location.hash = "#/" + initView;
    }

    route();

    /* 支持 ?id= 深链：配合 hash 模块定位详情（如 library.html?id=book-003） */
    var qid = getQuery("id");
    var d = detailFromLocation();
    if (d) openDetailById(d.mod, d.id);
    else if (qid) {
      var mod = initView || hashMod || "library";
      openDetailById(mod, qid);
    }
  }

  function getQuery(name) {
    var m = (location.search || "").match(new RegExp("[?&]" + name + "=([^&]+)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  boot();
})();
