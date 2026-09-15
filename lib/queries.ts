/**
 * 数据读取层：把 Prisma 行里的 JSON 字段解开成领域对象，页面只拿类型化的数据。
 * 聚合逻辑刻意放在 JS 里做而不是全塞 SQL —— Demo 数据量小，可读性优先。
 */
import { prisma } from "./db";
import { parseJson } from "./json";
import { viewerToken as newViewerToken } from "./ids";
import { llmConfig } from "./ai/deepseek";
import type {
  ContentVariant,
  Platform,
  PlatformFrame,
  PointItem,
  RewardTier,
  RiskFlag,
  TaskField,
} from "./types";

export interface DecodedMerchant {
  id: string;
  name: string;
  category: string;
  city: string;
  address: string | null;
  avgPrice: number | null;
  tones: string[];
  sellingPoints: string[];
  bannedWords: string[];
}

export interface DecodedCampaign {
  id: string;
  merchantId: string;
  title: string;
  objective: string;
  platforms: Platform[];
  brief: string;
  frames: PlatformFrame[];
  taskCard: TaskField[];
  rewardTiers: RewardTier[];
  aiMode: string;
  aiNote: string;
  degraded: boolean;
  status: string;
  publicToken: string;
  createdAt: Date;
}

function decodeMerchant(m: {
  id: string;
  name: string;
  category: string;
  city: string;
  address: string | null;
  avgPrice: number | null;
  tones: string;
  sellingPoints: string;
  bannedWords: string;
}): DecodedMerchant {
  return {
    ...m,
    tones: parseJson<string[]>(m.tones, []),
    sellingPoints: parseJson<string[]>(m.sellingPoints, []),
    bannedWords: parseJson<string[]>(m.bannedWords, []),
  };
}

function decodeCampaign(c: {
  id: string;
  merchantId: string;
  title: string;
  objective: string;
  platforms: string;
  brief: string;
  frames: string;
  taskCard: string;
  rewardTiers: string;
  aiMode: string;
  aiNote: string;
  degraded: boolean;
  status: string;
  publicToken: string;
  createdAt: Date;
}): DecodedCampaign {
  return {
    ...c,
    platforms: parseJson<Platform[]>(c.platforms, []),
    frames: parseJson<PlatformFrame[]>(c.frames, []),
    taskCard: parseJson<TaskField[]>(c.taskCard, []),
    rewardTiers: parseJson<RewardTier[]>(c.rewardTiers, []),
  };
}

export interface DecodedSubmission {
  id: string;
  answers: Record<string, string>;
  imageUrl: string | null;
  status: string;
  riskFlags: RiskFlag[];
  points: number;
  createdAt: Date;
  contributor: { id: string; nickname: string; avatarEmoji: string };
  contentCount: number;
  adoptedCount: number;
}

/** 另一版产出的摘要，用于在内容库里当场对比 */
export interface CompareVariant {
  id: string;
  variant: ContentVariant;
  title: string;
  body: string;
  tags: string[];
  coverHint: string;
  complianceNote: string;
  aiMode: string;
  degraded: boolean;
  aiNote: string;
  shareToken: string;
}

export interface DecodedContent {
  id: string;
  platform: Platform;
  title: string;
  body: string;
  tags: string[];
  coverHint: string;
  complianceNote: string;
  aiMode: string;
  aiNote: string;
  degraded: boolean;
  variant: ContentVariant;
  adopted: boolean;
  shareToken: string;
  createdAt: Date;
  submissionId: string;
  contributor: { id: string; nickname: string; avatarEmoji: string };
  answers: Record<string, string>;
  imageUrl: string | null;
  /** 同一素材同一平台另一版产出（没有就是 null） */
  compare: CompareVariant | null;
}

export interface DecodedContribution {
  id: string;
  points: number;
  reason: string;
  breakdown: PointItem[];
  createdAt: Date;
  contributor: { id: string; nickname: string; avatarEmoji: string };
  submissionId: string | null;
}

export interface DecodedReward {
  id: string;
  tierName: string;
  type: string;
  title: string;
  value: number;
  code: string;
  status: string;
  issuedAt: Date;
  redeemedAt: Date | null;
  contributor: { id: string; nickname: string; avatarEmoji: string };
}

export interface LeaderboardRow {
  contributorId: string;
  nickname: string;
  avatarEmoji: string;
  points: number;
  submissions: number;
  adopted: number;
  clicks: number;
  rewards: number;
}

