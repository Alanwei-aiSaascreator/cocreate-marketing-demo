/**
 * AI 层统一入口。
 *
 * 对外只暴露两个函数，调用方不需要知道底层走的是真模型还是规则引擎：
 *   generateBlueprint() —— 商家建活动时，生成平台框架 + 任务卡 + 奖励阶梯
 *   composeContents()   —— 老客提交素材后，加工成各平台内容
 *
 * 降级不是「兜底到报错」，而是「兜底到另一个能用的产出」。
 * 无论走哪条路，返回结构完全一致，aiMode 字段如实告诉界面这次用的是哪个。
 */
import { PLATFORM_META, type AiMode, type ComposedContent, type Platform, type PlatformFrame, type RewardTier, type TaskField } from "../types";
import { llmConfig, llmJson } from "./deepseek";
import { ensureSettingsLoaded } from "../settings";
import { BLUEPRINT_SYSTEM, COMPOSE_SYSTEM, blueprintUserPrompt, composeUserPrompt, platformSpecText } from "./prompts";
import { ruleBlueprint, ruleCompose, complianceCheck, SCENE_OPTIONS, type CampaignLike, type MerchantLike, type SubmissionLike } from "./rules";
import { canonicalThresholds } from "../domain/scoring";
import { blueprintSchema, composeBundleSchema, composedContentSchema, platformFrameSchema, rewardTierSchema, taskFieldSchema } from "./schemas";
import type {
  BlueprintPayload,
  ComposeBundlePayload,
  RawComposedContent,
  RawPlatformFrame,
  RawRewardTier,
  RawTaskField,
} from "./schemas";

export type { MerchantLike, CampaignLike, SubmissionLike } from "./rules";
export { llmConfig } from "./deepseek";

/**
 * 逐条校验：坏一条只丢一条，不让一个字段吃掉整批产出。
 * 返回保留下来的元素，以及被丢弃的数量（用于如实汇报）。
 */
function parseEach<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, items: unknown[]) {
  const kept: T[] = [];
  let dropped = 0;
  for (const item of items) {
    const parsed = schema.safeParse(item);
    if (parsed.success && parsed.data !== undefined) kept.push(parsed.data);
    else dropped++;
  }
  return { kept, dropped };
}

/** 空标题兜底：优先用正文首行，再不行用平台名 */
function fallbackTitle(body: string, platform: Platform): string {
  const line = body
    .split("\n")
    .map((s) => s.trim())
    .find(Boolean);
  if (!line) return PLATFORM_META[platform].name;
  return line.length > 30 ? `${line.slice(0, 29)}…` : line;
}

/**
 * LLM_MODE=llm 是**严格模式**：不允许静默降级，失败必须抛出来。
 *
 * 这个分支原先不存在 —— `.env.example` 和 `scripts/compare-engines.ts` 都写着
 * 「llm = 强制走模型（失败即报错）」，但代码里 llm 与 auto 的唯一区别只是 enabled，
 * 失败照样安静地退回模板。于是 compare-engines 会打印一大段看似正常的模板内容
 * 并正常退出，恰好制造了它声称要避免的「误以为看到的是大模型产出」。
 *
 * 注释承诺的事必须在代码里真的做到，否则就是撒谎注释。
 */
function assertStrictMode(cfg: { mode: string }, err: string): void {
  if (cfg.mode === "llm") {
    throw new Error(`LLM_MODE=llm（严格模式）要求必须走大模型，但本次失败：${err}`);
  }
}

// ── 1. 活动蓝图 ──────────────────────────────────────────

export interface BlueprintResult {
  frames: PlatformFrame[];
  taskCard: TaskField[];
  rewardTiers: RewardTier[];
  aiMode: AiMode;
  /**
   * 是否真的发生了「降级」。
   *
   * 只有一种情况是 true：**本该走模型（已配置 key）却因为失败退回规则引擎**。
   * 「没配 key」和「种子数据刻意用规则引擎」都**不算降级** ——
   * 不区分这两者，后台的 llm/rule 比例就会骗人：演示数据会显示 100% 规则引擎，
   * 看着像全线故障，其实一切正常。
   */
  degraded: boolean;
  note: string;
}

