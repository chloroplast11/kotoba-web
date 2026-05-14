"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWordPracticeStore } from "@/store/wordPracticeStore";
import QuizCard from "@/components/practice/QuizCard";
import WordPracticeSummary from "./WordPracticeSummary";
import type { WordPracticeItem } from "@/lib/wordPractice";
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
}

interface Props {
  queue: WordPracticeItem[];
  questionMap: Record<string, QuestionData>;
  word: { id: number; word: string; furigana: string };
}

export default function WordPracticeClient({ queue, questionMap, word }: Props) {
  const router = useRouter();
  const store = useWordPracticeStore();
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    store.init(queue);
  }, [queue]);

  const liveQueue = store.initialized ? store.queue : queue;
  const cursor = store.cursor;
  const item = liveQueue[cursor];
  const done = cursor >= liveQueue.length;

  function handleAnswer(correct: boolean) {
    store.submitAnswer(correct);
    setAnswered(true);
  }
  function handleNext() {
    setAnswered(false);
    store.advance();
  }
  function handleRetry() {
    store.reset();
    setAnswered(false);
    router.refresh();
  }

  if (done) {
    return (
      <WordPracticeSummary
        word={{ word: word.word, furigana: word.furigana }}
        onRetry={handleRetry}
      />
    );
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

  const questionWithMeta = {
    ...question,
    word: word.word,
    furigana: word.furigana,
  };

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
