// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invokeCnDirect, CN_PROVIDERS } from "../cn-direct";
import { invokeAgent } from "../invoke";
import type { InvokeEvent } from "../invoke";

async function collectEvents(stream: ReadableStream<InvokeEvent>): Promise<InvokeEvent[]> {
  const reader = stream.getReader();
  const events: InvokeEvent[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) events.push(value);
  }
  return events;
}

describe("cn-direct", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("exports 4 CN providers with correct endpoints", () => {
    expect(CN_PROVIDERS.map((p) => p.id)).toEqual([
      "glm",
      "deepseek",
      "qwen-direct",
      "moonshot",
    ]);
    expect(CN_PROVIDERS.find((p) => p.id === "glm")?.endpoint).toBe(
      "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    );
  });

  it("returns error when agent is unknown", async () => {
    const stream = invokeCnDirect({
      agent: "unknown-agent",
      prompt: "hello",
    });
    const events = await collectEvents(stream);
    expect(events).toEqual([
      { type: "error", message: "unknown cn-direct agent: unknown-agent" },
    ]);
  });

  it("returns error when API key is missing", async () => {
    delete process.env.MOONSHOT_API_KEY;
    const stream = invokeCnDirect({
      agent: "moonshot",
      prompt: "hello",
    });
    const events = await collectEvents(stream);
    expect(events).toEqual([
      {
        type: "error",
        message: "请设置环境变量 MOONSHOT_API_KEY 以使用 Moonshot。",
      },
    ]);
  });

  it("streams deltas and thinking from SSE response", async () => {
    process.env.ZHIPU_API_KEY = "test-key";

    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"<!DOCTYPE "}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"thinking process"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"html>"}}]}\n\n',
      "data: [DONE]\n\n",
    ].join("");

    const mockResponse = new Response(sseChunks, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

    const stream = invokeCnDirect({
      agent: "glm",
      prompt: "test prompt",
    });

    const events = await collectEvents(stream);

    expect(events).toEqual([
      {
        type: "start",
        bin: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        argv: ["glm-5.3-flash"],
        promptBytes: Buffer.byteLength("test prompt", "utf8"),
      },
      { type: "delta", text: "<!DOCTYPE " },
      { type: "meta", key: "thinking", value: "thinking process" },
      { type: "delta", text: "html>" },
      { type: "done", code: 0 },
    ]);
  });

  it("handles HTTP error response", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";

    const mockResponse = new Response("Unauthorized: invalid key", {
      status: 401,
      statusText: "Unauthorized",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

    const stream = invokeCnDirect({
      agent: "deepseek",
      prompt: "test",
    });

    const events = await collectEvents(stream);

    expect(events).toEqual([
      {
        type: "start",
        bin: "https://api.deepseek.com/chat/completions",
        argv: ["deepseek-chat"],
        promptBytes: Buffer.byteLength("test", "utf8"),
      },
      {
        type: "error",
        message: "DeepSeek API 返回 HTTP 401: Unauthorized: invalid key",
      },
      { type: "done", code: 1 },
    ]);
  });

  it("invokeAgent routes cn-direct agents without spawning CLI", async () => {
    process.env.ZHIPU_API_KEY = "test-key";

    const sseChunks = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n';
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(sseChunks, { status: 200 }));

    const stream = invokeAgent({
      agent: "glm",
      prompt: "hello",
    });

    const events = await collectEvents(stream);
    expect(events.some((e) => e.type === "delta" && e.text === "ok")).toBe(true);
    expect(events.some((e) => e.type === "done" && e.code === 0)).toBe(true);
  });
});