export async function generateBlueprint(
  merchant: MerchantLike,
  campaign: CampaignLike,
): Promise<BlueprintResult> {
  // 先加载「界面设置」再读配置 —— 否则用户在浏览器里刚填的 key 不会被用上
  await ensureSettingsLoaded();
  const cfg = llmConfig();
  const fallback = (degraded: boolean, note?: string): BlueprintResult => {
    const r = ruleBlueprint(merchant, campaign);
    return {
      frames: r.frames,
      taskCard: r.taskCard,
      rewardTiers: r.rewardTiers,
      aiMode: "rule",
      degraded,
      note: note ?? r.note,
    };
  };

  if (!cfg.enabled) return fallback(false);

  const res = await llmJson<BlueprintPayload>({
    system: BLUEPRINT_SYSTEM,
    user: blueprintUserPrompt({ merchant, campaign, platformSpec: platformSpecText() }),
    schema: blueprintSchema,
    temperature: 0.85,
    maxTokens: 3200,
    timeoutMs: 90_000,
  });

  if (!res.ok) {
    assertStrictMode(cfg, res.error);
    return fallback(true, `模型调用失败，已自动降级到规则引擎。原因：${res.error}`);
  }

  // 逐条校验：坏一条丢一条，再由 ensure* 用规则引擎补齐，而不是整批判失败
  const rawFrames = parseEach<RawPlatformFrame>(platformFrameSchema, res.data.frames);
  const rawTaskCard = parseEach<RawTaskField>(taskFieldSchema, res.data.taskCard);
  const rawTiers = parseEach<RawRewardTier>(rewardTierSchema, res.data.rewardTiers);

  const dropped = rawFrames.dropped + rawTaskCard.dropped + rawTiers.dropped;

  // 模型一条都没给出可用的，就如实标成规则引擎 + 降级，不假装是 AI 产出的
  if (rawFrames.kept.length === 0 && rawTaskCard.kept.length === 0 && rawTiers.kept.length === 0) {
    return fallback(true, `模型产出全部不合法（丢弃 ${dropped} 项），已降级到规则引擎。`);
  }

  const frames = ensureFrames(rawFrames.kept, merchant, campaign);
  const taskCard = ensureTaskCard(rawTaskCard.kept, merchant);
  const rewardTiers = ensureRewardTiers(rawTiers.kept, merchant);

  const usedRuleForFrames = frames.length > rawFrames.kept.length;
  // 任务卡不足 3 个有效字段时会被整张替换成规则版本；奖励阶梯不足 3 档同理。
  // 这两种都是「模型没给全，规则顶上」，属于部分降级，不能算成一次干净的成功。
  const taskCardReplaced = rawTaskCard.kept.length < 3;
  const tiersReplaced = rawTiers.kept.length < 3;

  const notes = [`${cfg.model} 生成，耗时 ${res.ms}ms`];
  if (usedRuleForFrames) {
    notes.push(`模型只给出 ${rawFrames.kept.length}/${campaign.platforms.length} 个平台，其余由规则引擎补齐`);
  }
  if (taskCardReplaced) notes.push("任务卡有效字段不足，整张改用规则引擎版本");
  if (tiersReplaced) notes.push("奖励阶梯有效档位不足，改用规则引擎版本");
  if (dropped > 0) notes.push(`丢弃 ${dropped} 项不合法产出`);

  return {
    frames,
    taskCard,
    rewardTiers,
    aiMode: "llm",
    // 任何一处靠规则顶上，都算部分降级 —— 部分降级也是降级
    degraded: usedRuleForFrames || taskCardReplaced || tiersReplaced || dropped > 0,
    note: notes.join("；"),
  };
}

