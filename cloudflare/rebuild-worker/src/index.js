/**
 * Cloudflare Worker —— 定时触发 Cloudflare Pages 重建
 * ------------------------------------------------------------
 * 用途：站点内容来自 Notion，而 Cloudflare Pages 默认只在 git push 时构建。
 *       本 Worker 由 Cron Trigger 按计划唤醒，向 Pages 的 Deploy Hook 发一个
 *       POST，从而拉起一次构建，把 Notion 的最新内容同步到线上。
 *
 * 安全：Deploy Hook URL 无需认证即可触发构建，等同于密钥。
 *       必须存为 Worker secret，绝不可硬编码进代码或提交到仓库：
 *         npx wrangler secret put DEPLOY_HOOK_URL
 *
 * 可选：同时暴露 POST /rebuild 手动端点，用 REBUILD_TOKEN 保护，
 *       便于在本地或第三方服务（如 cron-job.org）按需触发。
 *       未设置 REBUILD_TOKEN 时该端点自动关闭（安全默认）。
 *
 * 说明：Cron Triggers 按 **UTC** 执行。北京时间 = UTC+8。
 *
 * 参考：
 *   https://developers.cloudflare.com/workers/configuration/cron-triggers/
 *   https://developers.cloudflare.com/pages/configuration/deploy-hooks/
 */

const LOG = "[rebuild]";

/** 构造 JSON 响应 */
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export default {
  /**
   * Cron Trigger 入口。
   * @param {object} controller 提供 cron / scheduledTime / noRetry()
   * @param {object} env 环境变量（含 secret DEPLOY_HOOK_URL）
   */
  async scheduled(controller, env) {
    const cron = (controller && controller.cron) || "(unknown)";
    const time = controller && controller.scheduledTime
      ? new Date(controller.scheduledTime).toISOString()
      : new Date().toISOString();

    console.log(`${LOG} 触发 cron=${cron} 时间=${time}`);

    const hookUrl = env && env.DEPLOY_HOOK_URL;
    if (!hookUrl) {
      console.error(`${LOG} 未配置 DEPLOY_HOOK_URL，跳过。请先执行：npx wrangler secret put DEPLOY_HOOK_URL`);
      // 配置缺失属于确定性问题，重试也不会成功 —— 明确告知不要重试
      if (controller && typeof controller.noRetry === "function") controller.noRetry();
      return;
    }

    try {
      const res = await fetch(hookUrl, { method: "POST" });
      const text = await res.text().catch(() => "");
      console.log(`${LOG} Deploy Hook 响应 ${res.status} ${String(text).slice(0, 200)}`);

      if (!res.ok) {
        // 4xx 多为配置/权限问题（重试无益）；5xx 可能是临时故障（交给 Cloudflare 重试）
        if (res.status >= 400 && res.status < 500) {
          console.error(`${LOG} 收到 ${res.status}，判定为配置问题，不再重试`);
          if (controller && typeof controller.noRetry === "function") controller.noRetry();
        } else {
          throw new Error(`Deploy Hook 返回 ${res.status}`);
        }
      }
    } catch (e) {
      console.error(`${LOG} 调用失败：${e && e.message}`);
      throw e; // 抛出后由 Cloudflare 按重试策略处理
    }
  },

  /**
   * HTTP 入口：手动触发一次重建（需 REBUILD_TOKEN）。
   * @param {Request} request
   * @param {object} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    // 仅开放一个端点，其余一律 404，减少暴露面
    if (request.method !== "POST" || url.pathname !== "/rebuild") {
      return new Response("Not Found", { status: 404 });
    }

    const token = env && env.REBUILD_TOKEN;
    if (!token) {
      return json({ ok: false, error: "未配置 REBUILD_TOKEN，手动端点已关闭" }, 403);
    }

    const provided = request.headers.get("x-rebuild-token") || "";
    if (provided !== token) {
      return json({ ok: false, error: "token 不匹配" }, 401);
    }

    const hookUrl = env && env.DEPLOY_HOOK_URL;
    if (!hookUrl) {
      return json({ ok: false, error: "未配置 DEPLOY_HOOK_URL" }, 500);
    }

    const res = await fetch(hookUrl, { method: "POST" });
    const body = await res.text().catch(() => "");
    return json(
      { ok: res.ok, status: res.status, detail: String(body).slice(0, 300) },
      res.ok ? 200 : 502
    );
  }
};
