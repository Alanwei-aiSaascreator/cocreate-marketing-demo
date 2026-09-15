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

export const composedContentSchema = z.object({
  platform: platformEnum,
  // 朋友圈这类平台本来就没有标题，模型留空是合理的，绝不能因此判整批失败。
  // 空标题由归一化步骤补兜底值。实测踩过：一个空 title 让 4 个平台全部退回模板。
  title: z.string().catch(""),
  body: z.string().min(1),
  tags: z.array(z.string()).catch([]),
  coverHint: z.string().catch(""),
  complianceNote: z.string().catch(""),
});

/**
 * 两个 bundle 都是**逐条校验的容器**，不是整批校验的契约。
 *
 * 早先写的是 `z.array(composedContentSchema).min(1)`，结果模型只要有一条内容的
 * 某个字段不合规，整批产出就被判失败、四个平台全部降级到模板 —— 一次小瑕疵
 * 吃掉全部 AI 产出。现在容器只校验「是个数组」，每条由调用方逐条 safeParse：
 * 坏一条只放弃那一条，并由规则引擎单独补齐。
 */
export const blueprintSchema = z.object({
  frames: z.array(z.unknown()).catch([]),
  taskCard: z.array(z.unknown()).catch([]),
  rewardTiers: z.array(z.unknown()).catch([]),
});

export const composeBundleSchema = z.object({
  contents: z.array(z.unknown()).min(1),
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
  /** 未逐条校验的原始元素，由调用方 safeParse 后再归一化 */
  frames: unknown[];
  taskCard: unknown[];
  rewardTiers: unknown[];
};

export type ComposeBundlePayload = {
  contents: unknown[];
};
