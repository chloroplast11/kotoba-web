"use client";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/sessionStore";
import { useSettingsStore } from "@/store/settingsStore";
import { getCurrentDate } from "@/lib/time";
import Masthead from "@/components/layout/Masthead";

export default function SummaryPage() {
  const router = useRouter();
  const session = useSessionStore();
  const settings = useSettingsStore();

  const results = session.results;
  const wordMap = session.wordMap;
  const total = results.length;
  const right = results.filter((r) => r.correct).length;
  const acc = total > 0 ? Math.round(right * 100 / total) : 0;

  // Group by wordId
  const byWord = new Map<number, { right: number; wrong: number }>();
  for (const r of results) {
    const e = byWord.get(r.wordId) ?? { right: 0, wrong: 0 };
    if (r.correct) e.right++; else e.wrong++;
    byWord.set(r.wordId, e);
  }

  return (
    <div className="app">
      <Masthead />
      <section className="home-hero" style={{ marginBottom: "32px" }}>
        <div className="date-line">
          セッション完了 · {getCurrentDate().toLocaleDateString("ja-JP")}
        </div>
        <h1>
          <em>{acc}%</em> の正解率<br />
          {right}/{total} 問正解
        </h1>
      </section>

      {byWord.size > 0 && (
        <div className="summary-card">
          <h3>本日の単語別成績</h3>
          <ul className="summary-list">
            {[...byWord.entries()].map(([wordId, s]) => {
              const t = s.right + s.wrong;
              const rate = t > 0 ? Math.round(s.right * 100 / t) : 0;
              const cls = rate >= 75 ? "good" : rate < 50 ? "bad" : "";
              return (
                <li key={wordId}>
                  <span className="word">{wordMap[wordId]?.word ?? `ID:${wordId}`}</span>
                  <span className={`result ${cls}`}>{s.right}/{t} · {rate}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="actions" style={{ marginTop: "40px" }}>
        <button className="btn" onClick={() => router.push("/library")}>
          単語帖を見る
        </button>
        <button className="btn btn-secondary" onClick={() => router.push("/")}>
          ホームへ戻る
        </button>
      </div>

      <div style={{ marginTop: "48px", padding: "24px", background: "var(--paper-warm)", borderLeft: "2px solid var(--accent-soft)", fontFamily: "'Noto Serif JP', serif", fontSize: "14px", lineHeight: "1.7", color: "var(--ink-soft)" }}>
        <strong style={{ display: "block", fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--ink-faint)", marginBottom: "8px" }}>
          総復習数
        </strong>
        {settings.totalReviews} 問累計
      </div>
    </div>
  );
}
