import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMasteryLevel, toSrsData } from "@/lib/srs";
import type { DimKey, WrongAnswerItem } from "@/types/domain";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.wrongAnswer.findMany({
    where: { resolved: false },
    orderBy: { lastWrongAt: "desc" },
    include: { word: true },
  });

  const wordIds = [...new Set(rows.map((r) => r.wordId))];
  const states = await prisma.userWordState.findMany({
    where: { wordId: { in: wordIds } },
  });
  const stateMap = new Map<string, ReturnType<typeof toSrsData>>();
  for (const s of states) stateMap.set(`${s.wordId}:${s.dimension}`, toSrsData(s));

  const items: WrongAnswerItem[] = rows.map((r) => ({
    id: r.id,
    wordId: r.wordId,
    word: r.word.word,
    furigana: r.word.furigana,
    meaningZh: r.word.meaningZh,
    level: r.word.level,
    dimension: r.dimension as DimKey,
    wrongCount: r.wrongCount,
    firstWrongAt: r.firstWrongAt.toISOString(),
    lastWrongAt: r.lastWrongAt.toISOString(),
    masteryLevel: getMasteryLevel(stateMap.get(`${r.wordId}:${r.dimension}`) ?? null),
  }));

  return NextResponse.json({ items });
}
