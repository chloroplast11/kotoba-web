import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { DimKey, MistakeQuestionItem, MistakeWordGroup, QuestionOption } from "@/types/domain";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.wrongAnswer.findMany({
    where: { resolved: false },
    orderBy: { lastWrongAt: "desc" },
    include: { word: true, question: true },
  });

  const groups = new Map<number, MistakeWordGroup>();

  for (const r of rows) {
    let parsedOptions: QuestionOption[];
    try {
      parsedOptions = JSON.parse(r.question.options) as QuestionOption[];
    } catch {
      parsedOptions = [];
    }

    const qItem: MistakeQuestionItem = {
      id: r.id,
      questionId: r.questionId,
      dimension: r.dimension as DimKey,
      type: r.question.type,
      question: r.question.question,
      options: parsedOptions,
      correctIndex: r.question.correctIndex,
      wrongChoice: r.wrongChoice,
      explanation: r.question.explanation,
      explanationZh: r.question.explanationZh,
      wrongCount: r.wrongCount,
      lastWrongAt: r.lastWrongAt.toISOString(),
    };

    const existing = groups.get(r.wordId);
    if (existing) {
      existing.questions.push(qItem);
      existing.totalWrongQuestions += 1;
      if (!existing.dimensions.includes(qItem.dimension)) {
        existing.dimensions.push(qItem.dimension);
      }
      if (r.lastWrongAt.toISOString() > existing.lastWrongAt) {
        existing.lastWrongAt = r.lastWrongAt.toISOString();
      }
    } else {
      groups.set(r.wordId, {
        wordId: r.wordId,
        word: r.word.word,
        furigana: r.word.furigana,
        meaningZh: r.word.meaningZh,
        level: r.word.level,
        totalWrongQuestions: 1,
        dimensions: [qItem.dimension],
        lastWrongAt: r.lastWrongAt.toISOString(),
        questions: [qItem],
      });
    }
  }

  const sortedGroups = [...groups.values()].sort((a, b) =>
    b.lastWrongAt.localeCompare(a.lastWrongAt),
  );

  return NextResponse.json({ groups: sortedGroups });
}
