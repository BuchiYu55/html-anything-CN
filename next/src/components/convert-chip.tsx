"use client";

import { useCallback, useEffect } from "react";
import { useStore, selectActiveTask } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useConvert } from "@/lib/use-convert";
import { resolveAgentModel } from "@/lib/agent-models";

/**
 * Floating chip pinned to the editor / preview divider — the single Convert
 * entry point. The toolbar no longer has its own Convert button (removed to
 * avoid duplication), so this chip also owns the ⌘/Ctrl+Enter shortcut.
 */
export function ConvertChip() {
  const agent = useStore((s) => s.selectedAgent);
  const agents = useStore((s) => s.agents);
  const agentModels = useStore((s) => s.agentModels);
  const activeTaskId = useStore((s) => s.activeTaskId);
  const template = useStore((s) => selectActiveTask(s)?.templateId ?? "article-magazine");
  const content = useStore((s) => selectActiveTask(s)?.content ?? "");
  const format = useStore((s) => selectActiveTask(s)?.format ?? "text");
  const status = useStore((s) => selectActiveTask(s)?.status ?? "idle");
  const layoutMode = useStore((s) => s.layoutMode);
  const { run, cancel } = useConvert();
  const t = useT();

  const agentInfo = agents.find((a) => a.id === agent);
  // A stale persisted pick falls back to Default and is never sent on.
  const model = agent ? resolveAgentModel(agentInfo?.models, agentModels[agent]) : "default";
  const canConvert =
    !!agent && !!content.trim() && status !== "running" && !agentInfo?.unsupported;

  const isRunning = status === "running";

  const tip = !agent
    ? t("toolbar.firstSelectAgent")
    : agentInfo?.unsupported
      ? t("toolbar.unsupportedProtocol")
      : !content.trim()
        ? t("toolbar.enterContent")
        : t("convertChip.tooltip");

  const onClick = useCallback(() => {
    if (isRunning) {
      cancel(activeTaskId);
      return;
    }
    if (!canConvert) return;
    run({ taskId: activeTaskId, agent: agent!, templateId: template, content, format, model });
  }, [isRunning, canConvert, cancel, run, activeTaskId, agent, template, content, format, model]);

  // ⌘/Ctrl + Enter — global shortcut, fires Convert from anywhere on the page.
  // Lives here (not in Toolbar) because the chip is the single source of
  // Convert truth after the toolbar button was removed.
  useEffect(() => {
    if (layoutMode !== "split") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (isRunning || !canConvert) return;
        e.preventDefault();
        onClick();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layoutMode, onClick, isRunning, canConvert]);

  // Only show in split mode — when only one pane is visible there's no
  // divider to hang off, and the toolbar button is already obvious.
  if (layoutMode !== "split") return null;

  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-1/2 z-30 flex items-center"
      style={{ transform: "translateX(-50%)" }}
    >
      <button
        onClick={onClick}
        disabled={!isRunning && !canConvert}
        title={tip}
        aria-label={t("convertChip.label")}
        className="pointer-events-auto group relative flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium shadow-xl transition-all hover:scale-[1.03] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          background: isRunning ? "var(--coral-hover)" : "var(--coral)",
          color: "#fff",
                    boxShadow: "0 8px 24px rgba(201, 100, 66, 0.38), 0 2px 6px rgba(0,0,0,0.08)",
          border: "1px solid rgba(255,255,255,0.25)",
        }}
      >
        {isRunning ? (
          <>
            <span className="pulse-dot" style={{ background: "#fff" }} />
            {t("toolbar.stop")}
          </>
        ) : (
          <>
            <span aria-hidden>⚡</span>
            {t("convertChip.label")}
            <span className="hidden text-[10.5px] opacity-70 sm:inline">⌘↵</span>
          </>
        )}
      </button>
    </div>
  );
}
