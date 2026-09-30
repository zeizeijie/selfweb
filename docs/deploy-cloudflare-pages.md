# 部署到 Cloudflare Pages

本项目为**零依赖静态站**，构建产物在 `site/dist`，可直接部署到 Cloudflare Pages。

---

## 方式一：Git 集成（推荐，自动持续部署）

### 1. 推送代码到 Git 仓库

项目当前**尚未配置远程仓库**。先创建 GitHub/GitLab 仓库并推送：

```bash
# 在项目根目录
git remote add origin git@github.com:<你的用户名>/<仓库名>.git
git push -u origin master
```

> 如果希望默认分支名为 `main`：
> ```bash
> git branch -M main
> git push -u origin main
> ```

### 2. 在 Cloudflare 创建 Pages 项目

1. 打开 [Cloudflare Dashboard → Workers & Pages](https://dash.cloudflare.com/?to=%2F%3Aaccount%2Fworkers-and-pages)
2. 点击 **Create** → 选择 **Pages** → **Connect to Git**
3. 授权并选择刚推送的仓库

### 3. 填写构建配置

| 配置项 | 值 |
| --- | --- |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `site/dist` |
| Root directory | *(留空)* |

> 本项目零 npm 依赖，**不需要**安装步骤。Cloudflare 会自动跳过 `npm install`（无依赖可装）。

### 4. 配置环境变量（重要）

在 **Settings → Environment variables** 添加：

| 变量名 | 值 | 说明 |
| --- | --- | --- |
| `NODE_VERSION` | `18` | 构建所需的最低 Node 版本 |
| `NOTION_TOKEN` | `<你的 Notion Integration Token>` | **不配也能构建成功**，但会降级为本地数据 |
| `SITE_URL` | `https://你的域名` | 影响 canonical / OG / sitemap 的绝对地址 |

> **为什么必须在这里配 `NOTION_TOKEN`？**
> 本地的 `.env` 文件已被 `.gitignore` 排除，不会提交到仓库，Cloudflare 的构建环境读不到。
> 未配置时构建会走三级降级的第 ② 级，使用 `data/site-data.local.json`，**站点依然可正常访问**，只是内容不会随 Notion 实时更新。

### 5. 部署

点击 **Save and Deploy**。首次构建约 1 分钟，完成后会分配一个 `*.pages.dev` 域名。

---

## 方式二：Wrangler CLI 直传（手动）

适合不想接 Git、或需要一次性发布本地已构建产物。

```bash
# 1. 构建
npm run build

# 2. 用 wrangler 直传 site/dist
npx wrangler pages deploy site/dist --project-name=zeizeijie
```

首次运行会引导你登录 Cloudflare 账号。CI 环境可改用 API Token：

```bash
export CLOUDFLARE_API_TOKEN=<你的 token>
export CLOUDFLARE_ACCOUNT_ID=<你的 account id>
npx wrangler pages deploy site/dist --project-name=zeizeijie
```

---

## 配置说明

### `_headers`（响应头）

Cloudflare Pages **不读** `wrangler.toml` 的 `[[headers]]`，只认构建输出目录下的纯文本 `_headers` 文件。
本项目已由 `tools/build.js` + `tools/seo.js` 自动生成到 `site/dist/_headers`：

- `/assets/*` → 强缓存一年（`immutable`）
- `/*.html` → 不缓存，保证内容即时更新
- `/*` → 安全响应头（`X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy` / `Permissions-Policy`）

> 注意：`_headers` 的缩进必须是**空格**，不能用 Tab（Pages 规范要求）。

### 自定义 404

Cloudflare Pages 有内置约定：只要输出目录存在 `404.html`，未命中的路径会自动返回该页面（带 404 状态码）。

**不需要**在 `_redirects` 里写 404 规则 —— Cloudflare 的 `_redirects` **不支持** rewrites（仅支持 301/302/303/307/308 跳转），写了会被忽略。

本项目已生成 `site/dist/404.html`，开箱即用。

### 路由与 SEO

站点是 SPA + 构建时预渲染的多入口结构：

| 路径 | 文件 | 说明 |
| --- | --- | --- |
| `/` | `index.html` | 首页 |
| `/ai` | `ai.html` | AI 学习（`cleanUrls` 生效） |
| `/library` | `library.html` | 图书馆 |
| `/method` | `method.html` | 方法论 |
| `/travel` | `travel.html` | 旅行 |
| `/words` | `words.html` | Words |

每个入口页都有独立的 `title` / `description` / `canonical` / OG / Twitter 标签。

> **关于链接路径**：入口页之间使用**相对路径**（如 `href="ai.html"`）互相引用。
> 这与三份平台配置（Cloudflare / Vercel `cleanUrls+trailingSlash:false` / Netlify）一致，
> 且额外兼容「部署到子路径」的场景。Cloudflare Pages 会自动把 `/ai/` 归一化为 `/ai`，
> 因此不会产生相对路径错位。
>
> **例外**：若你把站点部署在**子目录**（如 `example.com/blog/`），相对路径依然可用，但需相应调整
> `SITE_URL` 为 `https://example.com/blog`，否则 canonical / sitemap 的绝对地址会不正确。

---

## 验证清单

部署完成后，逐项确认：

```bash
# 1. 首页可访问
curl -I https://<你的域名>/

# 2. 6 个入口页均返回 200
for p in "" ai library method travel words; do
  echo -n "/$p → "
  curl -s -o /dev/null -w "%{http_code}\n" "https://<你的域名>/$p"
done

# 3. 不存在的路径返回 404（而非 200）
curl -s -o /dev/null -w "%{http_code}\n" "https://<你的域名>/not-exist-page"

# 4. 安全响应头生效
curl -sI https://<你的域名>/ | grep -iE "x-content-type-options|x-frame-options|referrer-policy"

# 5. 静态资源强缓存生效
curl -sI https://<你的域名>/assets/favicon-32.png | grep -i cache-control
```

预期：入口页全 200；不存在路径 404；安全响应头存在；assets 返回 `max-age=31536000, immutable`。

---

## 常见问题

| 现象 | 原因与解决 |
| --- | --- |
| 构建报错 `node: command not found` 或版本过低 | 未设置 `NODE_VERSION`，在环境变量里加 `NODE_VERSION=18` |
| 线上内容与 Notion 不一致 | 未配置 `NOTION_TOKEN`，构建走了本地数据降级。在 Pages 环境变量中补上 |
| `sitemap.xml` / canonical 里是 `example.com` | 未设置 `SITE_URL`，补上正式域名后重新部署 |
| 书籍封面显示为渐变而非图片 | Notion 上传的图片是 1 小时过期的签名链接，构建时已自动降级。改用外部图片直链即可 |
| 深链接（如 `/library`）刷新后 404 | 确认 Build output directory 填的是 `site/dist`，且 6 个入口 HTML 已生成 |
| 构建成功但页面空白 | 检查 `site/dist/index.html` 是否存在于部署产物中 |