/**
 * AI 生成质量指标。
 *
 * 单条标注（这条内容是 llm 还是 rule）只能事后追查；
 * **比例才能让人一眼判断模型现在健不健康**，这才是运维要盯的数字。
 *
 * 关键点：`degraded` 必须和「按设计走规则引擎」严格分开。
 * 否则演示数据（种子刻意用规则引擎）会显示成 100% 规则引擎，
 * 看着像全线故障，其实一切正常 —— 那样这个指标反而在骗人。
 */
export interface AiQuality {
  total: number;
  llm: number;
  /** 按设计走规则引擎：未配置 key 或种子数据，不是故障 */
  ruleByDesign: number;
  /** 真实降级：已配置 key，本该走模型却失败退回 */
  degraded: number;
  /** 大模型产出占比（0~1） */
  llmRate: number;
  /** 真实降级率（0~1）—— 这是要盯的那个数 */
  degradedRate: number;
  /** 降级原因分布 */
  reasons: { note: string; count: number }[];
  /**
   * 未计入统计的对比版数量（同一素材同一平台的另一版产出）。
   * 不算进比例是有意的：把对比版也算进去，比例会变成假的 50/50。
   */
  comparisonCount: number;
  /** 是否配置了模型 key。没配的话「降级」这个指标无意义 */
  llmConfigured: boolean;
  model: string;
  /** 活动框架（平台框架/任务卡/奖励阶梯）的生成情况 */
  blueprint: { aiMode: string; degraded: boolean; note: string };
}

export interface WorkspaceMetrics {  submissions: number;
  blocked: number;
  warned: number;
  contents: number;
  adopted: number;
  contributors: number;
  rewardsIssued: number;
  rewardsRedeemed: number;
  clicks: number;
  shares: number;
  pointsIssued: number;
}

export interface Workspace {
  merchant: DecodedMerchant;
  campaign: DecodedCampaign;
  submissions: DecodedSubmission[];
  contents: DecodedContent[];
  contributions: DecodedContribution[];
  rewards: DecodedReward[];
  leaderboard: LeaderboardRow[];
  metrics: WorkspaceMetrics;
  aiQuality: AiQuality;
}

// ── 商家侧 ────────────────────────────────────────────────

/** 可选店铺列表，供建活动向导预填 */
export async function listMerchants(): Promise<DecodedMerchant[]> {
  const rows = await prisma.merchant.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(decodeMerchant);
}

