/**
 * 种子数据。
 *
 * 两个刻意的设计：
 * 1. 用**规则引擎**生成种子活动，不调模型 —— 让 `pnpm db:seed` 完全离线可复现，
 *    同时保证现场演示「新建活动」时走真模型，AI 效果是当场跑出来的。
 * 2. 故意埋进 4 种「坏样本」（重复图 / 含联系方式 / 写违禁词 / 没传图），
 *    让风控和贡献值规则在演示时是**看得见在工作**的，而不是嘴上说做了。
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { ruleBlueprint, ruleCompose } from "../lib/ai/rules";
import { detectRisks } from "../lib/domain/risk";
import { scoreSubmission, adoptPointItem, clickPointItem, CLICK_POINT, CLICK_CAP } from "../lib/domain/scoring";
import { tiersToGrant } from "../lib/domain/reward";
import { shareToken, viewerToken } from "../lib/ids";
import type { Platform, PlatformFrame, RewardTier, TaskField } from "../lib/types";

const prisma = new PrismaClient();
const UPLOAD_DIR = join(process.cwd(), "public", "uploads");

/**
 * 演示活动的固定入口短码。
 * 固定而非随机，这样反复重跑种子数据也不会让已经发出去的演示链接失效。
 */
export const DEMO_PUBLIC_TOKEN = "demo-cocreate";

// ── 占位实拍图 ────────────────────────────────────────────
// Demo 用程序生成的 SVG 占位图，避免把别人的照片放进仓库。
// 真实使用中这里就是老客自己上传的照片。

const PALETTES: [string, string][] = [
  ["#f97316", "#7c2d12"],
  ["#ef4444", "#7f1d1d"],
  ["#22c55e", "#14532d"],
  ["#3b82f6", "#1e3a8a"],
  ["#a855f7", "#4c1d95"],
  ["#eab308", "#713f12"],
  ["#14b8a6", "#134e4a"],
];

