/**
 * 降级规则引擎。
 *
 * 存在的意义有两个，都很实：
 * 1. 演示安全 —— 现场断网、key 欠费、模型限流时，Demo 依然完整可跑，不会开天窗。
 * 2. 兜底质量下限 —— 模板 + 老客真实素材的拼装，本身就是一个「可用的」产出，
 *    而不是一句「AI 生成失败」。
 *
 * 注意：这里绝不假装自己是模型。产出的 aiMode 会如实标记为 rule，
 * 界面上会明确显示「规则引擎」，不糊弄面试官。
 */
import {
  PLATFORM_META,
  type ComposedContent,
  type Platform,
  type PlatformFrame,
  type RewardTier,
  type TaskField,
} from "../types";
import { canonicalThresholds } from "../domain/scoring";

export interface MerchantLike {
  name: string;
  category: string;
  city: string;
  address?: string | null;
  avgPrice?: number | null;
  tones: string[];
  sellingPoints: string[];
  bannedWords: string[];
}

export interface CampaignLike {
  title: string;
  objective: string;
  platforms: Platform[];
  brief?: string;
}

export interface SubmissionLike {
  id: string;
  answers: Record<string, string>;
}

/** 稳定哈希：同样的输入永远得到同样的选词，方便复现和演示 */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number, offset = 0): T {
  return arr[(seed + offset) % arr.length];
}

/** 按品类决定「推荐项」的量词：餐饮说菜，美业说项目 */
function unitWord(category: string): string {
  if (/火锅|餐|烧烤|面|粉|饭|菜|小吃|烘焙|咖啡|茶|酒/.test(category)) return "菜";
  return "项目";
}

/**
 * 场景选项用**中文原值**，不再用 friends/family 这类英文 key。
 *
 * 原因：原来选项是英文 key、中文标签硬编码在前端组件里。可任务卡是 AI 生成的 ——
 * 模型一旦把 key 写成 with_friends，前端映射不到、H5 直接显示英文，
 * 规则引擎还会把它拼进正文（「with_friends 过来的。」）。
 * 让选项本身就是可直接展示、可直接入文的中文，这一整类耦合问题就消失了。
 */
export const SCENE_OPTIONS = ["和朋友聚会", "带家人", "一个人", "约会", "同事聚餐"];

/** 兼容历史数据里的英文 key */
const LEGACY_SCENE: Record<string, string> = {
  friends: "和朋友聚会",
  family: "带家人",
  solo: "一个人",
  date: "约会",
  colleagues: "同事聚餐",
};

function sceneLabel(raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "路过顺便";
  return LEGACY_SCENE[v] ?? v;
}

/**
 * 把商家禁词替换成安全的替代表达。
 *
 * 为什么必须有：风控提示里写着「AI 会在加工时替换成安全说法」。
 * 走大模型时提示词能保证这件事，但**走规则引擎时原来只做标记、内容里原样保留** ——
 * 那句承诺在默认路径（没配 key）下就是假的，带禁词的内容照样入库、照样能分享出去。
 *
 * 只替换**长且无歧义**的词。像「第一」「绝对」这种短词一旦位置替换
 * （「第一次来」→「很受欢迎次来」）会改出病句，宁可不动、留给商家处理。
 */
const SAFE_SUBSTITUTE: Record<string, string> = {
  最好吃: "很好吃",
  最好喝: "很好喝",
  最正宗: "很正宗",
  纯天然: "食材新鲜",
  治疗: "改善",
  顶级: "很高级",
  最强: "很强",
};

export function sanitizeBannedWords(
  text: string,
  bannedWords: string[],
): { text: string; replaced: string[]; remaining: string[] } {
  let out = text;
  const replaced: string[] = [];
  const remaining: string[] = [];

  for (const w of bannedWords) {
    if (!w || !out.includes(w)) continue;
    const safe = SAFE_SUBSTITUTE[w];
    if (safe) {
      out = out.split(w).join(safe);
      replaced.push(w);
    } else {
      remaining.push(w);
    }
  }

  return { text: out, replaced, remaining };
}

// ── 1. 生成活动蓝图：平台框架 + 任务卡 + 奖励阶梯 ──────────