export async function listCampaigns() {  const rows = await prisma.campaign.findMany({
    include: {
      merchant: true,
      _count: { select: { submissions: true, contents: true, rewards: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    objective: row.objective,
    status: row.status,
    aiMode: row.aiMode,
    publicToken: row.publicToken,
    createdAt: row.createdAt,
    merchant: decodeMerchant(row.merchant),
    platforms: parseJson<Platform[]>(row.platforms, []),
    counts: {
      submissions: row._count.submissions,
      contents: row._count.contents,
      rewards: row._count.rewards,
    },
  }));
}

export async function getWorkspace(campaignId: string): Promise<Workspace | null> {
  const row = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      merchant: true,
      submissions: {
        include: {
          contributor: true,
          contents: true,
        },
        orderBy: { createdAt: "desc" },
      },
      contents: {
        include: {
          submission: { include: { contributor: true } },
        },
        orderBy: [{ adopted: "desc" }, { createdAt: "desc" }],
      },
      contributions: {
        include: { contributor: true },
        orderBy: { createdAt: "desc" },
      },
      rewards: {
        include: { contributor: true },
        orderBy: { issuedAt: "desc" },
      },
      events: true,
    },
  });

  if (!row) return null;

  const submissions: DecodedSubmission[] = row.submissions.map((s) => {
    const riskFlags = parseJson<RiskFlag[]>(s.riskFlags, []);
    return {
      id: s.id,
      answers: parseJson<Record<string, string>>(s.answers, {}),
      imageUrl: s.imageUrl,
      status: s.status,
      riskFlags,
      points: s.points,
      createdAt: s.createdAt,
      contributor: {
        id: s.contributor.id,
        nickname: s.contributor.nickname,
        avatarEmoji: s.contributor.avatarEmoji,
      },
      contentCount: s.contents.length,
      adoptedCount: s.contents.filter((c) => c.adopted).length,
    };
  });

  // 同一素材同一平台可能存了两版（llm / rule）。
  // 内容库、漏斗、质量比例**只统计 primary**，另一版挂到 `compare` 上供当场对比 ——
  // 把两版都算进去的话，比例会变成假的 50/50，比不统计更误导人。
  const allContents = row.contents;
  const primaryRows = allContents.filter((c) => c.isPrimary);
  const siblingOf = new Map<string, (typeof allContents)[number]>();
  for (const c of allContents) {
    if (c.isPrimary) continue;
    siblingOf.set(`${c.submissionId}:${c.platform}`, c);
  }

  const contents: DecodedContent[] = primaryRows.map((c) => {
    const sibling = siblingOf.get(`${c.submissionId}:${c.platform}`);
    return {
      id: c.id,
      platform: c.platform as Platform,
      title: c.title,
      body: c.body,
      tags: parseJson<string[]>(c.tags, []),
      coverHint: c.coverHint,
      complianceNote: c.complianceNote,
      aiMode: c.aiMode,
      aiNote: c.aiNote,
      degraded: c.degraded,
      variant: (c.variant === "rule" ? "rule" : "llm") as ContentVariant,
      adopted: c.adopted,
      shareToken: c.shareToken,
      createdAt: c.createdAt,
      submissionId: c.submissionId,
      contributor: {
        id: c.submission.contributor.id,
        nickname: c.submission.contributor.nickname,
        avatarEmoji: c.submission.contributor.avatarEmoji,
      },
      answers: parseJson<Record<string, string>>(c.submission.answers, {}),
      imageUrl: c.submission.imageUrl,
      compare: sibling
        ? {
            id: sibling.id,
            variant: (sibling.variant === "rule" ? "rule" : "llm") as ContentVariant,
            title: sibling.title,
            body: sibling.body,
            tags: parseJson<string[]>(sibling.tags, []),
            coverHint: sibling.coverHint,
            complianceNote: sibling.complianceNote,
            aiMode: sibling.aiMode,
            degraded: sibling.degraded,
            aiNote: sibling.aiNote,
            shareToken: sibling.shareToken,
          }
        : null,
    };
  });

  const contributions: DecodedContribution[] = row.contributions.map((c) => ({
    id: c.id,
    points: c.points,
    reason: c.reason,
    breakdown: parseJson<PointItem[]>(c.breakdown, []),
    createdAt: c.createdAt,
    contributor: {
      id: c.contributor.id,
      nickname: c.contributor.nickname,
      avatarEmoji: c.contributor.avatarEmoji,
    },
    submissionId: c.submissionId,
  }));

  const rewards: DecodedReward[] = row.rewards.map((r) => ({
    id: r.id,
    tierName: r.tierName,
    type: r.type,
    title: r.title,
    value: r.value,
    code: r.code,
    status: r.status,
    issuedAt: r.issuedAt,
    redeemedAt: r.redeemedAt,
    contributor: {
      id: r.contributor.id,
      nickname: r.contributor.nickname,
      avatarEmoji: r.contributor.avatarEmoji,
    },
  }));

  // 贡献榜
  const clickBySubmission = new Map<string, number>();
  for (const e of row.events) {
    if (e.type === "click" && e.submissionId) {
      clickBySubmission.set(e.submissionId, (clickBySubmission.get(e.submissionId) ?? 0) + 1);
    }
  }

  const boardMap = new Map<string, LeaderboardRow>();
  for (const s of submissions) {
    if (!boardMap.has(s.contributor.id)) {
      boardMap.set(s.contributor.id, {
        contributorId: s.contributor.id,
        nickname: s.contributor.nickname,
        avatarEmoji: s.contributor.avatarEmoji,
        points: 0,
        submissions: 0,
        adopted: 0,
        clicks: 0,
        rewards: 0,
      });
    }
    const b = boardMap.get(s.contributor.id)!;
    if (s.status !== "rejected") b.submissions += 1;
    b.adopted += s.adoptedCount;
    b.clicks += clickBySubmission.get(s.id) ?? 0;
  }
  for (const c of contributions) {
    if (!boardMap.has(c.contributor.id)) continue;
    boardMap.get(c.contributor.id)!.points += c.points;
  }
  for (const r of rewards) {
    if (!boardMap.has(r.contributor.id)) continue;
    boardMap.get(r.contributor.id)!.rewards += 1;
  }
  const leaderboard = Array.from(boardMap.values()).sort((a, b) => b.points - a.points);

  const metrics: WorkspaceMetrics = {    submissions: submissions.length,
    blocked: submissions.filter((s) => s.status === "rejected").length,
    warned: submissions.filter((s) => s.status !== "rejected" && s.riskFlags.length > 0).length,
    contents: contents.length,
    adopted: contents.filter((c) => c.adopted).length,
    contributors: leaderboard.length,
    rewardsIssued: rewards.length,
    rewardsRedeemed: rewards.filter((r) => r.status === "redeemed").length,
    clicks: row.events.filter((e) => e.type === "click").length,
    shares: row.events.filter((e) => e.type === "share").length,
    pointsIssued: contributions.reduce((sum, c) => sum + c.points, 0),
  };

  // AI 生成质量：把「大模型 / 按设计的规则引擎 / 真实降级」三者严格分开统计。
  // 三者各自独立计数，保证互不重叠、加起来不超过总数 ——
  // 早先用「总数 - 大模型 - 降级」反推，一旦出现 aiMode=llm 且 degraded=true 的行
  // （写库时整批覆盖就会造出这种行），就会算出负数并渲染出「-4」「-100%」。
  const cfg = llmConfig();
  const llmCount = contents.filter((c) => c.aiMode === "llm").length;
  const degradedContents = contents.filter((c) => c.degraded);
  const byDesignCount = contents.filter((c) => c.aiMode !== "llm" && !c.degraded).length;
  const reasonMap = new Map<string, number>();
  for (const c of degradedContents) {
    const key = c.aiNote || "（未记录原因）";
    reasonMap.set(key, (reasonMap.get(key) ?? 0) + 1);
  }

  // 比例分母用三者之和，保证进度条宽度恰好铺满
  const partsTotal = llmCount + degradedContents.length + byDesignCount || 1;

  // `contents` 此时只含 primary，所以这里统计的天然就是「当前采用的那一版」。
  // 对比版单独报个数，让商家知道库里还有多少条没计入 —— 而不是把它们混进比例里。
  const comparisonCount = allContents.length - primaryRows.length;

  const aiQuality: AiQuality = {
    total: contents.length,
    llm: llmCount,
    ruleByDesign: byDesignCount,
    degraded: degradedContents.length,
    llmRate: llmCount / partsTotal,
    degradedRate: degradedContents.length / partsTotal,
    reasons: Array.from(reasonMap.entries())
      .map(([note, count]) => ({ note, count }))
      .sort((a, b) => b.count - a.count),
    comparisonCount,
    llmConfigured: cfg.enabled,
    model: cfg.model,
    blueprint: {
      aiMode: row.aiMode,
      degraded: row.degraded,
      note: row.aiNote,
    },
  };

  return {
    merchant: decodeMerchant(row.merchant),
    campaign: decodeCampaign(row),
    submissions,
    contents,
    contributions,
    rewards,
    leaderboard,
    metrics,
    aiQuality,
  };
}

