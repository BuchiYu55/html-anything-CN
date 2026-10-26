"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";

export function CommunityQrModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(21, 20, 15, 0.45)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[380px] rounded-2xl p-6 shadow-2xl transition-all"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line)",
          boxShadow: "0 18px 48px rgba(0,0,0,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--line-faint)] hover:text-[var(--ink)]"
          aria-label="关闭"
        >
          ✕
        </button>

        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium" style={{ background: "var(--coral-soft)", color: "var(--coral)" }}>
            <span>🍑</span> 一人公司 · AI 落地实测
          </div>
          <h3 className="mt-3 text-[18px] font-bold text-[var(--ink)] font-[family-name:var(--font-display)]">
            加入读者与实测交流群
          </h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--ink-mute)]">
            与博主一起交流 AI 落地工作流，领取小红书实测懒人包与避坑指南。
          </p>

          <div
            className="my-5 flex flex-col items-center justify-center rounded-xl p-6"
            style={{ background: "var(--paper)", border: "1px dashed var(--line)" }}
          >
            {/* 二维码图片，若无图片则优雅兜底 */}
            <div className="relative flex h-48 w-48 flex-col items-center justify-center rounded-lg bg-white p-2 shadow-inner">
              {!imgError ? (
                <img
                  src="/community-qr.png"
                  alt="社群二维码"
                  className="h-full w-full object-contain"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-3 text-center">
                  <div className="text-3xl mb-1">💬</div>
                  <div className="text-[12px] font-semibold text-[var(--ink)]">扫码进群 / 关注作者</div>
                  <div className="mt-1 text-[10.5px] text-[var(--ink-faint)]">
                    放置二维码至<br />
                    <code className="rounded bg-[var(--line-faint)] px-1 py-0.5 font-mono text-[9.5px]">
                      public/community-qr.png
                    </code>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-3 text-[11.5px] font-medium text-[var(--ink-soft)]">
              微信 / 小红书搜：<span className="font-bold text-[var(--coral)]">松一刻科技</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full rounded-xl py-2.5 text-[13px] font-medium text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: "var(--coral)", boxShadow: "0 4px 14px rgba(201, 100, 66, 0.28)" }}
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
