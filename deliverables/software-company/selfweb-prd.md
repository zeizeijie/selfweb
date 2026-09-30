# 个人知识花园 · 增量 PRD（网站可部署化 + 原生微信小程序）

| 项 | 内容 |
| --- | --- |
| 文档版本 | v1.0（增量） |
| 撰写人 | 许清楚（产品经理） |
| 语言 | 简体中文 |
| 技术形态 | 网站沿用现有原生静态站（HTML/CSS/JS，不重写）；小程序为原生微信小程序 |
| 数据形态 | 双端共用同一份内容数据，网站支持构建时从 Notion 同步、无 Token 优雅降级 |
| 上游资产 | `site/index.html` / `site/styles.css` / `site/data.js` / `site/app.js` |

---

## 1. 文档概述

**一句话目标**：在不重写网站前端的前提下，让网站「可上线、可被搜索与分享、内容可由 Notion 自动同步」，并新增一套「与网站视觉同源、内容同源」的原生微信小程序。

**本次变更范围（相对已完成的 UI 初版）**

| 维度 | 初版现状 | 本次增量 |
| --- | --- | --- |
| 网站部署 | 无构建、无部署配置，本地打开 | 交付 Vercel/Netlify 可部署产物与构建脚本，产出可访问线上地址 |
| 网站内容源 | 硬编码 `data.js` | 构建时 Notion 同步 → 生成 `data.js`；**无 Token 时降级为仓库内本地 `data.js`** |
| 网站分享/SEO | hash 路由 SPA，分享无标题摘要 | 补齐 meta/OG/Twitter 卡片、分享图、可选预渲染 |
| 视觉资产 | 封面依赖豆瓣外链、存在失效占位符 | 定义封面降级策略、图标与分享图规范 |
| 小程序 | 无 | 完整原生小程序：5 模块 + 筛选 + 详情页 + 分享 |
| 数据契约 | 仅服务网站 | 抽象为「双端共用数据契约」 |

**本次不做（明确排除）**：不重写网站为 React/Vite；不做小程序登录/用户体系；不做评论、点赞、收藏等 UGC；不做竞品与市场调研。

---

## 2. 产品目标与成功标准

| 编号 | 产品目标 | 成功标准（可验证） |
| --- | --- | --- |
| G1 | 网站可一键部署上线 | 推送代码后，Vercel/Netlify 构建成功并产出可访问 URL；页面在桌面 1440px 与移动 375px 下无横向滚动、无控制台报错 |
| G2 | 内容由 Notion 自动同步，且不依赖 Token 也能跑 | ① 未配置 `NOTION_TOKEN` 时构建成功，内容等同于仓库内本地数据；② 配置 Token 后，构建日志显示拉取条数；③ 同步失败时不阻断构建，回退本地数据并输出警告 |
| G3 | 网站可被搜索引擎与社交平台正确理解 | 每个模块 URL 具备独立 `<title>` + `description` + OG 卡片；分享到微信/微博显示标题、摘要、分享图（非空、非默认） |
| G4 | 交付与网站视觉同源的原生小程序 | 小程序可导入微信开发者工具运行；5 个模块数据条数与网站一致（书 12 / 方法论 7 / 旅行 3 / Words 74 / AI 3）；主色、圆角、留白观感与网站一致 |
| G5 | 双端内容同源、零重复维护 | 同一份内容契约生成双端数据；新增/修改 1 条内容，网站构建与小程序数据**均只需改一处或同步 Notion 一处** |
| G6 | 小程序具备分享能力 | 首页、各模块页、详情页均配置分享标题/路径/分享图，分享落地可正确打开对应内容 |

**关键量化验收**：内容完整性（条数 100% 对齐，数据零丢失）、双端首屏可交互、无失效封面图（封面 100% 有降级显示）、小程序包体积 ≤ 2MB。

---

## 3. 双端信息架构

### 3.1 页面 / 视图对照表

