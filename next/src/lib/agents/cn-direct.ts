/**
 * cn-direct.ts — 国产大模型直连模块
 *
 * 跳过 CLI 中间层，直接调用兼容 OpenAI 接口的国产 LLM 供应商（智谱 GLM、
 * DeepSeek、通义千问、Moonshot）。返回与 invokeAgent() 相同的
 * ReadableStream<InvokeEvent>，可在 route.ts 中无缝替换。
 *
 * 注意：Node.js 原生 fetch 不遵循 HTTPS_PROXY / HTTP_PROXY 环境变量。
 * 国产 API 通常为境内直连无需代理；如确需代理，可引入 global-agent 等库
 * 在进程启动时全局拦截，或配置 undici 的 ProxyAgent。
 */

import type { InvokeEvent } from "./invoke";

// ─── 供应商注册表 ─────────────────────────────────────────────────────

export type CnProvider = {
  id: string;           // AGENTS 数组中的 agent id: "glm" | "deepseek" | "qwen-direct" | "moonshot"
  label: string;
  baseUrl: string;      // OpenAI 兼容 base URL（不含尾部 /v1）
  envKey: string;       // API key 对应的环境变量名
  defaultModel: string;
};

export const CN_PROVIDERS: CnProvider[] = [
  { id: "glm",          label: "智谱 GLM",       baseUrl: "https://open.bigmodel.cn/api/paas/v4", envKey: "ZHIPU_API_KEY",     defaultModel: "glm-5.3-flash" },
  { id: "deepseek",     label: "DeepSeek",        baseUrl: "https://api.deepseek.com",             envKey: "DEEPSEEK_API_KEY",  defaultModel: "deepseek-chat" },
  { id: "qwen-direct",  label: "通义千问 (Direct)", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode", envKey: "DASHSCOPE_API_KEY", defaultModel: "qwen-plus" },
  { id: "moonshot",     label: "Moonshot",        baseUrl: "https://api.moonshot.cn",              envKey: "MOONSHOT_API_KEY",   defaultModel: "moonshot-v1-8k" },
];

// ─── 函数签名与实现 ───────────────────────────────────────────────────

export type CnDirectOpts = {
  agent: string;       // 供应商 id（CN_PROVIDERS.id 之一）
  prompt: string;      // 完整 prompt 文本（system+user 由 route.ts 拼合）
  model?: string;      // model id 覆盖，缺省取 provider.defaultModel
  signal?: AbortSignal;
};

export function invokeCnDirect(opts: CnDirectOpts): ReadableStream<InvokeEvent> {
  const provider = CN_PROVIDERS.find((p) => p.id === opts.agent);
  if (!provider) {
    return errorStream(`unknown cn-direct agent: ${opts.agent}`);
  }

  const apiKey = process.env[provider.envKey];
  if (!apiKey) {
    return errorStream(
      `请设置环境变量 ${provider.envKey} 以使用 ${provider.label}。`,
    );
  }

  const model =
    opts.model && opts.model !== "default" ? opts.model : provider.defaultModel;

  return new ReadableStream<InvokeEvent>({
    async start(controller) {
      let closed = false;

      const safeEnqueue = (ev: InvokeEvent) => {
        if (closed) return;
        try {
          controller.enqueue(ev);
        } catch {
          closed = true;
        }
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {}
      };

      // ① start 事件
      safeEnqueue({
        type: "start",
        bin: provider.baseUrl,
        argv: [model],
        promptBytes: Buffer.byteLength(opts.prompt, "utf8"),
      });

      let response: Response;
      try {
        response = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: opts.prompt }],
            stream: true,
          }),
          signal: opts.signal,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        safeEnqueue({ type: "error", message });
        safeEnqueue({ type: "done", code: 1 });
        safeClose();
        return;
      }

      // ② 非 2xx 响应
      if (!response.ok) {
        let bodyText = "";
        try {
          bodyText = await response.text();
        } catch {}
        safeEnqueue({
          type: "error",
          message: `${provider.label} API 返回 HTTP ${response.status}: ${bodyText.slice(0, 500)}`,
        });
        safeEnqueue({ type: "done", code: 1 });
        safeClose();
        return;
      }

      // ③ 读取 SSE 流
      try {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let lastUsage: Record<string, unknown> | null = null;
        let sseFinished = false;

        while (!sseFinished) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trimEnd();
            buf = buf.slice(nl + 1);
            if (!line) continue;               // 空行（SSE 分隔符）
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") {
              sseFinished = true;
              break;
            }
            // 解析 JSON chunk
            try {
              const chunk = JSON.parse(data) as {
                choices?: Array<{
                  delta?: {
                    content?: string;
                    reasoning_content?: string;
                  };
                }>;
                usage?: Record<string, unknown>;
              };
              const delta = chunk.choices?.[0]?.delta;
              if (delta?.content) {
                safeEnqueue({ type: "delta", text: delta.content });
              }
              // DeepSeek R1 风格的思维链
              if (delta?.reasoning_content) {
                safeEnqueue({
                  type: "meta",
                  key: "thinking",
                  value: delta.reasoning_content,
                });
              }
              // 部分供应商在最后一个 chunk 中附带 usage
              if (chunk.usage) {
                lastUsage = chunk.usage;
              }
            } catch {
              // JSON 解析失败（部分供应商发送空 data 行）——静默跳过
            }
          }
        }

        // ④ 发送 usage 元数据（如有）
        if (lastUsage) {
          safeEnqueue({ type: "meta", key: "usage", value: lastUsage });
        }

        // ⑤ 正常结束
        safeEnqueue({ type: "done", code: 0 });
        safeClose();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        safeEnqueue({ type: "error", message });
        safeEnqueue({ type: "done", code: 1 });
        safeClose();
      }
    },

    cancel() {
      // 流消费者取消——由 route.ts 调用 cancel → 触发 abort signal
      // opts.signal 的 abort 在 fetch 内部自动处理
    },
  });
}

// ─── 工具函数 ─────────────────────────────────────────────────────────

function errorStream(message: string): ReadableStream<InvokeEvent> {
  return new ReadableStream<InvokeEvent>({
    start(controller) {
      controller.enqueue({ type: "error", message });
      controller.close();
    },
  });
}
