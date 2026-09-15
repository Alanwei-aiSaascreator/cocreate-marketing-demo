import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PLATFORM_META, type Platform } from "@/lib/types";

export function Card({
  children,
  className,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return <div className={cn("card p-5", hover && "card-hover", className)}>{children}</div>;
}

export function SectionTitle({
  title,
  desc,
  right,
}: {
  title: string;
  desc?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {desc && <p className="hint mt-1">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

const BADGE_TONES = {
  brand: "bg-brand-50 text-brand-700 border-brand-200",
  gray: "bg-ink-100 text-ink-600 border-ink-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  children,
  tone = "gray",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  const meta = PLATFORM_META[platform];
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-0.5 text-xs font-medium text-ink-700">
      <span>{meta.emoji}</span>
      {meta.name}
    </span>
  );
}

export function Stat({
  label,
  value,
  unit,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  tone?: "default" | "brand";
}) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-ink-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums",
            tone === "brand" ? "text-brand-600" : "text-ink-900",
          )}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-ink-400">{unit}</span>}
      </div>
      {hint && <div className="hint mt-1">{hint}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-ink-100", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function EmptyState({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-200 bg-white/60 px-6 py-10 text-center">
      <div className="text-sm font-medium text-ink-600">{title}</div>
      {desc && <div className="hint mt-1">{desc}</div>}
    </div>
  );
}

/** AI 生成方式的如实标注 —— 走模型还是走规则引擎，界面上必须让商家看得见 */
export function AiModeTag({ mode, note }: { mode: string; note?: string }) {
  const isLlm = mode === "llm";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-ink-500"
      title={note || undefined}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isLlm ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      {isLlm ? "大模型生成" : "规则引擎生成"}
    </span>
  );
}
