/**
 * 风控检测。
 *
 * 面试里说的「不能简单交稿就给钱，否则会变成廉价刷稿」，落到代码上就是这里。
 * 设计原则：**每个判定都要能对用户解释清楚**，写成 RiskFlag 而不是一个 true/false。
 * Demo 阶段只做能解释、可演示的几条，完整反刷是后置项。
 */
import type { RiskFlag } from "../types";
import { FREE_SUBMISSIONS } from "./scoring";

export interface RiskInput {
  answers: Record<string, string>;
  imageHash?: string | null;
  /** 同活动内已有的图片 hash */
  existingImageHashes: string[];
  /** 同活动内已有的文本答案（拼接过），用于文本查重 */
  existingAnswerTexts: string[];
  /** 该老客在本次活动里已提交次数 */
  priorSubmissions: number;
  bannedWords: string[];
}

/** 联系方式 / 外部链接：本地生活共创里最常见的私域截流，直接拦 */
const CONTACT_PATTERN =
  /(微信|weixin|wechat|vx|v信|威信|扣扣|qq|电话|手机号|加我|私聊)\s*[:：]?\s*[a-zA-Z0-9_\-+]{5,}|\b1[3-9]\d{9}\b|https?:\/\/|www\.[a-z0-9-]+\.[a-z]{2,}/i;

/** 连续重复字符，如「好好好好好」「哈哈哈哈」 */
const REPEATED_CHARS = /(.)\1{3,}/;

/** 纯符号 / 纯字母数字，没有实质中文表达 */
const NO_REAL_TEXT = /^[a-zA-Z0-9\s\p{P}\p{S}]*$/u;

export function detectRisks(input: RiskInput): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const answers = input.answers;

  // 1. 图片查重：同活动内不能重复用同一张图
  if (input.imageHash && input.existingImageHashes.includes(input.imageHash)) {
    flags.push({
      code: "duplicate_image",
      label: "图片重复",
      level: "warn",
      note: "这张图在本次活动里已经提交过了。换一张你自己的实拍图即可正常计分。",
    });
  }

  // 2. 文本查重：整段答案与历史提交高度一致
  const joined = Object.values(answers)
    .map((v) => (v || "").trim())
    .filter(Boolean)
    .join("|");
  if (joined.length > 8 && input.existingAnswerTexts.includes(joined)) {
    flags.push({
      code: "duplicate_text",
      label: "文案重复",
      level: "warn",
      note: "这段内容和之前提交过的完全一致，系统只按一次有效贡献计算。",
    });
  }

  // 3. 文本灌水检测
  const mainText = (answers.feeling || answers.text || joined).trim();
  if (mainText.length > 0) {
    if (mainText.length < 4) {
      flags.push({
        code: "low_quality_text",
        label: "内容过短",
        level: "warn",
        note: "感受写得太短了，AI 没有足够素材加工，多写几个字就能拿满基础分。",
      });
    } else if (REPEATED_CHARS.test(mainText)) {
      flags.push({
        code: "low_quality_text",
        label: "内容疑似灌水",
        level: "warn",
        note: "检测到大量重复字符，这类内容不会进入内容库。",
      });
    } else if (NO_REAL_TEXT.test(mainText)) {
      flags.push({
        code: "low_quality_text",
        label: "内容无实质表达",
        level: "warn",
        note: "没有检测到有效的文字描述。",
      });
    }
  }

  // 4. 私域截流：拦下来，但不封禁，给用户改正机会
  const contactHit = Object.values(answers).find((v) => v && CONTACT_PATTERN.test(v));
  if (contactHit) {
    flags.push({
      code: "contact_leak",
      label: "含联系方式或外链",
      level: "block",
      note: "内容里包含联系方式或外部链接，为避免被平台判为营销号，这段内容不会进入内容库。",
    });
  }

  // 5. 商家合规禁词：老客自己写的话里可能出现「最好吃」这类绝对化用语
  const bannedHit = input.bannedWords.filter((w) => w && joined.includes(w));
  if (bannedHit.length > 0) {
    flags.push({
      code: "banned_words",
      label: "含平台违禁词",
      level: "warn",
      note: `你的话里出现了「${bannedHit.join("、")}」这类平台不喜欢的表述，AI 会在加工时替换成安全说法，不影响计分。`,
    });
  }

  // 6. 频次限制。计数口径是**本次活动累计**（不分天），文案必须如实说明，
  //    并且要指向真正实现了的规则（超出便捷次数后基础分下调），不能承诺没实现的扣减。
  if (input.priorSubmissions >= FREE_SUBMISSIONS) {
    flags.push({
      code: "rate_limit",
      label: "提交频次偏高",
      level: "warn",
      note: `本次活动你已提交 ${input.priorSubmissions} 次（累计，不分天）。第 ${FREE_SUBMISSIONS + 1} 次起基础分下调 —— 重复的同类内容对内容库价值有限。`,
    });
  }

  return flags;
}
