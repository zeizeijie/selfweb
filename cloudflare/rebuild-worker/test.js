/**
 * 本地验证 rebuild Worker 的逻辑（无需 wrangler / 无需真实网络）。
 * 运行：node cloudflare/rebuild-worker/test.js
 * 说明：Node 18+ 内置 fetch / Response / URL，可直接模拟 Workers 运行时。
 */
import worker from "./src/index.js";

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log("  ✓ " + msg); }
  else { fail++; console.log("  ✗ " + msg); }
}

/** 拦截全局 fetch，记录调用并返回预设响应 */
function mockFetch(responder) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init);
  };
  return {
    calls,
    restore() { globalThis.fetch = original; }
  };
}

console.log("=== 1. scheduled：未配置 DEPLOY_HOOK_URL ===");
{
  const m = mockFetch(async () => new Response("{}", { status: 200 }));
  const logs = [];
  const origErr = console.error;
  console.error = (...a) => logs.push(a.join(" "));
  let noRetryCalled = false;
  const controller = {
    cron: "0 1 * * *",
    scheduledTime: Date.parse("2026-09-30T01:00:00Z"),
    noRetry() { noRetryCalled = true; }
  };
  await worker.scheduled(controller, {});
  console.error = origErr;
  m.restore();

  assert(m.calls.length === 0, "未配置时不发起任何请求");
  assert(noRetryCalled === true, "配置缺失时调用 noRetry（避免无意义重试）");
  assert(logs.some((l) => l.includes("DEPLOY_HOOK_URL")), "输出了明确的错误提示");
}

console.log("");
console.log("=== 2. scheduled：正常触发 ===");
{
  const m = mockFetch(async () => new Response('{"ok":true}', { status: 200 }));
  const controller = { cron: "0 1 * * *", scheduledTime: Date.parse("2026-09-30T01:00:00Z") };
  await worker.scheduled(controller, { DEPLOY_HOOK_URL: "https://api.cloudflare.com/pages/webhook/test" });
  m.restore();

  assert(m.calls.length === 1, "发起了 1 次请求");
  assert(m.calls[0] && m.calls[0].init && m.calls[0].init.method === "POST", "使用 POST 方法");
  assert(m.calls[0].url.includes("webhook"), "请求目标为 Deploy Hook URL");
}

console.log("");
console.log("=== 3. scheduled：4xx 视为配置问题，不再重试 ===");
{
  const m = mockFetch(async () => new Response("bad", { status: 403 }));
  let noRetryCalled = false;
  const controller = { cron: "0 1 * * *", scheduledTime: Date.now(), noRetry() { noRetryCalled = true; } };
  const origErr = console.error;
  console.error = () => {};
  await worker.scheduled(controller, { DEPLOY_HOOK_URL: "https://example.com/hook" });
  console.error = origErr;
  m.restore();

  assert(noRetryCalled === true, "4xx 时调用 noRetry");
}

console.log("");
console.log("=== 4. scheduled：5xx 抛出以触发重试 ===");
{
  const m = mockFetch(async () => new Response("err", { status: 500 }));
  const origErr = console.error;
  console.error = () => {};
  let threw = false;
  const controller = { cron: "0 1 * * *", scheduledTime: Date.now() };
  try {
    await worker.scheduled(controller, { DEPLOY_HOOK_URL: "https://example.com/hook" });
  } catch (e) { threw = true; }
  console.error = origErr;
  m.restore();

  assert(threw === true, "5xx 时抛出异常（交由 Cloudflare 重试）");
}

console.log("");
console.log("=== 5. fetch：非目标路径返回 404 ===");
{
  const res = await worker.fetch(new Request("https://example.com/"), { REBUILD_TOKEN: "t" });
  assert(res.status === 404, "GET / 返回 404，实际 " + res.status);
  const res2 = await worker.fetch(new Request("https://example.com/rebuild", { method: "GET" }), { REBUILD_TOKEN: "t" });
  assert(res2.status === 404, "GET /rebuild 返回 404（仅接受 POST），实际 " + res2.status);
}

console.log("");
console.log("=== 6. fetch：未配置 REBUILD_TOKEN 时端点关闭 ===");
{
  const res = await worker.fetch(
    new Request("https://example.com/rebuild", { method: "POST", headers: { "x-rebuild-token": "anything" } }),
    {}
  );
  assert(res.status === 403, "无 REBUILD_TOKEN 时返回 403，实际 " + res.status);
}

console.log("");
console.log("=== 7. fetch：token 校验 ===");
{
  const mk = (t) => new Request("https://example.com/rebuild", {
    method: "POST",
    headers: t ? { "x-rebuild-token": t } : {}
  });

  const noToken = await worker.fetch(mk(null), { REBUILD_TOKEN: "secret123" });
  assert(noToken.status === 401, "缺少 token 返回 401，实际 " + noToken.status);

  const wrong = await worker.fetch(mk("wrong"), { REBUILD_TOKEN: "secret123" });
  assert(wrong.status === 401, "错误 token 返回 401，实际 " + wrong.status);

  const m = mockFetch(async () => new Response("ok", { status: 200 }));
  const ok = await worker.fetch(mk("secret123"), { REBUILD_TOKEN: "secret123", DEPLOY_HOOK_URL: "https://example.com/hook" });
  m.restore();
  assert(ok.status === 200, "正确 token 返回 200，实际 " + ok.status);
  assert(m.calls.length === 1, "正确 token 时确实触发了 Deploy Hook");
}

console.log("");
console.log("=========================================");
console.log("断言 " + (pass + fail) + " 项，通过 " + pass + "，失败 " + fail);
console.log("结果：" + (fail === 0 ? "全部通过 ✓" : "存在失败 ✗"));
process.exit(fail === 0 ? 0 : 1);
