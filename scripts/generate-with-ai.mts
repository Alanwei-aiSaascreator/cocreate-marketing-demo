/**
 * 用**真实大模型**把种子里预生成的规则引擎内容重跑一遍。
 *
 * ── 为什么需要这个脚本 ──
 * `pnpm db:seed` 刻意用规则引擎生成内容，好处是离线可复现、不花额度、几秒跑完。
 * 但代价是：AI 质量面板会显示「大模型 0% / 规则引擎 100%」——
 * 而那恰恰是演示时最该展示的地方。这份数据是给人看的，两者冲突。
 *
 * 所以拆开：
 *   `pnpm db:seed`   → 离线、可复现、零成本，用于开发和测试
 *   `pnpm demo:ai`   → 走真实大模型重跑内容，用于演示
 *
 * 脚本**原地更新** GeneratedContent，不删除重建 —— 因为 TrackEvent 通过 contentId
 * 关联点击回流，删了会把归因数据一起打散。这样 shareToken 和点击记录都保留。
 *
 * ── 用法 ──
 *   pnpm demo:ai                     处理全部素材（约 65 次模型调用，1-2 分钟）
 *   pnpm demo:ai --limit 20          只处理前 20 条素材（试水 / 省额度）
 *   pnpm demo:ai --campaign 0        只处理第 1 个活动
 *   pnpm demo:ai --concurrency 5     并发数（默认 3，调高容易撞限流）
 *   pnpm demo:ai --no-blueprints     跳过活动框架重建（默认会重建，见下）
 *
 * ── 关于活动框架重建与奖励重新结算 ──
 * 重建活动框架会换掉奖励阶梯的档位名，而已发出的 Reward 里存的是旧档位名。
 * 如果只是覆盖框架不管账本，`tiersToGrant` 会因为"档位名没见过"而**再发一轮券**。
 * 所以脚本在重建框架后会**按新阶梯重新结算该活动的福利**：
 * 先清掉该活动的 Reward，再按每位老客的累计贡献值重新发放。
 * 这样账本始终和当前阶梯一致。（Demo 数据里的券都是未核销状态，重发不影响任何人。）
 *
 * 需要保留原账本时用 `--no-blueprints` 跳过框架重建。
 */
import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { composeContents, generateBlueprint, llmConfig } from "../lib/ai";
import { parseJson } from "../lib/json";
import { tiersToGrant } from "../lib/domain/reward";
import type { Platform, PlatformFrame, RewardTier, TaskField } from "../lib/types";

const prisma = new PrismaClient();

// ── 参数 ──────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name: string): boolean {
  return argv.includes(`--${name}`);
}
function num(name: string, fallback: number): number {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) {
    const idx = argv.indexOf(`--${name}`);
    if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith("--")) {
      const v = Number(argv[idx + 1]);
      return Number.isFinite(v) ? v : fallback;
    }
    return fallback;
  }
  const v = Number(hit.split("=")[1]);
  return Number.isFinite(v) ? v : fallback;
}

const LIMIT = num("limit", Infinity);
const CONCURRENCY = Math.max(1, Math.min(8, num("concurrency", 3)));
const ONLY_CAMPAIGN = argv.includes("--campaign") ? num("campaign", -1) : -1;
const DO_BLUEPRINTS = !flag("no-blueprints");
const MAX_RETRY = num("retry", 2);

// ── 小工具 ────────────────────────────────────────────────

