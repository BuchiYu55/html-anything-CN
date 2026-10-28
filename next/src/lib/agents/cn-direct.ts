/**
 * cn-direct.ts — 国产大模型直连模块
 *
 * 跳过 CLI 中间层，直接调用兼容 OpenAI 接口的国产 LLM 供应商（智谱 GLM、
 * DeepSeek、通义千问、Moonshot）。返回与 invokeAgent() 相同的
 * ReadableStream<InvokeEvent>，可在 route.ts 中无缝替换。
 *
 * 针对深度思考模型已做专属调优（如智谱 GLM-5.3 默认设置 reasoning_effort: "low" +
 * max_tokens: 16384），彻底杜绝思考超时导致正文截断、卡片仅出「01」等问题。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { InvokeEvent } from "./invoke";

// ─── 供应商注册表 ─────────────────────────────────────────────────────

export type CnProvider = {
  id: string;           // AGENTS 数组中的 agent id: "glm" | "deepseek" | "qwen-direct" | "moonshot"
  label: string;
  endpoint: string;     // 完整 chat completions 端点 URL
  envKey: string;       // API key 对应的环境变量名
  defaultModel: string;
};

export const CN_PROVIDERS: CnProvider[] = [
  {
    id: "glm",
    label: "智谱 GLM",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    envKey: "ZHIPU_API_KEY",
    defaultModel: "glm-5.3-flash",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com/chat/completions",
    envKey: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
  },
  {
    id: "qwen-direct",
    label: "通义千问 (Direct)",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    envKey: "DASHSCOPE_API_KEY",
    defaultModel: "qwen-plus",
  },
  {
    id: "moonshot",
    label: "Moonshot",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    envKey: "MOONSHOT_API_KEY",
    defaultModel: "moonshot-v1-8k",
  },
];

// ─── 用户自定义 Key 持久化 ──────────────────────────────────────────

export function getUserKeysPath(): string {
  const baseDir = process.env.APPDATA
    ? join(process.env.APPDATA, "html-anything-desktop")
    : join(homedir(), ".html-anything");
  return join(baseDir, "api-keys.json");
}

export function loadUserCustomKeys(): Record<string, string> {
  try {
    const p = getUserKeysPath();
    if (existsSync(p)) {
      const data = JSON.parse(readFileSync(p, "utf8"));
      if (data && typeof data === "object") return data as Record<string, string>;
    }
  } catch {}
  return {};
}

export function saveUserCustomKey(providerId: string, apiKey: string): void {
  try {
    const p = getUserKeysPath();
    const dir = join(p, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const current = loadUserCustomKeys();
    if (!apiKey) {
      delete current[providerId];
    } else {
      current[providerId] = apiKey.trim();
    }
    writeFileSync(p, JSON.stringify(current, null, 2), "utf8");
  } catch (err) {
    console.error("saveUserCustomKey failed:", err);
  }
}

/**
 * 解析供应商对应的 API Key。
 * 优先级：
 * 1. 显式传入（explicitKey）
 * 2. 本地持久化配置（loadUserCustomKeys）
 * 3. process.env[provider.envKey]（显式指定，如 ZHIPU_API_KEY）
 * 4. process.env.OPENAI_API_KEY（OpenAI 兼容通用环境变量，用于 GLM 等）
 * 5. ~/.qwen/.env 文件中定义的 key 或 OPENAI_API_KEY（复用已有配置）
 */
export function resolveCnApiKey(provider: CnProvider, explicitKey?: string): string | null {
  if (explicitKey?.trim()) return explicitKey.trim();

  const customKeys = loadUserCustomKeys();
  if (customKeys[provider.id]?.trim()) {
    return customKeys[provider.id].trim();
  }

  const envKey = provider.envKey;
  if (process.env[envKey]?.trim()) return process.env[envKey]!.trim();
  if (provider.id === "glm" && process.env.OPENAI_API_KEY?.trim()) {
    return process.env.OPENAI_API_KEY.trim();
  }
  try {
    const envFile = join(homedir(), ".qwen", ".env");
    if (existsSync(envFile)) {
      const lines = readFileSync(envFile, "utf8").split(/\r?\n/);
      const map: Record<string, string> = {};
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq !== -1) {
          map[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
        }
      }
      if (map[envKey]?.trim()) return map[envKey].trim();
      if (provider.id === "glm" && map.OPENAI_API_KEY?.trim()) {
        return map.OPENAI_API_KEY.trim();
      }
    }
  } catch {}
  return null;
}

// ─── 函数签名与实现 ───────────────────────────────────────────────────

export type CnDirectOpts = {
  agent: string;       // 供应商 id（CN_PROVIDERS.id 之一）
  prompt: string;      // 完整 prompt 文本（system+user 由 route.ts 拼合）
  model?: string;      // model id 覆盖，缺省取 provider.defaultModel
  signal?: AbortSignal;
  apiKey?: string;     // 可选前端传入的显式 API Key
};

export function invokeCnDirect(opts: CnDirectOpts): ReadableStream<InvokeEvent> {
  const provider = CN_PROVIDERS.find((p) => p.id === opts.agent);
  if (!provider) {
    return errorStream(`unknown cn-direct agent: ${opts.agent}`);
  }

  const apiKey = resolveCnApiKey(provider, opts.apiKey);
  if (!apiKey) {
    return errorStream(
      `请在设置中配置 API Key，或设置环境变量 ${provider.envKey} 以使用 ${provider.label}。`,
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
        bin: provider.endpoint,
        argv: [model],
        promptBytes: Buffer.byteLength(opts.prompt, "utf8"),
      });

      // 构造请求体，设置 16384 token 保证长页面完整闭合
      const requestBody: Record<string, unknown> = {
        model,
        messages: [{ role: "user", content: opts.prompt }],
        stream: true,
        max_tokens: 16384,
      };

      // 智谱 GLM 思考模型：设定轻量推理档位，杜绝思考 4 分钟耗尽 token 截断
      if (provider.id === "glm") {
        requestBody.thinking = { type: "enabled" };
        requestBody.reasoning_effort = "low";
      }

      let response: Response;
      try {
        response = await fetch(provider.endpoint, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
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
              // DeepSeek R1 / GLM 思考链
              if (delta?.reasoning_content) {
                safeEnqueue({
                  type: "meta",
                  key: "thinking",
                  value: delta.reasoning_content,
                });
              }
              // 供应商在最后一个 chunk 中附带 usage
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
