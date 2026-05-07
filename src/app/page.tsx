import { prisma } from "@/lib/db";
import { buildTodayQueue } from "@/lib/queue";
import { todayDateString } from "@/lib/time";
import { toSrsData } from "@/lib/srs";
import type { AppSettingsData, DimKey } from "@/types/domain";
import type { UserWordState } from "@/generated/prisma";
import Masthead from "@/components/layout/Masthead";
import HomeClient from "@/components/home/HomeClient";

function computeStats(allStates: UserWordState[]) {
  const byWord = new Map<number, { R?: UserWordState; P?: UserWordState }>();
  for (const s of allStates) {
    if (!byWord.has(s.wordId)) byWord.set(s.wordId, {});
    if (s.dimension === "R" || s.dimension === "P") {
      byWord.get(s.wordId)![s.dimension as "R" | "P"] = s;
    }
  }
  let totalLearned = 0, mastered = 0;
  for (const dims of byWord.values()) {
    if (dims.R?.learnedAt) totalLearned++;
    if (dims.R && dims.R.stability >= 7 && dims.P && dims.P.stability >= 7) mastered++;
  }
  return { totalLearned, mastered };
}

export default async function HomePage() {
  const today = todayDateString();
  let sessionData = await prisma.dailySession.findUnique({ where: { date: today } });
  const allStates = await prisma.userWordState.findMany();
  let wordMap: Record<number, { word: string; furigana: string }> = {};

  if (!sessionData) {
    const [words, questions, settingsRow] = await Promise.all([
      prisma.word.findMany(),
      prisma.question.findMany(),
      prisma.appSettings.findUnique({ where: { id: 1 } }),
    ]);
    const settings: AppSettingsData = settingsRow
      ? {
          dailyNewWords: settingsRow.dailyNewWords,
          practiceLowFreqUsage: settingsRow.practiceLowFreqUsage,
          activeLevels: JSON.parse(settingsRow.activeLevels) as number[],
          totalReviews: settingsRow.totalReviews,
          streak: settingsRow.streak,
          timeOffset: settingsRow.timeOffset,
        }
      : { dailyNewWords: 4, practiceLowFreqUsage: false, activeLevels: [2], totalReviews: 0, streak: 0, timeOffset: 0 };

    const wordStateMap = new Map<number, Record<DimKey, ReturnType<typeof toSrsData> | null>>();
    for (const s of allStates) {
      if (!wordStateMap.has(s.wordId)) wordStateMap.set(s.wordId, { R: null, P: null, U: null });
      wordStateMap.get(s.wordId)![s.dimension as DimKey] = toSrsData(s);
    }
    const queue = buildTodayQueue(words, questions, wordStateMap, settings, new Date());
    sessionData = await prisma.dailySession.create({
      data: { date: today, queue: JSON.stringify(queue), cursor: 0, results: "[]" },
    });
    const allIds = new Set(queue.map((q) => q.wordId));
    wordMap = Object.fromEntries(
      words.filter((w) => allIds.has(w.id)).map((w) => [w.id, { word: w.word, furigana: w.furigana }])
    );
  } else {
    const parsedQueue = JSON.parse(sessionData.queue) as { wordId: number }[];
    const parsedResults = JSON.parse(sessionData.results) as { wordId: number }[];
    const allIds = [...new Set([...parsedQueue, ...parsedResults].map((q) => q.wordId))];
    const queueWords = await prisma.word.findMany({ where: { id: { in: allIds } } });
    wordMap = Object.fromEntries(queueWords.map((w) => [w.id, { word: w.word, furigana: w.furigana }]));
  }

  return (
    <div className="app">
      <Masthead />
      <HomeClient
        initialData={{
          queue: JSON.parse(sessionData.queue),
          cursor: sessionData.cursor,
          results: JSON.parse(sessionData.results),
          stats: computeStats(allStates),
          wordMap,
        }}
      />
    </div>
  );
}
