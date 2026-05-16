"use client";
import { useEffect, useState } from "react";
import RubyText from "@/components/ui/RubyText";
import { DIM_NAMES, DIM_DESCRIPTIONS } from "@/lib/constants";
import { getCurrentDate } from "@/lib/time";
import type { MistakeQuestionItem, MistakeWordGroup } from "@/types/domain";

const OPTION_LABELS = ["A", "B", "C", "D"];

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const now = getCurrentDate().getTime();
  const diffDays = Math.floor((now - then) / 86400000);
  if (diffDays <= 0) return "今日";
  if (diffDays === 1) return "昨日";
  if (diffDays < 7) return `${diffDays}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "long", day: "numeric" });
}

export default function MistakesClient() {
  const [groups, setGroups] = useState<MistakeWordGroup[] | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/mistakes")
      .then((r) => r.json())
      .then((data) => setGroups(data.groups as MistakeWordGroup[]))
      .catch(() => setGroups([]));
  }, []);

  function toggle(wordId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(wordId)) next.delete(wordId);
      else next.add(wordId);
      return next;
    });
  }

  async function markQuestionResolved(wrongAnswerId: number, wordId: number) {
    setGroups((prev) => {
      if (!prev) return prev;
      return prev
        .map((g) => {
          if (g.wordId !== wordId) return g;
          const remaining = g.questions.filter((q) => q.id !== wrongAnswerId);
          if (remaining.length === 0) return null;
          return { ...g, questions: remaining, totalWrongQuestions: remaining.length };
        })
        .filter((g): g is MistakeWordGroup => g !== null);
    });
    await fetch(`/api/mistakes/${wrongAnswerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolved: true }),
    });
  }

  if (groups === null) {
    return (
      <section className="home-hero">
        <div className="date-line">復習帖</div>
        <h1 style={{ fontSize: "32px" }}>読み込み中…</h1>
      </section>
    );
  }

  const totalQuestions = groups.reduce((a, g) => a + g.totalWrongQuestions, 0);

  return (
    <>
      <section className="home-hero" style={{ marginBottom: "40px" }}>
        <div className="date-line">復習帖 · ふくしゅうちょう</div>
        <h1>
          忘れたところを、<br />もう一度。
        </h1>
        <p className="lede">
          {totalQuestions > 0
            ? <>間違えた問題は <em style={{ color: "var(--accent)", fontStyle: "italic" }}>{totalQuestions}</em> 件。落ち着いて、ひとつずつ。</>
            : "今のところ、復習が必要な問題はありません。"}
        </p>
      </section>

      {groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-jp">よくできました</div>
          <div className="empty-state-en">All clear. Keep going.</div>
        </div>
      ) : (
        <ul className="mistake-list">
          {groups.map((g) => {
            const isOpen = expanded.has(g.wordId);
            return (
              <li key={g.wordId} className="mistake-row expandable">
                <button
                  type="button"
                  className="mistake-row-toggle"
                  onClick={() => toggle(g.wordId)}
                  aria-expanded={isOpen}
                >
                  <div className="mistake-main">
                    <div className="mistake-word">
                      <ruby>
                        {g.word}
                        <rt>{g.furigana}</rt>
                      </ruby>
                    </div>
                    <div className="mistake-meaning">{g.meaningZh}</div>
                    <div className="mistake-tags">
                      {g.dimensions.map((d) => (
                        <span key={d} className={`dimension-pill dim-${d}`}>
                          {DIM_NAMES[d]}
                        </span>
                      ))}
                      <span className="mistake-meta">N{g.level}</span>
                      <span className="mistake-meta">{g.totalWrongQuestions} 題</span>
                      <span className="mistake-meta">{formatRelativeDate(g.lastWrongAt)}</span>
                    </div>
                  </div>
                  <span className="mistake-chevron" aria-hidden="true">{isOpen ? "−" : "+"}</span>
                </button>

                {isOpen && (
                  <div className="mistake-question-list">
                    {g.questions.map((q) => (
                      <MistakeQuestion
                        key={q.id}
                        q={q}
                        onResolve={() => markQuestionResolved(q.id, g.wordId)}
                      />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function MistakeQuestion({ q, onResolve }: { q: MistakeQuestionItem; onResolve: () => void }) {
  const isListeningKanji = q.type === "listening_kanji";
  return (
    <div className="mistake-question">
      <div className="mistake-question-stem">
        {q.question ? <RubyText html={q.question} /> : <span className="mistake-meta">（題文なし）</span>}
      </div>
      <div className="mistake-question-options">
        {q.options.map((opt, idx) => {
          const isCorrect = idx === q.correctIndex;
          const isWrongChoice = idx === q.wrongChoice;
          const cls = [
            "mistake-option",
            isCorrect ? "mistake-option-correct" : "",
            isWrongChoice && !isCorrect ? "mistake-option-wrong" : "",
          ].filter(Boolean).join(" ");
          return (
            <div key={idx} className={cls}>
              <span className="mistake-option-marker">
                {isCorrect ? "✓" : isWrongChoice ? "✗" : OPTION_LABELS[idx]}
              </span>
              <span>
                {isListeningKanji ? opt.text : <RubyText html={opt.text} />}
              </span>
            </div>
          );
        })}
      </div>
      {(q.explanationZh || q.explanation) && (
        <div className="mistake-explanation">
          {q.explanationZh ?? q.explanation}
        </div>
      )}
      <div className="mistake-question-foot">
        <div className="mistake-question-meta">
          <span className={`dimension-pill dim-${q.dimension}`}>{DIM_NAMES[q.dimension]}</span>
          <span className="mistake-meta">× {q.wrongCount} 回</span>
          <span className="mistake-meta">{formatRelativeDate(q.lastWrongAt)}</span>
          <span className="mistake-hint">{DIM_DESCRIPTIONS[q.dimension]}</span>
        </div>
        <button
          type="button"
          className="mistake-btn mistake-btn-primary zh-zone"
          onClick={onResolve}
        >
          标记已掌握
        </button>
      </div>
    </div>
  );
}
