/**
 * 运行时设置：目前只用于 AI 密钥。
 *
 * ── 为什么要它 ──
 * 别人 clone 下这个仓库后，原本必须去改 `.env` 再重启才能用真模型，门槛太高。
 * 有了它就能在浏览器里填，而且**保存后立刻生效、不需要重启**。
 *
 * ── 优先级 ──
 * 界面设置 > 环境变量（.env）。这样 CI / 部署环境仍然可以只用环境变量，
 * 而界面上填过的会覆盖它 —— 让"我刚刚在界面上填了 key 怎么不生效"不会发生。
 *
 * ── 为什么要有内存缓存 ──
 * `llmConfig()` 是同步函数（AI 层到处在调），而读数据库是异步的。
 * 所以这里做一层缓存：AI 入口先 `await ensureSettingsLoaded()`，
 * 之后 `effectiveAiSettings()` 就能同步读到。保存时同步更新缓存。
 *
 * ── 安全 ──
 * 密钥以**明文**存本地 SQLite。单机 Demo 可接受，生产应走 KMS/Vault 或加密存储。
 * 界面上会如实说明，不假装它安全。读接口一律返回**掩码**，不回显完整密钥。
 */
import { prisma } from "./db";

export const AI_SETTING_KEYS = {
  apiKey: "ai.apiKey",
  baseUrl: "ai.baseUrl",
  model: "ai.model",
  mode: "ai.mode",
} as const;

export const AI_DEFAULTS = {
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  mode: "auto",
} as const;

export type AiModeSetting = "auto" | "llm" | "rule";

export interface EffectiveAiSettings {
  apiKey: string;
  /** 密钥从哪来的 —— 界面上要如实告诉用户 */
  apiKeySource: "ui" | "env" | "none";
  baseUrl: string;
  model: string;
  mode: AiModeSetting;
  enabled: boolean;
}

interface Cache {
  uiApiKey: string;
  uiBaseUrl: string | null;
  uiModel: string | null;
  uiMode: string | null;
}

let cache: Cache | null = null;
let loadPromise: Promise<void> | null = null;

function normalizeMode(raw: string): AiModeSetting {
  const v = raw.trim().toLowerCase();
  return v === "llm" || v === "rule" ? v : "auto";
}

/** 从数据库加载一次（之后走缓存）。加载失败也不抛，退化成只用环境变量。 */
async function load(): Promise<void> {
  if (cache) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const rows = await prisma.setting.findMany();
        const map = new Map(rows.map((r) => [r.key, r.value]));
        cache = {
          uiApiKey: (map.get(AI_SETTING_KEYS.apiKey) ?? "").trim(),
          uiBaseUrl: map.get(AI_SETTING_KEYS.baseUrl) ?? null,
          uiModel: map.get(AI_SETTING_KEYS.model) ?? null,
          uiMode: map.get(AI_SETTING_KEYS.mode) ?? null,
        };
      } catch {
        // 表还不存在 / 数据库不可用：当成"界面没设置过"，让 .env 兜底
        cache = { uiApiKey: "", uiBaseUrl: null, uiModel: null, uiMode: null };
      }
    })();
  }
  await loadPromise;
}

/** AI 入口在调 llmConfig() 之前必须先 await 这个 */
export async function ensureSettingsLoaded(): Promise<void> {
  await load();
}

/** 同步读取当前生效的 AI 配置 */
export function effectiveAiSettings(): EffectiveAiSettings {
  const envKey = (process.env.LLM_API_KEY ?? "").trim();
  const uiKey = cache?.uiApiKey ?? "";
  const apiKey = uiKey || envKey;

  const baseUrl = (
    cache?.uiBaseUrl ||
    process.env.LLM_BASE_URL ||
    AI_DEFAULTS.baseUrl
  )
    .trim()
    .replace(/\/+$/, "");

  const mode = normalizeMode(cache?.uiMode || process.env.LLM_MODE || AI_DEFAULTS.mode);

  return {
    apiKey,
    apiKeySource: uiKey ? "ui" : envKey ? "env" : "none",
    baseUrl,
    model: (cache?.uiModel || process.env.LLM_MODEL || AI_DEFAULTS.model).trim(),
    mode,
    enabled: mode !== "rule" && apiKey.length > 0,
  };
}