| 模块 | 网站（hash 视图） | 小程序（页面路径） | 网站有·小程序无 | 小程序有·网站无 |
| --- | --- | --- | --- | --- |
| 首页 | `#/`（`view-home`） | `pages/index/index` | 桌面悬停动效、大 Bento 网格 | 微信分享按钮、`onShareAppMessage` |
| AI 学习 | `#/ai` | `pages/ai/index` | 左右交错大图卡布局 | 分享卡片 |
| 图书馆 | `#/library` | `pages/library/index` | 桌面 4 列书墙 | 分享卡片 |
| 书籍详情 | 弹层 `#overlay` + `#modal`（modal.js） | `pages/book-detail/index?id=` | 弹层动画 | 原生页面转场、分享单本书 |
| 方法论 | `#/method` | `pages/method/index` | 桌面 3 列网格 | 分享卡片 |
| 文章详情 | 弹层 `#modal`（wide） | `pages/article-detail/index?id=` | 弹层动画 | 原生页面转场、分享单篇文章 |
| 旅行 | `#/travel` | `pages/travel/index` | 桌面 2 列 | 分享卡片 |
| 旅行详情 | 弹层 `#modal`（wide） | `pages/trip-detail/index?id=` | 弹层动画 | 原生页面转场、分享单段行程 |
| Words | `#/words` | `pages/words/index` | 桌面 3 列瀑布流 | 分享卡片 |
| 关于/页脚 | `#` 页脚区 | 首页底部区域 | — | — |

> **IA 差异说明**：网站为「单页 + 弹层」，小程序为「多页面栈」。小程序不使用弹层承载详情（微信用户习惯页面回退），改为独立详情页 + `navigateTo`。

### 3.2 小程序 tabBar 设计

微信小程序 tabBar 最多 5 个、最少 2 个。本产品有 5 个内容模块 + 首页，共 6 个入口，超出上限。

**决策**：tabBar 放 5 个高频入口，首页作为「启动页」通过 `pages/index/index` 承载并进入；其余模块通过首页卡片入口跳转。

| 序 | tabBar 项 | 页面路径 | 图标 | 选中色 |
| --- | --- | --- | --- | --- |
| 1 | 首页 | `pages/index/index` | `home` | `#0071e3` |
| 2 | AI 学习 | `pages/ai/index` | `chip` | `#0071e3` |
| 3 | 图书馆 | `pages/library/index` | `book` | `#0071e3` |
| 4 | 方法论 | `pages/method/index` | `compass` | `#0071e3` |
| 5 | 更多 | `pages/more/index` | `more` | `#0071e3` |

- `pages/more/index`（「更多」页）承载 **旅行** 与 **Words** 两个模块入口 + 站主信息。
- 备选方案（若用户偏好）：把 tabBar 缩减为「首页 / 图书馆 / 方法论 / Words / 更多」，AI 与旅行归入「更多」。**此点列入待确认问题。**

**tabBar 视觉参数建议**
| 项 | 值 |
| --- | --- |
| `color`（未选中文字） | `#86868b` |
| `selectedColor` | `#0071e3` |
| `backgroundColor` | `#ffffff` |
| `borderStyle` | `black`（对应 `rgba(0,0,0,0.08)` 的分割线观感） |
| 图标尺寸 | 81×81 px（`@3x`），单色线稿，随 `selectedColor` 静态切换（tabBar 不支持动态着色，需准备选中/未选中两套，或统一灰色） |

### 3.3 小程序页面路径规划（完整）

```
pages/
  index/index            首页
  ai/index               AI 学习列表
  library/index          图书馆列表（含筛选）
  book-detail/index      书籍详情（?id=<bookId>）
  method/index           方法论列表（含筛选）
  article-detail/index   文章详情（?id=<articleId>）
  travel/index           旅行列表
  trip-detail/index      行程详情（?id=<tripId>）
  words/index            Words 列表（含筛选）
  more/index             更多（旅行 + Words 入口）
components/
  book-card/             书籍卡片
  method-card/           方法论卡片
  chip-bar/              筛选芯片组
  reveal/                滚动渐入容器
  empty-state/           空态
utils/
  data.js                从契约生成的双端共享数据
  format.js              stars/时间/文本截断
```

---

## 4. 用户故事

### 角色 A：网站访客

| 编号 | 用户故事 | 验收标准 |
| --- | --- | --- |
| US-A1 | 作为访客，我希望打开网站就看到首页与五大空间概览，以便快速了解这里有什么 | 首页展示 hero + 5 张模块卡；每张卡显示模块名、tagline、数量；点击卡片进入对应视图 |
| US-A2 | 作为访客，我希望在图书馆按阅读状态筛选书籍，以便只看在读/想读 | 筛选芯片含「全部/已读/在读/想读」及各自数量；点击即过滤，无需刷新 |
| US-A3 | 作为访客，我希望点开一本书看到评分、状态与读书笔记 | 弹出详情弹层，含封面、作者、状态、标签、评分、笔记（引用/点评两种样式） |
| US-A4 | 作为访客，我希望在方法论按分类筛选并阅读全文 | 筛选含「全部 + 4 分类」；点开文章弹层展示结构化正文（h2/段落/列表/引用） |
| US-A5 | 作为访客，我希望在 Words 按分类筛选并浏览文案 | 4 分类筛选；瀑布流卡片显示正文、作者、来源、分类 |
| US-A6 | 作为访客，我希望把某个模块链接分享出去，对方能看到标题与摘要 | 分享任意模块 URL，社交平台预览显示该模块 title/description/分享图 |