/** 保证「该有的平台一个都不少」：模型漏掉的用规则引擎补 */
function ensureFrames(
  frames: RawPlatformFrame[],
  merchant: MerchantLike,
  campaign: CampaignLike,
): PlatformFrame[] {
  const ruleFrames = ruleBlueprint(merchant, campaign).frames;
  const byPlatform = new Map<Platform, RawPlatformFrame>();
  for (const f of frames) byPlatform.set(f.platform, f);

  return campaign.platforms.map((p) => {
    const fromModel = byPlatform.get(p);
    const meta = PLATFORM_META[p];
    if (!fromModel) {
      return ruleFrames.find((f) => f.platform === p) ?? ruleFrames[0];
    }
    return {
      platform: p,
      angle: fromModel.angle || `围绕「${campaign.objective}」突出真实到店体验`,
      mustInclude: fromModel.mustInclude?.length
        ? fromModel.mustInclude
        : [`店名「${merchant.name}」`],
      avoid: dedupe([...(fromModel.avoid ?? []), ...merchant.bannedWords]),
      structure: fromModel.structure?.length ? fromModel.structure : meta.structure,
      wordRange:
        fromModel.wordRange?.length === 2 ? fromModel.wordRange : meta.length,
      suggestedTags: (fromModel.suggestedTags ?? []).map(normalizeTag).filter(Boolean),
      guidance: fromModel.guidance || `照着说就行：${meta.tone}。`,
    };
  });
}

/**
 * 语义字段的固定 id。
 *
 * 系统按这些 id 计分和取文案：`answers.detail` 才给「具体细节 +5」，
 * `answers.feeling` 才进风控的灌水检测，规则引擎也按这几个 id 拼正文。
 * 但任务卡是模型生成的 —— 它把 feeling 写成 experience，那一档加分就会**静默失效**，
 * H5 还会直接显示英文 id。所以必须把模型的命名归一化回来。
 */
const CANONICAL_FIELDS: { id: string; type: TaskField["type"]; synonyms: string[] }[] = [
  {
    id: "feeling",
    type: "textarea",
    synonyms: ["feeling", "feel", "impression", "experience", "thought", "感受", "印象", "体验"],
  },
  {
    id: "recommend",
    type: "text",
    synonyms: ["recommend", "recommendation", "dish", "item", "food", "推荐", "招牌", "必点"],
  },
  {
    id: "scene",
    type: "choice",
    synonyms: ["scene", "occasion", "context", "situation", "场景", "场合"],
  },
  {
    id: "detail",
    type: "text",
    synonyms: ["detail", "details", "story", "moment", "memory", "细节", "故事"],
  },
  {
    id: "image",
    type: "image",
    synonyms: ["image", "photo", "picture", "img", "pic", "图片", "照片", "实拍图"],
  },
];

