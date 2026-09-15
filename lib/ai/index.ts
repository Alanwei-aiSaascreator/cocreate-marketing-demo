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
import { BLUEPRINT_SYSTEM, COMPOSE_SYSTEM, blueprintUserPrompt, composeUserPrompt, platformSpecText } from "./prompts";
import { ruleBlueprint, ruleCompose, complianceCheck, type CampaignLike, type MerchantLike, type SubmissionLike } from "./rules";
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
  const notes = [`${cfg.model} 生成，耗时 ${res.ms}ms`];
  if (usedRuleForFrames) {
    notes.push(`模型只给出 ${rawFrames.kept.length}/${campaign.platforms.length} 个平台，其余用规则引擎补齐`);
  }
  if (dropped > 0) notes.push(`丢弃 ${dropped} 项不合法产出`);

  return {
    frames,
    taskCard,
    rewardTiers,
    aiMode: "llm",
    degraded: false,
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
 * 任务卡归一化。两条硬保证，不依赖模型的自觉：
 * 1. 必须包含一张实拍图 —— 这是整套玩法的可信度地基。
 * 2. 至少 3 个字段 —— 否则老客没什么可填的，AI 也没素材可加工。
 *    模型只吐出 1-2 个字段时，整张卡改用规则引擎版本，而不是硬凑一张残缺的卡。
 */
function ensureTaskCard(taskCard: RawTaskField[], merchant: MerchantLike): TaskField[] {
  const ruleCard = ruleBlueprint(merchant, { title: "", objective: "", platforms: [] }).taskCard;

  if (taskCard.length < 3) return ruleCard;

  const normalized: TaskField[] = taskCard.slice(0, 6).map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type ?? "text",
    placeholder: f.placeholder ?? "",
    why: f.why ?? "",
    options:
      f.type === "choice" && (!f.options || f.options.length === 0)
        ? ["friends", "family", "solo", "date", "colleagues"]
        : f.options,
    required: f.required ?? true,
    // 模型经常忘记给 maxLength。而这个字段是「逼出短而真表达」的关键，
    // 所以服务端补一个默认上限，不让产品意图依赖模型的自觉。
    maxLength:
      f.maxLength ?? (f.type === "textarea" ? 120 : f.type === "text" ? 40 : undefined),
  }));

  if (normalized.some((f) => f.type === "image")) return normalized;

  const imageField = ruleCard.find((f) => f.type === "image")!;
  return [...normalized, imageField];
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

export interface ComposeResult {
  contents: ComposedContent[];
  aiMode: AiMode;
  /** 同 BlueprintResult.degraded：只有「本该走模型却失败」才为 true */
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

  const byRule = (degraded: boolean, note?: string): ComposeResult => ({
    contents: targets.map((p) => ruleCompose(merchant, campaign, submission, p)),
    aiMode: "rule",
    degraded,
    note:
      note ??
      "未配置模型 key，按设计使用规则引擎基于老客素材拼装（非降级）。",
  });

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

  const contents = targets.map((p) => modelContents.get(p) ?? ruleCompose(merchant, campaign, submission, p));
  const filled = targets.length - modelContents.size;

  const notes = [`${cfg.model} 加工，耗时 ${res.ms}ms`];
  if (filled > 0) notes.push(`${filled} 个平台由规则引擎补齐`);
  if (raw.dropped > 0) notes.push(`丢弃 ${raw.dropped} 条不合法产出`);

  return { contents, aiMode: "llm", degraded: false, note: notes.join("；") };
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
