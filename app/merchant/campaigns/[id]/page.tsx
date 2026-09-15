import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  MapPin,
  MousePointerClick,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { getWorkspace } from "@/lib/queries";
import { AiModeTag, Badge, Card, EmptyState, PlatformBadge, ProgressBar, Stat } from "@/components/ui";
import { AiQualityCard } from "@/components/AiQualityCard";
import { ContentLibrary } from "@/components/ContentLibrary";
import { QrCard } from "@/components/QrCard";
import { RedeemButton } from "@/components/actions";
import { RerunButton } from "@/components/RerunButton";
import { cn, formatDateTime, timeAgo, yuan } from "@/lib/utils";
import { PLATFORM_META, type RiskFlag } from "@/lib/types";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "概览" },
  { key: "contents", label: "内容库" },
  { key: "submissions", label: "素材与风控" },
  { key: "leaderboard", label: "贡献榜" },
  { key: "rewards", label: "奖励账本" },
  { key: "kit", label: "任务卡与二维码" },
] as const;

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = (TABS.find((t) => t.key === tabParam)?.key ?? "overview") as (typeof TABS)[number]["key"];

  const ws = await getWorkspace(id);
  if (!ws) notFound();

  const { merchant, campaign, metrics, leaderboard, submissions, contents, rewards, contributions, aiQuality } = ws;

  return (
    <div>
      {/* 头部 */}
      <div className="mb-6">
        <Link href="/merchant" className="text-xs text-ink-500 hover:text-ink-700">
          ← 活动列表
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink-900">{campaign.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {merchant.city} · {merchant.name}
              </span>
              <Badge tone="brand">{campaign.objective}</Badge>
              {campaign.platforms.map((p) => (
                <PlatformBadge key={p} platform={p} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* 有降级就在头部直接报出来，不让商家必须翻到概览才发现 */}
            {aiQuality.degraded > 0 && (
              <Badge tone="red">
                AI 降级 {aiQuality.degraded} 条
              </Badge>
            )}
            <AiModeTag mode={campaign.aiMode} note={campaign.aiNote} />
            <RerunButton campaignId={campaign.id} />
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-ink-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/merchant/campaigns/${campaign.id}?tab=${t.key}`}
            className={cn(
              "-mb-px border-b-2 px-3.5 py-2.5 text-sm transition",
              tab === t.key
                ? "border-brand-500 font-medium text-brand-700"
                : "border-transparent text-ink-500 hover:text-ink-800",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* ── 概览 ── */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="参与老客" value={metrics.contributors} unit="人" />
            <Stat label="老客素材" value={metrics.submissions} unit="条" hint={`风控拦截 ${metrics.blocked} 条`} />
            <Stat label="AI 内容产出" value={metrics.contents} unit="条" tone="brand" hint={`已采用 ${metrics.adopted} 条`} />
            <Stat
              label="已发店铺福利"
              value={metrics.rewardsIssued}
              unit="张"
              hint={`已核销 ${metrics.rewardsRedeemed} 张`}
            />
          </div>

          {/* AI 生成质量：放在最显眼处，这是运维要盯的第一个数字 */}
          <AiQualityCard quality={aiQuality} />

          {/* 闭环漏斗 */}
          <Card>
            <h2 className="text-sm font-semibold text-ink-900">闭环漏斗</h2>
            <p className="hint mt-1">
              从老客出真话到带来真实回流，每一环都有对应的数据支撑。
            </p>
            <div className="mt-4 space-y-3">
              {[
                { label: "老客提交素材", value: metrics.submissions, icon: Users, tone: "text-ink-600" },
                {
                  label: "通过风控进入内容库",
                  value: metrics.submissions - metrics.blocked,
                  icon: CheckCircle2,
                  tone: "text-emerald-600",
                },
                { label: "AI 加工成多平台内容", value: metrics.contents, icon: Sparkles, tone: "text-brand-600" },
                { label: "被商家采用", value: metrics.adopted, icon: CheckCircle2, tone: "text-violet-600" },
                {
                  label: "带来有效点击回流",
                  value: metrics.clicks,
                  icon: MousePointerClick,
                  tone: "text-blue-600",
                },
                { label: "发放店铺福利", value: metrics.rewardsIssued, icon: ArrowUpRight, tone: "text-amber-600" },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <row.icon className={cn("h-4 w-4 shrink-0", row.tone)} />
                  <span className="w-44 shrink-0 text-[13px] text-ink-700">{row.label}</span>
                  <ProgressBar
                    value={row.value}
                    max={Math.max(metrics.contents, metrics.clicks, metrics.submissions, 1)}
                    className="flex-1"
                  />
                  <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-ink-900">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 border-t border-ink-100 pt-4 text-xs text-ink-500 sm:grid-cols-3">
              <span>累计发放贡献值：{metrics.pointsIssued}</span>
              <span>分享次数：{metrics.shares}</span>
              <span>触发风控提醒：{metrics.warned} 条</span>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="text-sm font-semibold text-ink-900">各平台内容框架</h2>
              <div className="mt-3 space-y-3">
                {campaign.frames.map((f) => {
                  const meta = PLATFORM_META[f.platform];
                  return (
                    <div key={f.platform} className="border-b border-ink-100 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <PlatformBadge platform={f.platform} />
                        <span className="text-xs text-ink-400">
                          {f.wordRange[0]}-{f.wordRange[1]} 字
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] text-ink-700">{f.angle}</p>
                      <p className="hint mt-1">{meta.structure.join(" → ")}</p>
                    </div>
                  );
                })}
              </div>
            </Card>

            <div className="space-y-4">
              <QrCard
                path={`/c/${campaign.publicToken}`}
                title="老客共创入口"
                desc="老客扫码即可参与，免登录。"
              />
              <Card>
                <h2 className="text-sm font-semibold text-ink-900">最近动态</h2>
                <div className="mt-3 space-y-2.5">
                  {contributions.slice(0, 6).map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5 text-[13px]">
                      <span className="mt-0.5">{c.contributor.avatarEmoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-ink-700">
                            {c.contributor.nickname} · {c.reason}
                          </span>
                          <span className="shrink-0 font-medium tabular-nums text-brand-600">
                            +{c.points}
                          </span>
                        </div>
                        <span className="hint">{timeAgo(c.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                  {contributions.length === 0 && <EmptyState title="还没有贡献记录" />}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ── 内容库 ── */}
      {tab === "contents" && <ContentLibrary contents={contents} />}

      {/* ── 素材与风控 ── */}
      {tab === "submissions" && (
        <div className="space-y-4">
          <Card className="!p-4">
            <div className="flex flex-wrap items-center gap-4 text-xs text-ink-600">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                通过 {metrics.submissions - metrics.blocked} 条
              </span>
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                触发提醒 {metrics.warned} 条
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Ban className="h-3.5 w-3.5 text-red-500" />
                被拦截 {metrics.blocked} 条
              </span>
              <span className="hint ml-auto">
                每个判定都可解释 —— 老客看得到自己为什么被扣分，商家看得到为什么拦。
              </span>
            </div>
          </Card>

          {submissions.length === 0 ? (
            <EmptyState title="还没有老客提交素材" />
          ) : (
            <div className="space-y-3">
              {submissions.map((s) => {
                const flags = s.riskFlags as RiskFlag[];
                const blocked = s.status === "rejected";
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "card p-4",
                      blocked && "border-red-200 bg-red-50/40",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{s.contributor.avatarEmoji}</span>
                        <span className="text-sm font-medium text-ink-900">
                          {s.contributor.nickname}
                        </span>
                        <span className="text-xs text-ink-400">{formatDateTime(s.createdAt)}</span>
                        {blocked ? (
                          <Badge tone="red">已拦截</Badge>
                        ) : s.status === "adopted" ? (
                          <Badge tone="green">已采用</Badge>
                        ) : (
                          <Badge tone="gray">待处理</Badge>
                        )}
                        {s.contentCount > 0 && (
                          <Badge tone="blue">{s.contentCount} 条内容</Badge>
                        )}
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-brand-600">
                        +{s.points} 贡献值
                      </span>
                    </div>

                    <div className="mt-3 flex gap-4">
                      {s.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.imageUrl}
                          alt="老客实拍图"
                          className="h-20 w-20 shrink-0 rounded-lg border border-ink-200 object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1 grid gap-1 text-[13px] sm:grid-cols-2">
                        {Object.entries(s.answers).map(([k, v]) => (
                          <div key={k} className="min-w-0">
                            <span className="text-ink-400">{k}：</span>
                            <span className="text-ink-700">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {flags.length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t border-ink-100 pt-3">
                        {flags.map((f) => (
                          <div
                            key={f.code + f.label}
                            className={cn(
                              "flex items-start gap-1.5 text-xs",
                              f.level === "block" ? "text-red-700" : "text-amber-700",
                            )}
                          >
                            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                              <span className="font-medium">{f.label}：</span>
                              {f.note}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 贡献榜 ── */}
      {tab === "leaderboard" && (
        <Card className="!p-0">
          {leaderboard.length === 0 ? (
            <div className="p-5">
              <EmptyState title="还没有老客参与" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs text-ink-500">
                    <th className="px-5 py-3 font-medium">排名</th>
                    <th className="px-5 py-3 font-medium">老客</th>
                    <th className="px-5 py-3 text-right font-medium">贡献值</th>
                    <th className="px-5 py-3 text-right font-medium">有效素材</th>
                    <th className="px-5 py-3 text-right font-medium">被采用</th>
                    <th className="px-5 py-3 text-right font-medium">带来点击</th>
                    <th className="px-5 py-3 text-right font-medium">获得福利</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, i) => (
                    <tr key={row.contributorId} className="border-b border-ink-100 last:border-0">
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                            i === 0
                              ? "bg-amber-100 text-amber-700"
                              : i === 1
                                ? "bg-ink-200 text-ink-700"
                                : i === 2
                                  ? "bg-orange-100 text-orange-700"
                                  : "text-ink-400",
                          )}
                        >
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="mr-1.5">{row.avatarEmoji}</span>
                        <span className="font-medium text-ink-900">{row.nickname}</span>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-brand-600">
                        {row.points}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink-700">
                        {row.submissions}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink-700">{row.adopted}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink-700">{row.clicks}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink-700">{row.rewards}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── 奖励账本 ── */}
      {tab === "rewards" && (
        <Card className="!p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-ink-900">奖励账本</h2>
              <p className="hint mt-0.5">
                全部为店铺福利（券 / 赠品），不含现金。每张券可追溯到是哪一笔贡献换来的。
              </p>
            </div>
            <div className="text-xs text-ink-500">
              已发 {metrics.rewardsIssued} 张 · 已核销 {metrics.rewardsRedeemed} 张
            </div>
          </div>

          {rewards.length === 0 ? (
            <div className="p-5">
              <EmptyState title="还没有发出福利" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs text-ink-500">
                    <th className="px-5 py-3 font-medium">老客</th>
                    <th className="px-5 py-3 font-medium">档位</th>
                    <th className="px-5 py-3 font-medium">福利内容</th>
                    <th className="px-5 py-3 font-medium">券码</th>
                    <th className="px-5 py-3 font-medium">状态</th>
                    <th className="px-5 py-3 text-right font-medium">发放时间</th>
                    <th className="px-5 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rewards.map((r) => (
                    <tr key={r.id} className="border-b border-ink-100 last:border-0">
                      <td className="px-5 py-3">
                        <span className="mr-1.5">{r.contributor.avatarEmoji}</span>
                        <span className="font-medium text-ink-900">{r.contributor.nickname}</span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={r.type === "gift" ? "violet" : "brand"}>{r.tierName}</Badge>
                      </td>
                      <td className="px-5 py-3 text-ink-700">
                        {r.title}
                        {r.value > 0 && (
                          <span className="ml-1.5 text-xs text-ink-400">¥{yuan(r.value)}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-600">{r.code}</td>
                      <td className="px-5 py-3">
                        {r.status === "redeemed" ? (
                          <Badge tone="gray">已核销</Badge>
                        ) : (
                          <Badge tone="green">待使用</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-ink-500">
                        {r.redeemedAt
                          ? `核销于 ${formatDateTime(r.redeemedAt)}`
                          : formatDateTime(r.issuedAt)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <RedeemButton rewardId={r.id} status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── 任务卡与二维码 ── */}
      {tab === "kit" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="text-sm font-semibold text-ink-900">老客任务卡</h2>
            <p className="hint mt-1">
              刻意设计成「只填空、不写作文」。每个字段都注明了它的产品意图。
            </p>
            <div className="mt-4 space-y-3">
              {campaign.taskCard.map((f, i) => (
                <div key={f.id} className="rounded-lg border border-ink-200 p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-ink-400">{i + 1}</span>
                    <span className="text-[13px] font-medium text-ink-900">{f.label}</span>
                    {f.required && <Badge tone="red">必填</Badge>}
                    <Badge tone={f.type === "image" ? "violet" : "gray"}>{f.type}</Badge>
                  </div>
                  {f.placeholder && <p className="hint mt-1.5">示例：{f.placeholder}</p>}
                  <p className="hint mt-1.5 text-ink-500">
                    <span className="font-medium">设计意图：</span>
                    {f.why}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <h2 className="text-sm font-semibold text-ink-900">奖励阶梯</h2>
              <p className="hint mt-1">贡献值达标即自动发券，无需人工审批。</p>
              <div className="mt-3 space-y-2">
                {campaign.rewardTiers.map((t) => (
                  <div
                    key={t.name}
                    className="flex items-center justify-between rounded-lg border border-ink-200 px-3 py-2.5"
                  >
                    <div>
                      <div className="text-[13px] font-medium text-ink-900">{t.title}</div>
                      <div className="hint">{t.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums text-brand-600">
                        {t.threshold}
                      </div>
                      <div className="text-[11px] text-ink-400">贡献值</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <QrCard
              path={`/c/${campaign.publicToken}`}
              title="老客共创入口"
              desc="把这张二维码放在店内、或者发给老客群，扫码即参与。"
            />

            <Card>
              <h2 className="text-sm font-semibold text-ink-900">AI 生成说明</h2>
              <p className="hint mt-2">{campaign.aiNote}</p>
              <p className="hint mt-2">
                生成方式：{campaign.aiMode === "llm" ? "大语言模型" : "内置规则引擎"}。
                无 key、断网或模型限流时自动降级，界面会如实标注，不糊弄。
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
