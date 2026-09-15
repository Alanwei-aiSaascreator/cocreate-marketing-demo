import { Activity, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { AiQuality } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * AI 生成质量面板。
 *
 * ── 设计反思（第一版做错了）──
 * 第一版把「大模型 : 规则引擎」的比例条放在最显眼的位置，做成一根彩色长条，
 * 结果使用者看到「11% 大模型 / 89% 规则引擎」就以为不健康 —— 而这两个数字
 * 跟健康**毫无关系**。真正代表健康的是「降级」数（本该走模型却失败了）。
 *
 * 教训：**一个面板只能有一个主指标，而且必须是「需要采取行动」的那个。**
 * 把最显眼的位置给了不需要行动的数字，使用者就一定会误读它。
 * 所以这一版把层级颠倒过来：
 *   主区 = 健康判定（降级数），大到一眼看到；
 *   次区 = 内容构成，并且**主动写明「这不是健康指标」** ——
 *          因为人会本能地去读最显眼的图形，必须把话说明白。
 */
export function AiQualityCard({ quality }: { quality: AiQuality }) {
  const { total, llm, ruleByDesign, degraded, degradedRate, llmConfigured, model } = quality;

  const llmPct = total > 0 ? Math.round((llm / total) * 100) : 0;
  const designPct = total > 0 ? Math.round((ruleByDesign / total) * 100) : 0;
  const degradedPct = Math.round(degradedRate * 100);

  // 健康判定：只有「已配置 key 却失败」才是故障。
  // 分三态 —— 部分降级（模型只给了部分平台，其余由规则补齐）不该被当成健康，
  // 也不该和「整批退回模板」混为一谈。
  const health = !llmConfigured
    ? {
        tone: "info" as const,
        headline: "未配置模型",
        detail: "没配 LLM_API_KEY，全部按设计走规则引擎 —— 这是正常状态，不是故障。",
      }
    : degraded === 0
      ? {
          tone: "good" as const,
          headline: "健康 · 零降级",
          detail:
            llm > 0
              ? `模型调用全部正常：本期 ${llm}/${total} 条内容由 ${model} 生成，无一条因失败退回模板。`
              : `模型已配置（${model}）且零降级；本期内容均按设计用规则引擎产出（种子数据预生成），等有新素材提交就会走模型。`,
        }
      : degraded >= total
        ? {
            tone: "bad" as const,
            headline: `不健康 · 全部降级（${degraded} 条）`,
            detail: "本期内容全部退回模板，说明模型调用整体不可用。检查 key 额度、网络，或模型返回格式。",
          }
        : {
            tone: "warn" as const,
            headline: `部分降级 · ${degraded}/${total} 条退回模板`,
            detail:
              "模型只给出了部分平台，其余由规则引擎补齐 —— 那几条内容是模板拼的，不是 AI 写的。长期出现说明模型输出不稳定。",
          };

  const TONE = {
    good: {
      box: "border-emerald-200 bg-emerald-50",
      head: "text-emerald-900",
      body: "text-emerald-800",
      icon: "text-emerald-600",
      Icon: CheckCircle2,
    },
    warn: {
      box: "border-amber-200 bg-amber-50",
      head: "text-amber-900",
      body: "text-amber-800",
      icon: "text-amber-600",
      Icon: AlertTriangle,
    },
    bad: {
      box: "border-red-200 bg-red-50",
      head: "text-red-900",
      body: "text-red-800",
      icon: "text-red-600",
      Icon: AlertTriangle,
    },
    info: {
      box: "border-ink-200 bg-ink-50",
      head: "text-ink-800",
      body: "text-ink-600",
      icon: "text-ink-500",
      Icon: Info,
    },
  }[health.tone];

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
          <Activity className="h-4 w-4 text-brand-500" />
          AI 生成质量
        </h2>
        <span className="text-xs text-ink-400">内容产出共 {total} 条</span>
      </div>

      {/* ── 主区：健康判定。唯一需要采取行动的指标，占最大视觉权重 ── */}
      <div className={cn("mt-4 rounded-xl border p-4", TONE.box)}>
        <div className="flex items-start gap-3">
          <TONE.Icon className={cn("mt-0.5 h-5 w-5 shrink-0", TONE.icon)} />
          <div className="min-w-0">
            <div className={cn("text-base font-bold", TONE.head)}>{health.headline}</div>
            <p className={cn("mt-1 text-[13px] leading-relaxed", TONE.body)}>{health.detail}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
              判断依据：降级 = 「已配置 key，但模型调用失败 / 返回不合法」。
              没配 key、或种子数据用规则引擎，都<strong>不算</strong>降级。
            </p>
          </div>
        </div>
      </div>

      {/* ── 次区：内容构成。刻意降权，并主动声明它不是健康指标 ── */}
      <div className="mt-4 border-t border-ink-100 pt-4">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-xs font-medium text-ink-600">内容构成</span>
          <span className="text-[11px] text-ink-400">
            这不是健康指标 —— 规则引擎占比高，通常只是还没人提交新素材
          </span>
        </div>

        {/* 进度条去饱和：灰色不该被读成「坏」 */}
        <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-ink-100">
          {llm > 0 && (
            <div
              className="h-full bg-sky-400"
              style={{ width: `${llmPct}%` }}
              title={`大模型 ${llm} 条`}
            />
          )}
          {degraded > 0 && (
            <div
              className="h-full bg-red-500"
              style={{ width: `${degradedPct}%` }}
              title={`降级 ${degraded} 条`}
            />
          )}
          {ruleByDesign > 0 && (
            <div
              className="h-full bg-ink-200"
              style={{ width: `${designPct}%` }}
              title={`规则引擎（按设计）${ruleByDesign} 条`}
            />
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span className="text-ink-500">大模型</span>
            <span className="font-semibold tabular-nums text-ink-900">{llm}</span>
            <span className="text-ink-400">{llmPct}%</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", degraded > 0 ? "bg-red-500" : "bg-ink-200")} />
            <span className="text-ink-500">降级</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                degraded > 0 ? "text-red-600" : "text-ink-900",
              )}
            >
              {degraded}
            </span>
            <span className="text-ink-400">{degradedPct}%</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ink-200" />
            <span className="text-ink-500">规则引擎（按设计）</span>
            <span className="font-semibold tabular-nums text-ink-900">{ruleByDesign}</span>
            <span className="text-ink-400">{designPct}%</span>
          </span>
        </div>
      </div>

      {/* ── 降级原因：只在真的降级时才出现 ── */}
      {quality.reasons.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="text-xs font-medium text-red-800">降级原因</div>
          <div className="mt-2 space-y-1.5">
            {quality.reasons.map((r) => (
              <div key={r.note} className="flex items-start gap-2 text-[12px] text-red-700">
                <span className="shrink-0 rounded bg-white px-1.5 py-0.5 font-medium tabular-nums">
                  {r.count} 条
                </span>
                <span className="min-w-0 break-words">{r.note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 活动框架的生成情况 ── */}
      <div className="mt-4 border-t border-ink-100 pt-3">
        <div className="text-xs font-medium text-ink-600">
          活动框架（平台框架 / 任务卡 / 奖励阶梯）
        </div>
        <div className="mt-1.5 flex items-start gap-2">
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium",
              quality.blueprint.aiMode === "llm"
                ? "bg-emerald-50 text-emerald-700"
                : quality.blueprint.degraded
                  ? "bg-red-50 text-red-700"
                  : "bg-ink-100 text-ink-600",
            )}
          >
            {quality.blueprint.aiMode === "llm"
              ? "大模型生成"
              : quality.blueprint.degraded
                ? "降级"
                : "规则引擎"}
          </span>
          <span className="text-[12px] leading-relaxed text-ink-500">{quality.blueprint.note}</span>
        </div>
      </div>
    </div>
  );
}