### 角色 B：小程序用户

| 编号 | 用户故事 | 验收标准 |
| --- | --- | --- |
| US-B1 | 作为小程序用户，我希望通过 tabBar 在五大内容间切换 | tabBar 5 项可用，切换无白屏，选中态正确 |
| US-B2 | 作为小程序用户，我希望在图书馆/方法论/Words 内筛选 | 芯片横向滚动，点击过滤，数据条数与网站一致 |
| US-B3 | 作为小程序用户，我希望点开一本书进入详情页并能返回 | `navigateTo` 进入详情，左上返回可用，详情字段完整 |
| US-B4 | 作为小程序用户，我希望把一本书/一篇文章分享给微信好友 | 详情页支持「转发」，卡片标题为条目名，分享图非空，点开落在对应详情 |
| US-B5 | 作为小程序用户，我希望在无网络时看到友好提示 | 网络失败展示错误态与「重试」按钮，不出现空白页 |

### 角色 C：站主本人（内容维护）

| 编号 | 用户故事 | 验收标准 |
| --- | --- | --- |
| US-C1 | 作为站主，我希望在 Notion 改内容后重新部署网站即可生效 | 配置 Token 后重新构建，变更内容出现在线上 |
| US-C2 | 作为站主，我希望没配 Token 时也能正常部署 | 无 `NOTION_TOKEN` 时构建成功，使用仓库内本地数据 |
| US-C3 | 作为站主，我希望封面图不会因为外链失效而破图 | 封面加载失败自动降级为渐变底 + 书名文字，永不显示破图 |
| US-C4 | 作为站主，我希望同一份内容不用维护两遍 | 双端从同一契约生成；改一处即可同步（详见 §6） |

---

## 5. 需求池

> 所属端：**网站** / **小程序** / **双端**。优先级：P0 必做 / P1 应做 / P2 可选。

| 编号 | 需求描述 | 所属端 | 优先级 | 验收标准 |
| --- | --- | --- | --- | --- |
| R-01 | 网站接入 Vercel/Netlify 构建部署，产出线上可访问地址 | 网站 | P0 | 构建成功；线上 URL 可打开；5 视图路由正常 |
| R-02 | 构建时从 Notion 拉取内容，生成 `data.js` | 网站 | P0 | Token 存在时生成数据与 Notion 一致；日志输出各模块条数 |
| R-03 | 无 `NOTION_TOKEN` 时优雅降级为本地数据 | 网站 | P0 | 移除 Token 后构建仍成功，内容 = 仓库内数据 |
| R-04 | 站点补齐 SEO / 社交分享 meta（title/description/OG/Twitter） | 网站 | P0 | 每个模块 URL 有独立 title/desc；OG 图片 URL 有效 |
| R-05 | 封面加载失败降级（渐变底 + 书名） | 双端 | P0 | 移除/伪造失效封面后，展示渐变底 + 书名，无破图；《明朝那些事》占位符不出现破图 |
| R-06 | 小程序：首页 + 5 模块页完整实现 | 小程序 | P0 | 各页内容条数 = 网站；视觉同源 |
| R-07 | 小程序：图书馆/方法论/Words 筛选 | 小程序 | P0 | 筛选可用，条数与网站一致 |
| R-08 | 小程序：书籍/文章/行程详情页 | 小程序 | P0 | 三种详情页字段完整；返回正常 |
| R-09 | 小程序：tabBar + 导航栏配置 | 小程序 | P0 | tabBar 5 项正常；导航栏配色与站点一致 |
| R-10 | 小程序：分享（转发好友 / 分享到会话） | 小程序 | P0 | 首页/模块页/详情页均可转发，卡片信息正确 |
| R-11 | 双端共用数据契约（字段/枚举/降级统一） | 双端 | P0 | 见 §6；两端渲染字段一一对应 |
| R-12 | 小程序加载态 / 错误态 / 空态 | 小程序 | P1 | 网络失败显示错误态 + 重试；筛选无结果显示空态 |
| R-13 | 网站预渲染或静态化以提升分享抓取 | 网站 | P1 | 分享抓取不依赖 JS 执行即可拿到 title/desc/图 |
| R-14 | 图标资产规范化（模块图标、tabBar 图标两套） | 小程序 | P1 | 图标为本地资源，非外链；尺寸合规 |
| R-15 | 小程序包体积与资源优化（封面压缩/懒加载） | 小程序 | P1 | 上传包 ≤ 2MB；列表滚动流畅 |
| R-16 | 「更多」页聚合旅行 + Words 入口 | 小程序 | P1 | 两个入口可达对应模块页 |
| R-17 | 网站暗色模式（Apple 风格） | 网站 | P2 | 跟随系统 `prefers-color-scheme` 切换 |
| R-18 | 小程序图片预览 / 长按复制文案 | 小程序 | P2 | Words 长按可复制；封面可预览 |
| R-19 | 网站 404 / 无效 hash 兜底 | 网站 | P2 | 非法 hash 回退首页 |
| R-20 | 小程序订阅消息（内容更新提醒） | 小程序 | P2 | 待用户确认是否需要（见 §10） |

