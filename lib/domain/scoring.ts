/**
 * 贡献值规则引擎。
 *
 * 这是面试里那个「交稿就给钱会退化成廉价刷稿」问题的技术答案：
 * 分值必须**可拆解、可解释、分级绑定真实贡献**，而不是提交即全额。
 * 每一条得分都会在界面上写给用户看，让他知道「怎么做才能拿更多」。
 */
import type { PointItem, RiskFlag } from "../types";

export interface ScoreInput {
  answers: Record<string, string>;
  imageUrl?: string | null;
  riskFlags: RiskFlag[];
  /** 该老客在本次活动里已成功提交的次数，用于首次参与奖励 */
  priorSubmissions: number;
  /**
   * 任务卡里必填的**文字**字段。
   *
   * 注意：实拍图存在 submission.imageUrl 而不是 answers 里，
   * 所以它绝不能混进这个列表 —— 否则「必填项完整度」的分母永远差一项，
   * 老客把该填的都填了也拿不到这 5 分。实测踩过这个坑。
   */
  requiredTextFields: { id: string; label: string }[];
  /** 任务卡是否把实拍图设为必填 */
  imageRequired: boolean;
}

export interface ScoreResult {
  breakdown: PointItem[];
  points: number;
  reason: string;
}

/** 基础分：提交一份合格素材的保底，鼓励参与 */
const BASE = 20;
/** 实拍图：可信度的核心，权重刻意给高 */
const IMAGE = 10;
/** 补了具体细节：这是 AI 编不出来的东西，最该奖励 */
const DETAIL = 5;
/** 素材完整度高 */
const COMPLETE = 5;
/** 首次参与本活动 */
const FIRST_TIME = 10;
/** 命中重复图风险 */
const DUPLICATE_PENALTY = -20;

export function scoreSubmission(input: ScoreInput): ScoreResult {
  const breakdown: PointItem[] = [];
  const { answers, requiredTextFields, imageRequired } = input;

  const filledText = requiredTextFields.filter((f) => (answers[f.id] || "").trim().length > 0);
  const missingText = requiredTextFields.filter((f) => !(answers[f.id] || "").trim());
  const missingImage = imageRequired && !input.imageUrl;

  breakdown.push({
    label: "提交合格素材",
    points: BASE,
    note: "保底分，鼓励参与 —— 先愿意开口，才谈得上共创。",
  });

  if (input.imageUrl) {
    breakdown.push({
      label: "提供实拍图",
      points: IMAGE,
      note: "实拍图是可信度的地基，也是各平台判定真实内容最认的信号。",
    });
  }

  const detailText = (answers.detail || "").trim();
  if (detailText.length >= 6) {
    breakdown.push({
      label: "补充了具体细节",
      points: DETAIL,
      note: "细节是 AI 编不出来的东西，也是这套内容区别于纯 AI 写稿的地方。",
    });
  }

  if (missingText.length === 0 && !missingImage) {
    breakdown.push({
      label: "素材完整度高",
      points: COMPLETE,
      note: `必填项 ${filledText.length}/${requiredTextFields.length} 项文字均已填写${
        imageRequired ? "，实拍图已提供" : ""
      }，可直接进入加工。`,
    });
  } else {
    breakdown.push({
      label: "素材有缺项",
      points: 0,
      note: `缺少：${[
        ...missingText.map((f) => f.label),
        ...(missingImage ? ["实拍图"] : []),
      ].join("、")}。内容会偏单薄，补齐可拿满分。`,
    });
  }

  if (input.priorSubmissions === 0) {
    breakdown.push({
      label: "首次参与本活动",
      points: FIRST_TIME,
      note: "新人加权，让老客第一次参与就能拿到第一档福利。",
    });
  }

  // 风控扣分：只扣分不封号，并且告诉用户为什么 —— 惩罚要可解释才有约束力
  const duplicate = input.riskFlags.find((f) => f.code === "duplicate_image");
  if (duplicate) {
    breakdown.push({
      label: "图片重复",
      points: DUPLICATE_PENALTY,
      note: "同活动内已收到过相同图片，重复提交不计入有效贡献。",
    });
  }

  const blocked = input.riskFlags.filter((f) => f.level === "block");
  if (blocked.length > 0) {
    return {
      breakdown: [
        ...breakdown,
        {
          label: "内容未通过风控",
          points: 0,
          note: blocked.map((b) => b.note).join("；"),
        },
      ],
      points: 0,
      reason: `未通过风控：${blocked.map((b) => b.label).join("、")}`,
    };
  }

  const points = Math.max(0, breakdown.reduce((sum, item) => sum + item.points, 0));

  const positiveLabels = breakdown.filter((b) => b.points > 0).map((b) => b.label);
  const reason = positiveLabels.length
    ? `${positiveLabels.join(" + ")}，合计 ${points} 贡献值`
    : `本次未获得贡献值，合计 ${points}`;

  return { breakdown, points, reason };
}

/** 内容被商家采用时的追加分 —— 质量导向，而不是提交导向 */
export const ADOPT_BONUS = 30;

export function adoptPointItem(): PointItem {
  return {
    label: "内容被商家采用",
    points: ADOPT_BONUS,
    note: "质量导向：只有被商家真正用起来的内容才拿这一档。",
  };
}

/** 内容带来有效点击回流的加分与封顶 —— 奖励绑定真实引流效果的关键 */
export const CLICK_POINT = 5;
export const CLICK_CAP = 50;

export function clickPointItem(clickCount: number): PointItem {
  return {
    label: "内容带来有效点击",
    points: CLICK_POINT,
    note: `本次分享带来第 ${clickCount} 次有效回流，+${CLICK_POINT}（该项封顶 ${CLICK_CAP}）。`,
  };
}

/**
 * 奖励阶梯的规范阈值。
 *
 * 这是**经济规则，不是内容创作**，所以不交给模型决定。
 * 实测教训：模型不知道本系统的积分尺度，会给出 threshold = 1/3/5 这种量级，
 * 结果老客提交一次（单次就能拿 50 分）就解锁全部福利，商家预算瞬间被击穿。
 * 所以 AI 只负责写档位名、福利内容和面额，阈值一律由这里强制映射。
 */
const THRESHOLD_LADDER: Record<number, number[]> = {
  1: [50],
  2: [50, 150],
  3: [50, 120, 260],
  4: [50, 100, 180, 300],
};

export function canonicalThresholds(count: number): number[] {
  if (count <= 0) return [];
  const known = THRESHOLD_LADDER[count];
  if (known) return known;

  // 档位数超出预设时，在 50~300 之间均分
  const min = 50;
  const max = 300;
  return Array.from({ length: count }, (_, i) =>
    Math.round(min + ((max - min) * i) / (count - 1)),
  );
}
