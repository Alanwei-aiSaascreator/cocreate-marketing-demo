import { z } from "zod";
import type { ComposedContent, Platform, PlatformFrame, RewardTier, TaskField } from "../types";

/**
 * 模型输出的**结构校验**契约。
 *
 * 注意这里的分工：zod 只负责「形状对不对、核心字段在不在」，
 * 校验通过后拿到的数据仍然是**宽松类型**（RawXxx），
 * 由 lib/ai/index.ts 里的 ensure* / 归一化函数转成严格的领域类型。
 *
 * 为什么不让 zod 直接产出严格类型：模型输出是不可信输入，
 * 给它标注严格类型本身就是一种撒谎 —— 严格化必须发生在显式的归一化步骤里。
 * 次要字段用 .catch() 兜默认值，只有核心部分（平台、标题、正文）缺失才判定失败并降级。
 */
const platformEnum = z.enum(["xiaohongshu", "douyin", "dianping", "moments"]);

export const platformFrameSchema = z.object({
  platform: platformEnum,
  angle: z.string().catch(""),
  mustInclude: z.array(z.string()).catch([]),
  avoid: z.array(z.string()).catch([]),
  structure: z.array(z.string()).catch([]),
  wordRange: z.tuple([z.number(), z.number()]).catch([150, 400] as [number, number]),
  suggestedTags: z.array(z.string()).catch([]),
  guidance: z.string().catch(""),
});

export const taskFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["text", "textarea", "choice", "image"]).catch("text"),
  placeholder: z.string().catch(""),
  why: z.string().catch(""),
  options: z.array(z.string()).optional().catch(undefined),
  required: z.boolean().catch(true),
  maxLength: z.number().optional().catch(undefined),
});

export const rewardTierSchema = z.object({
  threshold: z.number(),
  name: z.string(),
  type: z.enum(["coupon", "gift"]).catch("coupon"),
  title: z.string(),
  value: z.number().catch(0),
});

export const blueprintSchema = z.object({
  frames: z.array(platformFrameSchema).min(1),
  taskCard: z.array(taskFieldSchema).min(3),
  rewardTiers: z.array(rewardTierSchema).min(1),
});

export const composedContentSchema = z.object({
  platform: platformEnum,
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string()).catch([]),
  coverHint: z.string().catch(""),
  complianceNote: z.string().catch(""),
});

export const composeBundleSchema = z.object({
  contents: z.array(composedContentSchema).min(1),
});

// ── 校验通过后的宽松载荷类型（待归一化）──────────────────

export type RawPlatformFrame = Partial<PlatformFrame> & { platform: Platform };
export type RawTaskField = Partial<TaskField> & { id: string; label: string };
export type RawRewardTier = Partial<RewardTier> & {
  threshold: number;
  name: string;
  title: string;
};
export type RawComposedContent = Partial<ComposedContent> & {
  platform: Platform;
  title: string;
  body: string;
};

export type BlueprintPayload = {
  frames: RawPlatformFrame[];
  taskCard: RawTaskField[];
  rewardTiers: RawRewardTier[];
};

export type ComposeBundlePayload = {
  contents: RawComposedContent[];
};
