import { NextResponse } from "next/server";
import {
  aiSettingsView,
  clearAiSettings,
  effectiveAiSettings,
  ensureSettingsLoaded,
  maskKey,
  saveAiSettings,
} from "@/lib/settings";
import { extractJson } from "@/lib/ai/deepseek";

export const runtime = "nodejs";

/**
 * AI 设置：让用户在浏览器里填密钥，不用去改 .env 再重启。
 *
 * 安全约定：
 * - GET **绝不回显完整密钥**，只返回掩码
 * - 密钥只写不读（写进去之后只能整体替换或清空）
 * - 明文存本地 SQLite —— 这一点在 GET 的 storageNote 里如实说明，不假装它安全
 */
export async function GET() {
  // 与设置页共用 aiSettingsView()，避免两处逻辑漂移
  return NextResponse.json(await aiSettingsView());
}

export async function POST(request: Request) {
  let body: { apiKey?: string; baseUrl?: string; model?: string; mode?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  // ── 测试连接：用当前（或刚填的）配置真发一次请求 ──
  // 这是这个页面上最有用的一步 —— 让用户当场知道 key 到底能不能用，
  // 而不是保存完再去提交一条素材才发现不行。
  if (body.action === "test") {
    await ensureSettingsLoaded();
    // 允许"填了还没保存就测试"：临时值优先
    const testKey = (body.apiKey ?? "").trim() || effectiveAiSettings().apiKey;
    const testBase = (body.baseUrl ?? "").trim().replace(/\/+$/, "") || effectiveAiSettings().baseUrl;
    const testModel = (body.model ?? "").trim() || effectiveAiSettings().model;

    if (!testKey) {
      return NextResponse.json({ ok: false, error: "还没有填密钥" }, { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const startedAt = Date.now();
    try {
      const res = await fetch(`${testBase}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${testKey}` },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: "user", content: '只回复两个字：可用' }],
          max_tokens: 12,
          stream: false,
        }),
        signal: controller.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        return NextResponse.json({
          ok: false,
          elapsedMs: Date.now() - startedAt,
          error: `HTTP ${res.status}：${text.slice(0, 200)}`,
        });
      }

      // 有些网关即使成功也可能返回非 JSON，这里只做尽力解析，不因此判定失败
      let reply = "";
      try {
        const parsed = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
        reply = parsed.choices?.[0]?.message?.content ?? "";
      } catch {
        const loose = extractJson(text) as { choices?: { message?: { content?: string } }[] } | null;
        reply = loose?.choices?.[0]?.message?.content ?? "";
      }

      return NextResponse.json({
        ok: true,
        elapsedMs: Date.now() - startedAt,
        model: testModel,
        reply: reply.trim().slice(0, 40) || "（模型返回了内容，但没能解出文本）",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({
        ok: false,
        elapsedMs: Date.now() - startedAt,
        error: msg.includes("abort") ? "请求超时（30 秒）" : msg,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  // ── 保存 ──
  try {
    await saveAiSettings({
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      model: body.model,
      mode: body.mode,
    });
    const s = effectiveAiSettings();
    return NextResponse.json({
      ok: true,
      apiKeyMasked: maskKey(s.apiKey),
      apiKeySource: s.apiKeySource,
      enabled: s.enabled,
      model: s.model,
      mode: s.mode,
      message: "已保存并立即生效 —— 不需要重启服务。",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "保存失败" },
      { status: 500 },
    );
  }
}

/** 清空界面设置，回到只用 .env */
export async function DELETE() {
  try {
    await clearAiSettings();
    const s = effectiveAiSettings();
    return NextResponse.json({
      ok: true,
      apiKeyMasked: maskKey(s.apiKey),
      apiKeySource: s.apiKeySource,
      enabled: s.enabled,
      message: "已清除界面设置，现在回退到 .env 里的配置。",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "清除失败" },
      { status: 500 },
    );
  }
}
