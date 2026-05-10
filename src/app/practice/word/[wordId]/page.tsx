import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { buildWordPracticeQueue } from "@/lib/wordPractice";
import WordPracticeClient from "@/components/practice/WordPracticeClient";
import type { DimKey } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function WordPracticePage({
  params,
}: {
  params: Promise<{ wordId: string }>;
}) {
  const { wordId } = await params;
  const id = parseInt(wordId, 10);
  if (Number.isNaN(id)) notFound();

  const [word, questions] = await Promise.all([
    prisma.word.findUnique({ where: { id } }),
    prisma.question.findMany({ where: { wordId: id } }),
  ]);
  if (!word) notFound();

  const queue = buildWordPracticeQueue(id, questions);

  if (queue.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-jp">この言葉には問題がありません</div>
        <div className="empty-state-en">
          No questions found for this word yet.
        </div>
        <Link className="btn" href="/library">単語帳に戻る</Link>
      </div>
    );
  }

  const questionMap: Record<string, {
    id: string;
    wordId: number;
    dimension: DimKey;
    type: string;
    question: string;
    questionPlain: string;
    options: { text: string; text_plain: string }[];
    correctIndex: number;
    explanation: string | null;
    explanationZh: string | null;
  }> = {};
  for (const q of questions) {
    questionMap[q.id] = {
      id: q.id,
      wordId: q.wordId,
      dimension: q.dimension as DimKey,
      type: q.type,
      question: q.question,
      questionPlain: q.questionPlain,
      options: JSON.parse(q.options),
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      explanationZh: q.explanationZh,
    };
  }

  return (
    <WordPracticeClient
      queue={queue}
      questionMap={questionMap}
      word={{ id: word.id, word: word.word, furigana: word.furigana }}
    />
  );
}
