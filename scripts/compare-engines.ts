/**
 * 同一份老客素材，分别用「规则引擎」和「大模型」加工，并排对比。
 *
 * 用途：这是理解本项目 AI 层设计最直观的方式 ——
 * 两个引擎吃的是同一份输入、吐的是同一个结构，差别只在内容质量。
 *
 * 用法：npx tsx scripts/compare-engines.ts
 */
import "dotenv/config";

// 强制走大模型。这样如果模型有问题会直接报错暴露出来，
// 而不是悄悄降级到规则引擎、让人误以为看到的是大模型的产出。
process.env.LLM_MODE = "llm";

import { PrismaClient } from "@prisma/client";
import { ruleCompose } from "../lib/ai/rules";
import { composeContents } from "../lib/ai";
import { parseJson } from "../lib/json";
import { PLATFORM_META, type Platform, type PlatformFrame } from "../lib/types";

const prisma = new PrismaClient();

function sep(title: string) {
  console.log(`\n${"═".repeat(78)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(78));
}

async function main() {
  const campaign = await prisma.campaign.findFirst({
    where: { publicToken: "demo-cocreate" },
    include: { merchant: true },
  });
  if (!campaign) throw new Error("找不到演示活动，请先跑 pnpm db:seed");

  // 挑一条素材最丰富的提交（有图、有细节），对比才有意义
  const submission = await prisma.submission.findFirst({
    where: { campaignId: campaign.id, imageUrl: { not: null }, status: { not: "rejected" } },
    orderBy: { points: "desc" },
  });
  if (!submission) throw new Error("找不到可用的素材");

  const answers = parseJson<Record<string, string>>(submission.answers, {});
  const platforms = parseJson<Platform[]>(campaign.platforms, []);
  const frames = parseJson<PlatformFrame[]>(campaign.frames, []);

  const merchantLike = {
    name: campaign.merchant.name,
    category: campaign.merchant.category,
    city: campaign.merchant.city,
    address: campaign.merchant.address,
    avgPrice: campaign.merchant.avgPrice,
    tones: parseJson<string[]>(campaign.merchant.tones, []),
    sellingPoints: parseJson<string[]>(campaign.merchant.sellingPoints, []),
    bannedWords: parseJson<string[]>(campaign.merchant.bannedWords, []),
  };
  const campaignLike = {
    title: campaign.title,
    objective: campaign.objective,
    platforms,
    brief: campaign.brief,
  };

  console.log(`\n活动：${campaign.title}    店铺：${campaign.merchant.name}`);
  sep("两个引擎收到的【完全相同】的输入：老客提交的素材");
  console.log(`  图片来源：${submission.imageUrl}（老客实拍图）`);
  for (const [k, v] of Object.entries(answers)) {
    console.log(`  ${k.padEnd(12)} ${v}`);
  }
  console.log(`\n  商家卖点：${merchantLike.sellingPoints.join("、")}`);
  console.log(`  合规禁词：${merchantLike.bannedWords.join("、")}`);
  console.log(`  目标平台：${platforms.join("、")}`);

  sep("引擎 A：规则引擎（lib/ai/rules.ts）");
  console.log("  特点：模板 + 槽位填充，本地纯函数，0 网络调用，永远可用\n");
  for (const p of platforms) {
    const c = ruleCompose(merchantLike, campaignLike, { id: submission.id, answers }, p);
    console.log(`  ── ${PLATFORM_META[p].emoji} ${PLATFORM_META[p].name} ──`);
    console.log(`  【标题】${c.title}`);
    console.log(
      `  【正文】\n${c.body
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n")}`,
    );
    console.log(`  【标签】${c.tags.join(" ") || "（无）"}\n`);
  }

  sep("引擎 B：大模型（lib/ai/deepseek.ts → composeContents）");
  console.log(`  特点：理解语义，会组织语言，质量上限高，但依赖网络/额度/返回格式\n`);
  const started = Date.now();
  const res = await composeContents(
    merchantLike,
    campaignLike,
    { id: submission.id, answers },
    frames,
    "老客已提供一张实拍图。",
  );
  console.log(`  aiMode = ${res.aiMode}    耗时 ${Date.now() - started}ms`);
  console.log(`  aiNote = ${res.note}\n`);
  for (const c of res.contents) {
    console.log(`  ── ${PLATFORM_META[c.platform].emoji} ${PLATFORM_META[c.platform].name} ──`);
    console.log(`  【标题】${c.title}`);
    console.log(
      `  【正文】\n${c.body
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n")}`,
    );
    console.log(`  【标签】${c.tags.join(" ") || "（无）"}`);
    console.log(`  【封面】${c.coverHint}`);
    console.log(`  【合规】${c.complianceNote}\n`);
  }
}

main()
  .catch((e) => {
    console.error("\n失败：", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
