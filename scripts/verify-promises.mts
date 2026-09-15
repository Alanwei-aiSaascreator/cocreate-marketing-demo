/**
 * 「承诺验证」—— 专门盯住一类最难发现的问题：**注释/文案承诺了，代码没做。**
 *
 * 这类问题比 bug 更坏：它让读代码的人（包括未来的自己）建立错误的心智模型。
 * 本项目实测踩到过 4 处：
 *   1. `LLM_MODE=llm` 声称「失败即报错」，实际与 auto 完全一样，静默退回模板
 *   2. 频次提示声称「超出部分不计入有效贡献」，实际什么都没做，第 4 次照样拿满分
 *   3. 禁词提示声称「AI 会替换成安全说法」，走规则引擎时却只标记、原文保留
 *   4. `compare-engines.ts` 声称「模型有问题会直接报错暴露」，实际会打印一段
 *      模板内容并正常退出 —— 恰好制造了它声称要避免的误解
 *
 * 光把它们改对不够 —— 得有人盯着别再退化回去。这个脚本就是那个"人"。
 *
 * 用法：pnpm verify:promises
 * 特点：不需要 dev server（纯函数级验证），把模型强制指向不可达地址
 *      来测「失败路径」，而不是依赖真的断网。
 */
import "dotenv/config";

// 制造一个「模型一定失败」的环境：端口 9（discard）会立刻 ECONNREFUSED。
// 必须在 import AI 模块之前设置 —— llmConfig() 是调用时读 env，但环境要先就位。
process.env.LLM_API_KEY = "sk-fake-for-promise-verification";
process.env.LLM_BASE_URL = "http://127.0.0.1:9";

import { spawnSync } from "node:child_process";
import { ruleCompose, sanitizeBannedWords } from "../lib/ai/rules";
import { scoreSubmission } from "../lib/domain/scoring";
import { composeContents, generateBlueprint } from "../lib/ai";

const merchant = {
  name: "承诺验证小馆",
  category: "火锅",
  city: "成都",
  address: "测试路 1 号",
  avgPrice: 88,
  tones: ["实在"],
  sellingPoints: ["现炒牛油锅底"],
  bannedWords: ["最好吃", "第一", "纯天然"],
};
const campaign = {
  title: "承诺验证活动",
  objective: "到店打卡",
  platforms: ["xiaohongshu"] as string[],
  brief: "",
};

let pass = 0;
let fail = 0;

