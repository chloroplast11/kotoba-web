"use client";
import { useState } from "react";
import RubyText from "@/components/ui/RubyText";
import DimPill from "@/components/layout/DimPill";
import MasteryPopover from "@/components/practice/MasteryPopover";
import WordInfoSheet from "@/components/practice/WordInfoSheet";
import type { DimKey, QueueItem, QuestionOption } from "@/types/domain";

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
  index: number;
  total: number;
  onAnswer: (correct: boolean) => void;
}

const OPTION_LABELS = ["A", "B", "C", "D"];

function getRoundLabel(item: QueueItem) {
  if (item.round === 1) return <span className="round-tag round-1">初回 · 学んだばかり</span>;
  if (item.round === 2) return <span className="round-tag round-2">第二回 · 最終確認</span>;
  if (item.isNewDim) return <span className="round-tag round-new">新次元 · 新しく解放</span>;
  return <span className="round-tag round-review">復習</span>;
}

export default function QuizCard({ item, question, index, total, onAnswer }: Props) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const answered = chosen !== null;
  const correct = chosen === question.correctIndex;

  function handleChoice(idx: number) {
    if (answered) return;
    setChosen(idx);
    onAnswer(idx === question.correctIndex);
  }

  const stemHtml = question.question.replace("____", '<span class="blank"></span>');
  const isShort = question.question.replace(/<rt>[^<]*<\/rt>|<\/?ruby>/g, "").length < 60;

  return (
    <div className="quiz-wrap">
      <div className="quiz-header">
        <div className="quiz-progress">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {getRoundLabel(item)}
          <DimPill dim={item.dim} />
          <button
            type="button"
            className="word-info-trigger"
            onClick={() => setSheetOpen(true)}
            aria-label="単語の詳細を見る"
          >
            詳しく
          </button>
          <MasteryPopover wordId={item.wordId} />
        </div>
      </div>

      <div className={`quiz-stem ${isShort ? "short" : ""}`}>
        <RubyText html={stemHtml} />
      </div>

      <div className="quiz-options">
        {question.options.map((opt, idx) => (
          <button
            key={idx}
            className={[
              "quiz-option",
              answered && idx === question.correctIndex ? "correct" : "",
              answered && idx === chosen && chosen !== question.correctIndex ? "wrong" : "",
            ].filter(Boolean).join(" ")}
            disabled={answered}
            onClick={() => handleChoice(idx)}
          >
            <span className="marker">{OPTION_LABELS[idx]}</span>
            <span><RubyText html={opt.text} /></span>
          </button>
        ))}
      </div>

      {answered && (
        <div className={`quiz-feedback ${correct ? "correct" : "wrong"}`}>
          <strong>{correct ? "正解 — Correct" : "不正解 — Try to recall"}</strong>
          {question.explanation ? (
            <RubyText html={question.explanation} />
          ) : (
            <span>
              {correct
                ? "正解です。"
                : <>正解は「<RubyText html={question.options[question.correctIndex]?.text ?? ""} />」です。</>}
            </span>
          )}
          {question.explanationZh && (
            <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--ink-faint)" }}>
              {question.explanationZh}
            </div>
          )}
        </div>
      )}

      <div className="quiz-actions">
        <span style={{ fontFamily: "'Noto Serif JP', serif", fontSize: "12px", color: "var(--ink-faint)" }}>
          {question.word} · {question.furigana}
        </span>
      </div>

      <WordInfoSheet
        wordId={item.wordId}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