---

## 6. 数据契约需求（架构师关键输入）

### 6.1 契约原则（P0）

1. **单一来源**：双端渲染的数据必须来自同一份逻辑结构。网站经构建产出 `window.SITE_DATA`；小程序经构建产出 `module.exports = {…}`（或 `utils/data.js`）。**字段名、层级、枚举值两端完全一致。**
2. **无 Token 降级**：构建脚本读取顺序为 ① 环境变量 `NOTION_TOKEN` + 数据库 ID → 若非空且请求成功，产出 Notion 数据；② 否则读取仓库内 `data/site-data.local.json`（由现有 `data.js` 迁出）→ 产出本地数据；③ 二者皆失败 → 使用内置兜底数据并输出构建警告，**不中断构建**。
3. **封面降级链**：`cover(有效URL)` → 失败 → `coverFallback(渐变CSS值)` → 仍缺失 → 默认渐变 `linear-gradient(135deg,#86868b,#48484a)`。**任何情况下不得渲染破图。**
4. **枚举约束**：`library.books[].status ∈ {已读, 在读, 想读}`；`library.books[].rating ∈ 0..5 整数`（0 = 未评分，不渲染星）；`method.articles[].category ∈ categories[].id`；`words.list[].category ∈ {人生感悟, 休闲文案, 为人处事, 装X语录}`。
5. **详情寻址稳定 ID**：小程序详情页用 `?id=` 寻址，因此每个可进入详情的条目需要一个稳定 `id`（见 6.3）。
6. **富文本受限语法**：正文文本仅支持 `**粗体**`；禁止内联 HTML/脚本（防 XSS，双端一致）。

### 6.2 顶层结构 schema

```jsonc
{
  "meta": {
    "name": "string(必填)",              // 站点名
    "subtitle": "string(必填)",
    "tagline": "string(必填)",
    "owner": "string(选填)",
    "shareImage": "string(选填)"          // 默认分享图 URL，缺省用站点默认图
  },
  "modules": [
    {
      "id": "枚举(ai|library|method|travel|words)·必填",
      "name": "string(必填)",
      "icon": "枚举(chip|book|compass|mountain|quote)·必填",
      "color": "string(#hex)·必填",
      "tagline": "string(必填)",
      "desc": "string(必填)",
      "count": "number(必填，列表实际长度)",
      "shareImage": "string(选填)"
    }
  ],
  "ai":      { "intro": "string", "projects": [ /* 6.2.1 */ ] },
  "library": { "intro": "string", "books": [ /* 6.2.2 */ ], "favorites": ["string"] },
  "method":  { "intro": "string", "categories": [ /* 6.2.3 */ ], "articles": [ /* 6.2.4 */ ] },
  "travel":  { "intro": "string", "trips": [ /* 6.2.5 */ ] },
  "words":   { "intro": "string", "categories": [ /* 6.2.6 */ ], "list": [ /* 6.2.7 */ ] }
}
```

#### 6.2.1 `ai.projects[]`
```jsonc
{
  "id": "string(必填，稳定唯一)",     // ⬅ 新增，用于分享/详情寻址
  "title": "string(必填)",
  "status": "枚举(进行中|已完成)·必填", // 渲染：已完成时状态点变灰
  "summary": "string(必填)",
  "tags": ["string"],
  "color": "#hex(必填)",
  "highlights": ["string"],
  "shareImage": "string(选填)"
}
```

