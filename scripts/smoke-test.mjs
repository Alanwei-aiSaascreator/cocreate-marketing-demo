/**
 * 端到端冒烟测试：把整个闭环真跑一遍。
 *
 * 覆盖：建活动（真调大模型）→ 老客 H5 提交素材 → AI 多平台加工 → 贡献值结算
 *      → 防刷规则（自己点自己的分享不加分）→ 引流回流加分 → 商家采用 → 核销券
 *
 * 用法：先 `pnpm dev`，另开终端跑 `node scripts/smoke-test.mjs`
 *      BASE_URL 可用环境变量覆盖，默认 http://localhost:3000
 */
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant: {
          name: "冒烟测试小馆",
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
    check(
      (submission.rewards ?? []).length > 0,
      `首次参与即解锁福利`,
      (submission.rewards ?? []).map((r) => r.title).join(" / ") || "无",
    );
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adopted: true }),
    });
    const data = await res.json();
    check(res.ok && data.adopted === true, "采用成功");
    check(data.campaignPoints > submission.campaignPoints, "采用后贡献值上涨", `${submission.campaignPoints} → ${data.campaignPoints}`);

    // 幂等：再点一次不应该重复加分
    const again = await fetch(`${BASE}/api/merchant/submissions/${submission.submissionId}/adopt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const ws = await fetch(`${BASE}/merchant/campaigns/${campaign.campaignId}?tab=rewards`);
    check(ws.ok, "奖励账本页可访问", `HTTP ${ws.status}`);
  } catch (err) {
    fail("核销页", err.message);
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