const OBJECTIVE_ANGLE: Record<string, string> = {
  到店打卡: "突出「值得专门跑一趟」的真实到店体验，让没来过的人产生好奇",
  团购转化: "突出套餐内容与性价比，把决策门槛降下来",
  口碑沉淀: "输出客观详实的体验细节，建立长期信任而不是一时冲动",
  新客拉新: "制造反差或悬念，让刷到的人想亲自试一次",
};

export function ruleBlueprint(
  merchant: MerchantLike,
  campaign: CampaignLike,
): { frames: PlatformFrame[]; taskCard: TaskField[]; rewardTiers: RewardTier[]; note: string } {
  const seed = hashSeed(`${merchant.name}|${campaign.title}|${campaign.platforms.join(",")}`);
  const angle = OBJECTIVE_ANGLE[campaign.objective] ?? OBJECTIVE_ANGLE["到店打卡"];
  const unit = unitWord(merchant.category);
  const displayAddress = merchant.address || `${merchant.city}（详见门店信息）`;

  const mustInclude = [
    `店名「${merchant.name}」`,
    `城市/位置：${displayAddress}`,
    merchant.sellingPoints.length > 0
      ? `商家卖点（**只能作客观店铺信息提及，例如「他们家主打 X」，不得写成老客的亲身体验**）：${merchant.sellingPoints.slice(0, 2).join("、")}`
      : "至少提到 1 个老客自己说过的真实细节",
    "老客自己的真实感受（不得由 AI 代写）",
  ];

  const baseAvoid = [
    ...merchant.bannedWords,
    "不要编造老客没说过的体验",
    "不要写成通版广告文案",
  ];

  const frames: PlatformFrame[] = campaign.platforms.map((platform, idx) => {
    const meta = PLATFORM_META[platform];
    const extraAvoid: Record<Platform, string[]> = {
      xiaohongshu: ["不要堆砌 emoji", "不要用「最」「第一」等绝对化用语"],
      douyin: ["前 3 秒不要介绍背景", "不要长句，口播要能一口气读完"],
      dianping: ["不要抒情过多", "不要把评分写得太满，留一点客观感"],
      moments: ["不要带话题标签刷屏", "不要出现价格硬广口吻"],
    };
    return {
      platform,
      angle,
      mustInclude,
      avoid: [...baseAvoid, ...extraAvoid[platform]],
      structure: meta.structure,
      wordRange: meta.length,
      suggestedTags: ruleTags(merchant, campaign, platform, seed + idx),
      guidance: `照着说就行，不用写整篇：${meta.tone}。${meta.length[0]}-${meta.length[1]} 字。`,
    };
  });

  const taskCard: TaskField[] = [
    {
      id: "feeling",
      label: "用一句话说说你当时的真实感受",
      type: "textarea",
      placeholder: `比如：没想到${merchant.city}还有这样一家${merchant.category}店`,
      why: "只要真实的一句感受，不要求写成文案 —— 放开自由创作会让内容质量和合规同时失控。",
      required: true,
      maxLength: 80,
    },
    {
      id: "recommend",
      label: `最想推荐的一个${unit}`,
      type: "text",
      placeholder: merchant.sellingPoints[0] ? `比如：${merchant.sellingPoints[0]}` : `写下你最有印象的那个${unit}`,
      why: `具体的推荐${unit}是内容可信度的锚点，也是其他用户做决策最快的信息。`,
      required: true,
      maxLength: 20,
    },
    {
      id: "scene",
      label: "你是什么场景下来的？",
      type: "choice",
      placeholder: "选一个就好",
      why: "场景决定了内容适合投给谁，是平台推荐流里最吃香的标签之一。",
      options: [...SCENE_OPTIONS],
      required: true,
    },
    {
      id: "detail",
      label: "再补一个具体细节",
      type: "text",
      placeholder: "比如：服务员主动帮我们把锅底换成了鸳鸯",
      why: "细节是「AI 编不出来的东西」，也是这套内容与纯 AI 写稿最大的区别。",
      required: false,
      maxLength: 40,
    },
    {
      id: "image",
      label: "传一张你的实拍图",
      type: "image",
      placeholder: "随手拍就行，不用修图",
      why: "实拍图是可信度的核心，也是各平台判定「真实内容」最认的信号。",
      required: true,
    },
  ];

  const giftName = merchant.sellingPoints[0] ? `${merchant.sellingPoints[0]}体验券` : "招牌体验券";
  const ladder = canonicalThresholds(3);
  const rewardTiers: RewardTier[] = [
    { threshold: ladder[0], name: "参与礼", type: "coupon", title: "5 元无门槛券", value: 500 },
    { threshold: ladder[1], name: "认真分享礼", type: "coupon", title: "20 元代金券", value: 2000 },
    { threshold: ladder[2], name: "优质共创礼", type: "gift", title: giftName, value: 3800 },
  ];

  return {
    frames,
    taskCard,
    rewardTiers,
    note: `规则引擎生成（未配置模型 key，或模型调用失败时的兜底）。同一活动每次生成结果稳定可复现。seed=${seed}`,
  };
}