#### 6.2.2 `library.books[]`
```jsonc
{
  "id": "string(必填，稳定唯一)",
  "title": "string(必填)",
  "author": "string(可空，渲染兜底为「—」/「佚名」)",
  "rating": "整数 0..5(必填，0 表示未评分)",
  "status": "枚举(已读|在读|想读)·必填",
  "tag": "string(必填)",
  "cover": "string(选填；可为空串或无效占位符，必须走降级链)",
  "coverFallback": "string(选填，CSS 渐变值)",
  "readTime": "string(选填，如 '2025' 或 '2024.11 — 2024.12')",
  "noteAvailable": "boolean(必填)",
  "noteTitle": "string(noteAvailable=true 时必填)",
  "note": [
    { "type": "枚举(quote|comment)·必填", "text": "string(必填)", "source": "string(选填)" }
  ]
}
```
> **特殊处理**：现 `data.js` 中《明朝那些事》`cover = "attachment:1.jpg"` 为无效占位符。契约要求构建脚本将其规范化为 `cover = ""`，并保留/补全 `coverFallback`，渲染端按 §6.1-3 降级。**禁止把 `attachment:` 前缀当 URL 渲染。**

#### 6.2.3 `method.categories[]`
```jsonc
{ "id": "枚举(learn|theory|project|life)·必填", "name": "string(必填)" }
```

#### 6.2.4 `method.articles[]`
```jsonc
{
  "id": "string(必填，稳定唯一)",
  "title": "string(必填)",
  "category": "string(必填，∈ categories[].id)",
  "summary": "string(必填)",
  "readingTime": "string(必填，如 '8 分钟')",
  "body": [
    // 一行一节点，节点键互斥：
    { "h2": "string" }                                   // 二级标题 → h3
    { "p": "string" }                                    // 段落（支持 **粗体**）
    { "li": "string" }                                   // 列表项
    { "quote": "string", "source": "string(选填)" }       // 引用块
  ]
}
```

#### 6.2.5 `travel.trips[]`
```jsonc
{
  "id": "string(必填，稳定唯一)",
  "title": "string(必填)",
  "location": "string(必填)",
  "date": "string(必填)",
  "altitude": "string(选填)",             // 卡片「关键信息」
  "cover": "string(必填，CSS 渐变值)",     // 旅行封面为渐变，非图片
  "summary": "string(必填)",
  "sections": [                           // 选填（与 checklists 至少有一个）
    { "icon": "枚举(route|clock|bag|wallet|sun|drop|device|pill)·必填",
      "title": "string(必填)",
      "items": ["string"] }
  ],
  "checklists": [ ["string"] ],           // 选填；item 内「（待补）」= 待办样式
  "tip": "string(选填)",
  "shareImage": "string(选填)"
}
```

#### 6.2.6 `words.categories[]`
```jsonc
{ "id": "枚举(all|人生感悟|休闲文案|为人处事|装X语录)·必填", "name": "string(必填)" }
```

#### 6.2.7 `words.list[]`
```jsonc
{
  "id": "string(必填，稳定唯一)",   // ⬅ 新增
  "text": "string(必填)",
  "author": "string(可空)",
  "source": "string(可空)",
  "category": "枚举(人生感悟|休闲文案|为人处事|装X语录)·必填"
}
```

### 6.3 稳定 ID 生成规则（供架构师实现）

- 若 Notion 数据源含 `id` / `slug`，直接采用。
- 若不含，构建脚本按 `模块前缀 + 序号` 生成确定性 id，例如 `book-001`、`article-003`、`trip-001`、`word-021`、`ai-001`。
- **顺序稳定性**：按源数据顺序生成，新增内容追加末尾，避免 id 漂移导致旧分享链接失效。
- `words.js` 当前 74 条（`modules` 中 count=80 为展示口径，需在构建时以 `list.length` 校正为 74，两端一致）。

### 6.4 双端消费差异映射

| 契约字段 | 网站消费 | 小程序消费 |
| --- | --- | --- |
| `cover` / `coverFallback` | `<img onerror>` 降级 + 背景渐变 | `<image binderror>` 降级 + `background` 渐变 |
| `body[].h2/p/li/quote` | 拼接为 innerHTML | `wx:for` 按节点类型渲染 `<view>` |
| `**粗体**` | `rich()` 转 `<strong>` | 解析为 `rich-text` nodes 或分段 `<text>` |
| 详情寻址 | 弹层由事件传 title | 路由 `?id=` + 在数据中按 id 查找 |
| 分享 | `meta`/OG 卡片 | `onShareAppMessage` |