// ── 老客侧（H5）──────────────────────────────────────────

export async function getCampaignByPublicToken(token: string) {
  const row = await prisma.campaign.findUnique({
    where: { publicToken: token },
    include: { merchant: true },
  });
  if (!row) return null;
  return { campaign: decodeCampaign(row), merchant: decodeMerchant(row.merchant) };
}

export async function getCampaignByShareToken(shareToken: string) {
  const content = await prisma.generatedContent.findUnique({
    where: { shareToken },
    include: {
      campaign: { include: { merchant: true } },
      submission: { include: { contributor: true } },
    },
  });
  if (!content) return null;
  return {
    content: {
      id: content.id,
      platform: content.platform as Platform,
      title: content.title,
      body: content.body,
      tags: parseJson<string[]>(content.tags, []),
      coverHint: content.coverHint,
      imageUrl: content.submission.imageUrl,
    },
    contributor: {
      id: content.submission.contributor.id,
      nickname: content.submission.contributor.nickname,
      avatarEmoji: content.submission.contributor.avatarEmoji,
    },
    campaign: decodeCampaign(content.campaign),
    merchant: decodeMerchant(content.campaign.merchant),
  };
}

/** 免登录认人：cookie 里有 token 就取，没有就建一个 */
export async function getOrCreateContributor(token: string) {
  const existing = await prisma.contributor.findUnique({ where: { viewerToken: token } });
  if (existing) return existing;

  const suffix = Math.floor(1000 + Math.random() * 9000);
  const emojis = ["🙂", "😋", "🌶️", "🍲", "✨", "🐱", "🍜", "🥢"];

  try {
    return await prisma.contributor.create({
      data: {
        viewerToken: token || newViewerToken(),
        nickname: `老客${suffix}`,
        avatarEmoji: emojis[Math.floor(Math.random() * emojis.length)],
        sourceChannel: "link",
      },
    });
  } catch {
    // 并发场景：老客双击提交、或同时开了两个标签页，两个请求都可能走到这里，
    // 后一个会撞上 viewerToken 的唯一约束。此时重读一次即可，不该把 500 甩给用户。
    const again = await prisma.contributor.findUnique({ where: { viewerToken: token } });
    if (again) return again;
    throw new Error("无法建立老客身份，请刷新页面重试");
  }
}