function makePlaceholder(index: number, emoji: string, caption: string): { url: string; hash: string } {
  const [from, to] = PALETTES[index % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="400" cy="330" r="150" fill="#ffffff" opacity="0.14"/>
  <text x="400" y="385" font-size="170" text-anchor="middle">${emoji}</text>
  <text x="400" y="560" font-size="42" font-family="system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" fill="#ffffff" text-anchor="middle" font-weight="600">${caption}</text>
  <text x="400" y="620" font-size="26" font-family="system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" fill="#ffffff" opacity="0.75" text-anchor="middle">老客实拍图（Demo 占位）</text>
</svg>`;
  const name = `seed-${index + 1}.svg`;
  writeFileSync(join(UPLOAD_DIR, name), svg, "utf8");
  return {
    url: `/uploads/${name}`,
    hash: createHash("sha256").update(svg).digest("hex").slice(0, 32),
  };
}

// ── 主流程 ────────────────────────────────────────────────

async function main() {
  console.log("清空旧数据…");
  await prisma.trackEvent.deleteMany();
  await prisma.reward.deleteMany();
  await prisma.contribution.deleteMany();
  await prisma.generatedContent.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.contributor.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.merchant.deleteMany();

  mkdirSync(UPLOAD_DIR, { recursive: true });

  // 1. 商家
  const merchant = await prisma.merchant.create({
    data: {
      name: "椒香里·重庆老火锅",
      category: "火锅",
      city: "成都",
      address: "成都市武侯区科华北路 12 号",
      avgPrice: 98,
      tones: JSON.stringify(["实在", "热闹", "不装"]),
      sellingPoints: JSON.stringify(["手工现炒牛油锅底", "凌晨四点到的鲜毛肚", "免费续杯的老荫茶"]),
      bannedWords: JSON.stringify(["最好吃", "第一", "纯天然", "治疗"]),
    },
  });
  console.log(`商家：${merchant.name}`);

  // 2. 活动（规则引擎生成，离线可复现）
  const merchantLike = {
    name: merchant.name,
    category: merchant.category,
    city: merchant.city,
    address: merchant.address,
    avgPrice: merchant.avgPrice,
    tones: JSON.parse(merchant.tones) as string[],
    sellingPoints: JSON.parse(merchant.sellingPoints) as string[],
    bannedWords: JSON.parse(merchant.bannedWords) as string[],
  };
  const campaignLike = {
    title: "老客共创 · 招牌菜口碑计划",
    objective: "到店打卡",
    platforms: ["xiaohongshu", "douyin", "dianping", "moments"] as Platform[],
    brief: "请老客用真实体验帮我们把招牌菜讲出去，重点铺小红书和大众点评。",
  };

  const blueprint = ruleBlueprint(merchantLike, campaignLike);
  const campaign = await prisma.campaign.create({
    data: {
      merchantId: merchant.id,
      title: campaignLike.title,
      objective: campaignLike.objective,
      platforms: JSON.stringify(campaignLike.platforms),
      brief: campaignLike.brief,
      frames: JSON.stringify(blueprint.frames),
      taskCard: JSON.stringify(blueprint.taskCard),
      rewardTiers: JSON.stringify(blueprint.rewardTiers),
      aiMode: "rule",
      aiNote: blueprint.note,
      // 固定 token，不用随机短码。
      // 原因：随机 token 意味着每次重跑种子都会让已发出去的演示链接失效，
      // 而"重置演示数据"是演示前的高频动作。固定下来，链接永远可用。
      publicToken: DEMO_PUBLIC_TOKEN,
      status: "active",
    },
  });
  console.log(`活动：${campaign.title}（H5 入口 /c/${campaign.publicToken}）`);

  const frames = blueprint.frames as PlatformFrame[];
  const taskCard = blueprint.taskCard as TaskField[];
  const rewardTiers = blueprint.rewardTiers as RewardTier[];
  // 实拍图不在 answers 里，和必填文字项分开传
  const requiredTextFields = taskCard
    .filter((f) => f.required && f.type !== "image")
    .map((f) => ({ id: f.id, label: f.label }));
  const imageRequired = !!taskCard.find((f) => f.type === "image")?.required;

  // 3. 老客
  const contributorSeeds = [
    { nickname: "小林爱吃辣", avatarEmoji: "🌶️", sourceChannel: "qr" },
    { nickname: "周末不加班", avatarEmoji: "🍲", sourceChannel: "link" },
    { nickname: "城西吃货日记", avatarEmoji: "🥢", sourceChannel: "qr" },
    { nickname: "阿 May", avatarEmoji: "✨", sourceChannel: "link" },
    { nickname: "老张的饭局", avatarEmoji: "🍻", sourceChannel: "qr" },
    { nickname: "一只牛奶猫", avatarEmoji: "🐱", sourceChannel: "link" },
  ];
  const contributors = [];
  for (const c of contributorSeeds) {
    contributors.push(
      await prisma.contributor.create({
        data: { ...c, viewerToken: viewerToken() },
      }),
    );
  }
  console.log(`老客：${contributors.length} 位`);

  // 4. 素材提交（含 4 种坏样本）
  const submissionSeeds: {
    contributor: number;
    answers: Record<string, string>;
    image: number | null;
    /** 复用前面的图片，制造「重复图」坏样本 */
    reuseImageOf?: number;
    adopted: boolean;
    clicks: number;
  }[] = [
    {
      contributor: 0,
      answers: {
        feeling: "锅底是真的香，牛油味很正，吃到后面也不发苦",
        recommend: "手工现炒牛油锅底",
        scene: "friends",
        detail: "服务员看我们辣得直喝水，主动送了两碗冰粉",
      },
      image: 0,
      adopted: true,
      clicks: 8,
    },
    {
      contributor: 1,
      answers: {
        feeling: "加班到九点过来，店里还很热闹，吃完感觉整个人活过来了",
        recommend: "鲜毛肚",
        scene: "colleagues",
        detail: "毛肚七上八下真的脆，比我在别家吃的都新鲜",
      },
      image: 1,
      adopted: true,
      clicks: 5,
    },
    {
      contributor: 2,
      answers: {
        feeling: "老荫茶免费续，这点很加分，解辣一绝",
        recommend: "老荫茶",
        scene: "family",
        detail: "我妈不爱喝饮料，就认这家的茶",
      },
      image: 2,
      adopted: true,
      clicks: 3,
    },
    {
      contributor: 3,
      answers: {
        feeling: "环境比想象中干净，桌子擦得很勤",
        recommend: "鲜毛肚",
        scene: "date",
        detail: "全程没有油烟味沾到衣服上，这点挺难得",
      },
      image: 3,
      adopted: false,
      clicks: 1,
    },
    {
      contributor: 4,
      answers: {
        feeling: "带朋友来吃的，三个成都人都说锅底巴适",
        recommend: "手工现炒牛油锅底",
        scene: "friends",
        detail: "老板过来问了一次口味，还给我们加了半份鸭血",
      },
      image: 4,
      adopted: false,
      clicks: 2,
    },
    // ── 坏样本 1：重复使用同一张图 ──
    {
      contributor: 5,
      answers: {
        feeling: "好吃，下次还来",
        recommend: "鲜毛肚",
        scene: "solo",
        detail: "",
      },
      image: null,
      reuseImageOf: 1,
      adopted: false,
      clicks: 0,
    },
    // ── 坏样本 2：含联系方式（会被 block） ──
    {
      contributor: 5,
      answers: {
        feeling: "味道不错，想约的可以加我微信 xiaomi1990 一起拼桌",
        recommend: "鸭血",
        scene: "friends",
        detail: "我经常组局，人多可以找我",
      },
      image: 5,
      adopted: false,
      clicks: 0,
    },
    // ── 坏样本 3：写了平台违禁词（warn，AI 加工时替换） ──
    {
      contributor: 0,
      answers: {
        feeling: "这家绝对是我在成都吃过最好吃的火锅，没有之一",
        recommend: "手工现炒牛油锅底",
        scene: "friends",
        detail: "带了三拨朋友来，都说好吃",
      },
      image: 6,
      adopted: false,
      clicks: 0,
    },
    // ── 坏样本 4：没传图 + 内容过短 ──
    {
      contributor: 1,
      answers: {
        feeling: "还行",
        recommend: "鲜毛肚",
        scene: "solo",
        detail: "",
      },
      image: null,
      adopted: false,
      clicks: 0,
    },
  ];

  const createdImages: { url: string; hash: string }[] = [];
  const imageHashesInCampaign: string[] = [];
  const answerTextsInCampaign: string[] = [];
  const submissionsForClickBonus: { id: string; contributorId: string; clicks: number }[] = [];
  let blockedCount = 0;
  let warnedCount = 0;

  console.log("\n写入素材提交并跑风控 / 贡献值 / 内容加工…");

  for (let i = 0; i < submissionSeeds.length; i++) {
    const seed = submissionSeeds[i];
    const contributor = contributors[seed.contributor];

    let image: { url: string; hash: string } | null = null;
    if (seed.reuseImageOf !== undefined) {
      image = createdImages[seed.reuseImageOf];
    } else if (seed.image !== null) {
      const emoji = ["🍲", "🥬", "🍵", "🥢", "🌶️", "🍺", "🐱"][seed.image % 7];
      const made = makePlaceholder(seed.image, emoji, seed.answers.recommend || "门店实拍");
      createdImages[seed.image] = made;
      image = made;
    }

    const priorCount = await prisma.submission.count({
      where: { campaignId: campaign.id, contributorId: contributor.id },
    });

    const riskFlags = detectRisks({
      answers: seed.answers,
      imageHash: image?.hash ?? null,
      existingImageHashes: imageHashesInCampaign,
      existingAnswerTexts: answerTextsInCampaign,
      priorSubmissions: priorCount,
      bannedWords: merchantLike.bannedWords,
    });

    const score = scoreSubmission({
      answers: seed.answers,
      imageUrl: image?.url ?? null,
      riskFlags,
      priorSubmissions: priorCount,
      requiredTextFields,
      imageRequired,
    });

    const blocked = riskFlags.some((f) => f.level === "block");
    if (blocked) blockedCount++;
    else if (riskFlags.length > 0) warnedCount++;

    const submission = await prisma.submission.create({
      data: {
        campaignId: campaign.id,
        contributorId: contributor.id,
        answers: JSON.stringify(seed.answers),
        imageUrl: image?.url ?? null,
        imageHash: image?.hash ?? null,
        status: blocked ? "rejected" : seed.adopted ? "adopted" : "processed",
        riskFlags: JSON.stringify(riskFlags),
        points: score.points,
      },
    });

    if (image) imageHashesInCampaign.push(image.hash);
    const joined = Object.values(seed.answers).filter(Boolean).join("|");
    if (joined) answerTextsInCampaign.push(joined);

    // 贡献记录（被拦下的不产生贡献）
    if (!blocked) {
      await prisma.contribution.create({
        data: {
          campaignId: campaign.id,
          contributorId: contributor.id,
          submissionId: submission.id,
          breakdown: JSON.stringify(score.breakdown),
          points: score.points,
          reason: score.reason,
        },
      });
    }

    // AI 内容加工：只有通过风控的素材才进内容库
    if (!blocked) {
      for (const frame of frames) {
        const composed = ruleCompose(
          merchantLike,
          campaignLike,
          { id: submission.id, answers: seed.answers },
          frame.platform,
        );
        const content = await prisma.generatedContent.create({
          data: {
            campaignId: campaign.id,
            submissionId: submission.id,
            platform: composed.platform,
            title: composed.title,
            body: composed.body,
            tags: JSON.stringify(composed.tags),
            coverHint: composed.coverHint,
            complianceNote: composed.complianceNote,
            aiMode: "rule",
            adopted: seed.adopted,
            adoptedAt: seed.adopted ? new Date() : null,
            shareToken: shareToken(),
            createdAt: new Date(Date.now() - (submissionSeeds.length - i) * 3600_000),
          },
        });

        await prisma.trackEvent.create({
          data: {
            type: "share",
            campaignId: campaign.id,
            submissionId: submission.id,
            contentId: content.id,
            meta: JSON.stringify({ platform: composed.platform }),
            createdAt: new Date(Date.now() - (submissionSeeds.length - i) * 1800_000),
          },
        });
      }

      // 被采用的内容追加分数
      if (seed.adopted) {
        const item = adoptPointItem();
        await prisma.contribution.create({
          data: {
            campaignId: campaign.id,
            contributorId: contributor.id,
            submissionId: submission.id,
            breakdown: JSON.stringify([item]),
            points: item.points,
            reason: item.label,
          },
        });
      }

      submissionsForClickBonus.push({ id: submission.id, contributorId: contributor.id, clicks: seed.clicks });
    }
  }

  // 5. 引流回流：点击事件 + 绑定效果的贡献值
  console.log("写入引流回流事件（奖励绑定真实效果的关键链路）…");
  for (const item of submissionsForClickBonus) {
    if (item.clicks <= 0) continue;
    const contents = await prisma.generatedContent.findMany({ where: { submissionId: item.id } });
    const perContent = Math.ceil(item.clicks / Math.max(1, contents.length));
    let remaining = item.clicks;

    for (const content of contents) {
      const n = Math.min(perContent, remaining);
      for (let k = 0; k < n; k++) {
        await prisma.trackEvent.create({
          data: {
            type: "click",
            campaignId: campaign.id,
            submissionId: item.id,
            contentId: content.id,
            meta: JSON.stringify({ platform: content.platform, referrer: "share" }),
            createdAt: new Date(Date.now() - Math.floor(Math.random() * 6) * 3600_000),
          },
        });
      }
      remaining -= n;
      if (remaining <= 0) break;
    }

    const points = Math.min(item.clicks * CLICK_POINT, CLICK_CAP);
    const pointItem = clickPointItem(item.clicks);
    await prisma.contribution.create({
      data: {
        campaignId: campaign.id,
        contributorId: item.contributorId,
        submissionId: item.id,
        breakdown: JSON.stringify([{ ...pointItem, points }]),
        points,
        reason: `内容带来 ${item.clicks} 次有效点击回流`,
      },
    });
  }

  // 6. 结算累计贡献值 + 发奖
  console.log("结算累计贡献值并发放店铺福利…");
  let rewardCount = 0;
  for (const contributor of contributors) {
    const agg = await prisma.contribution.aggregate({
      where: { contributorId: contributor.id, campaignId: campaign.id },
      _sum: { points: true },
    });
    const total = agg._sum.points ?? 0;

    await prisma.contributor.update({ where: { id: contributor.id }, data: { totalPoints: total } });

    const granted = await prisma.reward.findMany({
      where: { contributorId: contributor.id, campaignId: campaign.id },
      select: { tierName: true },
    });
    const toGrant = tiersToGrant(total, rewardTiers, granted.map((g) => g.tierName));

    for (const r of toGrant) {
      await prisma.reward.create({
        data: {
          campaignId: campaign.id,
          contributorId: contributor.id,
          tierName: r.tierName,
          type: r.type,
          title: r.title,
          value: r.value,
          code: r.code,
          status: "issued",
        },
      });
      rewardCount++;
    }
  }

  // 7. 汇总
  const totals = {
    contributors: contributors.length,
    submissions: await prisma.submission.count(),
    contents: await prisma.generatedContent.count(),
    contributions: await prisma.contribution.count(),
    rewards: rewardCount,
    clicks: await prisma.trackEvent.count({ where: { type: "click" } }),
    blocked: blockedCount,
    warned: warnedCount,
  };

  console.log(`
──────────────────────────────────────────────
种子数据完成
──────────────────────────────────────────────
  老客          ${totals.contributors}
  素材提交      ${totals.submissions}（其中被风控拦截 ${totals.blocked} 条、触发提醒 ${totals.warned} 条）
  AI 内容产出   ${totals.contents} 条（4 平台 × 有效素材）
  贡献记录      ${totals.contributions} 条
  已发福利      ${totals.rewards} 张
  引流点击回流  ${totals.clicks} 次

  商家后台      /merchant
  老客 H5 入口  /c/${campaign.publicToken}
──────────────────────────────────────────────
`);
}

main()
  .catch((e) => {
    console.error("种子数据失败：", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