export interface SaveAiInput {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  mode?: string;
}

/** 保存设置。写完立刻更新缓存 —— 不需要重启就能生效。 */
export async function saveAiSettings(input: SaveAiInput): Promise<void> {
  await load();

  const writes: { key: string; value: string }[] = [];
  if (input.apiKey !== undefined) {
    writes.push({ key: AI_SETTING_KEYS.apiKey, value: input.apiKey.trim() });
  }
  if (input.baseUrl !== undefined) {
    writes.push({ key: AI_SETTING_KEYS.baseUrl, value: input.baseUrl.trim().replace(/\/+$/, "") });
  }
  if (input.model !== undefined) {
    writes.push({ key: AI_SETTING_KEYS.model, value: input.model.trim() });
  }
  if (input.mode !== undefined) {
    writes.push({ key: AI_SETTING_KEYS.mode, value: normalizeMode(input.mode) });
  }

  for (const w of writes) {
    // 空值就删掉这一项，让 .env 重新接管，而不是存一个空字符串挡住它
    if (!w.value) {
      await prisma.setting.deleteMany({ where: { key: w.key } });
    } else {
      await prisma.setting.upsert({
        where: { key: w.key },
        create: w,
        update: { value: w.value },
      });
    }
  }

  // 同步缓存（注意空值要还原成 null，否则会挡住 .env）
  cache = {
    uiApiKey: input.apiKey !== undefined ? input.apiKey.trim() : (cache?.uiApiKey ?? ""),
    uiBaseUrl: input.baseUrl !== undefined ? input.baseUrl.trim() || null : (cache?.uiBaseUrl ?? null),
    uiModel: input.model !== undefined ? input.model.trim() || null : (cache?.uiModel ?? null),
    uiMode: input.mode !== undefined ? normalizeMode(input.mode) : (cache?.uiMode ?? null),
  };
}

/** 清空界面设置，回到只用 .env */
export async function clearAiSettings(): Promise<void> {
  await load();
  await prisma.setting.deleteMany({
    where: { key: { in: Object.values(AI_SETTING_KEYS) } },
  });
  cache = { uiApiKey: "", uiBaseUrl: null, uiModel: null, uiMode: null };
}

/** 界面只展示掩码，绝不回显完整密钥 */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 12) return `${key.slice(0, 3)}****`;
  return `${key.slice(0, 6)}****${key.slice(-4)}`;
}

/** 设置页/接口返回给前端的视图对象（不含完整密钥） */
export interface AiSettingsView {
  apiKeyMasked: string;
  apiKeySource: "ui" | "env" | "none";
  configured: boolean;
  enabled: boolean;
  baseUrl: string;
  model: string;
  mode: AiModeSetting;
  defaults: typeof AI_DEFAULTS;
  storageNote: string;
}

export const AI_STORAGE_NOTE =
  "密钥以明文保存在本地 SQLite（Setting 表）。本机 Demo 可以接受；生产环境请改用密钥管理服务（KMS / Vault）或加密存储。";

/**
 * 组装视图对象。
 * 抽出来是为了让**服务端页面和 GET 接口共用同一份逻辑** ——
 * 页面能在服务端就把状态渲染出来，不用先闪一下"加载中"，也不会两处逻辑漂移。
 */
export async function aiSettingsView(): Promise<AiSettingsView> {
  await ensureSettingsLoaded();
  const s = effectiveAiSettings();
  return {
    apiKeyMasked: maskKey(s.apiKey),
    apiKeySource: s.apiKeySource,
    configured: s.apiKey.length > 0,
    enabled: s.enabled,
    baseUrl: s.baseUrl,
    model: s.model,
    mode: s.mode,
    defaults: AI_DEFAULTS,
    storageNote: AI_STORAGE_NOTE,
  };
}
