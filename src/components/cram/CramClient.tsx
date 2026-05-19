"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCramStore } from "@/store/cramStore";
import QuizCard from "@/components/practice/QuizCard";
import CramSummary from "./CramSummary";
import type { CramItem } from "@/lib/cram";
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
  qualityScore: number | null;
}

interface Props {
  queue: CramItem[];
  questionMap: Record<string, QuestionData>;
  wordMap: Record<number, { word: string; furigana: string }>;
}

export default function CramClient({ queue, questionMap, wordMap }: Props) {
  const router = useRouter();
  const cram = useCramStore();
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    cram.init(queue);
  }, [queue]);

  const liveQueue = cram.initialized ? cram.queue : queue;
  const cursor = cram.cursor;
  const item = liveQueue[cursor];
  const done = cursor >= liveQueue.length;

  function handleAnswer(correct: boolean) {
    cram.submitAnswer(correct);
    setAnswered(true);
  }
  function handleNext() {
    setAnswered(false);
    cram.advance();
  }
  function handleRetry() {
    cram.reset();
    setAnswered(false);
    router.refresh();
  }

  if (done) {
    return <CramSummary wordMap={wordMap} onRetry={handleRetry} />;
  }

  if (!item) {
    return (
      <div className="empty-state">
        <div className="empty-state-jp">読み込み中...</div>
      </div>
    );
  }

  const question = questionMap[item.questionId];
  if (!question) {
    return (
      <div className="empty-state">
        <div className="empty-state-jp">問題が見つかりません</div>
      </div>
    );
  }

  const w = wordMap[item.wordId];
  const questionWithMeta = {
    ...question,
    word: w?.word ?? "",
    furigana: w?.furigana ?? "",
  };

  // Adapt CramItem to QueueItem shape. CramItem has no round/isNew/isNewDim,
  // so QuizCard's getRoundLabel falls through to the "復習" tag, which is fine.
  const queueLikeItem: QueueItem = {
    wordId: item.wordId,
    dim: item.dim,
    questionId: item.questionId,
  };

  return (
    <div>
      <QuizCard
        key={cursor}
        item={queueLikeItem}
        question={questionWithMeta}
        index={cursor}
        total={liveQueue.length}
        onAnswer={handleAnswer}
      />
      {answered && (
        <div
          className="quiz-actions"
          style={{ maxWidth: "720px", margin: "0 auto", padding: "0 0 32px" }}
        >
          <span />
          <button className="btn" onClick={handleNext}>次へ →</button>
        </div>
      )}
    </div>
  );
}
