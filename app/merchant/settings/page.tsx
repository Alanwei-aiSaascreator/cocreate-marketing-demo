import Link from "next/link";
import { AiSettingsForm } from "@/components/AiSettingsForm";
import { aiSettingsView } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  // 在服务端就把状态取好传给表单 ——
  // 纯客户端取数会先闪一下"加载中"，而且首屏 HTML 里没有内容（不可测、也不利于排查）
  const initial = await aiSettingsView();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href="/merchant" className="text-xs text-ink-500 hover:text-ink-700">
          ← 返回活动列表
        </Link>
        <h1 className="mt-2 text-xl font-bold text-ink-900">AI 设置</h1>
        <p className="hint mt-1">
          在这里填入大模型密钥就能用真模型加工内容。<strong className="font-medium">不填也能完整跑通</strong>
          —— AI 层会自动降级到内置规则引擎，只是产出质量差一些。
        </p>
      </div>

      <AiSettingsForm initial={initial} />
    </div>
  );
}