---

## 7. UI 设计规格（双端）

### 7.1 网站：设计 token 提炼（源自 `styles.css`，保持不变）

| 类别 | Token | 值 |
| --- | --- | --- |
| 背景 | `--bg` / `--bg-alt` | `#ffffff` / `#f5f5f7` |
| 背景（毛玻璃） | `--bg-elev` | `rgba(255,255,255,.72)` |
| 文本 | `--text` / `--text-secondary` / `--text-tertiary` | `#1d1d1f` / `#6e6e73` / `#86868b` |
| 分割线 | `--line` / `--line-strong` | `rgba(0,0,0,.08)` / `rgba(0,0,0,.14)` |
| 主色 | `--blue` / `--blue-hover` | `#0071e3` / `#0077ed` |
| 圆角 | `--radius-s/m/l/xl` | `12 / 18 / 28 / 40 px` |
| 阴影 | `--shadow-s/m/l` | 见 styles.css 第 25–27 行 |
| 导航高 | `--nav-h` | `52px` |
| 内容宽 | `--max` | `1120px` |
| 缓动 | `--ease` | `cubic-bezier(.28,.11,.32,1)` |
| 字体栈 | `--font` | `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif` |
| 断点 | — | `980px`（平板）、`734px`（手机） |
| 模块色 | modules[].color | ai `#0071e3` / library `#bf4800` / method `#6e56cf` / travel `#0f8a6a` / words `#c2405f` |
| 强调色 | 星标 `#f5a623`、成功点 `#30d158` | — |

**需补齐的资产规范**
| 资产 | 规格 |
| --- | --- |
| 分享默认图（OG image） | 1200×630 px，PNG，含站点名 + tagline，浅色底（`#f5f5f7`）+ 蓝色点缀 |
| 各模块分享图 | 1200×630 px，取模块色做点缀；可程序化生成或静态备好 5 张 |
| favicon | 32×32 + 180×180（apple-touch-icon），取 logo 圆点渐变 `#0071e3→#6e56cf` |
| 图标 | 沿用 `app.js` 内联 SVG 线性图标（stroke 1.7，圆角）；确保小程序侧有等价本地资源 |
| 字号阶梯 | h1 `clamp(44,7vw,88)` / sec-title `clamp(30,4vw,48)` / card-title 21 / lead `clamp(17,2vw,21)` / body 15–16.5 / meta 12–13 |

### 7.2 小程序：Apple 风格 → WXSS 映射

**rpx 换算规则**：设计稿以 750rpx = 屏宽（对应 375px 逻辑像素），换算 `1px ≈ 2rpx`。以下数值为建议值（基于网站 token 折算）。

| 类别 | 网站值 | 小程序建议值（rpx） |
| --- | --- | --- |
| 页面左右留白 | `24px` | `48rpx` |
| 卡片圆角（大） | `28px` | `56rpx` |
| 卡片圆角（中） | `18px` | `36rpx` |
| 圆角（小 / 芯片） | `12px / 999px` | `24rpx / 999rpx` |
| 区块间距（section.tight） | `72px` | `120rpx`（移动端更紧凑） |
| 卡片内边距 | `32px 32px 28px` | `56rpx 56rpx 48rpx` |
| 卡片间距 | `20–22px` | `32–40rpx` |
| 导航栏高度 | `52px` | 用小程序原生导航栏（默认），或 `navigationStyle:"custom"` 时 `88rpx + 安全区` |
| 按钮圆角 | `980px` | `980rpx`（胶囊） |
| 按钮内边距 | `11px 22px` | `22rpx 44rpx` |

**颜色映射（WXSS 变量，写入 `app.wxss`）**
```css
page {
  --bg: #ffffff;
  --bg-alt: #f5f5f7;
  --text: #1d1d1f;
  --text-secondary: #6e6e73;
  --text-tertiary: #86868b;
  --line: rgba(0,0,0,0.08);
  --blue: #0071e3;
  --radius-m: 36rpx;
  --radius-l: 56rpx;
  background: var(--bg);
  color: var(--text);
}
```

