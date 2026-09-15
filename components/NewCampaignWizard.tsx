"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Badge, Card, PlatformBadge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PLATFORM_META, PLATFORMS, type Platform } from "@/lib/types";
import type { DecodedMerchant } from "@/lib/queries";

const OBJECTIVES = ["到店打卡", "团购转化", "口碑沉淀", "新客拉新"];

const CATEGORY_PRESETS = [
  "火锅",
  "咖啡",
  "烧烤",
  "日料",
  "烘焙",
  "美甲",
  "美发",
  "SPA",
  "亲子乐园",
  "健身房",
];

interface BlueprintPreview {
  campaignId: string;
  publicToken: string;
  aiMode: string;
  aiNote: string;
  elapsedMs: number;
  frames: { platform: Platform; angle: string }[];
  taskFields: { id: string; label: string; type: string }[];
  rewardTiers: { threshold: number; name: string; title: string; type: string; value: number }[];
}

export function NewCampaignWizard({ merchants }: { merchants: DecodedMerchant[] }) {
  const router = useRouter();
  const initial = merchants[0];

  const [step, setStep] = useState(0);
  const [merchantId, setMerchantId] = useState<string | null>(initial?.id ?? null);

  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "火锅");
  const [city, setCity] = useState(initial?.city ?? "成都");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [avgPrice, setAvgPrice] = useState(
    initial?.avgPrice != null ? String(initial.avgPrice) : "",
  );
  const [tones, setTones] = useState((initial?.tones ?? ["实在", "热闹"]).join("、"));
  const [sellingPoints, setSellingPoints] = useState((initial?.sellingPoints ?? []).join("、"));
  const [bannedWords, setBannedWords] = useState(
    (initial?.bannedWords ?? ["最好吃", "第一", "纯天然", "治疗"]).join("、"),
  );

  const [title, setTitle] = useState("老客共创 · 招牌口碑计划");
  const [objective, setObjective] = useState(OBJECTIVES[0]);
  const [platforms, setPlatforms] = useState<Platform[]>([
    "xiaohongshu",
    "douyin",
    "dianping",
    "moments",
  ]);
  const [brief, setBrief] = useState("请老客用真实体验帮我们把招牌讲出去。");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BlueprintPreview | null>(null);

  const splitTags = (raw: string) =>
    raw
      .split(/[、,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const canSubmit = useMemo(
    () => name.trim() && category.trim() && city.trim() && title.trim() && platforms.length > 0,
    [name, category, city, title, platforms],
  );

  function resetMerchant() {
    setMerchantId(null);
    setName("");
    setSellingPoints("");
    setAddress("");
    setAvgPrice("");
  }

  async function generate() {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/merchant/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: merchantId ?? undefined,
          merchant: {
            name: name.trim(),
            category: category.trim(),
            city: city.trim(),
            address: address.trim(),
            avgPrice: avgPrice ? Number(avgPrice) : undefined,
            tones: splitTags(tones),
            sellingPoints: splitTags(sellingPoints),
            bannedWords: splitTags(bannedWords),
          },
          campaign: {
            title: title.trim(),
            objective,
            platforms,
            brief: brief.trim(),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "生成失败");
        return;
      }
      setResult(data as BlueprintPreview);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络异常，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link href="/merchant" className="text-xs text-ink-500 hover:text-ink-700">
          ← 返回活动列表
        </Link>
        <h1 className="mt-2 text-xl font-bold text-ink-900">新建共创活动</h1>
        <p className="hint mt-1">
          你只管给店铺信息和营销目标，平台框架、老客任务卡、奖励阶梯都由 AI 生成 ——
          框架是 AI 出的，边界是商家定的。
        </p>
      </div>

      {/* 步骤条 */}
      <div className="mb-6 flex items-center gap-2">
        {["店铺信息", "活动设置", "AI 生成结果"].map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i < step
                  ? "bg-brand-500 text-white"
                  : i === step
                    ? "bg-brand-100 text-brand-700 ring-2 ring-brand-200"
                    : "bg-ink-100 text-ink-400",
              )}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-xs font-medium",
                i <= step ? "text-ink-800" : "text-ink-400",
              )}
            >
              {label}
            </span>
            {i < 2 && <div className="h-px flex-1 bg-ink-200" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 第 1 步：店铺信息 */}
      {step === 0 && (
        <Card className="animate-fade-up">
          {merchants.length > 0 && (
            <div className="mb-4 rounded-lg border border-ink-200 bg-ink-50 p-3">
              <div className="mb-2 text-xs font-medium text-ink-600">选择已有店铺</div>
              <div className="flex flex-wrap gap-2">
                {merchants.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMerchantId(m.id);
                      setName(m.name);
                      setCategory(m.category);
                      setCity(m.city);
                      setAddress(m.address ?? "");
                      setAvgPrice(m.avgPrice != null ? String(m.avgPrice) : "");
                      setTones(m.tones.join("、"));
                      setSellingPoints(m.sellingPoints.join("、"));
                      setBannedWords(m.bannedWords.join("、"));
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs",
                      merchantId === m.id
                        ? "border-brand-400 bg-white font-medium text-brand-700"
                        : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
                    )}
                  >
                    {m.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={resetMerchant}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs",
                    merchantId === null
                      ? "border-brand-400 bg-white font-medium text-brand-700"
                      : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
                  )}
                >
                  + 新店铺
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">店铺名称</label>
              <input
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：椒香里·重庆老火锅"
              />
            </div>

            <div>
              <label className="label">品类</label>
              <input
                className="field"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="category-presets"
              />
              <datalist id="category-presets">
                {CATEGORY_PRESETS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="label">城市</label>
              <input
                className="field"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="例：成都"
              />
            </div>

            <div>
              <label className="label">门店地址</label>
              <input
                className="field"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="例：成都市武侯区科华北路 12 号"
              />
            </div>

            <div>
              <label className="label">人均（元）</label>
              <input
                className="field"
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="例：98"
                inputMode="numeric"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="label">品牌调性</label>
              <input
                className="field"
                value={tones}
                onChange={(e) => setTones(e.target.value)}
                placeholder="例：实在、热闹、不装"
              />
              <p className="hint mt-1">约束 AI 的语气。用顿号或逗号分隔。</p>
            </div>

            <div className="sm:col-span-2">
              <label className="label">核心卖点</label>
              <input
                className="field"
                value={sellingPoints}
                onChange={(e) => setSellingPoints(e.target.value)}
                placeholder="例：手工现炒牛油锅底、凌晨四点到的鲜毛肚"
              />
              <p className="hint mt-1">AI 会把这些写进内容的必含信息里。</p>
            </div>

            <div className="sm:col-span-2">
              <label className="label">合规禁词</label>
              <input
                className="field"
                value={bannedWords}
                onChange={(e) => setBannedWords(e.target.value)}
                placeholder="例：最好吃、第一、纯天然、治疗"
              />
              <p className="hint mt-1">
                这些词会进入每个平台的禁忌清单，并用于内容合规自检。
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!name.trim() || !category.trim() || !city.trim()}
              onClick={() => setStep(1)}
            >
              下一步
            </button>
          </div>
        </Card>
      )}

      {/* 第 2 步：活动设置 */}
      {step === 1 && (
        <Card className="animate-fade-up">
          <div className="space-y-5">
            <div>
              <label className="label">活动名称</label>
              <input
                className="field"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="label">营销目标</label>
              <div className="flex flex-wrap gap-2">
                {OBJECTIVES.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setObjective(o)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs",
                      objective === o
                        ? "border-brand-400 bg-brand-50 font-medium text-brand-700"
                        : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
              <p className="hint mt-1.5">
                目标会决定 AI 的创作切入点，比如「团购转化」会重点突出性价比和决策门槛。
              </p>
            </div>

            <div>
              <label className="label">覆盖平台</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {PLATFORMS.map((p) => {
                  const meta = PLATFORM_META[p];
                  const on = platforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setPlatforms((prev) =>
                          prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                        )
                      }
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition",
                        on
                          ? "border-brand-400 bg-brand-50"
                          : "border-ink-200 bg-white hover:border-ink-300",
                      )}
                    >
                      <span className="text-lg">{meta.emoji}</span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-medium text-ink-900">
                          {meta.name}
                          {on && <Check className="h-3.5 w-3.5 text-brand-600" />}
                        </span>
                        <span className="hint mt-0.5 block">{meta.tone}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="label">补充说明（可选）</label>
              <textarea
                className="field"
                rows={3}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="想强调什么、想避开什么，AI 会一并考虑。"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-between">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>
              上一步
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canSubmit || loading}
              onClick={generate}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI 正在生成…
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  让 AI 生成活动框架
                </>
              )}
            </button>
          </div>

          {loading && (
            <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-xs text-brand-700">
              正在生成 {platforms.length} 个平台的内容框架、老客任务卡和奖励阶梯。
              模型调用最长约 90 秒；如果调用失败会自动降级到规则引擎，不会卡住。
            </div>
          )}
        </Card>
      )}

      {/* 第 3 步：生成结果 */}
      {step === 2 && result && (
        <div className="animate-fade-up space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <Sparkles className="h-4 w-4 text-brand-500" />
                生成完成
              </span>
              <Badge tone={result.aiMode === "llm" ? "green" : "amber"}>
                {result.aiMode === "llm" ? "大模型生成" : "规则引擎生成"}
              </Badge>
              <span className="text-xs text-ink-500">耗时 {(result.elapsedMs / 1000).toFixed(1)}s</span>
            </div>
            <p className="hint mt-2">{result.aiNote}</p>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-ink-900">各平台内容框架</h3>
            <div className="mt-3 space-y-2.5">
              {result.frames.map((f) => (
                <div key={f.platform} className="flex gap-3">
                  <PlatformBadge platform={f.platform} />
                  <span className="text-[13px] text-ink-600">{f.angle}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-ink-900">老客任务卡</h3>
            <p className="hint mt-1">老客只填空，不写整篇 —— 这是内容质量不崩的前提。</p>
            <div className="mt-3 space-y-2">
              {result.taskFields.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2 text-[13px]">
                  <span className="font-mono text-[11px] text-ink-400">{i + 1}</span>
                  <span className="text-ink-800">{t.label}</span>
                  <Badge tone={t.type === "image" ? "violet" : "gray"}>{t.type}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-ink-900">奖励阶梯</h3>
            <p className="hint mt-1">只用店铺福利，不出现现金。</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {result.rewardTiers.map((t) => (
                <div key={t.name} className="rounded-lg border border-ink-200 p-3">
                  <div className="text-xs text-ink-500">满 {t.threshold} 贡献值</div>
                  <div className="mt-1 text-sm font-medium text-ink-900">{t.title}</div>
                  <div className="hint mt-0.5">{t.name}</div>
                </div>
              ))}
            </div>
          </Card>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => router.push(`/merchant/campaigns/${result.campaignId}`)}
            >
              进入工作台
            </button>
            <Link href={`/c/${result.publicToken}`} className="btn btn-ghost" target="_blank">
              打开老客 H5 看一眼
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
