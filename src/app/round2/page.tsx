"use client";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/sessionStore";
import Masthead from "@/components/layout/Masthead";

export default function Round2IntroPage() {
  const router = useRouter();
  const session = useSessionStore();

  const round1Results = session.results;
  const right = round1Results.filter((r) => r.correct).length;
  const total = round1Results.length;
  const round2Count = session.queue.filter((q) => q.round === 2).length;

  return (
    <div className="app">
      <Masthead />
      <div className="empty-state" style={{ paddingTop: "64px" }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: "24px" }}>
          第一回完了
        </div>
        <div className="empty-state-jp" style={{ fontSize: "40px", lineHeight: "1.3", marginBottom: "24px" }}>
          第二回 — 最終確認
        </div>
        <div className="empty-state-en" style={{ maxWidth: "520px", marginBottom: "8px" }}>
          新しい単語をそれぞれ一度、学習直後に問題を解きました。
        </div>
        <div className="empty-state-en" style={{ maxWidth: "520px" }}>
          この第二回では、同じ {round2Count} 語が — しかし
          <em style={{ color: "var(--accent)", fontStyle: "italic" }}>別の問題</em>で — 再登場します。
          出会いと出会いの間の間隔こそが、言葉を定着させます。
        </div>

        <div style={{ margin: "48px 0 32px", display: "inline-flex", gap: "32px", padding: "20px 32px", border: "1px solid var(--line)", background: "var(--paper)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: "28px", color: "var(--ink)", fontWeight: "300" }}>
              {right}<span style={{ color: "var(--ink-faint)", fontSize: "18px" }}> / {total}</span>
            </div>
            <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--ink-faint)", marginTop: "4px" }}>
              第一回スコア
            </div>
          </div>
        </div>

        <div>
          <button className="btn" onClick={() => router.push("/practice")}>
            第二回を始める →
          </button>
        </div>
      </div>
    </div>
  );
}
