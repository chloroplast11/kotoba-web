"use client";
import { useRouter } from "next/navigation";
import { useCramStore } from "@/store/cramStore";

interface Props {
  wordMap: Record<number, { word: string; furigana: string }>;
  onRetry: () => void;
}

export default function CramSummary({ wordMap, onRetry }: Props) {
  const router = useRouter();
  const results = useCramStore((s) => s.results);
  const reset = useCramStore((s) => s.reset);

  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

  const byWord = new Map<number, { right: number; wrong: number }>();
  for (const r of results) {
    const e = byWord.get(r.wordId) ?? { right: 0, wrong: 0 };
    if (r.correct) e.right++; else e.wrong++;
    byWord.set(r.wordId, e);
  }

  function handleHome() {
    reset();
    router.push("/");
  }

  return (
    <div>
      <section className="home-hero" style={{ marginBottom: "32px" }}>
        <div className="date-line">特訓モード · 完了</div>
        <h1>
          正答率 <em>{rate}%</em>
        </h1>
        <p className="lede">
          {correct} / {total} 問正解。 {byWord.size} 語に触れました。
        </p>
      </section>

      <div className="summary-card">
        <h3>語彙ごとの結果</h3>
        <ul className="summary-list">
          {[...byWord.entries()].map(([wordId, s]) => {
            const sub = s.right + s.wrong;
            const r = sub > 0 ? Math.round((s.right * 100) / sub) : 0;
            const cls = r >= 75 ? "good" : r < 50 ? "bad" : "";
            return (
              <li key={wordId}>
                <span className="word">{wordMap[wordId]?.word ?? `ID:${wordId}`}</span>
                <span className={`result ${cls}`}>{s.right}/{sub} · {r}%</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="actions" style={{ marginTop: "32px" }}>
        <button className="btn" onClick={onRetry}>もう一度</button>
        <button className="btn btn-secondary" onClick={handleHome}>ホームに戻る</button>
      </div>

      <p style={{
        marginTop: "24px",
        fontFamily: "'Fraunces', serif",
        fontStyle: "italic",
        fontSize: "12px",
        color: "var(--ink-faint)",
      }}>
        ※ 特訓モードの結果はSRSスケジュールに記録されません。
      </p>
    </div>
  );
}
