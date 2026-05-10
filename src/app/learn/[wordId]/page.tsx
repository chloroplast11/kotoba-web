import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Masthead from "@/components/layout/Masthead";
import WordEntry from "@/components/learn/WordEntry";
import type { ExampleSentence } from "@/types/domain";

export default async function LearnPage({
  params,
  searchParams,
}: {
  params: Promise<{ wordId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { wordId } = await params;
  const { from } = await searchParams;
  const id = parseInt(wordId, 10);
  if (isNaN(id)) notFound();

  const word = await prisma.word.findUnique({ where: { id } });
  if (!word) notFound();

  const wordData = {
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
  };

  return (
    <div className="app">
      <Masthead />
      <WordEntry word={wordData} fromLibrary={from === "library"} />
    </div>
  );
}
