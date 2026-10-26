import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { invokeAgent, type InvokeEvent } from "../agents-invoke.js";

// Live round-trip against the real local agy CLI (Antigravity, Google AI
// Pro membership). Skipped unless AGY_LIVE=1 so normal test runs never
// spend account quota. The scratch cwd mirrors the incident-postmortem
// discipline: an auto-approved agent must never run in a code directory.
const live = !!process.env.AGY_LIVE;

describe.skipIf(!live)("agy live round-trip (real CLI, real account)", () => {
  it(
    "streams deltas and completes with exit code 0",
    async () => {
      const events: InvokeEvent[] = [];
      const scratch = mkdtempSync(path.join(tmpdir(), "agy-live-"));
      const stream = invokeAgent({
        agent: "agy",
        prompt: "请只回复四个汉字：直连成功",
        model: "gemini-3.8-flash-low",
        cwd: scratch,
      });
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        events.push(value);
      }

      const text = events
        .filter((e): e is Extract<InvokeEvent, { type: "delta" }> => e.type === "delta")
        .map((e) => e.text)
        .join("");
      const doneEv = events.find(
        (e): e is Extract<InvokeEvent, { type: "done" }> => e.type === "done",
      );
      const usage = events.find(
        (e): e is Extract<InvokeEvent, { type: "meta" }> => e.type === "meta" && e.key === "usage",
      );

      expect(text).toContain("直连成功");
      expect(doneEv?.code).toBe(0);
      expect(usage).toBeDefined();
    },
    180_000,
  );
});
