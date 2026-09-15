import { randomBytes, randomUUID } from "node:crypto";

const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz"; // 去掉易混字符 0/1/o/l

function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** 活动免登录入口短码，用在 /c/[token] */
export function campaignToken(): string {
  return randomCode(10);
}

/** 内容分享短码，用在 /s/[shareToken]，承载引流归因 */
export function shareToken(): string {
  return randomCode(10);
}

/** 老客身份令牌（写进 cookie） */
export function viewerToken(): string {
  return randomUUID();
}

/** 奖励券码，人可读、可核销 */
export function couponCode(prefix = "CC"): string {
  return `${prefix}-${randomCode(4).toUpperCase()}-${randomCode(4).toUpperCase()}`;
}
