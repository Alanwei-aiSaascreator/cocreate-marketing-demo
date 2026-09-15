/**
 * 重建「你自己的演示活动」。
 *
 * 为什么需要它：`pnpm db:seed` 会清空所有表再重建种子数据 ——
 * 这是种子的正常行为，但也意味着**你手工建的活动、以及你在 H5 提交的记录都会没**。
 * 演示前重置数据是高频动作，所以给你一个可重复执行的脚本把它建回来。
 *
 * 与种子活动的区别（两个都留着有对比价值）：
 *   · 种子活动：用**规则引擎**生成，保证离线可复现
 *   · 这个脚本：走**真实大模型**，演示「商家自己建活动 → AI 现场生成框架」这条路
 *
 * 用法：
 *   pnpm demo:mine                     # 建一个默认标题的活动
 *   pnpm demo:mine "秋季新品共创"        # 自定义标题
 *   pnpm demo:mine --rule              # 强制走规则引擎（没配 key 或想快速跑）
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { generateBlueprint, llmConfig } from "../lib/ai";
import { campaignToken } from "../lib/ids";
import { DEMO_PUBLIC_TOKEN } from "../lib/demo";
import { parseJson } from "../lib/json";
import type { Platform } from "../lib/types";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const useRule = args.includes("--rule");
const titleArg = args.find((a) => !a.startsWith("--"));
const TITLE = titleArg || "老客共创 · 招牌口碑计划";

if (useRule) process.env.LLM_MODE = "rule";

async function main() {
  // 用种子数据里的商家。没有就先提示跑 db:seed。
  const merchant = await prisma.merchant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!merchant) {
    console.error("\n  找不到商家。请先执行：pnpm db:seed\n");
    process.exit(1);
  }

  const merchantLike = {
    name: merchant.name,
    category: merchant.category,
    city: merchant.city,
    address: merchant.address,
    avgPrice: merchant.avgPrice,
    tones: parseJson<string[]>(merchant.tones, []),
    sellingPoints: parseJson<string[]>(merchant.sellingPoints, []),
    bannedWords: parseJson<string[]>(merchant.bannedWords, []),
  };

  const objective = "口碑沉淀";
  const platforms: Platform[] = ["xiaohongshu", "douyin", "dianping", "moments"];

  console.log(`\n  店铺：${merchant.name}`);
  console.log(`  活动：${TITLE}`);
  console.log(`  方式：${useRule ? "规则引擎（--rule）" : `大模型（${llmConfig().model}）`}`);
  console.log("  正在生成平台框架 / 任务卡 / 奖励阶梯…");

  const started = Date.now();
  // 大模型失败会自动降级到规则引擎，所以这个脚本不会因为模型问题而失败
  const blueprint = await generateBlueprint(merchantLike, {
    title: TITLE,
    objective,
    platforms,
    brief: "请老客用真实体验帮我们把招牌讲出去，重点铺小红书和大众点评。",
  });

  const created = await prisma.campaign.create({
    data: {
      merchantId: merchant.id,
      title: TITLE,
      objective,
      platforms: JSON.stringify(platforms),
      brief: "请老客用真实体验帮我们把招牌讲出去，重点铺小红书和大众点评。",
      frames: JSON.stringify(blueprint.frames),
      taskCard: JSON.stringify(blueprint.taskCard),
      rewardTiers: JSON.stringify(blueprint.rewardTiers),
      aiMode: blueprint.aiMode,
      aiNote: blueprint.note,
      degraded: blueprint.degraded,
      // 随机 token：这是「你自己建的活动」，不受固定演示链接的约束
      publicToken: campaignToken(),
      status: "active",
    },
  });

  console.log(
    `\n  ✓ 已创建（${((Date.now() - started) / 1000).toFixed(1)}s，${blueprint.aiMode === "llm" ? "大模型" : "规则引擎"}${blueprint.degraded ? " · 降级" : ""}）`,
  );
  console.log(`    任务卡 ${blueprint.taskCard.length} 个字段 · 奖励 ${blueprint.rewardTiers.length} 档`);
  console.log(`    奖励阈值：${blueprint.rewardTiers.map((t) => t.threshold).join(" / ")}`);
  console.log(`\n  工作台：/merchant/campaigns/${created.id}`);
  console.log(`  老客 H5：/c/${created.publicToken}`);
  console.log(`\n  提示：固定演示入口始终是 /c/${DEMO_PUBLIC_TOKEN}，不受本脚本影响。\n`);
}

main()
  .catch((e) => {
    console.error("\n  失败：", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