function canonicalFieldId(rawId: string, type: TaskField["type"]): string {
  const key = (rawId || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  for (const f of CANONICAL_FIELDS) {
    if (f.id === key || f.synonyms.includes(key)) return f.id;
  }
  // 类型比名字可靠：模型可能把它叫 photo_upload
  if (type === "image") return "image";
  return rawId;
}

/**
 * 任务卡归一化。三条硬保证，都不依赖模型的自觉：
 * 1. 语义 id 必须齐（feeling / recommend / scene / detail / image）—— 缺一个就有加分静默失效。
 * 2. 必须包含实拍图字段 —— 这是整套玩法的可信度地基。
 * 3. 至少 3 个字段 —— 否则老客没什么可填，AI 也没素材可加工；不足时整张卡用规则引擎版本。
 */
function ensureTaskCard(taskCard: RawTaskField[], merchant: MerchantLike): TaskField[] {
  const ruleCard = ruleBlueprint(merchant, { title: "", objective: "", platforms: [] }).taskCard;

  if (taskCard.length < 3) return ruleCard;

  const byCanonical = new Map<string, TaskField>();
  const extras: TaskField[] = [];

  for (const f of taskCard.slice(0, 6)) {
    const type = f.type ?? "text";
    const id = canonicalFieldId(f.id, type);
    const field: TaskField = {
      id,
      label: f.label,
      type,
      placeholder: f.placeholder ?? "",
      why: f.why ?? "",
      // 选项一律用系统内置的中文场景项：模型给的英文 key 前端映射不到，
      // 还会被规则引擎原样拼进正文（「with_friends 过来的。」）
      options: type === "choice" ? [...SCENE_OPTIONS] : undefined,
      required: f.required ?? true,
      // 模型经常忘记给 maxLength，而它是「逼出短而真表达」的关键，服务端补默认值
      maxLength: f.maxLength ?? (type === "textarea" ? 120 : type === "text" ? 40 : undefined),
    };

    const isCanonical = CANONICAL_FIELDS.some((c) => c.id === id);
    if (!isCanonical) {
      extras.push(field);
    } else if (!byCanonical.has(id)) {
      byCanonical.set(id, field);
    }
  }

  // 先保证语义字段齐（缺的用规则引擎版本补），再考虑模型给的额外自定义字段
  const result: TaskField[] = [];
  for (const need of CANONICAL_FIELDS) {
    const fromModel = byCanonical.get(need.id);
    const fallback = ruleCard.find((r) => r.id === need.id);
    const field = fromModel ?? fallback;
    if (field) result.push(field);
  }
  for (const extra of extras) {
    if (result.length >= 6) break;
    result.push(extra);
  }

  // 兜底：无论如何都要有实拍图字段
  if (!result.some((f) => f.type === "image")) {
    const imageField = ruleCard.find((f) => f.type === "image");
    if (imageField) result.push(imageField);
  }

  return result;
}

function ensureRewardTiers(tiers: RawRewardTier[], merchant: MerchantLike): RewardTier[] {
  const shape = [...tiers]
    .sort((a, b) => a.threshold - b.threshold)
    .slice(0, 4)
    .map((t) => ({
      name: t.name,
      title: t.title,
      // 奖励只用店铺福利，杜绝现金 —— 现金会把共创变成廉价刷稿
      type: t.type === "gift" ? ("gift" as const) : ("coupon" as const),
      value: Number.isFinite(t.value) && (t.value ?? 0) > 0 ? Math.round(t.value!) : 1000,
    }));

  if (shape.length < 3) {
    return ruleBlueprint(merchant, { title: "", objective: "", platforms: [] }).rewardTiers;
  }

  // 档位名和福利内容用模型写的（这是它擅长的），
  // 阈值强制映射到系统既定阶梯（这是确定性的经济规则，不能让模型自由发挥）
  const ladder = canonicalThresholds(shape.length);
  return shape.map((t, i) => ({ ...t, threshold: ladder[i] }));
}

// ── 2. 素材加工 ──────────────────────────────────────────

/**
 * 单条内容的产出，**带上它自己的来源**。
 *
 * 为什么必须逐条标：模型可能只给出 4 个平台里的 3 个，第 4 个由规则引擎补齐。
 * 早先这种情况整批标成 `aiMode: "llm"` —— 那条模板内容在数据库里就被标成了
 * 大模型产出，标签在撒谎，面板也因此看不见"部分降级"。
 */
export interface ComposedItem extends ComposedContent {
  /** 这一条的真实来源：llm = 模型写的，rule = 规则引擎拼的 */
  source: AiMode;
  /** 这一条是否为兜底产出（模型本该给却没给）。未配 key / 种子数据时为 false */
  fallback: boolean;
}

export interface ComposeResult {
  contents: ComposedItem[];
  /** 整批的主来源 */
  aiMode: AiMode;
  /** 是否存在任何兜底产出（含「部分平台补齐」这种情况） */
  degraded: boolean;
  note: string;
}

export async function composeContents(
  merchant: MerchantLike,
  campaign: CampaignLike,
  submission: SubmissionLike,
  frames: PlatformFrame[],
  imageNote: string,
): Promise<ComposeResult> {
  const targets: Platform[] = campaign.platforms.length
    ? campaign.platforms
    : frames.map((f) => f.platform);

  /** 整批走规则引擎。degraded 决定这些行是不是「兜底」 */
  const byRule = (degraded: boolean, note?: string): ComposeResult => ({
    contents: targets.map((p) => ({
      ...ruleCompose(merchant, campaign, submission, p),
      source: "rule" as AiMode,
      fallback: degraded,
    })),
    aiMode: "rule",
    degraded,
    note:
      note ??
      "未配置模型 key，按设计使用规则引擎基于老客素材拼装（非降级）。",
  });

  // 同理：先加载界面设置，再判断该走模型还是规则引擎
  await ensureSettingsLoaded();
  const cfg = llmConfig();
  if (!cfg.enabled) return byRule(false);

  const res = await llmJson<ComposeBundlePayload>({
    system: COMPOSE_SYSTEM,
    user: composeUserPrompt({
      merchant,
      campaign,
      frames: frames.map((f) => ({
        platform: f.platform,
        angle: f.angle,
        mustInclude: f.mustInclude,
        avoid: f.avoid,
        structure: f.structure,
        wordRange: f.wordRange,
        suggestedTags: f.suggestedTags,
      })),
      submission: { answers: submission.answers, imageNote },
      platformSpec: platformSpecText(),
    }),
    schema: composeBundleSchema,
    temperature: 0.9,
    maxTokens: 3000,
    timeoutMs: 90_000,
  });

  if (!res.ok) {
    assertStrictMode(cfg, res.error);
    return byRule(true, `模型调用失败，已自动降级到规则引擎。原因：${res.error}`);
  }

  // 逐条校验：某一条内容的字段有问题，只放弃那一个平台并由规则引擎补齐，
  // 而不是让一次小瑕疵吃掉全部 AI 产出（实测踩过：一个空 title 干掉 4 个平台）
  const raw = parseEach<RawComposedContent>(composedContentSchema, res.data.contents);

  const modelContents = new Map<Platform, ComposedContent>();
  for (const c of raw.kept) {
    modelContents.set(c.platform, {
      platform: c.platform,
      // 朋友圈这类平台没有标题，模型留空是合理的，这里补兜底值而不是判它失败
      title: (c.title ?? "").trim() || fallbackTitle(c.body, c.platform),
      body: c.body,
      tags: (c.tags ?? []).map(normalizeTag).filter(Boolean),
      coverHint: c.coverHint ?? "",
      // 合规自检不信任模型的自述，服务端重新扫一遍禁词
      complianceNote:
        serverCompliance([c.title, c.body].join("\n"), merchant.bannedWords) ||
        c.complianceNote ||
        "无",
    });
  }

  // 模型一条可用的都没给出，就如实标成规则引擎 + 降级
  if (modelContents.size === 0) {
    return byRule(true, `模型产出全部不合法（丢弃 ${raw.dropped} 条），已降级到规则引擎。`);
  }

  // 逐条标来源：模型给了就是 llm，模型没给的那个平台由规则引擎补，并标记为兜底
  const contents: ComposedItem[] = targets.map((p) => {
    const fromModel = modelContents.get(p);
    if (fromModel) {
      return { ...fromModel, source: "llm" as AiMode, fallback: false };
    }
    return {
      ...ruleCompose(merchant, campaign, submission, p),
      source: "rule" as AiMode,
      fallback: true,
    };
  });

  const filled = contents.filter((c) => c.fallback).length;
  const notes = [`${cfg.model} 加工，耗时 ${res.ms}ms`];
  if (filled > 0) {
    notes.push(`模型只给出 ${targets.length - filled}/${targets.length} 个平台，其余由规则引擎补齐（部分降级）`);
  }
  if (raw.dropped > 0) notes.push(`丢弃 ${raw.dropped} 条不合法产出`);

  return {
    contents,
    aiMode: "llm",
    // 只要有任何一条是兜底产出就算降级 —— 部分降级也是降级，不能藏
    degraded: filled > 0,
    note: notes.join("；"),
  };
}

/** 服务端合规自检：不信任模型的自我声明 */
function serverCompliance(text: string, bannedWords: string[]): string {
  const hit = complianceCheck(text, bannedWords);
  return hit ? hit.replace("⚠️ 命中商家禁词：", "⚠️ 合规自检命中禁词：") : "";
}

// ── 小工具 ───────────────────────────────────────────────

function normalizeTag(tag: string): string {
  const t = (tag || "").trim().replace(/^#+/, "");
  return t ? `#${t}` : "";
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}