**字体栈限制与替代**
| 网站 | 小程序 | 说明 |
| --- | --- | --- |
| `-apple-system / SF Pro` | 不生效 | 小程序默认使用系统字体，iOS 上默认即为苹方/SF，无需显式指定 |
| `"PingFang SC"` | 可写 | 建议字体栈：`-apple-system, "PingFang SC", "Helvetica Neue", sans-serif` |
| `letter-spacing: -0.03em` | 支持但需 `rpx` 无关（px 单位） | 关键标题保留字距收紧以维持 Apple 观感 |
| `backdrop-filter` 毛玻璃 | 部分支持（需基础库≥2.15+、iOS 表现好） | 导航若用自定义，可降级为纯色 `#ffffff` + 底部 1px 分割线 |

**导航栏配色**
| 项 | 值 |
| --- | --- |
| `navigationBarBackgroundColor` | `#ffffff` |
| `navigationBarTextStyle` | `black` |
| `navigationBarTitleText` | 各页对应模块名（首页 = 站点名「知识花园」） |
| `backgroundColor`（下拉背景） | `#f5f5f7` |
| `backgroundTextStyle` | `dark` |

**tabBar 视觉**：见 §3.2。

**其他小程序端规范**
- 模块卡片：圆角 `56rpx`、背景 `#f5f5f7`、图标块 84rpx（对应网站 42px），颜色取 `modules[].color`。
- 图书馆网格：2 列（移动优先），封面比例 `3 / 4.3`。
- Words：单列卡片流（移动端不做瀑布流，保证阅读节奏）。
- 阴影：小程序支持 `box-shadow`，量级参照 `--shadow-s`（卡片常态）与 `--shadow-m`（悬停态改为点击态）。

---

## 8. 交互规格

| 交互 | 网站行为 | 小程序行为 | 验收标准 |
| --- | --- | --- | --- |
| 模块导航 | hash 路由切换视图，滚动置顶，导航切换 active | tabBar 切换 / `navigateTo` | 切换无残留、无闪烁 |
| 筛选 | 芯片点击 → 过滤列表 → 更新数量标签 | 同左，芯片横向可滚动 | 筛选结果条数正确；当前芯片高亮 |
| 详情 | 点击卡片 → 打开 `#overlay` 弹层（scale+淡入）；ESC/点遮罩/关闭按钮关闭；打开时锁定 body 滚动 | 点击 → `navigateTo` 详情页；返回手势/左上返回 | 详情内容完整；返回后列表筛选态保留（小程序需缓存筛选状态，如 `wx.setStorage` 或页面栈返回不重置） |
| 滚动渐入 | `IntersectionObserver` + `.reveal` 逐条延迟（≤340ms） | 简化：用 `wx.createIntersectionObserver` 或 CSS 动画首屏淡入 | 元素进入视口淡入上移；无性能卡顿 |
| 加载态 | 静态数据即时渲染（无网络请求）；Notion 为构建时 | 首屏 `wx.showLoading` 或骨架屏，数据就绪后隐藏 | 加载中不出现空白/错位 |
| 空态 | 筛选无结果时列表区为空 → 需补空态文案 | 显示空态插画/文案 + 「查看全部」按钮 | 任何筛选都能看到明确空态提示 |
| 错误态 | 若将来改为运行时拉取，展示重试；当前封面失败走降级 | 数据/网络错误展示错误态 + 「重试」 | 点击重试可恢复 |
| 分享 | meta/OG 卡片（静态） | `onShareAppMessage` / 转发按钮 | 卡片标题、图、路径正确 |
| 键盘可达性 | 卡片 `tabindex` + Enter/Space 跳转 | — | 网站键盘可操作 |
| 导航滚动效果 | 滚过 8px 后导航加底部分割线 | 原生导航自带 | — |

**状态保留要求（小程序）**：从详情返回列表时，筛选条件与滚动位置应保留（P1）。

---

## 9. 验收标准

### 9.1 网站验收清单

