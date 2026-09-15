import { z } from "zod";
import { PLATFORMS } from "./types";

export const campaignCreateSchema = z.object({
  /** 不传则新建商家；传了则更新该商家的基础信息 */
  merchantId: z.string().optional(),
  merchant: z.object({
    name: z.string().min(1, "店铺名称必填").max(40),
    category: z.string().min(1, "品类必填").max(20),
    city: z.string().min(1, "城市必填").max(20),
    address: z.string().max(80).optional().default(""),
    avgPrice: z.number().int().min(0).max(100000).optional(),
    tones: z.array(z.string().max(10)).max(6).default([]),
    sellingPoints: z.array(z.string().max(30)).max(8).default([]),
    bannedWords: z.array(z.string().max(20)).max(20).default([]),
  }),
  campaign: z.object({
    title: z.string().min(1, "活动名称必填").max(50),
    objective: z.string().min(1).max(20),
    platforms: z
      .array(z.enum(PLATFORMS))
      .min(1, "至少选择一个平台")
      .max(4)
      // 去重：重复平台会让一次提交落库多条完全相同的内容，
      // 内容库的分母和 React 的 key 都会出错
      .refine((arr) => new Set(arr).size === arr.length, "平台不能重复选择"),
    brief: z.string().max(300).default(""),
  }),
});

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;

export const adoptSchema = z.object({
  adopted: z.boolean(),
});

/** 半自动发布：商家标记这条内容有没有真的发到平台上 */
export const publishSchema = z.object({
  published: z.boolean(),
});

export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "参数不合法";
  return `${issue.path.join(".") || "参数"}：${issue.message}`;
}