/** H5 底部「还差多少分解锁福利」只需要一个数，别把整个 dashboard 拉出来 */
export async function getContributorCampaignPoints(
  campaignId: string,
  contributorId: string,
): Promise<number> {
  const agg = await prisma.contribution.aggregate({
    where: { campaignId, contributorId },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
}

export interface ContributorDashboard {
  contributor: {
    id: string;
    nickname: string;
    avatarEmoji: string;
    totalPoints: number;
    campaignPoints: number;
  };
  /** 本次活动里，这位老客的内容共带来多少次有效点击回流 */
  totalClicks: number;
  submissions: {
    id: string;
    answers: Record<string, string>;
    imageUrl: string | null;
    status: string;
    points: number;
    riskFlags: RiskFlag[];
    createdAt: Date;
    contents: {
      id: string;
      platform: Platform;
      title: string;
      body: string;
      adopted: boolean;
      shareToken: string;
      /** 这条内容带来了几次有效点击回流 */
      clicks: number;
    }[];
  }[];
  contributions: { id: string; points: number; reason: string; breakdown: PointItem[]; createdAt: Date }[];
  rewards: { id: string; tierName: string; title: string; type: string; value: number; code: string; status: string }[];
}

export async function getContributorDashboard(
  campaignId: string,
  contributorId: string,
): Promise<ContributorDashboard | null> {
  const contributor = await prisma.contributor.findUnique({ where: { id: contributorId } });
  if (!contributor) return null;

  const [submissions, contributions, rewards, agg, globalAgg] = await Promise.all([
    prisma.submission.findMany({
      where: { campaignId, contributorId },
      // 只给老客看 primary 那一版：否则 4 个平台会显示成 8 条，把老客搞糊涂
      include: { contents: { where: { isPrimary: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contribution.findMany({
      where: { campaignId, contributorId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.reward.findMany({
      where: { campaignId, contributorId },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.contribution.aggregate({
      where: { campaignId, contributorId },
      _sum: { points: true },
    }),
    prisma.contribution.aggregate({
      where: { contributorId },
      _sum: { points: true },
    }),
  ]);

  // 按内容统计「这条分享带来了几次有效回流」。
  //
  // 为什么要单独查：老客的激励闭环缺了最后一环 —— 他看得到自己拿了多少贡献值，
  // 但看不到「我分享出去到底有没有用」。而分享是唯一能带来新客的动作，
  // 没有反馈就不会有人持续做。
  const submissionIds = submissions.map((s) => s.id);
  const clickRows = submissionIds.length
    ? await prisma.trackEvent.groupBy({
        by: ["contentId"],
        where: { submissionId: { in: submissionIds }, type: "click" },
        _count: { _all: true },
      })
    : [];
  const clicksByContent = new Map<string, number>();
  for (const row of clickRows) {
    if (row.contentId) clicksByContent.set(row.contentId, row._count._all);
  }

  const submissionClicks = new Map<string, number>();

  return {
    contributor: {
      id: contributor.id,
      nickname: contributor.nickname,
      avatarEmoji: contributor.avatarEmoji,
      totalPoints: globalAgg._sum.points ?? 0,
      campaignPoints: agg._sum.points ?? 0,
    },
    totalClicks: Array.from(clicksByContent.values()).reduce((a, b) => a + b, 0),
    submissions: submissions.map((s) => {
      const contents = s.contents.map((c) => ({
        id: c.id,
        platform: c.platform as Platform,
        title: c.title,
        body: c.body,
        adopted: c.adopted,
        shareToken: c.shareToken,
        clicks: clicksByContent.get(c.id) ?? 0,
      }));
      submissionClicks.set(
        s.id,
        contents.reduce((sum, c) => sum + c.clicks, 0),
      );
      return {
        id: s.id,
        answers: parseJson<Record<string, string>>(s.answers, {}),
        imageUrl: s.imageUrl,
        status: s.status,
        points: s.points,
        riskFlags: parseJson<RiskFlag[]>(s.riskFlags, []),
        createdAt: s.createdAt,
        contents,
      };
    }),
    contributions: contributions.map((c) => ({
      id: c.id,
      points: c.points,
      reason: c.reason,
      breakdown: parseJson<PointItem[]>(c.breakdown, []),
      createdAt: c.createdAt,
    })),
    rewards: rewards.map((r) => ({
      id: r.id,
      tierName: r.tierName,
      title: r.title,
      type: r.type,
      value: r.value,
      code: r.code,
      status: r.status,
    })),
  };
}
