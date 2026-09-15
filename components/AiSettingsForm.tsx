"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, PlugZap, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiSettingsView } from "@/lib/settings";

const SOURCE_LABEL: Record<string, { text: string; tone: string }> = {
  ui: { text: "来自界面设置", tone: "text-emerald-700" },
  env: { text: "来自 .env", tone: "text-blue-700" },
  none: { text: "未配置", tone: "text-amber-700" },
};

export function AiSettingsForm({ initial }: { initial: AiSettingsView }) {
  // 初始状态由服务端直接给，首屏就有内容、不闪"加载中"
  const [state, setState] = useState<AiSettingsView>(initial);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [model, setModel] = useState(initial.model);
  const [mode, setMode] = useState<AiSettingsView["mode"]>(initial.mode);

  const [busy, setBusy] = useState<"" | "test" | "save" | "clear">("");
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function refresh() {
    const res = await fetch("/api/merchant/settings/ai");
    const data = (await res.json()) as AiSettingsView;
    setState(data);
    setBaseUrl(data.baseUrl);
    setModel(data.model);
    setMode(data.mode);
  }

  // 挂载后仍拉一次：服务端渲染到用户交互之间可能已经过了几秒
  useEffect(() => {
    void refresh();
  }, []);

  async function call(action: "test" | "save" | "clear") {
    setBusy(action);
    setMsg(null);
    if (action === "test") setTestResult(null);

    try {
      const res = await fetch("/api/merchant/settings/ai", {
        method: action === "clear" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body:
          action === "clear"
            ? undefined
            : JSON.stringify({
                action: action === "test" ? "test" : undefined,
                // 只有真的输入了才提交，避免用空串把已存的 key 清掉
                apiKey: apiKey.trim() ? apiKey.trim() : undefined,
                baseUrl: baseUrl.trim(),
                model: model.trim(),
                mode,
              }),
      });
      const data = await res.json();

      if (action === "test") {
        setTestResult({
          ok: !!data.ok,
          text: data.ok
            ? `连通正常（${data.elapsedMs}ms，模型返回「${data.reply}」）`
            : `失败：${data.error ?? "未知错误"}`,
        });
        return;
      }

      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "操作失败" });
        return;
      }

      setMsg({ ok: true, text: data.message ?? "已保存" });
      if (action === "save") setApiKey(""); // 保存后清空输入框，不再留着明文
      await refresh();
    } catch {
      const text = "网络异常，请重试";
      if (action === "test") setTestResult({ ok: false, text });
      else setMsg({ ok: false, text });
    } finally {
      setBusy("");
    }
  }

  if (!state) {
    return (
      <div className="card p-6 text-center text-sm text-ink-400">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      </div>
    );
  }

  const source = SOURCE_LABEL[state.apiKeySource];
  return (
    <div className="space-y-4">
      {/* 当前状态 */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink-900">当前状态</h2>
        <div className="mt-3 space-y-2 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-500">密钥</span>
            {state.configured ? (
              <span className="font-mono text-ink-800">{state.apiKeyMasked}</span>
            ) : (
              <span className="text-amber-700">未配置</span>
            )}
            <span className={cn("text-[11px]", source.tone)}>（{source.text}）</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-500">接口地址</span>
            <span className="font-mono text-ink-800">{state.baseUrl}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-500">模型</span>
            <span className="font-mono text-ink-800">{state.model}</span>
            <span className="text-ink-500">· 模式</span>
            <span className="font-mono text-ink-800">{state.mode}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-500">AI 加工</span>
            {state.enabled ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                会调用大模型
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                不调用模型，全部走规则引擎（闭环照样跑通）
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 输入 */}
      <div className="card p-5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
          <KeyRound className="h-4 w-4 text-brand-500" />
          填入密钥
        </h2>
        <p className="hint mt-1">
          保存后**立即生效，不需要重启服务**。留空则不改动已保存的密钥。
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="label">API Key</label>
            <input
              className="field font-mono"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={state.configured ? "已配置（留空则不修改）" : "sk-..."}
              autoComplete="off"
            />
            <p className="hint mt-1">
              任何 OpenAI 兼容接口都可以：DeepSeek / 通义 / 智谱 / OpenAI / 自建网关。
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">接口地址</label>
              <input
                className="field font-mono"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={state.defaults.baseUrl}
              />
            </div>
            <div>
              <label className="label">模型名</label>
              <input
                className="field font-mono"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={state.defaults.model}
              />
            </div>
          </div>

          <div>
            <label className="label">调用模式</label>
            <div className="flex flex-wrap gap-2">
              {([
                { v: "auto", t: "auto · 失败自动降级" },
                { v: "llm", t: "llm · 严格模式（失败即报错）" },
                { v: "rule", t: "rule · 只用规则引擎" },
              ] as const).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setMode(o.v)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs",
                    mode === o.v
                      ? "border-brand-400 bg-brand-50 font-medium text-brand-700"
                      : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
                  )}
                >
                  {o.t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost text-xs"
            disabled={busy !== ""}
            onClick={() => call("test")}
          >
            {busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
            测试连接
          </button>
          <button
            type="button"
            className="btn btn-primary text-xs"
            disabled={busy !== ""}
            onClick={() => call("save")}
          >
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            保存
          </button>
          {state.apiKeySource === "ui" && (
            <button
              type="button"
              className="btn btn-ghost text-xs"
              disabled={busy !== ""}
              onClick={() => call("clear")}
            >
              {busy === "clear" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              清除界面设置
            </button>
          )}
        </div>

        {testResult && (
          <div
            className={cn(
              "mt-3 rounded-lg border px-3 py-2 text-[12px] leading-relaxed",
              testResult.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800",
            )}
          >
            {testResult.text}
          </div>
        )}
        {msg && (
          <div
            className={cn(
              "mt-3 rounded-lg border px-3 py-2 text-[12px] leading-relaxed",
              msg.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800",
            )}
          >
            {msg.text}
          </div>
        )}
      </div>

      {/* 存储说明 —— 如实说，不假装安全 */}
      <div className="card border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <div>
            <div className="text-[12px] font-medium text-amber-900">关于密钥存储</div>
            <p className="mt-1 text-[12px] leading-relaxed text-amber-800">{state.storageNote}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-amber-800">
              另外：这个页面本身受商家口令（<code className="rounded bg-white/70 px-1">MERCHANT_PASSWORD</code>）保护。
              没设口令时它和其他商家页面一样是开放的 —— 那种情况下请不要在公网部署上填真 key。
            </p>
          </div>
        </div>
      </div>

      {/* 优先级说明 */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink-900">配置优先级</h2>
        <div className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-ink-600">
          <p>
            <span className="font-medium text-ink-800">界面设置 &gt; 环境变量（.env）</span>
            —— 界面上填过的会覆盖 .env，所以「刚填了怎么不生效」不会发生。
          </p>
          <p>
            留空某一项并保存，等于<strong className="font-medium">删掉</strong>这一项界面设置，
            让 .env 重新接管（而不是存一个空字符串把它挡住）。
          </p>
        </div>
      </div>
    </div>
  );
}
