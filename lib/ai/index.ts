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
import { blueprintSchema, composeBundleSchema } from "./schemas";
import type {
  BlueprintPayload,
  ComposeBundlePayload,
  RawPlatformFrame,
  RawRewardTier,
  RawTaskField,
} from "./schemas";

export type { MerchantLike, CampaignLike, SubmissionLike } from "./rules";
export { llmConfig } from "./deepseek";

// ── 1. 活动蓝图 ──────────────────────────────────────────

export interface BlueprintResult {
  frames: PlatformFrame[];
  taskCard: TaskField[];
  rewardTiers: RewardTier[];
  aiMode: AiMode;
  note: string;
}

export async function generateBlueprint(
  merchant: MerchantLike,
  campaign: CampaignLike,
): Promise<BlueprintResult> {
  const cfg = llmConfig();
  const fallback = () => {
    const r = ruleBlueprint(merchant, campaign);
    return { frames: r.frames, taskCard: r.taskCard, rewardTiers: r.rewardTiers, aiMode: "rule" as AiMode, note: r.note };
  };

  if (!cfg.enabled) return fallback();

  const res = await llmJson<BlueprintPayload>({
    system: BLUEPRINT_SYSTEM,
    user: blueprintUserPrompt({ merchant, campaign, platformSpec: platformSpecText() }),
    schema: blueprintSchema,
    temperature: 0.85,
    maxTokens: 3200,
    timeoutMs: 90_000,
  });

  if (!res.ok) {
    const r = fallback();
    return { ...r, note: `模型调用失败，已自动降级到规则引擎。原因：${res.error}` };
  }

  // 模型可能漏平台 / 漏图片字段，这里补齐，保证下游流程不依赖模型的完美发挥
  const frames = ensureFrames(res.data.frames, merchant, campaign);
  const taskCard = ensureTaskCard(res.data.taskCard, merchant);
  const rewardTiers = ensureRewardTiers(res.data.rewardTiers, merchant);

  return {
    frames,
    taskCard,
    rewardTiers,
    aiMode: "llm",
    note: `${cfg.model} 生成，耗时 ${res.ms}ms${frames.length > res.data.frames.length ? "；模型漏了部分平台，已用规则引擎补齐" : ""}`,
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

/** 任务卡必须包含一张实拍图 —— 这是整套玩法的可信度地基，模型漏了就补上 */
function ensureTaskCard(taskCard: RawTaskField[], merchant: MerchantLike): TaskField[] {
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

  const ruleCard = ruleBlueprint(merchant, { title: "", objective: "", platforms: [] }).taskCard;
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

  const byRule = (): ComposeResult => ({
    contents: targets.map((p) => ruleCompose(merchant, campaign, submission, p)),
    aiMode: "rule",
    note: "未配置模型或调用失败，已用规则引擎基于老客素材拼装。",
  });

  const cfg = llmConfig();
  if (!cfg.enabled) return byRule();

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
    return { ...byRule(), note: `模型调用失败，已自动降级到规则引擎。原因：${res.error}` };
  }

  // 同样补齐：模型漏了哪个平台，就用规则引擎补哪个平台
  const modelContents = new Map<Platform, ComposedContent>();
  for (const c of res.data.contents) {
    modelContents.set(c.platform, {
      platform: c.platform,
      title: c.title,
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

  const contents = targets.map((p) => modelContents.get(p) ?? ruleCompose(merchant, campaign, submission, p));
  const filled = targets.length - modelContents.size;

  return {
    contents,
    aiMode: "llm",
    note: `${cfg.model} 加工，耗时 ${res.ms}ms${filled > 0 ? `；模型漏了 ${filled} 个平台，已用规则引擎补齐` : ""}`,
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
