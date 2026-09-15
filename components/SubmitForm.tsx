"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  Gift,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { compressImage, formatBytes } from "@/lib/image-client";
import { PLATFORM_META, type PointItem, type RewardTier, type RiskFlag, type TaskField } from "@/lib/types";

interface ComposedItem {
  id: string;
  platform: string;
  title: string;
  body: string;
  tags: string[];
  coverHint: string;
  complianceNote: string;
  shareToken: string;
}

interface SubmitResult {
  ok: boolean;
  blocked: boolean;
  points: number;
  breakdown: PointItem[];
  riskFlags: RiskFlag[];
  aiMode?: string;
  aiNote?: string;
  contents: ComposedItem[];
  campaignPoints?: number;
  totalPoints?: number;
  rewards?: { tierName: string; title: string; type: string; value: number; code: string }[];
  message?: string;
}

/** 提交过程中的阶段提示 —— 让等待变得可理解，而不是一个转圈 */
const STAGES = [
  "正在校验内容合规…",
  "AI 正在按各平台调性加工…",
  "内容入库、计算贡献值…",
  "结算店铺福利…",
];

export function SubmitForm({
  token,
  taskCard,
  rewardTiers,
  nickname,
  currentPoints,
}: {
  token: string;
  taskCard: TaskField[];
  rewardTiers: RewardTier[];
  nickname: string;
  currentPoints: number;
}) {
  const fieldDefaults: Record<string, string> = {};
  for (const f of taskCard) if (f.type === "choice" && f.options?.[0]) fieldDefaults[f.id] = f.options[0];

  const [answers, setAnswers] = useState<Record<string, string>>(fieldDefaults);
  const [name, setName] = useState(nickname);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageNote, setImageNote] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const imageField = taskCard.find((f) => f.type === "image");

  /**
   * 选图即压缩。
   *
   * 手机直出照片常有 3–12MB，超过后端上限；老客在 H5 里没有任何办法自己压，
   * 所以在这里用 canvas 缩到长边 1600px + JPEG 0.82，通常降到几百 KB。
   * 顺带把 iPhone 的 HEIC 统一转成 JPEG。压缩失败则原样上传，不阻断老客。
   */
  async function pickFile(raw: File | null) {
    setError("");
    if (!raw) {
      setFile(null);
      setImageNote("");
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      return;
    }

    setCompressing(true);
    setImageNote("");
    try {
      const result = await compressImage(raw);
      setFile(result.file);
      setImageNote(result.note);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(result.file));
    } catch {
      // compressImage 内部已兜底，这里只防它自身抛异常
      setFile(raw);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(raw));
      setImageNote("");
    } finally {
      setCompressing(false);
    }
  }

  const missing = taskCard
    .filter((f) => f.required && f.type !== "image" && !(answers[f.id] || "").trim())
    .map((f) => f.label);
  const missingImage = !!imageField?.required && !file;
  // 压缩中不能提交：提交的是还没压完的原图，会撞后端体积上限
  const canSubmit = missing.length === 0 && !missingImage && !compressing;

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    setStage(0);

    // 阶段提示按真实耗时推进，不假装
    const timer = setInterval(() => {
      setStage((s) => (s < STAGES.length - 1 ? s + 1 : s));
    }, 3500);

    try {
      const form = new FormData();
      form.set("answers", JSON.stringify(answers));
      form.set("nickname", name);
      if (file) form.set("image", file);

      const res = await fetch(`/api/c/${token}/submit`, { method: "POST", body: form });
      const data = (await res.json()) as SubmitResult & { error?: string };

      if (!res.ok) {
        setError(data.error ?? "提交失败，请重试");
        return;
      }
      setResult(data);
      setAnswers(fieldDefaults);
      pickFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch {
      setError("网络异常，请检查连接后重试");
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  // ── 结果页 ──
  if (result) {
    return (
      <div className="animate-fade-up space-y-4 pb-8">
        {result.blocked ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
              <AlertTriangle className="h-4 w-4" />
              这次没通过风控
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-red-700">{result.message}</p>
            <RiskList flags={result.riskFlags} />
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <Check className="h-4 w-4" />
                提交成功，贡献值已到账
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-emerald-700">
                  +{result.points}
                </span>
                <span className="text-xs text-emerald-700">
                  本次活动累计 {result.campaignPoints} 贡献值
                </span>
              </div>
            </div>

            {/* 贡献值拆解 —— 让老客知道怎么拿更多 */}
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-ink-900">这 {result.points} 分是怎么来的</h3>
              <div className="mt-3 space-y-2.5">
                {result.breakdown
                  .filter((b) => b.points !== 0)
                  .map((b) => (
                    <div key={b.label} className="flex items-start gap-3">
                      <span
                        className={cn(
                          "w-9 shrink-0 text-right text-sm font-semibold tabular-nums",
                          b.points > 0 ? "text-brand-600" : "text-red-600",
                        )}
                      >
                        {b.points > 0 ? `+${b.points}` : b.points}
                      </span>
                      <div>
                        <div className="text-[13px] font-medium text-ink-800">{b.label}</div>
                        <p className="hint">{b.note}</p>
                      </div>
                    </div>
                  ))}
              </div>
              <p className="hint mt-3 border-t border-ink-100 pt-3">
                想拿更多：让内容被商家采用（+30）、把内容分享出去带来真实点击（+5/次，封顶 50）。
              </p>
            </div>

            {/* 风控提醒 */}
            {result.riskFlags.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-[13px] font-medium text-amber-800">几条提示</div>
                <RiskList flags={result.riskFlags} />
              </div>
            )}

            {/* 发到的券 */}
            {result.rewards && result.rewards.length > 0 && (
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-brand-800">
                  <Gift className="h-4 w-4" />
                  解锁了 {result.rewards.length} 张店铺福利
                </div>
                <div className="mt-3 space-y-2">
                  {result.rewards.map((r) => (
                    <div
                      key={r.code}
                      className="flex items-center justify-between rounded-lg border border-brand-200 bg-white px-3 py-2.5"
                    >
                      <div>
                        <div className="text-[13px] font-medium text-ink-900">{r.title}</div>
                        <div className="hint">{r.tierName}</div>
                      </div>
                      <span className="font-mono text-xs text-ink-600">{r.code}</span>
                    </div>
                  ))}
                </div>
                <p className="hint mt-2">到店出示券码即可核销。</p>
              </div>
            )}
          </>
        )}

        {/* AI 产出 */}
        {result.contents.length > 0 && (
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <Sparkles className="h-4 w-4 text-brand-500" />
                AI 把你的话加工成了 {result.contents.length} 条内容
              </h3>
            </div>
            <p className="hint mt-1">同一份真实体验，按各平台调性分别表达。</p>
            <div className="mt-3 space-y-3">
              {result.contents.map((c) => {
                const meta = PLATFORM_META[c.platform as keyof typeof PLATFORM_META];
                return (
                  <details key={c.id} className="rounded-lg border border-ink-200 bg-white">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
                      <span>{meta?.emoji}</span>
                      <span className="text-[13px] font-medium text-ink-800">{meta?.name}</span>
                      <span className="truncate text-xs text-ink-400">{c.title}</span>
                    </summary>
                    <div className="border-t border-ink-100 px-3 py-3">
                      <div className="text-[13px] font-medium text-ink-900">{c.title}</div>
                      <div className="content-body mt-2 text-[13px] text-ink-700">{c.body}</div>
                      {c.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.tags.map((t) => (
                            <span key={t} className="text-xs text-blue-600">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {c.complianceNote && c.complianceNote !== "无" && (
                        <p className="mt-2 text-xs text-amber-700">{c.complianceNote}</p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
            <p className="hint mt-3">
              生成方式：{result.aiMode === "llm" ? "大语言模型" : "规则引擎"}。{result.aiNote}
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            className="btn btn-ghost flex-1"
            onClick={() => {
              setResult(null);
              setError("");
            }}
          >
            <Plus className="h-4 w-4" />
            再贡献一条
          </button>
          <a href={`/c/${token}/me`} className="btn btn-primary flex-1">
            看我的贡献与福利
          </a>
        </div>
      </div>
    );
  }

  // ── 表单 ──
  return (
    <div className="space-y-4 pb-8">
      {taskCard.map((field) => (
        <div key={field.id} className="card p-4">
          <label className="label !mb-1.5">
            {field.label}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </label>

          {field.type === "textarea" && (
            <>
              <textarea
                className="field"
                rows={3}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                value={answers[field.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))}
              />
              {field.maxLength && (
                <div className="mt-1 text-right text-[11px] text-ink-400">
                  {(answers[field.id] ?? "").length}/{field.maxLength}
                </div>
              )}
            </>
          )}

          {field.type === "text" && (
            <input
              className="field"
              maxLength={field.maxLength}
              placeholder={field.placeholder}
              value={answers[field.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))}
            />
          )}

          {field.type === "choice" && (
            <div className="flex flex-wrap gap-2">
              {(field.options ?? []).map((opt) => {
                // 新生成的任务卡选项本身就是中文，直接用。
                // 这个映射表只为兼容早期用英文 key 的历史活动；
                // 提交时统一存中文，避免英文 key 被规则引擎拼进正文（「friends 过来的。」）。
                const LEGACY: Record<string, string> = {
                  friends: "和朋友聚会",
                  family: "带家人",
                  solo: "一个人",
                  date: "约会",
                  colleagues: "同事聚餐",
                };
                const value = LEGACY[opt] ?? opt;
                const on = answers[field.id] === value;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [field.id]: value }))}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-[13px]",
                      on
                        ? "border-brand-400 bg-brand-50 font-medium text-brand-700"
                        : "border-ink-200 bg-white text-ink-600",
                    )}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          )}

          {field.type === "image" && (
            <div>
              {preview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="预览"
                    className="h-44 w-full rounded-lg border border-ink-200 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => pickFile(null)}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
                    aria-label="移除图片"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-300 bg-ink-50 text-ink-500"
                >
                  <Camera className="h-6 w-6" />
                  <span className="text-[13px]">{field.placeholder || "选择照片"}</span>
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />

              {/* 压缩状态反馈：手机拍照常有 3–12MB，压完能小一个数量级，
                  不告诉用户的话，他会以为自己选的还是那张大图 */}
              {compressing && (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-brand-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在压缩图片…
                </p>
              )}
              {!compressing && imageNote && (
                <p className="mt-2 text-[12px] text-emerald-700">{imageNote}</p>
              )}
              {!compressing && !imageNote && file && (
                <p className="mt-2 text-[12px] text-ink-500">
                  当前大小 {formatBytes(file.size)}
                </p>
              )}
            </div>
          )}

          <p className="hint mt-2">{field.why}</p>
        </div>
      ))}

      {/* 昵称 */}
      <div className="card p-4">
        <label className="label !mb-1.5">你的称呼</label>
        <input
          className="field"
          maxLength={20}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="让商家知道是谁贡献的"
        />
        <p className="hint mt-2">免登录，填个称呼就能参与。</p>
      </div>

      {/* 奖励进度 */}
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-brand-800">
          <Gift className="h-4 w-4" />
          再拿多少分能解锁福利
        </div>
        <div className="mt-3 space-y-2">
          {rewardTiers.map((t) => {
            const left = t.threshold - currentPoints;
            const reached = left <= 0;
            return (
              <div key={t.name} className="flex items-center justify-between text-[13px]">
                <span className={reached ? "text-brand-800" : "text-ink-600"}>{t.title}</span>
                <span className={cn("tabular-nums", reached ? "text-brand-700" : "text-ink-500")}>
                  {reached ? "已解锁" : `还差 ${left}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {busy && (
        <div className="rounded-lg border border-brand-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-brand-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            {STAGES[stage]}
          </div>
          <p className="hint mt-1.5">
            正在调用 AI 按各平台调性加工内容，通常 10-40 秒。若模型不可用会自动降级，不影响你的贡献值。
          </p>
        </div>
      )}

      <button type="button" onClick={submit} disabled={!canSubmit || busy} className="btn btn-primary w-full !py-3">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? "提交中…" : "提交我的共创"}
      </button>

      {!canSubmit && (
        <p className="hint text-center">
          还差：{[...missing, ...(missingImage ? ["一张实拍图"] : [])].join("、")}
        </p>
      )}
    </div>
  );
}

function RiskList({ flags }: { flags: RiskFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {flags.map((f) => (
        <div key={f.code + f.label} className="flex items-start gap-2">
          <Badge tone={f.level === "block" ? "red" : "amber"}>{f.label}</Badge>
          <span className="text-[12px] leading-relaxed text-ink-600">{f.note}</span>
        </div>
      ))}
    </div>
  );
}
