import { prisma } from "@/lib/db";
import { todayDateString } from "@/lib/time";
import Masthead from "@/components/layout/Masthead";
import PracticeClient from "@/components/practice/PracticeClient";
import type { QueueItem, QuestionOption, DimKey } from "@/types/domain";

export default async function PracticePage() {
  const today = todayDateString();
  const session = await prisma.dailySession.findUnique({ where: { date: today } });

  if (!session) {
    return (
      <div className="app">
        <Masthead />
        <div className="empty-state">
          <div className="empty-state-jp">セッションがありません</div>
          <a href="/" className="btn" style={{ display: "inline-block" }}>ホームへ戻る</a>
        </div>
      </div>
    );
  }

  const queue = JSON.parse(session.queue) as QueueItem[];
  const questionIds = [...new Set(queue.map((q) => q.questionId))];
  const wordIds = [...new Set(queue.map((q) => q.wordId))];

  const [dbQuestions, dbWords] = await Promise.all([
    prisma.question.findMany({ where: { id: { in: questionIds } } }),
    prisma.word.findMany({ where: { id: { in: wordIds } } }),
  ]);

  const questionsMap = new Map(
    dbQuestions.map((q) => [
      q.id,
      {
        id: q.id,
        wordId: q.wordId,
        dimension: q.dimension as DimKey,
        type: q.type,
        question: q.question,
        questionPlain: q.questionPlain,
        options: JSON.parse(q.options) as QuestionOption[],
        correctIndex: q.correctIndex,
        explanation: q.explanation ?? null,
        explanationZh: q.explanationZh ?? null,
        word: "",
        furigana: "",
      },
    ])
  );

  const wordsMap = new Map(
    dbWords.map((w) => [w.id, { word: w.word, furigana: w.furigana }])
  );

  return (
    <div className="app">
      <Masthead />
      <PracticeClient questions={questionsMap} words={wordsMap} />
    </div>
  );
}
