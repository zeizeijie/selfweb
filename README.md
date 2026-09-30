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

1. 复制 `.env.example` 为 `.env`，填入 Notion Integration Token
2. 在 `data/notion-map.json` 中确认各模块的数据源 ID
3. 重新构建即可拉取最新内容

**降级策略**：即使没有 Token 或 Notion 请求失败，构建依然成功，自动回退到本地数据 —— 不会中断部署。

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
