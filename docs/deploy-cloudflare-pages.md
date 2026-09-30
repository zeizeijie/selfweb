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

## 自动定时构建（同步 Notion 更新）

### 为什么需要

Cloudflare Pages 默认**只在 git push 时构建**。但本站内容来自 Notion——你在 Notion 里改了内容，仓库代码没变，Pages 不会重新构建，线上就看不到更新。

解决办法是用 **Deploy Hook**：一个专属 URL，对它发 POST 请求就能拉起一次构建。再配一个定时器按计划调用它，即可让线上内容自动跟随 Notion。

### 第 1 步：创建 Deploy Hook

1. Cloudflare Dashboard → **Workers & Pages** → 选择你的 Pages 项目
2. **Settings** → **Builds** → **Add deploy hook**
3. 填写：
   - **Deploy hook name**：`notion-sync`（任意唯一标识）
   - **Branch to build**：你的生产分支（`master` 或 `main`）
4. 创建后复制生成的 URL，形如：
   ```
   https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```

> ⚠️ **安全提醒**：Deploy Hook URL **无需任何认证**即可触发构建，等同于密码。
> 不要提交到仓库、不要写在前端代码里。下文两种方案都把它存为密钥。

先验证 Hook 本身可用：

```bash
curl -X POST "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/<你的ID>"
```

回到 Pages 项目的 **Deployments** 列表，应能看到一条新构建，其 **Source** 列显示为 Deploy Hook。

### 第 2 步：选一种定时方案

| 方案 | 适合场景 | 依赖 |
|---|---|---|
| **A. Workers Cron Trigger**（推荐） | 希望全部在 Cloudflare 生态内完成 | 需额外部署一个 Worker |
| **B. GitHub Actions 定时** | 仓库在 GitHub，不想多部署一个 Worker | 需 GitHub repo secret |

两者任选其一即可，**不要同时启用**（会重复构建、浪费额度）。

---

#### 方案 A：Workers Cron Trigger（推荐）

本项目已内置 Worker 代码，位于 `cloudflare/rebuild-worker/`。

**1. 部署 Worker**

```bash
cd cloudflare/rebuild-worker
npx wrangler deploy
```

**2. 存入 Deploy Hook URL（作为密钥）**

```bash
npx wrangler secret put DEPLOY_HOOK_URL
# 粘贴第 1 步得到的 URL
```

**3.（可选）启用手动触发端点**

```bash
npx wrangler secret put REBUILD_TOKEN
# 输入一个自定义令牌，例如用 openssl rand -hex 16 生成
```

配置后可手动触发一次构建：

```bash
curl -X POST https://zeizeijie-rebuild.<你的子域>.workers.dev/rebuild \
  -H "x-rebuild-token: <你的 REBUILD_TOKEN>"
```

> 未设置 `REBUILD_TOKEN` 时该端点自动返回 403（安全默认，无需担心暴露）。

**4. 调整时间**

编辑 `cloudflare/rebuild-worker/wrangler.toml` 的 `crons`：

```toml
[triggers]
crons = ["0 1 * * *"]
```

> ⚠️ **Cron 按 UTC 执行**，北京时间 = UTC + 8。

| cron（UTC） | 北京时间 | 月构建次数 |
|---|---|---|
| `0 1 * * *` | 每天 09:00 | ≈ 30 |
| `0 13 * * *` | 每天 21:00 | ≈ 30 |
| `0 1,13 * * *` | 每天 09:00 与 21:00 | ≈ 60 |
| `0 1 * * MON` | 每周一 09:00 | ≈ 4 |
| `*/30 * * * *` | 每 30 分钟 | ≈ 1440 ⚠️ 会超出免费额度 |

改完后重新 `npx wrangler deploy`，**最多 15 分钟**后在全球网络生效。

**查看执行记录**：Workers → 你的 Worker → **Settings** → **Trigger Events** → **View events**（保留最近 100 次）。

---

#### 方案 B：GitHub Actions 定时

仓库已内置 `.github/workflows/rebuild.yml`，**默认关闭定时**（避免与方案 A 重复构建），
开箱即可手动触发。启用定时只需两步：

**1. 启用定时**

编辑 `.github/workflows/rebuild.yml`，把 `schedule` 段的注释取消：

```yaml
on:
  schedule:
    # 每天 UTC 01:00 = 北京时间 09:00（约 30 次/月）
    - cron: "0 1 * * *"
  workflow_dispatch:
```

**2. 存入 Deploy Hook URL**

GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**，
添加 `DEPLOY_HOOK_URL`，值为第 1 步得到的 URL。

**手动触发一次**（无需等待定时）：

GitHub 仓库 → **Actions** → 选 `Rebuild site (Notion sync)` → **Run workflow**。

> 注意：GitHub Actions 的 `schedule` 同样按 **UTC** 执行；且在仓库长期无活动后可能被停用，
> 另外高峰时段 cron 可能延迟数分钟——**不保证准点**。对本站这种每天一次的场景无影响。
>
> 未配置 `DEPLOY_HOOK_URL` 时该 workflow 会直接报错退出（不会静默失败）。

---

### 构建额度与频率建议

Cloudflare Pages 各方案的构建上限：

| 方案 | 每月构建数 | 并发构建 |
|---|---|---|
| Free | 500 | 1 |
| Pro | 5,000 | 5 |
| Business | 20,000 | 20 |

单次构建超时为 20 分钟；本站构建约 1 秒，不会触及。

**建议：每天 1 次（≈30 次/月）**。Notion 属于低频内容源，每天同步一次完全够用，且距 500 次上限余量充足。

> 避免「每次 Notion 变更都构建」——Notion 没有开箱即用的 webhook，需自建轮询，
> 且频繁构建会很快耗尽额度、还容易撞上「同时只能 1 个构建」的限制。

### 验证定时是否生效

```bash
# 1. 查看最近的 Cron 触发记录
cd cloudflare/rebuild-worker && npx wrangler tail

# 2. 确认构建的 Source 是 Deploy Hook
#    Dashboard → Pages 项目 → Deployments → 查看 Source 列

# 3. 确认线上内容确实更新了
curl -s https://<你的域名>/data.js | grep -o '"name":"[^"]*"' | head -3
```

### 常见问题

| 现象 | 原因与解决 |
|---|---|
| 定时到了但没构建 | Cron 改动需重新 deploy，且最多 15 分钟才生效 |
| 日志显示「未配置 DEPLOY_HOOK_URL」 | 忘记 `wrangler secret put`；注意 secret 不会随代码走，换机器需重设 |
| 内容与 Notion 不一致 | 检查 Pages 环境变量 `NOTION_TOKEN` 是否已配置；未配置会降级为本地数据 |
| 触发了但构建失败 | 看 Pages 的构建日志；常见于 `NODE_VERSION` 未设置 |
| 想临时停掉定时 | Worker 方案：把 `crons` 改为 `[]` 再 deploy；Actions 方案：在 GitHub 停用 workflow |

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