- [ ] 构建命令可执行，产出静态站点；未配置 `NOTION_TOKEN` 时构建成功并降级本地数据
- [ ] 配置 Token 后重新构建，线上内容更新（抽查 1 条）
- [ ] 部署平台（Vercel/Netlify）构建成功，生成可访问 URL
- [ ] 首页 + 5 模块视图路由正常（`#/`、`#/ai`、`#/library`、`#/method`、`#/travel`、`#/words`）
- [ ] 图书馆筛选：全部 12、已读、在读、想读数量正确
- [ ] 方法论筛选：全部 7 + 4 分类数量正确
- [ ] Words 筛选：全部 74 + 4 分类数量正确
- [ ] 书籍详情弹层：封面、作者、状态、标签、评分、笔记渲染正确
- [ ] 文章详情弹层：h2/段落/列表/引用渲染正确，`**粗体**` 生效
- [ ] 旅行详情弹层：sections 与 checklists 均正确（含「待补」样式）
- [ ] 《明朝那些事》不出现破图（走渐变降级 + 书名）
- [ ] 所有封面加载失败均有降级显示
- [ ] 每个模块 URL 有独立 title / description / OG 卡片
- [ ] 移动端 375px 无横向滚动，导航折叠菜单可用
- [ ] 桌面 1440px 布局正常；无控制台报错
- [ ] 键盘 Enter/Space 可触发模块卡片跳转

### 9.2 小程序验收清单

- [ ] 可导入微信开发者工具，编译无报错、无警告阻断
- [ ] tabBar 5 项正常显示与切换，选中态配色正确
- [ ] 首页 5 模块卡片可跳转对应页面
- [ ] 各模块数据条数与网站一致（书 12 / 方法论 7 / 旅行 3 / Words 74 / AI 3）
- [ ] 图书馆筛选正确；方法论筛选正确；Words 筛选正确
- [ ] 书籍详情页（`?id=`）字段完整；文章详情页结构完整；行程详情页 sections/checklists 完整
- [ ] 封面加载失败降级为渐变 + 书名
- [ ] 首页 / 各模块页 / 详情页均支持微信转发，卡片信息正确，落地页正确
- [ ] 网络异常时展示错误态并可重试；筛选无结果显示空态
- [ ] 详情返回列表后筛选条件保留
- [ ] 上传包体积 ≤ 2MB
- [ ] 视觉与网站同源：主色 `#0071e3`、圆角、留白观感一致

### 9.3 双端一致性验收

- [ ] 同一内容条目在网站与小程序显示一致（标题、作者、评分、状态、分类、正文）
- [ ] 数据契约字段两端一一对应，无单端独有字段
- [ ] 枚举值两端完全一致，无拼写/别名差异

---

## 10. 待确认问题（需用户拍板）

| 编号 | 问题 | 影响 | 建议默认 |
| --- | --- | --- | --- |
| Q1 | 小程序 **AppID** 是否已有？ | 无法真机预览/发布 | 先用「测试号」跑通，正式 AppID 后补 |
| Q2 | 小程序 **名称**与简介 | tabBar 首页标题、分享卡片 | 沿用「知识花园」 |
| Q3 | 是否需要**订阅消息 / 内容更新提醒** | 决定 R-20 是否做 | 默认不做 |
| Q4 | 网站**部署域名** | 影响 SEO 绝对 URL、OG 卡片 | 先用 Vercel 默认域名 |
| Q5 | **Notion Token** 何时提供？对应数据库 ID 是否已建好 5 个数据源？ | 决定 R-02 是否能真实跑通 | 先交付降级版；Token 后补 |
| Q6 | Notion 各模块的**字段映射**是否需先对齐（例如 rating 在 Notion 里存数字还是星）？ | 影响构建脚本字段适配 | 由架构师先定义映射表，用户确认 |
| Q7 | tabBar 组合方案：`首页/AI/图书馆/方法论/更多` 还是 `首页/图书馆/方法论/Words/更多`？ | 影响 IA 与常用入口 | 采用前者（旅行+Words 入「更多」） |
| Q8 | 是否接受**网站保持 SPA + 预渲染**，而非完全多页静态化？ | 影响 SEO 方案工作量 | 采用「SPA + 构建时预渲染关键模块」折中 |
| Q9 | 分享图是**静态备好 5 张**还是**构建时程序化生成**？ | 影响构建复杂度 | 先用静态 5 张 + 1 张默认图 |
| Q10 | `modules[].count` 口径：现有「图书馆 14 / Words 80」与真实数据（书 12 / Words 74）不符，是否统一以**真实列表长度**为准？ | 影响首页数字展示一致性 | 统一以真实 `list.length` 为准 |

---

> **下游交接提示（给架构师）**：§6 数据契约是本次最关键输入，请优先落地「契约层 → 构建脚本（Notion 同步 + 降级）→ 双端生成」，再据此拆解网站与小程序实现任务。§6.3 稳定 ID 与 §6.2.2 封面降级是两端详情/分享能力的共同前提。
