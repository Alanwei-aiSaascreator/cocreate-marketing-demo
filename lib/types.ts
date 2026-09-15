/**
 * 领域类型定义。
 * 所有 DB 里的 JSON 字段都对应这里的一个类型，读写统一走 lib/json.ts。
 */

// ── 平台 ────────────────────────────────────────────────
export const PLATFORMS = ["xiaohongshu", "douyin", "dianping", "moments"] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface PlatformMeta {
  id: Platform;
  name: string;
  emoji: string;
  /** 一句话调性，直接进提示词 */
  tone: string;
  /** 内容结构骨架 */
  structure: string[];
  /** 正文字数区间 */
  length: [number, number];
  /** 话题标签风格 */
  tagStyle: string;
  /** 展示用主色 */
  accent: string;
  /**
   * 该平台的网页版创作入口。
   *
   * **留空表示这个平台没有可用的网页发布入口**（只能在 App 内发）。
   * 这类平台必须如实说明并给出行之有效的替代路径，
   * 而不是塞一个点进去没用的链接 —— 那比不给链接更浪费时间。
   */
  publishUrl?: string;
  /** 发布方式说明，原样展示给商家看 */
  publishNote: string;
}

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  xiaohongshu: {
    id: "xiaohongshu",
    name: "小红书",
    emoji: "📕",
    tone: "像闺蜜安利，真诚、有细节、带情绪，多用 emoji 和口语化短句，绝不写成广告",
    structure: ["钩子标题（带情绪或反差）", "我为什么来 / 第一印象", "分点讲真实体验细节", "推荐给谁 / 值不值得来", "话题标签"],
    length: [300, 600],
    tagStyle: "3-6 个话题标签，含 1 个城市词 + 1 个品类词 + 1 个场景词",
    accent: "#ff2442",
    publishUrl: "https://creator.xiaohongshu.com/publish/publish",
    publishNote: "网页版创作中心可以直接发图文：标题、正文、标签都能粘贴，实拍图另存后上传。",
  },
  douyin: {
    id: "douyin",
    name: "抖音",
    emoji: "🎵",
    tone: "口播感，节奏快，前 3 秒必须抓人，短句、有画面感、有行动号召",
    structure: ["开场钩子（前 3 秒，反差/悬念/痛点）", "场景描述（画面感）", "核心体验 1-2 个点", "行动号召（到店/团购）"],
    length: [80, 150],
    tagStyle: "2-4 个标签，含地域词和品类词，避免堆砌",
    accent: "#000000",
    publishUrl: "https://creator.douyin.com/",
    publishNote: "网页版创作者中心可上传，但这条是口播文案 —— 需要自己录一段或配画面，它本身不是成片。",
  },
  dianping: {
    id: "dianping",
    name: "大众点评",
    emoji: "🍜",
    tone: "客观详实，信息密度高，像老食客认真写评价，帮别人做决策",
    structure: ["总体评价一句话", "环境 / 服务", "推荐菜或推荐项目（带具体理由）", "人均与性价比", "适合场景与结论"],
    length: [150, 300],
    tagStyle: "标签少而准，2-3 个",
    accent: "#ff6633",
    publishNote: "点评没有网页发布入口，只能在「大众点评」App 里发。复制文案 → 到店铺页写评价 → 粘贴。",
  },
  moments: {
    id: "moments",
    name: "朋友圈",
    emoji: "💬",
    tone: "生活化、克制、不像广告，像随手一发，熟人会更愿意点开",
    structure: ["一句真实感受", "一个具体细节或画面", "（可选）一句轻推荐"],
    length: [30, 80],
    tagStyle: "不加话题标签，最多 2 个 emoji",
    accent: "#07c160",
    publishNote: "朋友圈只能在微信 App 内发。这条通常是发给老客本人、让他自己发的，不建议商家代发。",
  },
};

// ── AI 生成的平台内容框架 ────────────────────────────────
export interface PlatformFrame {
  platform: Platform;
  /** 本次创作要打的切入点 */
  angle: string;
  /** 必须出现的信息（店名、地址、招牌等） */
  mustInclude: string[];
  /** 表达上的禁忌，来自商家合规禁词 + 平台特性 */
  avoid: string[];
  structure: string[];
  /** 目标字数 */
  wordRange: [number, number];
  /** 建议话题标签 */
  suggestedTags: string[];
  /** 让老客照着说的引导语 */
  guidance: string;
}

// ── 派给老客的轻量任务卡 ─────────────────────────────────
export interface TaskField {
  id: string;
  label: string;
  /** text | textarea | choice | image */
  type: "text" | "textarea" | "choice" | "image";
  placeholder: string;
  /** 设计意图说明，商家后台展示，体现「不放开自由创作」的产品判断 */
  why: string;
  options?: string[];
  required: boolean;
  maxLength?: number;
}

// ── 奖励阶梯 ────────────────────────────────────────────
export interface RewardTier {
  /** 达到该贡献值即解锁 */
  threshold: number;
  name: string;
  type: "coupon" | "gift";
  title: string;
  /** 单位：分 */
  value: number;
}

// ── 贡献值拆解 ──────────────────────────────────────────
export interface PointItem {
  label: string;
  points: number;
  note: string;
}

// ── 风控标记 ────────────────────────────────────────────
export interface RiskFlag {
  /** duplicate_image | low_quality_text | spam_pattern | rate_limit */
  code: string;
  label: string;
  /** info | warn | block */
  level: "info" | "warn" | "block";
  note: string;
}

// ── AI 产出的多平台内容 ──────────────────────────────────
export interface ComposedContent {
  platform: Platform;
  title: string;
  body: string;
  tags: string[];
  coverHint: string;
  complianceNote: string;
}

export type AiMode = "llm" | "rule";

/**
 * 内容的产出引擎。
 *
 * 同一份素材、同一个平台**可以同时存两版**（rule 和 llm），用于在后台对比两种产出。
 * 只有 `isPrimary` 的那一版参与内容库计数、闭环漏斗和 AI 质量比例 ——
 * 否则给每条内容都存一份对比版，比例会变成假的 50/50，那样比不统计更误导人。
 */
export type ContentVariant = AiMode;

export const VARIANT_LABEL: Record<ContentVariant, string> = {
  llm: "大模型",
  rule: "规则引擎",
};

export const VARIANT_HINT: Record<ContentVariant, string> = {
  llm: "模型根据老客素材现场组织的表达",
  rule: "内置模板 + 槽位填充的产出：离线可用，但不懂语义、不会组织叙事",
};
