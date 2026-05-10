"use client";
import { useRouter } from "next/navigation";
import { useWordPracticeStore } from "@/store/wordPracticeStore";
import { getCurrentTime } from "@/lib/time";

interface Props {
  word: { word: string; furigana: string };
  onRetry: () => void;
}

function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}秒`;
  return `${m}分${s.toString().padStart(2, "0")}秒`;
}

export default function WordPracticeSummary({ word, onRetry }: Props) {
  const router = useRouter();
  const results = useWordPracticeStore((s) => s.results);
  const startedAt = useWordPracticeStore((s) => s.startedAt);
  const reset = useWordPracticeStore((s) => s.reset);

  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const rate = total > 0 ? Math.round((correct / total) * 100) : 0;
  const elapsed = startedAt > 0 ? getCurrentTime() - startedAt : 0;

  function handleBack() {
    reset();
    router.push("/library");
  }

  return (
    <div>
      <section className="home-hero" style={{ marginBottom: "32px" }}>
        <div className="date-line">単語別練習 · 完了</div>
        <h1>
          {word.furigana && (
            <span style={{ display: "block", fontSize: "16px", color: "var(--ink-faint)", marginBottom: "8px" }}>
              {word.furigana}
            </span>
          )}
          {word.word}
        </h1>
        <p className="lede">
          正答率 {rate}% ／ {correct} / {total} 問正解 ／ {formatElapsed(elapsed)}
        </p>
      </section>

      <div className="actions" style={{ marginTop: "32px" }}>
        <button className="btn" onClick={onRetry}>もう一度</button>
        <button className="btn btn-secondary" onClick={handleBack}>単語帳に戻る</button>
      </div>

      <p style={{
        marginTop: "24px",
        fontFamily: "'Fraunces', serif",
        fontStyle: "italic",
        fontSize: "12px",
        color: "var(--ink-faint)",
      }}>
        ※ 単語別練習の結果はSRSスケジュールに記録されません。
      </p>
    </div>
  );
}
