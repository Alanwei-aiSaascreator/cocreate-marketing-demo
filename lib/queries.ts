/**
 * 数据读取层：把 Prisma 行里的 JSON 字段解开成领域对象，页面只拿类型化的数据。
 * 聚合逻辑刻意放在 JS 里做而不是全塞 SQL —— Demo 数据量小，可读性优先。
 */
import { prisma } from "./db";
import { parseJson } from "./json";
import { viewerToken as newViewerToken } from "./ids";
import type {
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

export interface DecodedContent {
  id: string;
  platform: Platform;
  title: string;
  body: string;
  tags: string[];
  coverHint: string;
  complianceNote: string;
  aiMode: string;
  adopted: boolean;
  shareToken: string;
  createdAt: Date;
  submissionId: string;
  contributor: { id: string; nickname: string; avatarEmoji: string };
  answers: Record<string, string>;
  imageUrl: string | null;
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

export interface WorkspaceMetrics {
  submissions: number;
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

  const contents: DecodedContent[] = row.contents.map((c) => ({
    id: c.id,
    platform: c.platform as Platform,
    title: c.title,
    body: c.body,
    tags: parseJson<string[]>(c.tags, []),
    coverHint: c.coverHint,
    complianceNote: c.complianceNote,
    aiMode: c.aiMode,
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
  }));

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

  const metrics: WorkspaceMetrics = {
    submissions: submissions.length,
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

  return {
    merchant: decodeMerchant(row.merchant),
    campaign: decodeCampaign(row),
    submissions,
    contents,
    contributions,
    rewards,
    leaderboard,
    metrics,
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
  return prisma.contributor.create({
    data: {
      viewerToken: token || newViewerToken(),
      nickname: `老客${suffix}`,
      avatarEmoji: emojis[Math.floor(Math.random() * emojis.length)],
      sourceChannel: "link",
    },
  });
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

export interface ContributorDashboard {  contributor: {
    id: string;
    nickname: string;
    avatarEmoji: string;
    totalPoints: number;
    campaignPoints: number;
  };
  submissions: {
    id: string;
    answers: Record<string, string>;
    imageUrl: string | null;
    status: string;
    points: number;
    riskFlags: RiskFlag[];
    createdAt: Date;
    contents: { id: string; platform: Platform; title: string; adopted: boolean; shareToken: string }[];
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
      include: { contents: true },
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

  return {
    contributor: {
      id: contributor.id,
      nickname: contributor.nickname,
      avatarEmoji: contributor.avatarEmoji,
      totalPoints: globalAgg._sum.points ?? 0,
      campaignPoints: agg._sum.points ?? 0,
    },
    submissions: submissions.map((s) => ({
      id: s.id,
      answers: parseJson<Record<string, string>>(s.answers, {}),
      imageUrl: s.imageUrl,
      status: s.status,
      points: s.points,
      riskFlags: parseJson<RiskFlag[]>(s.riskFlags, []),
      createdAt: s.createdAt,
      contents: s.contents.map((c) => ({
        id: c.id,
        platform: c.platform as Platform,
        title: c.title,
        adopted: c.adopted,
        shareToken: c.shareToken,
      })),
    })),
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
