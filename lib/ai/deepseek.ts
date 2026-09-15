/**
 * OpenAI 兼容的大模型客户端。
 * 只做三件事：发请求、超时兜底、把模型输出解析成可信 JSON。
 * 任何一步失败都返回 ok:false，由 lib/ai/index.ts 决定是否降级 —— 绝不抛异常打断业务。
 */
import type { ZodType } from "zod";

export type LlmConfig = {
  mode: "auto" | "llm" | "rule";
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 是否应当尝试调用真模型 */
  enabled: boolean;
};

export function llmConfig(): LlmConfig {
  const rawMode = (process.env.LLM_MODE || "auto").trim().toLowerCase();
  const mode: LlmConfig["mode"] = rawMode === "llm" || rawMode === "rule" ? rawMode : "auto";
  const apiKey = (process.env.LLM_API_KEY || "").trim();
  const baseUrl = (process.env.LLM_BASE_URL || "https://api.deepseek.com").trim().replace(/\/+$/, "");
  const model = (process.env.LLM_MODEL || "deepseek-chat").trim();

  return {
    mode,
    apiKey,
    baseUrl,
    model,
    // mode=rule 时永不调用；没有 key 时永不调用。其余交给真实请求去试
    enabled: mode !== "rule" && apiKey.length > 0,
  };
}

/** 从模型返回里硬抠出 JSON —— 兼容 ```json 包裹、前后废话、多余逗号 */
export function extractJson(raw: string): unknown {
  if (!raw) return null;
  let text = raw.trim();

  // 去掉 ```json ... ``` 围栏
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  const tryParse = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  const direct = tryParse(text);
  if (direct !== undefined) return direct;

  // 截取第一个 { 到最后一个 }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const sliced = text.slice(start, end + 1);
    const parsed = tryParse(sliced) ?? tryParse(sliced.replace(/,\s*([}\]])/g, "$1"));
    if (parsed !== undefined) return parsed;
  }
  return null;
}

export type LlmCallResult<T> =
  | { ok: true; data: T; model: string; ms: number }
  | { ok: false; error: string; raw?: string };

export async function llmJson<T>(opts: {
  system: string;
  user: string;
  /**
   * 只做结构校验，不负责产出领域类型。
   * 调用方显式声明 T，并对校验通过的数据做归一化 —— 模型输出是不可信输入。
   */
  schema: ZodType;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<LlmCallResult<T>> {
  const cfg = llmConfig();
  if (!cfg.enabled) {
    return { ok: false, error: `LLM 未启用（mode=${cfg.mode}, hasKey=${cfg.apiKey.length > 0}）` };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  const startedAt = Date.now();

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens ?? 2400,
        response_format: { type: "json_object" },
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status} ${text.slice(0, 300)}` };
    }

    const payload = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(content);
    if (parsed === null) {
      return { ok: false, error: "模型返回不是合法 JSON", raw: content.slice(0, 400) };
    }

    const validated = opts.schema.safeParse(parsed);
    if (!validated.success) {
      return {
        ok: false,
        error: `结构校验失败: ${validated.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        raw: content.slice(0, 400),
      };
    }

    return { ok: true, data: validated.data as T, model: payload.model ?? cfg.model, ms: Date.now() - startedAt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.includes("abort") ? "调用超时" : msg };
  } finally {
    clearTimeout(timer);
  }
}
