/**
 * 种子数据编排。
 *
 * 数据本身在 `seed-data.ts`（10 个活动 / 14 位老客 / 68 条素材），
 * 这里只负责把它们写进库，并让**真实的风控、计分、奖励规则**去决定结果。
 *
 * 三个刻意的设计：
 *
 * 1. **活动蓝图用规则引擎生成，不调模型**
 *    `pnpm db:seed` 因此完全离线可复现；同时保证现场演示「新建活动」时走真模型，
 *    AI 效果是当场跑出来的，而不是从种子里读出来的。
 *
 * 2. **结果全部是推导出来的，不是写死的**
 *    素材里留了微信号 → 由 `detectRisks` 判出 block；
 *    写了「最好吃」→ 由真实的禁词表命中；
 *    复用同一张图 → 由真实的 hash 查重命中；
 *    少传图/内容过短 → 由真实的计分规则扣分。
 *    数据只描述"发生了什么"，规则决定"算多少"。改规则，种子结果跟着变。
 *
 * 3. **时间的还原**
 *    活动创建时间按 launchedDaysAgo 倒推，素材按 hoursAfterLaunch 落在活动开始之后。
 *    于是夜班护士的宵夜落在凌晨、家庭局落在周末 —— 不是一堆同一秒的数据。
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { ruleBlueprint, ruleCompose } from "../lib/ai/rules";
import { detectRisks } from "../lib/domain/risk";
import {
  scoreSubmission,
  adoptPointItem,
  clickPointItem,
  CLICK_CAP,
  CLICK_POINT,
} from "../lib/domain/scoring";
import { tiersToGrant } from "../lib/domain/reward";
import { campaignToken, shareToken, viewerToken } from "../lib/ids";
import { DEMO_PUBLIC_TOKEN } from "../lib/demo";
import { MERCHANTS, PERSONAS, CAMPAIGNS, SUBMISSIONS } from "./seed-data";
import type { Platform, PlatformFrame, RewardTier, TaskField } from "../lib/types";

const prisma = new PrismaClient();
const UPLOAD_DIR = join(process.cwd(), "public", "uploads");
const HOUR = 3600_000;
const DAY = 24 * HOUR;

// ── 占位实拍图 ────────────────────────────────────────────
// Demo 用程序生成的 SVG，避免把别人的照片放进仓库。
// 真实使用中这里就是老客自己上传的照片。

const PALETTES: [string, string][] = [
  ["#f97316", "#7c2d12"],
  ["#ef4444", "#7f1d1d"],
  ["#22c55e", "#14532d"],
  ["#3b82f6", "#1e3a8a"],
  ["#a855f7", "#4c1d95"],
  ["#eab308", "#713f12"],
  ["#14b8a6", "#134e4a"],
  ["#ec4899", "#831843"],
];

/** 每个品类一组贴合场景的表情，占位图不至于全是同一个符号 */
const CATEGORY_EMOJI: Record<string, string[]> = {
  火锅: ["🍲", "🥬", "🌶️", "🥢", "🍺"],
  咖啡: ["☕", "🥐", "📖", "🪟", "🧊"],
  烤鱼: ["🐟", "🍚", "🥬", "🔥", "🍺"],
  日式居酒屋: ["🍢", "🍶", "🏮", "🔥", "🥢"],
  美甲: ["💅", "✨", "🎨", "🪞", "💖"],
  宠物友好餐厅: ["🐕", "🐈", "🌿", "🦴", "☀️"],
  健身房: ["🏋️", "💪", "🥇", "🚿", "⏰"],
  烘焙: ["🥐", "🍞", "🧈", "🎂", "🧺"],
  面馆: ["🍜", "🥢", "🌶️", "🏮", "🫖"],
  亲子娱乐: ["🏊", "🧸", "🛁", "👶", "☀️"],
};

function emojiFor(category: string, index: number): string {
  const pool = CATEGORY_EMOJI[category] ?? ["📷", "✨", "🌿", "☀️", "🍽️"];
  return pool[index % pool.length];
}