function check(cond: boolean, name: string, detail = "") {
  if (cond) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? ` \x1b[90m${detail}\x1b[0m` : ""}`);
  } else {
    fail++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` \x1b[90m${detail}\x1b[0m` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

console.log("\n\x1b[1m承诺验证\x1b[0m  逐条实测「注释说的」和「代码做的」是否一致");
console.log("\x1b[90m（模型已强制指向不可达地址 http://127.0.0.1:9）\x1b[0m");

// ── 1. LLM_MODE=llm 的「失败即报错」──
section("1. LLM_MODE=llm 是严格模式（失败即报错，不静默降级）");

process.env.LLM_MODE = "auto";
try {
  const r = await composeContents(merchant, campaign, { id: "p1", answers: { feeling: "还行" } }, [], "");
  check(
    r.degraded === true && r.aiMode === "rule",
    "auto 模式：失败时降级为 rule（这是设计，不是 bug）",
    `degraded=${r.degraded}`,
  );
} catch (e) {
  check(false, "auto 模式：应降级而不是抛错", String(e));
}

process.env.LLM_MODE = "llm";
try {
  const r = await composeContents(merchant, campaign, { id: "p2", answers: { feeling: "还行" } }, [], "");
  check(false, "llm 模式：composeContents 必须抛错", `竟然返回了 aiMode=${r.aiMode}`);
} catch (e) {
  check(true, "llm 模式：composeContents 抛错", String(e instanceof Error ? e.message : e).slice(0, 64));
}

try {
  await generateBlueprint(merchant, campaign);
  check(false, "llm 模式：generateBlueprint 必须抛错", "竟然返回了");
} catch (e) {
  check(true, "llm 模式：generateBlueprint 抛错", String(e instanceof Error ? e.message : e).slice(0, 64));
}

// ── 2. 频次提示的「超出部分不计入有效贡献」──
section("2. 频次超出后真的降分（而不是只在提示里说说）");

const baseArgs = {
  answers: { feeling: "锅底很香", detail: "服务员主动加了冰粉" },
  hasImage: true,
  riskFlags: [] as { code: string; label: string; level: "info" | "warn" | "block"; note: string }[],
  requiredTextFields: [{ id: "feeling", label: "感受" }],
  imageRequired: true,
};

const first = scoreSubmission({ ...baseArgs, priorSubmissions: 0 });
const fourth = scoreSubmission({ ...baseArgs, priorSubmissions: 3 });
const firstBase = first.breakdown.find((b) => b.label.includes("提交"))!;
const fourthBase = fourth.breakdown.find((b) => b.label.includes("提交"))!;

check(firstBase.points === 20, "第 1 次：基础分 20", `${firstBase.label} ${firstBase.points}`);
check(fourthBase.points === 5, "第 4 次：基础分真降到 5", `${fourthBase.label} ${fourthBase.points}`);
check(fourth.points < first.points, "第 4 次总分确实更低", `${first.points} → ${fourth.points}`);
check(
  !fourthBase.note.includes("不计入"),
  "文案不再承诺没实现的「不计入有效贡献」",
  fourthBase.note.slice(0, 40),
);

// ── 3. 禁词替换的承诺（规则引擎路径）──
section("3. 规则引擎路径下真的替换禁词（不是只标记）");

const composed = ruleCompose(
  merchant,
  campaign,
  {
    id: "p3",
    answers: {
      feeling: "这家绝对是我在成都吃过最好吃的火锅",
      recommend: "现炒牛油锅底",
      scene: "和朋友聚会",
      detail: "带了三拨朋友来",
    },
  },
  "xiaohongshu",
);

check(!composed.body.includes("最好吃"), "正文里已无「最好吃」", composed.body.includes("很好吃") ? "替换为「很好吃」" : "已移除");
check(
  composed.complianceNote.includes("已自动替换禁词"),
  "合规说明如实标注替换了什么",
  composed.complianceNote.slice(0, 40),
);

const partial = sanitizeBannedWords("这是第一好吃的火锅，纯天然无添加", ["第一", "纯天然", "最好吃"]);
check(
  partial.replaced.includes("纯天然") && partial.remaining.includes("第一"),
  "长且无歧义的词替换、短词保留并标出（避免改出病句）",
  `替换[${partial.replaced}] 保留[${partial.remaining}]`,
);

// ── 4. compare-engines.ts 的「模型有问题会直接报错暴露」──
section("4. compare-engines.ts 在模型不可用时真的报错暴露");

const res = spawnSync("npx", ["tsx", "scripts/compare-engines.ts"], {
  env: {
    ...process.env,
    LLM_MODE: "llm",
    LLM_BASE_URL: "http://127.0.0.1:9",
    LLM_API_KEY: "sk-fake-for-promise-verification",
    LLM_MODEL: "deepseek-chat",
  },
  encoding: "utf8",
  shell: true,
  timeout: 120_000,
});

const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
check(res.status !== 0, "以非 0 退出（而不是正常退出）", `退出码 ${res.status}`);
check(
  out.includes("失败："),
  "打印的是错误，而不是一大段看似正常的模板产出",
  out.includes("失败：") ? "含错误信息" : "未见到错误信息",
);

console.log(
  `\n\x1b[1m结果：\x1b[0m \x1b[32m${pass} 通过\x1b[0m` +
    (fail > 0 ? `，\x1b[31m${fail} 失败\x1b[0m` : "") +
    `\n\x1b[90m这些断言守的是「注释承诺 == 代码行为」。改动 AI 层或计分规则后请重跑。\x1b[0m\n`,
);

process.exit(fail > 0 ? 1 : 0);
