import { prisma } from "@/lib/db";
import { buildCramQueue } from "@/lib/cram";
import { toSrsData } from "@/lib/srs";
import { getCurrentDate } from "@/lib/time";
import type { AppSettingsData, DimKey, SrsData } from "@/types/domain";
import CramClient from "@/components/cram/CramClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CramPage() {
  const [words, questions, statesRows, settingsRow] = await Promise.all([
    prisma.word.findMany(),
    prisma.question.findMany(),
    prisma.userWordState.findMany(),
    prisma.appSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        dailyNewWords: 4,
        practiceLowFreqUsage: false,
        activeLevels: JSON.stringify([2]),
        totalReviews: 0,
        streak: 0,
        timeOffset: 0,
        cramSize: 50,
      },
      update: {},
    }),
  ]);

  const settings: AppSettingsData = {
    dailyNewWords: settingsRow.dailyNewWords,
    practiceLowFreqUsage: settingsRow.practiceLowFreqUsage,
    activeLevels: JSON.parse(settingsRow.activeLevels) as number[],
    totalReviews: settingsRow.totalReviews,
    streak: settingsRow.streak,
    timeOffset: settingsRow.timeOffset,
    cramSize: settingsRow.cramSize,
    audioAutoplay: settingsRow.audioAutoplay ?? true,
    listeningRatio: settingsRow.listeningRatio ?? 30,
  };

  const wordStates = new Map<number, Record<DimKey, SrsData | null>>();
  for (const w of words) {
    wordStates.set(w.id, { R: null, P: null, U: null });
  }
  for (const row of statesRows) {
    const dim = row.dimension as DimKey;
    const cell = wordStates.get(row.wordId);
    if (!cell) continue;
    cell[dim] = toSrsData(row);
  }

  const queue = buildCramQueue(words, questions, wordStates, settings, getCurrentDate());

  if (queue.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-jp">特訓する言葉がありません</div>
        <div className="empty-state-en">
          習得済みの言葉ばかりです。新しい言葉を学んでから戻ってください。
        </div>
        <Link className="btn" href="/">ホームに戻る</Link>
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

  const wordMap: Record<number, { word: string; furigana: string }> = {};
  for (const w of words) {
    wordMap[w.id] = { word: w.word, furigana: w.furigana };
  }

  return <CramClient queue={queue} questionMap={questionMap} wordMap={wordMap} />;
}
