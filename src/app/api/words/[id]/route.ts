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
    meaningZh: word.meaningZh,
    pos: word.pos,
    level: word.level,
    pitchAccent: word.pitchAccent,
    homophones: word.homophones,
    audioFile: word.audioFile,
    exampleSentences: JSON.parse(word.exampleSentences) as ExampleSentence[],
    synonyms: JSON.parse(word.synonyms) as string[],
  });
}