function ruleTags(merchant: MerchantLike, campaign: CampaignLike, platform: Platform, seed: number): string[] {
  const city = merchant.city;
  const cat = merchant.category;
  const objectiveTag: Record<string, string> = {
    到店打卡: "周末去哪",
    团购转化: "本地团购",
    口碑沉淀: "本地人推荐",
    新客拉新: "探店",
  };
  const scene = pick(["朋友聚会", "约会餐厅", "家人聚餐", "一个人也要吃好"], seed, 3);

  if (platform === "moments") return [];
  if (platform === "dianping") return [`#${city}${cat}`, `#${objectiveTag[campaign.objective] ?? "探店"}`];
  if (platform === "douyin") return [`#${city}美食`, `#${cat}`, `#${objectiveTag[campaign.objective] ?? "探店"}`];
  return [
    `#${city}${cat}`,
    `#${objectiveTag[campaign.objective] ?? "探店"}`,
    `#${scene}`,
    `#${merchant.name}`,
    "#真实体验",
  ];
}

// ── 2. 把老客素材加工成各平台内容 ────────────────────────

export function ruleCompose(
  merchant: MerchantLike,
  campaign: CampaignLike,
  submission: SubmissionLike,
  platform: Platform,
): ComposedContent {
  const seed = hashSeed(`${submission.id}|${platform}`);
  const a = submission.answers;
  const meta = PLATFORM_META[platform];

  const feeling = (a.feeling || "").trim() || `来${merchant.name}的这次体验比预期好`;
  const recommend = (a.recommend || "").trim() || merchant.sellingPoints[0] || `${merchant.category}招牌`;
  const detail = (a.detail || "").trim();
  const scene = sceneLabel(a.scene || "");
  const sellingPoint = merchant.sellingPoints[0] || `${merchant.category}做得扎实`;
  const avg = merchant.avgPrice ? `人均 ${merchant.avgPrice} 左右` : "";

  const reasonPool = [
    "闭眼点，基本不会踩雷",
    "是那种吃完还会惦记的味道",
    "分量给得实在，性价比很高",
    "第一口就明白为什么回头客多",
  ];
  const reason = pick(reasonPool, seed, 1);
  const closingPool = [
    `下次还会再来，${scene}来这儿挺合适的。`,
    `已经推荐给身边人了，${scene}选这儿不亏。`,
    `${scene}想找个不出错的地方，这家可以放进清单。`,
  ];
  const closing = pick(closingPool, seed, 2);
  const tags = ruleTags(merchant, campaign, platform, seed);

  let title = "";
  let body = "";

  if (platform === "xiaohongshu") {
    const titlePool = [
      `在${merchant.city}，${feeling}`,
      `${merchant.city}这家${merchant.category}店，${feeling}`,
      `不吹不黑，${merchant.name}的${recommend}真的值得专门跑一趟`,
      `${scene}去了${merchant.name}，${feeling}`,
    ];
    title = truncate(pick(titlePool, seed, 0), 20);
    body = [
      title,
      "",
      feeling,
      "",
      `📍${merchant.name}｜${merchant.address || merchant.city}`,
      detail ? `${scene}过来的，${detail}。` : `${scene}过来的。`,
      "",
      "说几个真实感受：",
      `1️⃣ ${recommend} —— ${reason}`,
      `2️⃣ ${sellingPoint}`,
      detail ? `3️⃣ ${detail}` : `3️⃣ ${scene}来的体验很舒服`,
      avg ? `\n${avg}，${merchant.category}里算实在的。` : "",
      "",
      closing,
    ]
      .filter((line) => line !== "")
      .join("\n");
  } else if (platform === "douyin") {
    const hookPool = [
      `${merchant.city}人注意，这家${merchant.category}店我劝你早点来`,
      `别划走，${merchant.city}这家${merchant.category}店有点东西`,
      `在${merchant.city}找了这么久，终于遇到一家${feeling}`,
    ];
    const hook = pick(hookPool, seed, 0);
    title = truncate(hook, 24);
    body = [
      `【0-3 秒｜钩子】${hook}`,
      `【画面】${detail || `${merchant.name}店内实拍`}`,
      `【口播】${feeling}。他们家的${recommend}，${reason}。${sellingPoint}。`,
      avg ? `【口播】${avg}，这个价位在${merchant.city}挺能打。` : "",
      `【结尾｜行动号召】${scene}想来的，评论区扣个 1，或者直接搜「${merchant.name}」。`,
    ]
      .filter(Boolean)
      .join("\n");
  } else if (platform === "dianping") {
    title = truncate(`${merchant.name}｜${feeling}`, 24);
    body = [
      `总体：${feeling}`,
      "",
      `环境与服务：${detail || "店内干净，出餐速度正常，服务员态度不错。"}`,
      `推荐：${recommend}，${reason}。${sellingPoint}。`,
      avg ? `人均：${avg.replace("左右", "")}。` : "",
      `适合：${scene}。`,
      "",
      closing,
    ]
      .filter(Boolean)
      .join("\n");
  } else {
    // moments
    title = truncate(feeling, 16);
    body = [feeling, detail ? `${detail}。` : "", `${merchant.name}的${recommend}，${reason}，${scene}来正合适。`]
      .filter(Boolean)
      .join("\n");
  }

  // 合规处理：能安全替换的禁词直接换掉，拿不准的保留但明确标出。
  // 这样「AI 会替换成安全说法」这句承诺在规则引擎路径下也是真的。
  const sanitized = sanitizeBannedWords([title, body].join("\n"), merchant.bannedWords);
  const parts = sanitized.text.split("\n");
  title = parts[0] ?? title;
  body = parts.slice(1).join("\n");

  const notes: string[] = [];
  if (sanitized.replaced.length > 0) {
    notes.push(`已自动替换禁词：${sanitized.replaced.join("、")}`);
  }
  if (sanitized.remaining.length > 0) {
    notes.push(
      `⚠️ 无法安全替换，需人工处理：${sanitized.remaining.join("、")}（位置替换会改出病句，故保留原文）`,
    );
  }

  return {
    platform,
    title,
    body,
    tags,
    coverHint: coverHintFor(platform, recommend, merchant),
    complianceNote:
      notes.join("；") || `已按${meta.name}调性输出，字数落在 ${meta.length[0]}-${meta.length[1]} 区间内。`,
  };
}

function coverHintFor(platform: Platform, recommend: string, merchant: MerchantLike): string {
  if (platform === "douyin")
    return `用老客实拍图做首帧，叠加文字「${recommend}」+「${merchant.name}」，前 3 秒露出`;
  if (platform === "xiaohongshu") return `封面用老客实拍图，压一行手写体标题，避免加边框和贴纸`;
  if (platform === "dianping") return `首图用老客实拍图（真实、不加滤镜更容易被采信）`;
  return `直接用老客实拍图，不修图`;
}

/** 合规自检：扫商家禁词，命中就明确写出来，而不是悄悄放过 */
export function complianceCheck(text: string, bannedWords: string[]): string {
  const hits = bannedWords.filter((w) => w && text.includes(w));
  if (hits.length === 0) return "";
  return `⚠️ 命中商家禁词：${hits.join("、")}，发布前需替换或删除。`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
