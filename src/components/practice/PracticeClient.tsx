"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/sessionStore";
import QuizCard from "./QuizCard";
import ListeningQuizCard from "./ListeningQuizCard";
import type { QueueItem, QuestionOption } from "@/types/domain";
import type { DimKey } from "@/types/domain";

interface QuestionData {
  id: string;
  wordId: number;
  dimension: DimKey;
  type: string;
  question: string;
  questionPlain: string;
  options: QuestionOption[];
  correctIndex: number;
  explanation: string | null;
  explanationZh: string | null;
  word: string;
  furigana: string;
}

interface Props {
  questions: Map<string, QuestionData>;
  words: Map<number, { word: string; furigana: string }>;
  wordPool: Array<{ id: number; word: string }>;
}

export default function PracticeClient({ questions, words, wordPool }: Props) {
  const router = useRouter();
  const session = useSessionStore();
  const [answered, setAnswered] = useState(false);
  const [skipListeningSession, setSkipListeningSession] = useState(false);
  const [skippedAudioByCursor, setSkippedAudioByCursor] = useState<Set<number>>(new Set());

  const item = session.queue[session.cursor] as QueueItem | undefined;
  const question = item ? questions.get(item.questionId) : undefined;
  const audioModeActive =
    !!item?.audioMode &&
    !skipListeningSession &&
    !skippedAudioByCursor.has(session.cursor);

  useEffect(() => {
    if (!session.isLoaded) session.loadSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!session.isLoaded) {
    return (
      <div className="empty-state">
        <div className="empty-state-jp">読み込み中...</div>
      </div>
    );
  }

  if (session.cursor >= session.queue.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-jp">本日の練習は完了しました</div>
        <div className="empty-state-en">
          本日のキューは空です。明日また来てください。
        </div>
        <button className="btn" onClick={() => router.push("/library")}>
          単語帖を見る
        </button>
      </div>
    );
  }

  if (!item || !question) {
    return (
      <div className="empty-state">
        <div className="empty-state-jp">問題が見つかりません</div>
        <button className="btn" onClick={() => router.push("/")}>
          ホームへ戻る
        </button>
      </div>
    );
  }

  const w = words.get(item.wordId);
  const questionWithMeta: typeof question & { word: string; furigana: string } = {
    ...question,
    word: w?.word ?? "",
    furigana: w?.furigana ?? "",
  };

  function handleAnswer(correct: boolean) {
    if (!item) return;
    setAnswered(true);
    session.submitAnswer(item.wordId, item.dim, item.questionId, correct);
  }

  function handleNext() {
    if (!item) return;
    setAnswered(false);
    session.advanceCursor();

    const nextCursor = session.cursor + 1;
    const nextItem = session.queue[nextCursor] as QueueItem | undefined;

    // Round 1 → Round 2 transition
    if (item.round === 1 && nextItem?.round === 2) {
      router.push("/round2");
      return;
    }

    // New word that hasn't been learned yet → go to learn page
    if (nextItem?.isNew && !hasLearnedAt(nextItem.wordId)) {
      router.push(`/learn/${nextItem.wordId}`);
      return;
    }

    if (nextCursor >= session.queue.length) {
      router.push("/summary");
      return;
    }
  }

  function hasLearnedAt(wordId: number): boolean {
    // Check by looking at whether this word appears in results (simplistic check)
    return session.results.some((r) => r.wordId === wordId);
  }

  function handleSkipThisAudio() {
    setSkippedAudioByCursor((prev) => {
      const next = new Set(prev);
      next.add(session.cursor);
      return next;
    });
  }

  return (
    <div>
      <div
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          padding: "0 0 8px",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          onClick={() => setSkipListeningSession((v) => !v)}
          title={skipListeningSession ? "音声問題を再開" : "音声問題をスキップ"}
          aria-label={skipListeningSession ? "音声問題を再開" : "音声問題をスキップ"}
          style={{
            background: "none",
            border: "1px dotted var(--ink-faint)",
            color: skipListeningSession ? "var(--ink)" : "var(--ink-faint)",
            fontSize: "11px",
            padding: "4px 10px",
            cursor: "pointer",
            letterSpacing: "0.05em",
          }}
        >
          {skipListeningSession ? "🎧 音声 OFF" : "🎧 音声 ON"}
        </button>
      </div>

      {audioModeActive && item.audioMode ? (
        <ListeningQuizCard
          key={session.cursor}
          item={item}
          question={questionWithMeta}
          audioMode={item.audioMode}
          wordPool={wordPool}
          index={session.cursor}
          total={session.queue.length}
          onAnswer={handleAnswer}
          onSkipListening={handleSkipThisAudio}
        />
      ) : (
        <QuizCard
          key={session.cursor}
          item={item}
          question={questionWithMeta}
          index={session.cursor}
          total={session.queue.length}
          onAnswer={handleAnswer}
        />
      )}
      {answered && (
        <div className="quiz-actions" style={{ maxWidth: "720px", margin: "0 auto", padding: "0 0 32px" }}>
          <span />
          <button className="btn" onClick={handleNext}>
            次へ →
          </button>
        </div>
      )}
    </div>
  );
}
