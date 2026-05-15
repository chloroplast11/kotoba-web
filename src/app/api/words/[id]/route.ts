import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ExampleSentence } from "@/types/domain";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const word = await prisma.word.findUnique({ where: { id } });
  if (!word) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: word.id,
    word: word.word,
    furigana: word.furigana,
    romaji: word.romaji,
    meaningZh: word.meaningZh,
    meaningEn: word.meaningEn,
    pos: word.pos,
    level: word.level,
    frequency: word.frequency,
    usageNotes: word.usageNotes,
    exampleSentences: JSON.parse(word.exampleSentences) as ExampleSentence[],
    synonyms: JSON.parse(word.synonyms) as string[],
    collocations: JSON.parse(word.collocations) as string[],
  });
}
