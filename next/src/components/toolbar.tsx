"use client";

import { useState, useCallback, useEffect } from "react";
import { useStore, selectActiveTask } from "@/lib/store";
import { useConvert } from "@/lib/use-convert";
import { useT } from "@/lib/i18n";
import { resolveAgentModel } from "@/lib/agent-models";
import { TemplatePicker } from "./template-picker";
import { ExportMenu } from "./export-menu";
import { LayoutModeToggle } from "./layout-mode-toggle";
import { DeployControl } from "./deploy-control";

export function Toolbar({
  iframeRef,
  onOpenAgentPicker,
  onOpenSettings,
  onRequestConfigureDeploy,
  deployConfigRev,
}: {
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  onOpenAgentPicker: () => void;
  onOpenSettings: () => void;
  onRequestConfigureDeploy: () => void;
  deployConfigRev: number;
}) {
  const agent = useStore((s) => s.selectedAgent);
  const agents = useStore((s) => s.agents);
  const agentModels = useStore((s) => s.agentModels);
  const t = useT();

  const agentInfo = agents.find((a) => a.id === agent);
  // A stale persisted pick falls back to Default and is never sent on.
  const model = agent ? resolveAgentModel(agentInfo?.models, agentModels[agent]) : "default";

  const activeTaskId = useStore((s) => s.activeTaskId);
  const template = useStore((s) => selectActiveTask(s)?.templateId ?? "article-magazine");
  const content = useStore((s) => selectActiveTask(s)?.content ?? "");
  const format = useStore((s) => selectActiveTask(s)?.format ?? "text");
  const status = useStore((s) => selectActiveTask(s)?.status ?? "idle");
  const { run, cancel } = useConvert();

  const isRunning = status === "running";
  const canConvert =
    !!agent && !!content.trim() && status !== "running" && !agentInfo?.unsupported;

  const onConvert = useCallback(() => {
    if (isRunning) {
      cancel(activeTaskId);
      return;
    }
    if (!canConvert) return;
    run({ taskId: activeTaskId, agent: agent!, templateId: template, content, format, model });
  }, [isRunning, canConvert, cancel, run, activeTaskId, agent, template, content, format, model]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (isRunning || !canConvert) return;
        e.preventDefault();
        onConvert();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onConvert, isRunning, canConvert]);

  return (
    <header
      className="relative z-40 flex flex-wrap items-center justify-between gap-3 px-5 py-3"
      style={{
        background: "rgba(250, 249, 247, 0.92)",
        borderBottom: "1px solid var(--line-faint)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div className="flex items-center gap-4">
        <Brand />
        <div className="hidden h-6 w-px sm:block" style={{ background: "var(--line)" }} />
        <button
          onClick={onOpenAgentPicker}
          className="flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-[13px] transition-all hover:border-[var(--ink)]/30"
          style={{ background: "var(--surface)", borderColor: "var(--line)" }}
          title={t("toolbar.switchAgent")}
        >
          {agentInfo ? (
            <>
              <span className="pulse-dot" />
              <span className="font-medium text-[var(--ink)]">{agentInfo.label}</span>
              {model !== "default" && (
                <span
                  className="rounded px-1.5 py-0.5 text-[10.5px] font-mono"
                  style={{ background: "var(--paper)", color: "var(--ink-mute)", border: "1px solid var(--line-faint)" }}
                  title={`model = ${model}`}
                >
                  {model}
                </span>
              )}
              <span className="text-[var(--ink-faint)]">›</span>
            </>
          ) : (
            <>
              <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--coral)] text-[9px] text-white font-bold">!</span>
              <span className="font-medium text-[var(--coral)]">{t("toolbar.selectAgent")}</span>
            </>
          )}
        </button>
        <TemplatePicker />
        <button
          onClick={onConvert}
          disabled={!isRunning && !canConvert}
          title={
            !agent
              ? t("toolbar.firstSelectAgent")
              : agentInfo?.unsupported
                ? t("toolbar.unsupportedProtocol")
                : !content.trim()
                  ? t("toolbar.enterContent")
                  : t("toolbar.shortcutHint")
          }
          className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: isRunning ? "var(--coral-hover)" : "var(--coral)",
            boxShadow: isRunning ? "0 0 12px rgba(201,100,66,0.4)" : "0 2px 8px rgba(201, 100, 66, 0.28)",
          }}
        >
          {isRunning ? (
            <>
              <span className="pulse-dot" style={{ background: "#fff" }} />
              <span>{t("toolbar.stop")}</span>
            </>
          ) : (
            <>
              <span>⚡</span>
              <span>{t("convertChip.label")}</span>
              <span className="text-[10.5px] opacity-75 font-mono ml-0.5">⌘↵</span>
            </>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <LayoutModeToggle />
        <div className="hidden h-6 w-px sm:block" style={{ background: "var(--line)" }} />
        <HistoryToggle />
        <button
          onClick={onOpenSettings}
          className="grid h-9 w-9 place-items-center rounded-full border text-[var(--ink-soft)] transition-all hover:border-[var(--ink)]/30 hover:text-[var(--ink)]"
          style={{ background: "var(--surface)", borderColor: "var(--line)" }}
          title={t("toolbar.settings")}
          aria-label={t("toolbar.settings")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <DeployControl
          onRequestConfigureDeploy={onRequestConfigureDeploy}
          configRev={deployConfigRev}
        />
        <ExportMenu iframeRef={iframeRef} />
      </div>
    </header>
  );
}

function HistoryToggle() {
  const open = useStore((s) => s.historyPaneOpen);
  const setOpen = useStore((s) => s.setHistoryPaneOpen);
  const t = useT();
  return (
    <button
      onClick={() => setOpen(!open)}
      className="grid h-9 w-9 place-items-center rounded-full border text-[var(--ink-soft)] transition-all hover:border-[var(--ink)]/30 hover:text-[var(--ink)]"
      style={{
        background: open ? "var(--coral-soft)" : "var(--surface)",
        borderColor: open ? "var(--coral)" : "var(--line)",
        color: open ? "var(--coral)" : undefined,
      }}
      title={t("history.toggle")}
      aria-label={t("history.toggle")}
      aria-pressed={open}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <polyline points="3 4 3 9 8 9" />
        <polyline points="12 7 12 12 15 14" />
      </svg>
    </button>
  );
}

function Brand() {
  const t = useT();
  return (
    <a href="/" className="flex items-center gap-2.5">
      <div
        className="grid h-9 w-9 place-items-center rounded-full font-[family-name:var(--font-serif)] italic text-[18px] font-semibold text-[var(--ink)]"
        style={{ border: "1.5px solid var(--ink)", background: "var(--surface)" }}
      >
        H
      </div>
      <div className="leading-tight">
        <div className="text-[14px] font-semibold tracking-tight text-[var(--ink)] font-[family-name:var(--font-display)]">
          HTML <em className="serif-em not-italic font-[family-name:var(--font-serif)] italic font-semibold">Anything</em>
        </div>
        <div className="text-[9.5px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          {t("brand.subtitle")}
        </div>
      </div>
    </a>
  );
}
