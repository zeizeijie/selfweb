# 贼贼接 · 个人知识站（双端）

一个个人知识库的展示空间，同时交付 **可部署静态网站** 与 **原生微信小程序**，两端内容同源。

内容分为五个模块：**AI 学习 · 图书馆 · 方法论 · 旅行 · Words**。

---

## 快速开始

```bash
# 1. 构建（生成双端数据 + 网站发布产物 site/dist/）
node tools/build.js

# 2. 本地预览网站
cd site/dist && python -m http.server 8901
# 打开 http://127.0.0.1:8901

# 3. 小程序：用微信开发者工具导入 miniprogram/ 目录
```

> 无需 `npm install` —— 全链路 **零依赖**，仅需 Node 18+。



---

## 目录结构

```
├── data/
│   ├── site-data.local.json    # 本地内容源（无 Notion Token 时使用）
│   └── notion-map.json         # Notion 数据源 ID 与字段映射表
├── templates/
│   └── site-template.html      # 纯净 HTML 模板（构建只读，保证幂等）
├── tools/                      # 构建链
│   ├── build.js                #   主构建（三级降级 → 双端产物 → SEO → 资产）
│   ├── notion.js               #   Notion API 拉取
│   ├── normalize.js            #   归一化：补 id / 校 count / 修封面 / 枚举校验
│   ├── generate.js             #   产出 site/data.js + miniprogram/utils/data.js
│   ├── seo.js                  #   入口 HTML / robots / sitemap / manifest / 404
│   ├── make-icons.js           #   图标与分享图（纯 Node zlib 生成 PNG）
│   ├── verify.js               #   产物校验
│   ├── verify-miniprogram.js   #   小程序静态校验
│   └── sim-miniprogram.js      #   小程序页面逻辑模拟
├── site/                       # 网站端
│   ├── index.html              #   纯净模板副本
│   ├── app.js / styles.css     #   应用逻辑 / Apple 风格设计系统
│   ├── data.js                 #   构建产物（勿手工改）
│   ├── assets/                 #   favicon / OG 分享图
│   └── dist/                   #   发布目录（Vercel / Netlify 指向这里）
├── miniprogram/                # 微信小程序
│   ├── app.json / app.js / app.wxss
│   ├── pages/                  #   10 个页面
│   ├── components/             #   5 个组件
│   ├── utils/                  #   data.js(产物) / format.js / store.js
│   └── assets/tabbar/          #   tabBar 图标
└── deliverables/software-company/   # PRD / 架构设计 / 测试报告
```

---

## 内容维护

### 方式一：直接改本地数据（简单）

编辑 `data/site-data.local.json`，然后重新构建：

```bash
node tools/build.js
```

### 方式二：接入 Notion 自动同步

1. 在 [notion.so/my-integrations](https://www.notion.so/my-integrations) 新建集成，复制 Internal Integration Secret
2. **关键一步**：在 Notion 中把目标页面/数据库「连接」（Share → 找到你的集成）到该集成，否则 API 会返回 404
3. 复制 `.env.example` 为 `.env`，填入 `NOTION_TOKEN`（`build.js` 会自动加载 `.env`，无需额外依赖）
4. 在 `data/notion-map.json` 中确认各模块的 `dataSourceId`
5. 重新构建即可拉取最新内容

**如何获取正确的数据源 ID**：

- `dataSourceId` 必须是 **database_id**（形如 `1a0f5433-9d28-8009-9689-d01fdd5c0af3`），**不是** `collection://...` 或页面 ID
- 可用 `POST https://api.notion.com/v1/search`（带 `filter: {property:"object", value:"database"}`）列出集成可见的全部数据库
- 若某个模块是「页面下的子页面集合」而非数据库，在该模块配置 `"type": "page"` 并填 `pageId`

**降级策略（三级 + 模块级）**：

| 层级 | 触发条件 | 行为 |
| --- | --- | --- |
| ① | `NOTION_TOKEN` 存在且请求成功 | 使用 Notion 数据 |
| ①′ | **部分模块**同步失败 | 失败模块**单独**回填本地数据，其余模块继续用 Notion（模块级降级） |
| ② | 无 Token / 整体请求失败 | 全部回退 `data/site-data.local.json` |
| ③ | 本地数据也缺失 | 使用内置兜底数据 |

任何情况下 **构建都不会失败**，不会中断部署。

**字段类型支持**（`notion-map.json` 的 `fields[].type`）：

`title` / `rich_text` / `rich_text_lines` / `number` / `select` / `status` / `multi_select` / `stars` / `date` / `files_or_url` / `relation` / `title_const`

- `status`：Notion 新版 status 属性（值取 `status.name`）
- `stars`：`multi_select` 里的 ⭐ 符号转为 0~5 数字
- `relation`：自动二次查询关联页面取标题（如书籍的「作者」关联）
- `title_const`：按标题查表赋值，用于「页面型数据源」缺失字段时手工指定

**已知限制**：Notion 上传的图片会返回带签名的 **S3 临时链接（1 小时过期）**，构建脚本会识别并自动降级为渐变背景，避免线上破图。如需真实封面，请在 Notion 中改用外部图片直链（如豆瓣 CDN）。

### 部署

已内置 `vercel.json` 与 `netlify.toml`，发布目录为 `site/dist`：

| 平台           | 操作                             |
| ------------ | ------------------------------ |
| Vercel       | 导入仓库，自动识别配置                    |
| Netlify      | 导入仓库，自动识别配置                    |
| GitHub Pages | 将 `site/dist` 推到 `gh-pages` 分支 |

记得设置环境变量 `SITE_URL` 为你的正式域名（影响 sitemap 与分享卡片里的绝对地址）。

---

## 测试

```bash
node tools/build.js              # 构建（含自检报告）
node tools/verify.js             # 产物校验
node tools/verify-miniprogram.js # 小程序静态校验
node tools/sim-miniprogram.js    # 小程序页面逻辑模拟
node --test tools/normalize.test.js
```

或一次跑完：`node tools/build.js && node tools/verify.js && node tools/verify-miniprogram.js && node tools/sim-miniprogram.js`

---

## 小程序说明

- **tabBar**：首页 / AI 学习 / 图书馆 / 方法论 / 更多（旅行与 Words 收在「更多」页）
- **详情页**：书籍、文章、行程各有一个独立页面，通过 `?id=` 寻址
- **筛选态保留**：从详情返回列表时，之前的筛选条件不会丢失
- 当前 `project.config.json` 使用 `touristappid`（游客模式），**正式发布前需替换为你自己的 AppID**

---

## 设计说明

界面参照 Apple 设计语言：SF 字体栈、毛玻璃导航、大留白、克制动效。  
双端共用同一套设计 token（主色 `#0071e3`、背景 `#f5f5f7`、圆角与间距按 `2rpx ≈ 1px` 换算）。

---

## 待办

- [ ] 替换小程序 AppID（`miniprogram/project.config.json`）
- [ ] 配置 `SITE_URL` 为正式域名
- [ ] 如需 Notion 同步，提供 Integration Token
- [ ] 小程序真机冒烟测试（当前仅通过静态与逻辑验证）
