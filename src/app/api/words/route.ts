import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSrsData } from "@/lib/srs";
import type { DimKey } from "@/types/domain";

export async function GET() {
  const [words, allStates] = await Promise.all([
    prisma.word.findMany({ orderBy: { frequency: "asc" } }),
    prisma.userWordState.findMany(),
  ]);

  // Group states by wordId
  const statesByWord = new Map<number, Record<DimKey, ReturnType<typeof toSrsData> | null>>();
  for (const s of allStates) {
    if (!statesByWord.has(s.wordId)) {
      statesByWord.set(s.wordId, { R: null, P: null, U: null });
    }
    statesByWord.get(s.wordId)![s.dimension as DimKey] = toSrsData(s);
  }

  const result = words.map((w) => ({
    id: w.id,
    word: w.word,
    furigana: w.furigana,
    meaningZh: w.meaningZh,
    meaningEn: w.meaningEn,
    level: w.level,
    frequency: w.frequency,
    pos: w.pos,
    dimStates: statesByWord.get(w.id) ?? { R: null, P: null, U: null },
  }));

  return NextResponse.json(result);
}
