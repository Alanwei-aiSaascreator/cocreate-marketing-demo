/**
 * 端到端冒烟测试：把整个闭环真跑一遍。
 *
 * 覆盖：建活动（真调大模型）→ 老客 H5 提交素材 → AI 多平台加工 → 贡献值结算
 *      → 防刷规则（自己点自己的分享不加分）→ 引流回流加分 → 商家采用 → 核销券
 *
 * 用法：先 `pnpm dev`，另开终端跑 `node scripts/smoke-test.mjs`
 *      BASE_URL 可用环境变量覆盖，默认 http://localhost:3000
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const envPath = join(process.cwd(), ".env");

/** 测试店铺名。既用于建数据，也作为清理锚点，避免测试数据污染演示列表 */
const SMOKE_MERCHANT = "冒烟测试小馆";
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

// 读 .env 判断是否配置了模型 key —— 决定「必须走大模型」这条断言是否适用
const envText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const hasKey = /LLM_API_KEY\s*=\s*["']?[^"'\s]+/.test(envText);

const merchantPassword =
  envText.match(/MERCHANT_PASSWORD\s*=\s*["']?([^"'\s]*)/)?.[1] ?? "";

/**
 * 商家侧的请求头。
 *
 * 部署设了 MERCHANT_PASSWORD 时，所有 /api/merchant/* 都会 401。
 * 测试自己先登录一次拿 cookie，否则「设了口令的部署跑测试」会看到一片虚假失败 ——
 * 那会让人误以为功能坏了，实际只是测试没带凭据。
 */
let merchantHeaders = {};

async function loginAsMerchant() {
  if (!merchantPassword) {
    console.log("  \x1b[90m（未设置 MERCHANT_PASSWORD，商家接口按演示模式开放）\x1b[0m");
    return;
  }

  const res = await fetch(`${BASE}/api/merchant/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: merchantPassword }),
  });

  // 这里绝不能静默 return：登录失败会让后面所有商家侧断言以「401」的假象失败，
  // 让人误以为功能坏了，而真正的问题只是测试没拿到凭据。
  if (!res.ok) {
    console.log(`  \x1b[31m✗ 商家登录失败（HTTP ${res.status}）：检查 .env 里的 MERCHANT_PASSWORD\x1b[0m`);
    process.exit(1);
  }

  const setCookie = res.headers.getSetCookie?.() ?? [];
  const token = setCookie.map((c) => c.split(";")[0]).find((c) => c.startsWith("cc_merchant="));
  if (!token) {
    console.log("  \x1b[31m✗ 商家登录成功但没拿到 cc_merchant cookie\x1b[0m");
    process.exit(1);
  }

  merchantHeaders = { cookie: token };
  console.log("  \x1b[90m（已用 MERCHANT_PASSWORD 登录，后续商家侧请求带凭据）\x1b[0m");
}

let passed = 0;
let failed = 0;

function ok(name, detail = "") {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? ` \x1b[90m${detail}\x1b[0m` : ""}`);
}

function fail(name, detail = "") {
  failed++;
  console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` \x1b[90m${detail}\x1b[0m` : ""}`);
}

function check(cond, name, detail = "") {
  if (cond) ok(name, detail);
  else fail(name, detail);
  return cond;
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/** 1x1 透明 PNG，够用来跑通「图片上传 + 内容 hash 查重」 */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function captureCookie(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const m = c.match(/cc_viewer=([^;]+)/);
    if (m) return `cc_viewer=${m[1]}`;
  }
  return "";
}

async function main() {
  await loginAsMerchant();
  console.log(`\n\x1b[1m共创营销 Demo · 端到端冒烟测试\x1b[0m  →  ${BASE}`);

  // ── 1. 页面可访问 ──────────────────────────────────────
  section("1. 页面可访问");
  for (const [path, label] of [
    ["/", "落地页"],
    ["/merchant", "商家后台"],
    ["/merchant/campaigns/new", "建活动向导"],
  ]) {
    try {
      const res = await fetch(`${BASE}${path}`);
      check(res.ok, `${label} ${path}`, `HTTP ${res.status}`);
    } catch (err) {
      fail(`${label} ${path}`, err.message);
    }
  }

  // ── 2. 建活动（真实调用大模型） ────────────────────────
  section("2. 建活动（真实调用大模型）");
  let campaign;
  try {
    const res = await fetch(`${BASE}/api/merchant/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...merchantHeaders },
      body: JSON.stringify({
        merchant: {
          name: SMOKE_MERCHANT,
          category: "火锅",
          city: "成都",
          address: "成都市测试路 1 号",
          avgPrice: 88,
          tones: ["实在", "热闹"],
          sellingPoints: ["现炒牛油锅底", "凌晨到的鲜毛肚"],
          bannedWords: ["最好吃", "第一"],
        },
        campaign: {
          title: "冒烟测试 · 老客共创",
          objective: "到店打卡",
          platforms: ["xiaohongshu", "douyin", "dianping", "moments"],
          brief: "验证闭环。",
        },
      }),
    });
    campaign = await res.json();
    if (!res.ok) throw new Error(campaign.error || `HTTP ${res.status}`);

    check(!!campaign.campaignId, "创建活动返回 campaignId");
    check(!!campaign.publicToken, "生成 H5 免登录入口 token", campaign.publicToken);
    check(
      ["llm", "rule"].includes(campaign.aiMode),
      `AI 生成方式：${campaign.aiMode}`,
      `${(campaign.elapsedMs / 1000).toFixed(1)}s`,
    );
    check(campaign.frames?.length === 4, `覆盖 4 个平台框架`, `实际 ${campaign.frames?.length}`);

    // 这一条是实测踩过的坑：模型不知道积分尺度，会给 1/3/5 这种阈值
    const thresholds = (campaign.rewardTiers ?? []).map((t) => t.threshold);
    const ascending = thresholds.every((v, i) => i === 0 || v > thresholds[i - 1]);
    check(
      thresholds.length >= 3 && thresholds.every((t) => t >= 50 && t <= 300) && ascending,
      "奖励阈值被强制映射到系统阶梯（50~300 且递增）",
      `实际 [${thresholds.join(", ")}]`,
    );
  } catch (err) {
    fail("创建活动", err.message);
    console.log("\n\x1b[31m建活动失败，后续步骤无法继续。\x1b[0m");
    process.exit(1);
  }

  // ── 3. 老客 H5 提交素材 ────────────────────────────────
  section("3. 老客 H5 提交素材");
  let submission;
  let cookie = "";
  try {
    const res = await fetch(`${BASE}/c/${campaign.publicToken}`);
    cookie = captureCookie(res.headers.getSetCookie ? res : { headers: { getSetCookie: () => [] } });
    check(res.ok, `H5 页面 /c/${campaign.publicToken}`, `HTTP ${res.status}`);
  } catch (err) {
    fail("H5 页面", err.message);
  }

  try {
    const form = new FormData();
    form.set(
      "answers",
      JSON.stringify({
        feeling: "锅底是真的香，牛油味正，吃到后面也不发苦",
        recommend: "现炒牛油锅底",
        scene: "friends",
        detail: "服务员看我们辣得直喝水，主动送了两碗冰粉",
      }),
    );
    form.set("nickname", "冒烟测试老客");
    form.set("image", new Blob([TINY_PNG], { type: "image/png" }), "test.png");

    const res = await fetch(`${BASE}/api/c/${campaign.publicToken}/submit`, {
      method: "POST",
      body: form,
      headers: cookie ? { cookie } : {},
    });
    submission = await res.json();
    if (!res.ok) throw new Error(submission.error || `HTTP ${res.status}`);

    check(submission.ok && !submission.blocked, "素材通过风控入库");
    check(submission.points > 0, `结算贡献值 +${submission.points}`);
    check(
      Array.isArray(submission.breakdown) && submission.breakdown.length > 0,
      "贡献值可拆解（逐项可解释）",
      `${submission.breakdown.length} 项`,
    );
    check(
      submission.contents?.length === 4,
      "AI 加工出 4 个平台的内容",
      `实际 ${submission.contents?.length}`,
    );

    const bodyLengths = (submission.contents ?? []).map((c) => c.body.length);
    const distinct = new Set((submission.contents ?? []).map((c) => c.body)).size;
    check(distinct === (submission.contents ?? []).length, "各平台内容互不相同（调性有差异）");
    check(
      new Set(bodyLengths).size > 1,
      "各平台篇幅不同（符合平台字数区间）",
      `[${bodyLengths.join(", ")}]`,
    );

    // 逐条来源自洽性。曾经出现过：模型只给了 3 个平台，第 4 个由规则引擎补，
    // 但整批被标成 aiMode=llm —— 那条模板内容在库里被标成了「AI 写的」，标签在撒谎。
    //
    // 注意这里只能是**单向**蕴含（fallback ⟹ rule），不能写成双向等价：
    // 「按设计走规则引擎」（未配 key / 种子数据）也是 rule，但 fallback=false。
    const items = submission.contents ?? [];
    check(
      items.every((c) => c.fallback !== true || c.source === "rule"),
      "凡是被标为兜底的内容，来源必须是规则引擎",
      items.map((c) => `${c.platform}:${c.source}${c.fallback ? "(兜底)" : ""}`).join(" "),
    );
    check(
      items.some((c) => c.fallback === true) === submission.degraded,
      "批次降级标记与逐条兜底标记一致",
      `degraded=${submission.degraded}`,
    );
    check(
      (submission.rewards ?? []).length > 0,
      `首次参与即解锁福利`,
      (submission.rewards ?? []).map((r) => r.title).join(" / ") || "无",
    );

    // 关键回归断言：「配置了模型却静默降级」是最危险的失败模式 ——
    // 界面上一切正常，但内容其实是模板拼的，产品主张直接落空。
    // 实测踩过：模型有一条内容的 title 为空，导致 4 个平台全部退回模板。
    if (hasKey) {
      check(
        submission.aiMode === "llm",
        "AI 加工走了大模型（未静默降级）",
        `aiMode=${submission.aiMode}｜${submission.aiNote}`,
      );
      check(
        !/降级|补齐|不合法/.test(submission.aiNote ?? ""),
        "本次无需规则引擎兜底",
        submission.aiNote ?? "",
      );
    } else {
      ok("未配置模型 key，按预期走规则引擎", `aiMode=${submission.aiMode}`);
    }
  } catch (err) {
    fail("提交素材", err.message);
    console.log("\n\x1b[31m提交失败，后续步骤无法继续。\x1b[0m");
    process.exit(1);
  }

  // ── 4. 防刷规则 ────────────────────────────────────────
  section("4. 防刷规则");
  const shareToken = submission.contents[0].shareToken;

  try {
    const res = await fetch(`${BASE}/api/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ shareToken, type: "click" }),
    });
    const data = await res.json();
    check(
      res.ok && data.credited === false,
      "自己点自己的分享不计引流贡献",
      data.message || "",
    );
  } catch (err) {
    fail("自点检测", err.message);
  }

  // ── 5. 引流回流加分 ────────────────────────────────────
  section("5. 引流回流加分（奖励绑定真实效果）");
  try {
    const res = await fetch(`${BASE}/api/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareToken, type: "click" }),
    });
    const data = await res.json();
    check(
      res.ok && data.credited === true && data.gainedPoints > 0,
      "陌生访客点击产生有效回流并给贡献者加分",
      `+${data.gainedPoints}`,
    );
  } catch (err) {
    fail("引流加分", err.message);
  }

  // ── 6. 商家采用内容 ────────────────────────────────────
  section("6. 商家采用内容");
  try {
    const res = await fetch(`${BASE}/api/merchant/submissions/${submission.submissionId}/adopt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...merchantHeaders },
      body: JSON.stringify({ adopted: true }),
    });
    const data = await res.json();
    check(res.ok && data.adopted === true, "采用成功");
    check(data.campaignPoints > submission.campaignPoints, "采用后贡献值上涨", `${submission.campaignPoints} → ${data.campaignPoints}`);

    // 幂等：再点一次不应该重复加分
    const again = await fetch(`${BASE}/api/merchant/submissions/${submission.submissionId}/adopt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...merchantHeaders },
      body: JSON.stringify({ adopted: true }),
    });
    const againData = await again.json();
    check(
      againData.campaignPoints === data.campaignPoints,
      "重复点采用不重复加分（幂等）",
      `仍为 ${againData.campaignPoints}`,
    );
  } catch (err) {
    fail("商家采用", err.message);
  }

  // ── 7. 核销 ────────────────────────────────────────────
  section("7. 福利核销");
  try {
    const me = await fetch(`${BASE}/c/${campaign.publicToken}/me`, {
      headers: cookie ? { cookie } : {},
    });
    check(me.ok, "我的贡献页可访问", `HTTP ${me.status}`);

    // 从商家工作台找一张待核销的券
    const ws = await fetch(`${BASE}/merchant/campaigns/${campaign.campaignId}?tab=rewards`, { headers: merchantHeaders });
    check(ws.ok, "奖励账本页可访问", `HTTP ${ws.status}`);
  } catch (err) {
    fail("核销页", err.message);
  }

  // ── 8. 演示固定入口 ────────────────────────────────────
  // 这一段是回归断言：曾经因为「重跑种子数据 → 随机 token 变化 → 已发出的演示链接失效」，
  // 导致老客提交时报「活动已结束」。固定 token + 下面的断言把这个坑钉死。
  section("8. 演示固定入口（种子数据）");
  const DEMO_TOKEN = "demo-cocreate";
  try {
    const res = await fetch(`${BASE}/c/${DEMO_TOKEN}`);
    check(res.ok, `演示入口 /c/${DEMO_TOKEN} 可访问`, `HTTP ${res.status}`);

    const me = await fetch(`${BASE}/c/${DEMO_TOKEN}/me`);
    check(me.ok, "演示入口的「我的贡献」页可访问", `HTTP ${me.status}`);

    // 失效链接必须优雅降级，而不是甩一个默认 404
    const dead = await fetch(`${BASE}/c/this-token-is-dead`);
    const deadHtml = await dead.text();
    check(
      dead.status === 404 && deadHtml.includes("这个共创链接已失效"),
      "失效链接渲染友好的引导页（而非默认 404）",
      `HTTP ${dead.status}`,
    );
  } catch (err) {
    fail("演示固定入口", err.message);
  }

  // ── 9. AI 质量可观测性 ─────────────────────────────────
  // 光有降级机制不够：必须能从后台看到「大模型 / 按设计的规则引擎 / 真实降级」三者的比例，
  // 否则线上模型静默退化成模板，没人会知道。
  section("9. AI 质量可观测性");
  try {
    const res = await fetch(`${BASE}/merchant/campaigns/${campaign.campaignId}`, { headers: merchantHeaders });
    const html = await res.text();
    check(res.ok, "工作台可访问", `HTTP ${res.status}`);
    check(html.includes("AI 生成质量"), "概览页展示 AI 生成质量面板");
    check(
      html.includes("规则引擎（按设计）"),
      "面板区分「按设计」与「降级」两个概念",
    );
    // 这条守的是一个真实的设计教训：第一版把「大模型 : 规则引擎」比例条做成
    // 最显眼的元素，结果使用者看到「11% 大模型 / 89% 规则引擎」就以为不健康 ——
    // 而这两个数字跟健康毫无关系。面板必须主动声明「构成 ≠ 健康」。
    check(
      html.includes("这不是健康指标"),
      "面板主动声明内容构成不是健康指标（防止把比例误读成健康度）",
    );
    check(
      html.includes("健康 · 零降级") ||
        html.includes("部分降级") ||
        html.includes("全部降级"),
      "面板给出明确的健康判定结论（健康 / 部分降级 / 全部降级）",
    );

    if (hasKey) {
      check(html.includes("零降级"), "配了 key 且无故障时，面板显示零降级");
    } else {
      ok("未配置 key，跳过零降级断言");
    }
  } catch (err) {
    fail("AI 质量面板", err.message);
  }

  // ── 10. 数据库约束真的在兜底吗 ─────────────────────────
  // 并发保护不能只靠「先查后插」：两个请求会同时查到"不存在"。
  // 这里直接尝试插入重复行，验证唯一约束真的把它挡下来。
  // 插失败 = 符合预期 = 没有污染；万一插成功，就删掉并判失败。
  section("10. 并发保护的数据库约束");
  {
    const prisma = new PrismaClient();
    try {
      const reward = await prisma.reward.findFirst();
      if (!reward) {
        ok("没有奖品样本，跳过");
      } else {
        try {
          const dup = await prisma.reward.create({
            data: {
              campaignId: reward.campaignId,
              contributorId: reward.contributorId,
              tierName: reward.tierName,
              type: reward.type,
              title: `${reward.title}（重复插入测试）`,
              value: reward.value,
              code: `DUPTEST-${Date.now()}`,
              status: "issued",
            },
          });
          // 没被挡住 —— 说明约束缺失，清理并报错
          await prisma.reward.delete({ where: { id: dup.id } });
          fail("Reward 同档位唯一约束生效", "重复插入竟然成功了");
        } catch (err) {
          check(
            err?.code === "P2002",
            "Reward 同档位唯一约束生效（挡住重复发券）",
            `拒绝码 ${err?.code}`,
          );
        }
      }

      const content = await prisma.generatedContent.findFirst();
      if (!content) {
        ok("没有内容样本，跳过");
      } else {
        const key = `fp:smoketest${Date.now()}`;
        const make = () =>
          prisma.trackEvent.create({
            data: {
              type: "click",
              campaignId: content.campaignId,
              submissionId: content.submissionId,
              contentId: content.id,
              viewerKey: key,
              meta: JSON.stringify({ kind: "click" }),
            },
          });

        const first = await make();
        try {
          await make();
          // 第二次竟然也插进去了 → 去重失效
          await prisma.trackEvent.deleteMany({ where: { viewerKey: key } });
          fail("TrackEvent 同访客去重约束生效", "同一访客的重复点击竟然都入库了");
        } catch (err) {
          check(
            err?.code === "P2002",
            "TrackEvent 同访客去重约束生效（挡住脚本刷分）",
            `拒绝码 ${err?.code}`,
          );
        } finally {
          await prisma.trackEvent.deleteMany({ where: { id: first.id } });
        }
      }
    } catch (err) {
      fail("数据库约束检查", err.message);
    } finally {
      await prisma.$disconnect();
    }
  }

  // ── 11. 清理测试数据 ───────────────────────────────────
  // 冒烟测试每次都会建一个活动。不清理的话，反复跑几轮就把演示列表堆满了垃圾。
  // 用固定的测试店铺名做清理锚点（cascade 会连带删掉活动/素材/内容/奖励）。
  // 设 KEEP_SMOKE_DATA=1 可以保留，方便事后翻看。
  if (process.env.KEEP_SMOKE_DATA !== "1") {
    section("10. 清理测试数据");
    const prisma = new PrismaClient();
    try {
      const { count } = await prisma.merchant.deleteMany({ where: { name: SMOKE_MERCHANT } });
      check(count > 0, `清理测试店铺「${SMOKE_MERCHANT}」`, `删除 ${count} 个`);
    } catch (err) {
      fail("清理测试数据", err.message);
    } finally {
      await prisma.$disconnect();
    }
  }

  // ── 汇总 ───────────────────────────────────────────────
  console.log(
    `\n\x1b[1m结果：\x1b[0m \x1b[32m${passed} 通过\x1b[0m` +
      (failed > 0 ? `，\x1b[31m${failed} 失败\x1b[0m` : "") +
      `\n商家工作台：${BASE}/merchant/campaigns/${campaign.campaignId}` +
      `\n老客 H5：    ${BASE}/c/${campaign.publicToken}\n`,
  );

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n\x1b[31m冒烟测试异常终止：\x1b[0m", err);
  process.exit(1);
});
