/**
 * 为每份素材的每个平台建立**两版产出**：规则引擎版 + 大模型版，并决定哪一版是当前采用的。
 *
 * ── 为什么是"建配对"而不是"重写一遍" ──
 * 早先这个脚本是**直接覆盖**规则引擎产出的内容，那会把种子数据里的东西顶掉。
 * 现在两份都留着：大模型版作为 primary（内容库展示的那一版），
 * 规则引擎版作为对比版挂在同一素材下，在内容库里可以一键切换对看。
 * **谁都不覆盖谁。**
 *
 * ── 为什么要留规则引擎版 ──
 * 它是最好的教学材料。切过去能直接看到模板拼装的毛病：标题被硬截断、
 * 分点撞车（推荐项和卖点重复）、偶尔出病句（「人均：人均 98 。」）。
 * 这比口头说"AI 比模板强"有说服力得多。
 *
 * ── 关于质量面板的比例 ──
 * 面板只统计 `isPrimary` 那一版。把对比版也算进去的话比例会变成假的 50/50 ——
 * 那比不统计更误导人。所以对比版单独报个数。
 *
 * ── 关于降级的诚实性 ──
 * 模型重试三次仍失败时，**不创建 llm 版**，而是把规则引擎版标成 `degraded=true`。
 * 因为这时的规则产出确实是"本该走模型却失败了"的兜底，不是"按设计如此"。
 * 不这么标的话，面板会把它误报成健康的"规则引擎（按设计）"。
 *
 * ── 用法 ──
 *   pnpm demo:ai                     建立全部配对（约 65 次模型调用，1-2 分钟）
 *   pnpm demo:ai --limit 20          只处理前 20 条素材（试水 / 省额度）
 *   pnpm demo:ai --campaign 0        只处理第 1 个活动
 *   pnpm demo:ai --concurrency 5     并发数（默认 3，调高容易撞限流）
 *   pnpm demo:ai --no-blueprints     跳过活动框架重建
 *   pnpm demo:ai --no-compare        不生成规则引擎对比版（内容库里就没有切换对比）
 *
 * 脚本可反复执行：已经有大模型版的素材会自动跳过，中断后重跑只补没跑完的。
 */
import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { composeContents, generateBlueprint, llmConfig } from "../lib/ai";
import { ruleCompose } from "../lib/ai/rules";
import { parseJson } from "../lib/json";
import { tiersToGrant } from "../lib/domain/reward";
import { shareToken as newShareToken } from "../lib/ids";
import type { Platform, PlatformFrame, RewardTier, TaskField } from "../lib/types";

const prisma = new PrismaClient();

// ── 参数 ──────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
function num(name: string, fallback: number): number {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) {
    const v = Number(hit.split("=")[1]);
    return Number.isFinite(v) ? v : fallback;
  }
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith("--")) {
    const v = Number(argv[idx + 1]);
    return Number.isFinite(v) ? v : fallback;
  }
  return fallback;
}

const LIMIT = num("limit", Infinity);
const CONCURRENCY = Math.max(1, Math.min(8, num("concurrency", 3)));
const ONLY_CAMPAIGN = argv.includes("--campaign") ? num("campaign", -1) : -1;
const DO_BLUEPRINTS = !flag("no-blueprints");
const DO_COMPARE = !flag("no-compare");
const MAX_RETRY = num("retry", 2);

// ── 小工具 ────────────────────────────────────────────────

const startedAt = Date.now();
function elapsed(): string {
  const s = Math.round((Date.now() - startedAt) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

/** 极简并发池：LLM 调用是 IO 密集，串行跑 65 次要十几分钟 */
async function pool<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await worker(items[i]);
      }
    }),
  );
  return results;
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

interface MerchantLike {
  name: string;
  category: string;
  city: string;
  address: string | null;
  avgPrice: number | null;
  tones: string[];
  sellingPoints: string[];
  bannedWords: string[];
}

interface JobResult {
  /** 本次拿到了新的模型产出 */
  composed: boolean;
  /** 本来就有可用的大模型版，本次只补了对比版 */
  reusedLlm: boolean;
  /** 真的失败了（模型调不通、且手里没有可用的大模型版） */
  failed: boolean;
  /** 本次新建/更新的 llm 内容条数 */
  llmWritten: number;
  /** 本次补建的规则引擎对比版条数 */
  compareBuilt: number;
  note: string;
}

