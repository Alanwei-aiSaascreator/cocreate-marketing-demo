import { Activity, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { AiQuality } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * AI 生成质量面板。
 *
 * 为什么不只做「llm vs rule 比例」：rule 有三种来源，
 * 只有「本该走模型却失败」才是故障。混在一起统计，演示数据会显示 100% 规则引擎、
 * 看着像全线故障 —— 那样这个指标反而在骗人。
 * 所以这里把三者分开，真正要盯的是 **降级数**。
 */
export function AiQualityCard({ quality }: { quality: AiQuality }) {
  const { total, llm, ruleByDesign, degraded, llmRate, degradedRate, llmConfigured, model } = quality;

  const llmPct = Math.round(llmRate * 100);
  const degradedPct = Math.round(degradedRate * 100);
  const designPct = total > 0 ? 100 - llmPct - degradedPct : 0;

  // 健康判定必须如实反映「模型到底有没有被行使过」。
  // 否则种子数据下会出现「大模型 0 条」却显示「模型调用全部正常」的误导性结论。
  const health = !llmConfigured
    ? { tone: "info" as const, text: `未配置模型 key，全部按设计走规则引擎（${model}）` }
    : degraded > 0
      ? {
          tone: "bad" as const,
          text: `有 ${degraded} 条内容本该走大模型但失败了，已退回模板 —— 检查 key 额度、网络或模型返回格式`,
        }
      : llm === 0
        ? {
            tone: "info" as const,
            text: `模型已配置（${model}）且未发生降级；本次活动的内容均按设计用规则引擎产出（种子数据预生成），等有新素材提交就会走模型`,
          }
        : { tone: "good" as const, text: `模型调用全部正常，零降级（${llm}/${total} 条内容由 ${model} 生成）` };

  const HEALTH_STYLE = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
    bad: "border-red-200 bg-red-50 text-red-800",
    info: "border-ink-200 bg-ink-50 text-ink-600",
  } as const;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
          <Activity className="h-4 w-4 text-brand-500" />
          AI 生成质量
        </h2>
        <span className="text-xs text-ink-400">
          内容产出共 {total} 条
        </span>
      </div>

      <p className="hint mt-1">
        单条标注只能事后追查，比例才能一眼判断模型现在健不健康。
      </p>

      {/* 比例条 */}
      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-ink-100">
        {llm > 0 && (
          <div
            className="h-full bg-emerald-500"
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
            className="h-full bg-ink-300"
            style={{ width: `${designPct}%` }}
            title={`规则引擎（按设计）${ruleByDesign} 条`}
          />
        )}
      </div>

      {/* 三个数字 */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-ink-500">大模型</span>
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-ink-900">
            {llm}
            <span className="ml-1 text-xs font-normal text-ink-400">{llmPct}%</span>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                degraded > 0 ? "bg-red-500" : "bg-ink-300",
              )}
            />
            <span className="text-xs text-ink-500">降级</span>
          </div>
          <div
            className={cn(
              "mt-1 text-lg font-semibold tabular-nums",
              degraded > 0 ? "text-red-600" : "text-ink-900",
            )}
          >
            {degraded}
            <span className="ml-1 text-xs font-normal text-ink-400">{degradedPct}%</span>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ink-300" />
            <span className="text-xs text-ink-500">规则引擎（按设计）</span>
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-ink-900">
            {ruleByDesign}
            <span className="ml-1 text-xs font-normal text-ink-400">{designPct}%</span>
          </div>
        </div>
      </div>

      {/* 健康判定 */}
      <div className={cn("mt-4 flex items-start gap-2 rounded-lg border p-3", HEALTH_STYLE[health.tone])}>
        {health.tone === "good" && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        {health.tone === "bad" && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        {health.tone === "info" && <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        <span className="text-[12px] leading-relaxed">{health.text}</span>
      </div>

      {/* 降级原因分布 */}
      {quality.reasons.length > 0 && (
        <div className="mt-3 border-t border-ink-100 pt-3">
          <div className="text-xs font-medium text-ink-600">降级原因</div>
          <div className="mt-2 space-y-1.5">
            {quality.reasons.map((r) => (
              <div key={r.note} className="flex items-start gap-2 text-[12px] text-ink-600">
                <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 font-medium tabular-nums text-red-700">
                  {r.count} 条
                </span>
                <span className="min-w-0 break-words">{r.note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 活动框架的生成情况 */}
      <div className="mt-3 border-t border-ink-100 pt-3">
        <div className="text-xs font-medium text-ink-600">活动框架（平台框架 / 任务卡 / 奖励阶梯）</div>
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
          <span className="text-[12px] leading-relaxed text-ink-500">
            {quality.blueprint.note}
          </span>
        </div>
      </div>
    </div>
  );
}