const started = Date.now();
function elapsed(): string {
  const s = Math.round((Date.now() - started) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

/** 极简并发池：LLM 调用是 IO 密集，串行跑 184 次要二十多分钟 */
async function pool<T, R>(items: T[], size: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}

interface JobResult {
  submissionId: string;
  ok: boolean;
  aiMode: "llm" | "rule";
  degraded: boolean;
  updated: number;
  note: string;
}

/**
 * 按当前阶梯重新结算一个活动的全部福利。
 *
 * 为什么必须做：重建框架会换掉档位名，而 Reward 里存的是旧名字。
 * 不重算的话，旧名字的券变成孤儿、新名字的券会被当成"没发过"再发一轮 ——
 * 老客凭空多拿一份，账本彻底对不上。
 */
async function resettleRewards(campaignId: string, tiers: RewardTier[]): Promise<number> {
  await prisma.reward.deleteMany({ where: { campaignId } });

  const grouped = await prisma.contribution.groupBy({
    by: ["contributorId"],
    where: { campaignId },
    _sum: { points: true },
  });

  let count = 0;
  for (const row of grouped) {
    const total = row._sum.points ?? 0;
    for (const r of tiersToGrant(total, tiers, [])) {
      await prisma.reward.create({
        data: {
          campaignId,
          contributorId: row.contributorId,
          tierName: r.tierName,
          type: r.type,
          title: r.title,
          value: r.value,
          code: r.code,
          status: "issued",
        },
      });
      count++;
    }
  }
  return count;
}

// ── 主流程 ────────────────────────────────────────────────

async function main() {
  const cfg = llmConfig();
  if (!cfg.enabled) {
    console.error(`
  ✗ 模型未启用，这个脚本跑不出大模型内容。
    当前 LLM_MODE=${cfg.mode}，LLM_API_KEY ${cfg.apiKey ? "已配置" : "为空"}。
    请在 .env 里填好 LLM_API_KEY 后重试（只想离线跑就用 pnpm db:seed 即可）。
`);
    process.exit(1);
  }

  console.log(`
\x1b[1m用真实大模型重跑种子内容\x1b[0m
  模型        ${cfg.model}
  并发        ${CONCURRENCY}
  重试        ${MAX_RETRY} 次
  范围        ${ONLY_CAMPAIGN >= 0 ? `只处理第 ${ONLY_CAMPAIGN + 1} 个活动` : "全部活动"}${LIMIT !== Infinity ? `，最多 ${LIMIT} 条素材` : ""}
  重建框架    ${DO_BLUEPRINTS ? "是（含按新阶梯重新结算福利）" : "否（--no-blueprints）"}
`);

  const campaigns = await prisma.campaign.findMany({
    include: {
      merchant: true,
      submissions: {
      orderBy: { createdAt: "asc" },
      include: { contents: { select: { aiMode: true, degraded: true } } },
    },
    },
    orderBy: { createdAt: "asc" },
  });

  // ── 可选：重建活动框架 ──
  if (DO_BLUEPRINTS) {
    console.log("重建活动框架（含奖励按新阶梯重新结算）…");
    let reissued = 0;
    for (let i = 0; i < campaigns.length; i++) {
      if (ONLY_CAMPAIGN >= 0 && i !== ONLY_CAMPAIGN) continue;
      const c = campaigns[i];
      const bp = await generateBlueprint(
        {
          name: c.merchant.name,
          category: c.merchant.category,
          city: c.merchant.city,
          address: c.merchant.address,
          avgPrice: c.merchant.avgPrice,
          tones: parseJson<string[]>(c.merchant.tones, []),
          sellingPoints: parseJson<string[]>(c.merchant.sellingPoints, []),
          bannedWords: parseJson<string[]>(c.merchant.bannedWords, []),
        },
        {
          title: c.title,
          objective: c.objective,
          platforms: parseJson<Platform[]>(c.platforms, []),
          brief: c.brief,
        },
      );
      await prisma.campaign.update({
        where: { id: c.id },
        data: {
          frames: JSON.stringify(bp.frames),
          taskCard: JSON.stringify(bp.taskCard),
          rewardTiers: JSON.stringify(bp.rewardTiers),
          aiMode: bp.aiMode,
          aiNote: bp.note,
          degraded: bp.degraded,
        },
      });

      // 关键：档位名换了，账本必须跟着重算，否则旧档位名的券会成为孤儿，
      // 而新档位名会被当成"没发过"再发一轮。
      const reissuedHere = await resettleRewards(c.id, bp.rewardTiers);
      reissued += reissuedHere;

      console.log(
        `  ${c.merchant.name.padEnd(16)} ${bp.aiMode}${bp.degraded ? " · 降级" : ""}  阶梯 ${bp.rewardTiers.map((t) => t.threshold).join("/")}  重发福利 ${reissuedHere} 张`,
      );
    }
    console.log(`  福利重新结算合计 ${reissued} 张\n`);
  }

  // ── 收集待处理的素材 ──
  // 跳过已经是大模型产出的：让脚本可以反复执行 —— 中断后重跑只补没跑完的，不浪费额度。
  const jobs: { campaign: (typeof campaigns)[number]; submissionId: string; answers: Record<string, string>; hasImage: boolean }[] = [];
  let skipped = 0;
  for (let i = 0; i < campaigns.length; i++) {
    if (ONLY_CAMPAIGN >= 0 && i !== ONLY_CAMPAIGN) continue;
    for (const s of campaigns[i].submissions) {
      if (s.status === "rejected") continue; // 被拦下的素材本来就没有内容
      if (s.contents.length > 0 && s.contents.every((c) => c.aiMode === "llm" && !c.degraded)) {
        skipped++;
        continue;
      }
      jobs.push({
        campaign: campaigns[i],
        submissionId: s.id,
        answers: parseJson<Record<string, string>>(s.answers, {}),
        hasImage: !!s.imageUrl,
      });
    }
  }

  const targets = jobs.slice(0, LIMIT === Infinity ? jobs.length : LIMIT);
  if (skipped > 0) console.log(`已是大模型产出、跳过 ${skipped} 条素材（可反复执行，只补没跑完的）`);
  console.log(`待处理素材 ${targets.length} 条（每条 ${"约 1 次"}模型调用，每次约 5-9 秒）`);
  console.log(`按并发 ${CONCURRENCY} 估算，大约需要 ${Math.ceil((targets.length * 7) / CONCURRENCY / 60)} 分钟。\n`);
  if (targets.length === 0) {
    console.log("  没有需要处理的素材 —— 所有内容都已经是大模型产出的了。\n");
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  const results = await pool(targets, CONCURRENCY, async (job): Promise<JobResult> => {
    const frames = parseJson<PlatformFrame[]>(job.campaign.frames, []);
    const platforms = parseJson<Platform[]>(job.campaign.platforms, []);
    const taskCard = parseJson<TaskField[]>(job.campaign.taskCard, []);

    const merchantLike = {
      name: job.campaign.merchant.name,
      category: job.campaign.merchant.category,
      city: job.campaign.merchant.city,
      address: job.campaign.merchant.address,
      avgPrice: job.campaign.merchant.avgPrice,
      tones: parseJson<string[]>(job.campaign.merchant.tones, []),
      sellingPoints: parseJson<string[]>(job.campaign.merchant.sellingPoints, []),
      bannedWords: parseJson<string[]>(job.campaign.merchant.bannedWords, []),
    };
    const campaignLike = {
      title: job.campaign.title,
      objective: job.campaign.objective,
      platforms,
      brief: job.campaign.brief,
    };

    // 失败重试：184 次调用里有一两次网络抖动很正常，不该因此把整批算成降级
    let composed = null;
    let lastErr = "";
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        const r = await composeContents(
          merchantLike,
          campaignLike,
          { id: job.submissionId, answers: job.answers },
          frames,
          job.hasImage ? "老客已提供一张实拍图，封面建议请基于这张图来写。" : "老客未提供实拍图。",
        );
        // 只有真拿到模型产出才算成功；降级结果不当成功，触发重试
        if (r.aiMode === "llm" && !r.degraded) {
          composed = r;
          break;
        }
        lastErr = r.note;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
      if (attempt < MAX_RETRY) await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }

    if (!composed) {
      // 三次都失败：保留原有内容，并**如实标成降级** —— 不能把规则产出的内容标成大模型产出的
      await prisma.generatedContent.updateMany({
        where: { submissionId: job.submissionId },
        data: { degraded: true, aiNote: `模型重跑失败，保留原有规则产出。原因：${lastErr.slice(0, 160)}` },
      });
      done++;
      process.stdout.write(`\r  进度 ${done}/${targets.length}  失败/降级 ${lastErr.slice(0, 40)}`.padEnd(90));
      return { submissionId: job.submissionId, ok: false, aiMode: "rule", degraded: true, updated: 0, note: lastErr };
    }

    // 原地更新，不删重建 —— 保住 contentId，从而保住点击回流的归因
    const existing = await prisma.generatedContent.findMany({
      where: { submissionId: job.submissionId },
      select: { id: true, platform: true },
    });
    const byPlatform = new Map(existing.map((e) => [e.platform, e.id]));
    let updated = 0;

    // 任务卡里标了 required 的字段，用来判断这条素材算不算完整（这里只用于展示，不重复计分）
    void taskCard;

    for (const item of composed.contents) {
      const id = byPlatform.get(item.platform);
      const data = {
        title: item.title,
        body: item.body,
        tags: JSON.stringify(item.tags),
        coverHint: item.coverHint,
        complianceNote: item.complianceNote,
        aiMode: item.source,
        degraded: item.fallback,
        aiNote: composed.note,
      };
      if (id) {
        await prisma.generatedContent.update({ where: { id }, data });
      } else {
        // 模型给出了任务卡里没覆盖的平台，补一条（shareToken 新生成）
        const { shareToken } = await import("../lib/ids");
        await prisma.generatedContent.create({
          data: {
            campaignId: job.campaign.id,
            submissionId: job.submissionId,
            platform: item.platform,
            shareToken: shareToken(),
            ...data,
          },
        });
      }
      updated++;
    }

    done++;
    process.stdout.write(`\r  进度 ${done}/${targets.length}  已更新 ${updated} 条内容`.padEnd(90));
    return { submissionId: job.submissionId, ok: true, aiMode: composed.aiMode, degraded: composed.degraded, updated, note: composed.note };
  });

  console.log("\n");

  // ── 汇总 ──
  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  const contentUpdated = results.reduce((s, r) => s + r.updated, 0);

  const all = await prisma.generatedContent.findMany({ select: { aiMode: true, degraded: true } });
  const llm = all.filter((c) => c.aiMode === "llm").length;
  const degraded = all.filter((c) => c.degraded).length;
  const byDesign = all.length - llm - degraded;
  const rate = (n: number) => `${((n / (all.length || 1)) * 100).toFixed(1)}%`;

  console.log(`──────────────────────────────────────────────────`);
  console.log(`  完成，用时 ${elapsed()}`);
  console.log(`──────────────────────────────────────────────────`);
  console.log(`  处理素材        ${results.length} 条（成功 ${okCount}、失败 ${failCount}）`);
  console.log(`  更新内容        ${contentUpdated} 条`);
  console.log("");
  console.log(`  全库内容构成（这就是后台「AI 生成质量」面板上的数字）`);
  console.log(`    大模型          ${String(llm).padStart(4)}  ${rate(llm)}`);
  console.log(`    降级            ${String(degraded).padStart(4)}  ${rate(degraded)}${degraded > 0 ? "   ← 需要关注" : ""}`);
  console.log(`    规则引擎(按设计) ${String(byDesign).padStart(4)}  ${rate(byDesign)}`);
  console.log(`    合计            ${String(all.length).padStart(4)}`);
  console.log("");
  if (degraded === 0 && llm > 0) {
    console.log(`  ✓ 面板会显示「健康 · 零降级」`);
  } else if (degraded > 0) {
    console.log(`  ⚠ 有 ${degraded} 条降级，面板会给出对应提示 —— 这是如实反映，不是 bug`);
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error("\n  失败：", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