// ── 主流程 ────────────────────────────────────────────────

async function main() {
  const cfg = llmConfig();
  if (!cfg.enabled) {
    console.error(`
  ✗ 模型未启用，这个脚本跑不出大模型内容。
    当前 LLM_MODE=${cfg.mode}，LLM_API_KEY ${cfg.apiKey ? "已配置" : "为空"}。
    只想离线跑用 pnpm db:seed 即可。
`);
    process.exit(1);
  }

  console.log(`
\x1b[1m为素材建立「大模型版 + 规则引擎对比版」\x1b[0m
  模型        ${cfg.model}
  并发        ${CONCURRENCY}     重试 ${MAX_RETRY} 次
  范围        ${ONLY_CAMPAIGN >= 0 ? `只处理第 ${ONLY_CAMPAIGN + 1} 个活动` : "全部活动"}${LIMIT !== Infinity ? `，最多 ${LIMIT} 条素材` : ""}
  重建框架    ${DO_BLUEPRINTS ? "是（含按新阶梯重新结算福利）" : "否"}
  对比版      ${DO_COMPARE ? "生成（内容库里可切换对看）" : "不生成"}
`);

  const campaigns = await prisma.campaign.findMany({
    include: {
      merchant: true,
      submissions: {
        orderBy: { createdAt: "asc" },
        include: { contents: { select: { variant: true, degraded: true, platform: true } } },
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
      const merchantLike: MerchantLike = {
        name: c.merchant.name,
        category: c.merchant.category,
        city: c.merchant.city,
        address: c.merchant.address,
        avgPrice: c.merchant.avgPrice,
        tones: parseJson<string[]>(c.merchant.tones, []),
        sellingPoints: parseJson<string[]>(c.merchant.sellingPoints, []),
        bannedWords: parseJson<string[]>(c.merchant.bannedWords, []),
      };
      const bp = await generateBlueprint(merchantLike, {
        title: c.title,
        objective: c.objective,
        platforms: parseJson<Platform[]>(c.platforms, []),
        brief: c.brief,
      });
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
      const n = await resettleRewards(c.id, bp.rewardTiers);
      reissued += n;
      console.log(`  ${c.merchant.name.padEnd(16)} ${bp.aiMode}${bp.degraded ? " · 降级" : ""}  阶梯 ${bp.rewardTiers.map((t) => t.threshold).join("/")}  福利 ${n} 张`);
    }
    console.log(`  福利重新结算合计 ${reissued} 张\n`);
  }

  // ── 收集待处理的素材 ──
  // 跳过已经有大模型版且未降级的：可反复执行，中断后重跑只补没跑完的。
  type Job = {
    campaign: (typeof campaigns)[number];
    submissionId: string;
    answers: Record<string, string>;
    hasImage: boolean;
    hasLlm: boolean;
  };
  const jobs: Job[] = [];
  let skipped = 0;
  for (let i = 0; i < campaigns.length; i++) {
    if (ONLY_CAMPAIGN >= 0 && i !== ONLY_CAMPAIGN) continue;
    for (const s of campaigns[i].submissions) {
      if (s.status === "rejected") continue;
      const llmRows = s.contents.filter((c) => c.variant === "llm" && !c.degraded);
      const hasLlm = llmRows.length > 0 && llmRows.length === s.contents.filter((c) => c.variant === "llm").length;
      // 有大模型版、且对比版也齐了，才真正跳过
      const compareNeeded = DO_COMPARE && s.contents.filter((c) => c.variant === "rule").length === 0;
      if (hasLlm && !compareNeeded) {
        skipped++;
        continue;
      }
      jobs.push({
        campaign: campaigns[i],
        submissionId: s.id,
        answers: parseJson<Record<string, string>>(s.answers, {}),
        hasImage: !!s.imageUrl,
        hasLlm,
      });
    }
  }

  const targets = jobs.slice(0, LIMIT === Infinity ? jobs.length : LIMIT);
  if (skipped > 0) console.log(`已完成、跳过 ${skipped} 条素材`);
  console.log(`待处理素材 ${targets.length} 条`);
  console.log(`按并发 ${CONCURRENCY} 估算，大约需要 ${Math.ceil((targets.length * 7) / CONCURRENCY / 60)} 分钟。\n`);

  if (targets.length === 0) {
    console.log("  没有需要处理的素材。\n");
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  const results = await pool<Job, JobResult>(targets, CONCURRENCY, async (job) => {
    const frames = parseJson<PlatformFrame[]>(job.campaign.frames, []);
    const platforms = parseJson<Platform[]>(job.campaign.platforms, []);
    const taskCard = parseJson<TaskField[]>(job.campaign.taskCard, []);

    const merchantLike: MerchantLike = {
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

    // ── 第 1 步：确保规则引擎对比版存在（本地生成，零 API 成本）──
    let compareBuilt = 0;
    if (DO_COMPARE) {
      for (const frame of frames) {
        const existing = await prisma.generatedContent.findUnique({
          where: {
            submissionId_platform_variant: {
              submissionId: job.submissionId,
              platform: frame.platform,
              variant: "rule",
            },
          },
          select: { id: true },
        });
        if (existing) continue;

        const c = ruleCompose(merchantLike, campaignLike, { id: job.submissionId, answers: job.answers }, frame.platform);
        await prisma.generatedContent.create({
          data: {
            campaignId: job.campaign.id,
            submissionId: job.submissionId,
            platform: c.platform,
            title: c.title,
            body: c.body,
            tags: JSON.stringify(c.tags),
            coverHint: c.coverHint,
            complianceNote: c.complianceNote,
            aiMode: "rule",
            variant: "rule",
            // 先建为非 primary，最后统一决定谁是 primary
            isPrimary: false,
            degraded: false,
            aiNote: "规则引擎对比产出（同一素材的另一版，用于对比），非降级。",
            shareToken: newShareToken(),
          },
        });
        compareBuilt++;
      }
    }

    // ── 第 2 步：调模型拿大模型版 ──
    // 已经有可用的 llm 版就跳过调用 —— 否则光是为了补对比版，
    // 又会把 65 次模型调用重跑一遍，白花额度。
    let composed = null;
    let lastErr = "";
    for (let attempt = 0; !job.hasLlm && attempt <= MAX_RETRY; attempt++) {
      try {
        const r = await composeContents(
          merchantLike,
          campaignLike,
          { id: job.submissionId, answers: job.answers },
          frames,
          job.hasImage ? "老客已提供一张实拍图，封面建议请基于这张图来写。" : "老客未提供实拍图。",
        );
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

    let llmWritten = 0;

    if (composed) {
      // upsert：已存在就更新文本，不存在才新建 —— 保住 contentId，从而保住点击回流的归因
      for (const item of composed.contents) {
        const where = {
          submissionId_platform_variant: {
            submissionId: job.submissionId,
            platform: item.platform,
            variant: "llm" as const,
          },
        };
        const data = {
          title: item.title,
          body: item.body,
          tags: JSON.stringify(item.tags),
          coverHint: item.coverHint,
          complianceNote: item.complianceNote,
          aiMode: "llm",
          degraded: false,
          aiNote: composed.note,
        };
        const existing = await prisma.generatedContent.findUnique({ where, select: { id: true } });
        if (existing) {
          await prisma.generatedContent.update({ where, data });
        } else {
          await prisma.generatedContent.create({
            data: {
              campaignId: job.campaign.id,
              submissionId: job.submissionId,
              platform: item.platform,
              variant: "llm",
              isPrimary: false,
              shareToken: newShareToken(),
              ...data,
            },
          });
        }
        llmWritten++;
      }
    } else if (DO_COMPARE && !job.hasLlm) {
      // 三次都失败：没有 llm 版可展示，规则引擎版顶上。
      // 但这时它是**兜底**而不是"按设计如此"，必须如实标降级 ——
      // 否则面板会把它误报成健康的「规则引擎（按设计）」。
      await prisma.generatedContent.updateMany({
        where: { submissionId: job.submissionId, variant: "rule" },
        data: {
          degraded: true,
          aiNote: `模型生成失败，改用规则引擎兜底。原因：${lastErr.slice(0, 160)}`,
        },
      });
    }

    // ── 第 3 步：决定哪个平台用哪版作为 primary ──
    const rows = await prisma.generatedContent.findMany({
      where: { submissionId: job.submissionId },
      select: { id: true, platform: true, variant: true, degraded: true },
    });
    for (const platform of platforms) {
      const pair = rows.filter((r) => r.platform === platform);
      if (pair.length === 0) continue;
      const llm = pair.find((r) => r.variant === "llm" && !r.degraded);
      const pick = llm ?? pair.find((r) => r.variant === "rule") ?? pair[0];
      await prisma.generatedContent.updateMany({
        where: { submissionId: job.submissionId, platform },
        data: { isPrimary: false },
      });
      await prisma.generatedContent.update({ where: { id: pick.id }, data: { isPrimary: true } });
    }

    void taskCard;
    done++;
    process.stdout.write(
      `\r  进度 ${done}/${targets.length}  llm ${llmWritten} 条  对比版 +${compareBuilt} 条`.padEnd(88),
    );

    return {
      composed: !!composed,
      reusedLlm: !composed && job.hasLlm,
      failed: !composed && !job.hasLlm,
      llmWritten,
      compareBuilt,
      note: composed ? composed.note : lastErr,
    };
  });

  console.log("\n");

  // ── 汇总 ──
  // 三种情况必须分开报：真写了模型产出 / 复用了已有的 / 真失败了。
  // 混成一个"成功/失败"会让「本来就有 llm 版、只补了对比版」被误报成失败 ——
  // 那种汇总本身就是在误导人。
  const composedCount = results.filter((r) => r.composed).length;
  const reusedCount = results.filter((r) => r.reusedLlm).length;
  const failCount = results.filter((r) => r.failed).length;

  const primary = await prisma.generatedContent.findMany({
    where: { isPrimary: true },
    select: { aiMode: true, degraded: true },
  });
  const comparison = await prisma.generatedContent.count({ where: { isPrimary: false } });
  const llm = primary.filter((c) => c.aiMode === "llm").length;
  const degraded = primary.filter((c) => c.degraded).length;
  const byDesign = primary.length - llm - degraded;
  const rate = (n: number) => `${((n / (primary.length || 1)) * 100).toFixed(1)}%`;

  console.log(`──────────────────────────────────────────────────`);
  console.log(`  完成，用时 ${elapsed()}`);
  console.log(`──────────────────────────────────────────────────`);
  console.log(`  处理素材        ${results.length} 条`);
  console.log(`    · 本次生成大模型版    ${composedCount} 条（写入内容 ${results.reduce((s, r) => s + r.llmWritten, 0)} 条）`);
  console.log(`    · 已有大模型版、仅补对比版 ${reusedCount} 条`);
  console.log(`    · 真失败（模型调不通）    ${failCount} 条${failCount > 0 ? "   ← 已如实标为降级" : ""}`);
  console.log(`  补建对比版      ${results.reduce((s, r) => s + r.compareBuilt, 0)} 条`);
  console.log("");
  console.log(`  当前采用的那一版（= 后台质量面板统计的口径）`);
  console.log(`    大模型          ${String(llm).padStart(4)}  ${rate(llm)}`);
  console.log(`    降级            ${String(degraded).padStart(4)}  ${rate(degraded)}${degraded > 0 ? "   ← 需要关注" : ""}`);
  console.log(`    规则引擎(按设计) ${String(byDesign).padStart(4)}  ${rate(byDesign)}`);
  console.log(`    合计            ${String(primary.length).padStart(4)}`);
  console.log("");
  console.log(`  对比版（不计入比例，仅用于内容库里切换对看）  ${comparison} 条`);
  console.log("");
  if (degraded === 0 && llm > 0) console.log(`  ✓ 面板会显示「健康 · 零降级」`);
  else if (degraded > 0) console.log(`  ⚠ 有 ${degraded} 条降级，面板会给出对应提示 —— 这是如实反映，不是 bug`);
  console.log("");
}

main()
  .catch((e) => {
    console.error("\n  失败：", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
