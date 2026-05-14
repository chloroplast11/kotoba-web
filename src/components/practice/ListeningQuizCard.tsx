"use client";
import { useState } from "react";
import RubyText from "@/components/ui/RubyText";
import DimPill from "@/components/layout/DimPill";
import MasteryPopover from "@/components/practice/MasteryPopover";
import PlayButton from "@/components/ui/PlayButton";
import { getWordAudioUrl } from "@/lib/audio";
import type { DimKey, ListenMode, QueueItem, QuestionOption } from "@/types/domain";

interface QuestionData {
  id: string;
  wordId: number;
  dimension: DimKey;
  type: string;
  question: string;
  options: QuestionOption[];
  correctIndex: number;
  explanation: string | null;
  explanationZh: string | null;
  word: string;
  furigana: string;
}

interface Props {
  item: QueueItem;
  question: QuestionData;
  audioMode: ListenMode;
  index: number;
  total: number;
  onAnswer: (correct: boolean) => void;
  onSkipListening: () => void;
}

const OPTION_LABELS = ["A", "B", "C", "D"];

export default function ListeningQuizCard({
  item,
  question,
  audioMode,
  index,
  total,
  onAnswer,
  onSkipListening,
}: Props) {
  const [chosen, setChosen] = useState<number | null>(null);
  const answered = chosen !== null;

  const { options, correctIndex } = question;
  const correct = chosen === correctIndex;
  const audioSrc = getWordAudioUrl(item.wordId);

  function handleChoice(idx: number) {
    if (answered) return;
    setChosen(idx);
    onAnswer(idx === correctIndex);
  }

  return (
    <div className="quiz-wrap">
      <div className="quiz-header">
        <div className="quiz-progress">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span className="round-tag round-review">復習 · 聴解</span>
          <DimPill dim={item.dim} />
          <MasteryPopover wordId={item.wordId} />
        </div>
      </div>

      <div className="quiz-stem listening" style={{ textAlign: "center", padding: "40px 0 24px" }}>
        <PlayButton
          src={audioSrc}
          fallbackText={question.word}
          autoPlay
          size="lg"
          label="再生"
          ariaLabel="音声を再生"
        />
        <div style={{ marginTop: "12px", fontSize: "13px", color: "var(--ink-faint)", letterSpacing: "0.18em" }}>
          聴いて下さい
        </div>
        {!answered && (
          <div style={{ marginTop: "20px" }}>
            <button
              type="button"
              onClick={onSkipListening}
              style={{
                background: "none",
                border: "1px dotted var(--ink-faint)",
                color: "var(--ink-faint)",
                fontSize: "11px",
                padding: "4px 10px",
                cursor: "pointer",
                letterSpacing: "0.05em",
              }}
              title="この問題を文字版に切り替える"
            >
              飛ばす（文字で見る）
            </button>
          </div>
        )}
      </div>

      <div className="quiz-options">
        {options.map((opt, idx) => (
          <button
            key={idx}
            className={[
              "quiz-option",
              answered && idx === correctIndex ? "correct" : "",
              answered && idx === chosen && chosen !== correctIndex ? "wrong" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={answered}
            onClick={() => handleChoice(idx)}
          >
            <span className="marker">{OPTION_LABELS[idx]}</span>
            <span>
              {audioMode === "listen_kanji" ? (
                opt.text
              ) : (
                <RubyText html={opt.text} />
              )}
            </span>
          </button>
        ))}
      </div>

      {answered && (
        <div className={`quiz-feedback ${correct ? "correct" : "wrong"}`}>
          <strong>{correct ? "正解 — Correct" : "不正解 — Try to recall"}</strong>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
            <ruby style={{ fontSize: "22px", fontFamily: "'Noto Serif JP', serif" }}>
              {question.word}
              <rt style={{ fontSize: "11px", color: "var(--ink-faint)" }}>{question.furigana}</rt>
            </ruby>
            <PlayButton src={audioSrc} fallbackText={question.word} size="sm" label="もう一度" />
          </div>
          {question.explanation && (
            <div style={{ marginTop: "8px" }}>
              <RubyText html={question.explanation} />
            </div>
          )}
          {question.explanationZh && (
            <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--ink-faint)" }}>
              {question.explanationZh}
            </div>
          )}
        </div>
      )}

      <div className="quiz-actions">
        {answered && (
          <span style={{ fontFamily: "'Noto Serif JP', serif", fontSize: "12px", color: "var(--ink-faint)" }}>
            {question.word} · {question.furigana}
          </span>
        )}
      </div>
    </div>
  );
}
