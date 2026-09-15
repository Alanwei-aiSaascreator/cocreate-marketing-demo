import Link from "next/link";
import { ArrowRight, Sparkles, Users, Wand2, Gift } from "lucide-react";
import { listCampaigns } from "@/lib/queries";
import { Card } from "@/components/ui";
import { PLATFORM_META } from "@/lib/types";

const LOOP = [
  {
    icon: Wand2,
    step: "01",
    title: "商家定框架",
    desc: "录入店铺信息和卖点，AI 生成各平台内容框架、老客任务卡、奖励阶梯。",
  },
  {
    icon: Users,
    step: "02",
    title: "老客出真话",
    desc: "扫码进 H5，30 秒填空题 + 一张实拍图。不写作文，只出真实体验。",
  },
  {
    icon: Sparkles,
    step: "03",
    title: "AI 适配多平台",
    desc: "同一份素材，产出小红书 / 抖音 / 大众点评 / 朋友圈四种调性的内容。",
  },
  {
    icon: Gift,
    step: "04",
    title: "按真贡献发福利",
    desc: "贡献值可拆解，绑定「被采用」和「带来真实点击」，发店铺福利而非现金。",
  },
];

export default async function HomePage() {
  const campaigns = await listCampaigns();
  const latest = campaigns[0];

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
            共
          </div>
          <span className="text-sm font-semibold text-ink-900">共创营销 Demo</span>
        </div>
        <Link href="/merchant" className="btn btn-ghost">
          商家后台
        </Link>
      </header>

      <section className="mt-14">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
          <Sparkles className="h-3.5 w-3.5" />
          商家 × AI × 老客
        </span>
        <h1 className="mt-5 text-3xl font-bold leading-tight text-ink-900 sm:text-4xl">
          商家定框架，AI 出任务，
          <br className="hidden sm:block" />
          老客出真话，AI 适配全网。
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-600">
          纯靠商家用 AI 硬写内容，同质化、广告感重，平台不爱推。把老客拉进来做共创，
          用真实体验和实拍图打底，AI 再加工适配不同平台 —— 内容更能打，
          同时激活老客、拉来新客。这不是又一个 AI 文案工具，而是一条
          <span className="font-medium text-ink-900"> 从内容生产到贡献结算的完整闭环</span>。
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {latest ? (
            <>
              <Link href={`/merchant/campaigns/${latest.id}`} className="btn btn-primary">
                进入商家工作台
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href={`/c/${latest.publicToken}`} className="btn btn-ghost">
                以老客身份体验 H5
              </Link>
            </>
          ) : (
            <Link href="/merchant/campaigns/new" className="btn btn-primary">
              创建第一个共创活动
            </Link>
          )}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-sm font-semibold text-ink-500">闭环怎么转</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {LOOP.map((item) => (
            <Card key={item.step} hover className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-ink-400">{item.step}</span>
                  <h3 className="text-sm font-semibold text-ink-900">{item.title}</h3>
                </div>
                <p className="hint mt-1.5">{item.desc}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-ink-900">踩住的两个坑</h2>
          <ul className="mt-3 space-y-3 text-[13px] leading-relaxed text-ink-600">
            <li>
              <span className="font-medium text-ink-800">不让老客自由创作。</span>
              用户只做结构化填空（一句感受 / 一张实拍图 / 一个推荐项），
              AI 在商家设定的框架内加工 —— 放开自由发挥，内容质量和合规会同时崩。
            </li>
            <li>
              <span className="font-medium text-ink-800">不搞「交稿就给钱」。</span>
              贡献值拆成 5 项，其中「被商家采用 +30」「带来有效点击 +5/次（封顶 50）」，
              提交即全额的玩法一定会退化成廉价刷稿。
            </li>
          </ul>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-ink-900">适配的平台调性</h2>
          <div className="mt-3 space-y-2.5">
            {Object.values(PLATFORM_META).map((p) => (
              <div key={p.id} className="flex gap-3">
                <span className="mt-0.5 text-base">{p.emoji}</span>
                <div>
                  <div className="text-[13px] font-medium text-ink-800">
                    {p.name}
                    <span className="ml-2 font-normal text-ink-400">
                      {p.length[0]}-{p.length[1]} 字
                    </span>
                  </div>
                  <p className="hint">{p.tone}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-14">
        <div className="card bg-ink-900 p-5">
          <h2 className="text-sm font-semibold text-white">刻意没做的部分</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-300">
            这是一个用来验证玩法闭环的 Demo，以下重模块明确后置，不假装已经做完：
          </p>
          <div className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] text-ink-300 sm:grid-cols-2">
            <span>· 真实多平台一键发布（开放接口与风控成本极高）</span>
            <span>· 精细效果归因（需平台侧数据回传，现用点击上报模拟）</span>
            <span>· 自动结算打款（涉及资金合规）</span>
            <span>· 完整风控反刷（现做图片查重 + 频次 + 灌水 + 私域截流检测）</span>
            <span>· 账号体系（改用免登录 token 链接，降低老客参与门槛）</span>
            <span>· 感知哈希与图像相似度检索（现用文件内容 sha256 查重）</span>
          </div>
        </div>
      </section>

      <footer className="mt-12 border-t border-ink-200 pt-6 text-xs text-ink-400">
        商家 × AI × 老客 共创营销 Demo · 数据全部本地 SQLite，可离线运行
      </footer>
    </main>
  );
}