function makePlaceholder(
  index: number,
  emoji: string,
  caption: string,
  subCaption: string,
): { url: string; hash: string } {
  const [from, to] = PALETTES[index % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="400" cy="320" r="150" fill="#ffffff" opacity="0.14"/>
  <text x="400" y="375" font-size="170" text-anchor="middle">${emoji}</text>
  <text x="400" y="550" font-size="40" font-family="system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" fill="#ffffff" text-anchor="middle" font-weight="600">${caption}</text>
  <text x="400" y="606" font-size="24" font-family="system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" fill="#ffffff" opacity="0.72" text-anchor="middle">${subCaption}</text>
  <text x="400" y="700" font-size="20" font-family="system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" fill="#ffffff" opacity="0.5" text-anchor="middle">老客实拍图（Demo 占位）</text>
</svg>`;
  const name = `seed-${index}.svg`;
  writeFileSync(join(UPLOAD_DIR, name), svg, "utf8");
  return {
    url: `/uploads/${name}`,
    hash: createHash("sha256").update(svg).digest("hex").slice(0, 32),
  };
}

// ── 主流程 ────────────────────────────────────────────────

interface BuiltCampaign {
  id: string;
  createdAt: Date;
  frames: PlatformFrame[];
  taskCard: TaskField[];
  rewardTiers: RewardTier[];
  merchantLike: {
    name: string;
    category: string;
    city: string;
    address: string | null;
    avgPrice: number | null;
    tones: string[];
    sellingPoints: string[];
    bannedWords: string[];
  };
  campaignLike: { title: string; objective: string; platforms: Platform[]; brief: string };
}

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
  const now = Date.now();

  // 1. 商家
  const merchantIdByKey = new Map<string, string>();
  for (const m of MERCHANTS) {
    const row = await prisma.merchant.create({
      data: {
        name: m.name,
        category: m.category,
        city: m.city,
        address: m.address,
        avgPrice: m.avgPrice,
        tones: JSON.stringify(m.tones),
        sellingPoints: JSON.stringify(m.sellingPoints),
        bannedWords: JSON.stringify(m.bannedWords),
      },
    });
    merchantIdByKey.set(m.key, row.id);
  }
  console.log(`商家 ${MERCHANTS.length} 个`);

  // 2. 老客（跨活动复用同一批人，所以有累计贡献的概念）
  const personaIdByKey = new Map<string, string>();
  for (const p of PERSONAS) {
    const c = await prisma.contributor.create({
      data: {
        viewerToken: viewerToken(),
        nickname: p.nickname,
        avatarEmoji: p.avatarEmoji,
        sourceChannel: p.sourceChannel,
      },
    });
    personaIdByKey.set(p.key, c.id);
  }
  console.log(`老客 ${PERSONAS.length} 位`);

  // 3. 活动（蓝图用规则引擎，保证离线可复现）
  const built: BuiltCampaign[] = [];
  for (const def of CAMPAIGNS) {
    const merchantId = merchantIdByKey.get(def.merchantKey)!;
    const mDef = MERCHANTS.find((m) => m.key === def.merchantKey)!;

    const merchantLike = {
      name: mDef.name,
      category: mDef.category,
      city: mDef.city,
      address: mDef.address,
      avgPrice: mDef.avgPrice,
      tones: mDef.tones,
      sellingPoints: mDef.sellingPoints,
      bannedWords: mDef.bannedWords,
    };
    const campaignLike = {
      title: def.title,
      objective: def.objective,
      platforms: def.platforms as Platform[],
      brief: def.brief,
    };

    const blueprint = ruleBlueprint(merchantLike, campaignLike);
    const createdAt = new Date(now - def.launchedDaysAgo * DAY);

    const row = await prisma.campaign.create({
      data: {
        merchantId,
        title: def.title,
        objective: def.objective,
        platforms: JSON.stringify(def.platforms),
        brief: def.brief,
        frames: JSON.stringify(blueprint.frames),
        taskCard: JSON.stringify(blueprint.taskCard),
        rewardTiers: JSON.stringify(blueprint.rewardTiers),
        aiMode: "rule",
        aiNote: "种子数据刻意用规则引擎生成（保证离线可复现），非降级。",
        degraded: false,
        publicToken: def.isDemoEntry ? DEMO_PUBLIC_TOKEN : campaignToken(),
        status: def.status,
        createdAt,
        updatedAt: createdAt,
      },
    });

    built.push({
      id: row.id,
      createdAt,
      frames: blueprint.frames,
      taskCard: blueprint.taskCard,
      rewardTiers: blueprint.rewardTiers,
      merchantLike,
      campaignLike,
    });
  }
  const closedCount = CAMPAIGNS.filter((c) => c.status === "closed").length;
  console.log(`活动 ${CAMPAIGNS.length} 个（其中已结束 ${closedCount} 个）`);

  // 4. 素材提交 —— 风控 / 计分 / 内容加工全部走真实规则
  const images = new Map<number, { url: string; hash: string }>();
  const hashesByCampaign = new Map<string, string[]>();
  const textsByCampaign = new Map<string, string[]>();
  let imageSeq = 0;
  let blockedCount = 0;
  let warnedCount = 0;
  let contentCount = 0;
  let clickEventCount = 0;

  console.log("\n写入素材并跑真实的风控 / 计分 / 内容加工…");

  for (const s of SUBMISSIONS) {
    const c = built[s.campaign];
    const contributorId = personaIdByKey.get(s.persona)!;
    const answers = s.answers as Record<string, string>;

    // 图片：null = 没传；reuse:N = 复用第 N 张（制造重复图）；数字 = 新建
    let image: { url: string; hash: string } | null = null;
    if (typeof s.image === "string" && s.image.startsWith("reuse:")) {
      image = images.get(Number(s.image.slice(6))) ?? null;
    } else if (typeof s.image === "number") {
      imageSeq++;
      image = makePlaceholder(
        imageSeq,
        emojiFor(c.merchantLike.category, imageSeq),
        answers.recommend || c.merchantLike.category,
        `${c.merchantLike.name}｜老客实拍`,
      );
      images.set(s.image, image);
    }

    const createdAt = new Date(c.createdAt.getTime() + s.hoursAfterLaunch * HOUR);

    const priorCount = await prisma.submission.count({
      where: { campaignId: c.id, contributorId },
    });

    const hashes = hashesByCampaign.get(c.id) ?? [];
    const texts = textsByCampaign.get(c.id) ?? [];

    const requiredTextFields = c.taskCard
      .filter((f) => f.required && f.type !== "image")
      .map((f) => ({ id: f.id, label: f.label }));
    const imageRequired = !!c.taskCard.find((f) => f.type === "image")?.required;

    const riskFlags = detectRisks({
      answers,
      imageHash: image?.hash ?? null,
      existingImageHashes: hashes,
      existingAnswerTexts: texts,
      priorSubmissions: priorCount,
      bannedWords: c.merchantLike.bannedWords,
    });

    const score = scoreSubmission({
      answers,
      hasImage: !!image,
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
        campaignId: c.id,
        contributorId,
        answers: JSON.stringify(answers),
        imageUrl: image?.url ?? null,
        imageHash: image?.hash ?? null,
        status: blocked ? "rejected" : s.adopted ? "adopted" : "processed",
        riskFlags: JSON.stringify(riskFlags),
        points: score.points,
        createdAt,
        updatedAt: createdAt,
      },
    });

    if (image) hashes.push(image.hash);
    const joined = Object.values(answers).filter(Boolean).join("|");
    if (joined) texts.push(joined);
    hashesByCampaign.set(c.id, hashes);
    textsByCampaign.set(c.id, texts);

    if (!blocked) {
      await prisma.contribution.create({
        data: {
          campaignId: c.id,
          contributorId,
          submissionId: submission.id,
          breakdown: JSON.stringify(score.breakdown),
          points: score.points,
          reason: score.reason,
          createdAt,
        },
      });
    }

    // 内容加工：只有通过风控的素材才进内容库
    if (!blocked) {
      const contentIds: string[] = [];
      for (const frame of c.frames) {
        const composed = ruleCompose(
          c.merchantLike,
          c.campaignLike,
          { id: submission.id, answers },
          frame.platform,
        );
        const content = await prisma.generatedContent.create({
          data: {
            campaignId: c.id,
            submissionId: submission.id,
            platform: composed.platform,
            title: composed.title,
            body: composed.body,
            tags: JSON.stringify(composed.tags),
            coverHint: composed.coverHint,
            complianceNote: composed.complianceNote,
            aiMode: "rule",
            degraded: false,
            aiNote: "种子数据用规则引擎生成（离线可复现），非降级。",
            adopted: s.adopted,
            adoptedAt: s.adopted ? createdAt : null,
            shareToken: shareToken(),
            createdAt,
          },
        });
        contentIds.push(content.id);
        contentCount++;

        // 每条内容都发生过一次"分享出去"的动作
        await prisma.trackEvent.create({
          data: {
            type: "share",
            campaignId: c.id,
            submissionId: submission.id,
            contentId: content.id,
            viewerKey: `seed:share:${content.id}`,
            meta: JSON.stringify({ platform: composed.platform }),
            createdAt: new Date(createdAt.getTime() + 10 * 60_000),
          },
        });
      }

      // 被采用的内容追加分数（与运行时同一条规则）
      if (s.adopted) {
        const item = adoptPointItem();
        await prisma.contribution.create({
          data: {
            campaignId: c.id,
            contributorId,
            submissionId: submission.id,
            breakdown: JSON.stringify([item]),
            points: item.points,
            reason: item.label,
            createdAt: new Date(createdAt.getTime() + 2 * DAY),
          },
        });
      }

      // 引流回流：次数按真实分布给（大多数 0-3，少数爆款两位数）
      if (s.clicks > 0 && contentIds.length > 0) {
        for (let k = 0; k < s.clicks; k++) {
          await prisma.trackEvent.create({
            data: {
              type: "click",
              campaignId: c.id,
              submissionId: submission.id,
              contentId: contentIds[k % contentIds.length],
              // 每个访客一个唯一 key —— 唯一约束要求「同一内容 + 同一访客」只计一次
              viewerKey: `seed:click:${submission.id}:${k}`,
              meta: JSON.stringify({ platform: "share" }),
              createdAt: new Date(createdAt.getTime() + (k + 1) * 7 * HOUR),
            },
          });
          clickEventCount++;
        }

        const points = Math.min(s.clicks * CLICK_POINT, CLICK_CAP);
        const item = clickPointItem(s.clicks);
        await prisma.contribution.create({
          data: {
            campaignId: c.id,
            contributorId,
            submissionId: submission.id,
            breakdown: JSON.stringify([{ ...item, points }]),
            points,
            reason: `内容带来 ${s.clicks} 次有效点击回流`,
            createdAt: new Date(createdAt.getTime() + 3 * DAY),
          },
        });
      }
    }
  }

  console.log(`素材 ${SUBMISSIONS.length} 条（拦截 ${blockedCount}、提醒 ${warnedCount}）`);
  console.log(`内容 ${contentCount} 条 · 引流点击事件 ${clickEventCount} 次`);

  // 5. 发奖 —— 用运行时同一套 tiersToGrant
  let rewardCount = 0;
  for (const c of built) {
    for (const p of PERSONAS) {
      const contributorId = personaIdByKey.get(p.key)!;
      const agg = await prisma.contribution.aggregate({
        where: { contributorId, campaignId: c.id },
        _sum: { points: true },
      });
      const total = agg._sum.points ?? 0;
      if (total === 0) continue;

      const granted = await prisma.reward.findMany({
        where: { contributorId, campaignId: c.id },
        select: { tierName: true },
      });
      const toGrant = tiersToGrant(total, c.rewardTiers, granted.map((g) => g.tierName));

      for (const r of toGrant) {
        await prisma.reward.create({
          data: {
            campaignId: c.id,
            contributorId,
            tierName: r.tierName,
            type: r.type,
            title: r.title,
            value: r.value,
            code: r.code,
            status: "issued",
            issuedAt: new Date(c.createdAt.getTime() + 4 * DAY),
          },
        });
        rewardCount++;
      }
    }
  }

  // 6. 汇总
  const totals = {
    merchants: await prisma.merchant.count(),
    campaigns: await prisma.campaign.count(),
    contributors: await prisma.contributor.count(),
    submissions: await prisma.submission.count(),
    contents: await prisma.generatedContent.count(),
    contributions: await prisma.contribution.count(),
    shares: await prisma.trackEvent.count({ where: { type: "share" } }),
  };

  console.log(`
──────────────────────────────────────────────────
种子数据完成
──────────────────────────────────────────────────
  商家            ${totals.merchants}
  活动            ${totals.campaigns}（其中已结束 ${closedCount} 个）
  老客            ${totals.contributors}
  素材提交        ${totals.submissions}（拦截 ${blockedCount}、提醒 ${warnedCount}）
  AI 内容产出     ${totals.contents}
  贡献记录        ${totals.contributions}
  已发福利        ${rewardCount} 张
  分享事件        ${totals.shares}
  引流点击回流    ${clickEventCount}

  主演示活动      ${CAMPAIGNS[0].title}
  商家后台        /merchant
  老客 H5 入口    /c/${DEMO_PUBLIC_TOKEN}
──────────────────────────────────────────────────
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
