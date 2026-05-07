import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildTodayQueue } from "@/lib/queue";
import { todayDateString } from "@/lib/time";
import { toSrsData } from "@/lib/srs";
import type { AppSettingsData, DimKey, QueueItem, ReviewResult } from "@/types/domain";
import type { UserWordState } from "@/generated/prisma";

const DEFAULT_SETTINGS: AppSettingsData = {
  dailyNewWords: 4,
  practiceLowFreqUsage: false,
  activeLevels: [2],
  totalReviews: 0,
  streak: 0,
  timeOffset: 0,
};

function computeStats(allStates: UserWordState[]) {
  const byWord = new Map<number, { R?: UserWordState; P?: UserWordState }>();
  for (const s of allStates) {
    if (!byWord.has(s.wordId)) byWord.set(s.wordId, {});
    if (s.dimension === "R" || s.dimension === "P") {
      byWord.get(s.wordId)![s.dimension as "R" | "P"] = s;
    }
  }

  let totalLearned = 0;
  let mastered = 0;
  for (const dims of byWord.values()) {
    if (dims.R?.learnedAt) totalLearned++;
    if (dims.R && dims.R.stability >= 7 && dims.P && dims.P.stability >= 7) mastered++;
  }
  return { totalLearned, mastered };
}

export async function GET() {
  const today = todayDateString();

  // Try to load existing session
  const existing = await prisma.dailySession.findUnique({ where: { date: today } });
  if (existing) {
    const queue = JSON.parse(existing.queue) as QueueItem[];
    const existingResults = JSON.parse(existing.results) as ReviewResult[];
    const wordIds = [...new Set([...queue, ...existingResults].map((q) => q.wordId))];
    const [allStates, queueWords] = await Promise.all([
      prisma.userWordState.findMany(),
      prisma.word.findMany({ where: { id: { in: wordIds } } }),
    ]);
    const { totalLearned, mastered } = computeStats(allStates);
    const wordMap = Object.fromEntries(queueWords.map((w) => [w.id, { word: w.word, furigana: w.furigana }]));
    return NextResponse.json({
      date: existing.date,
      queue,
      cursor: existing.cursor,
      results: JSON.parse(existing.results) as ReviewResult[],
      stats: { totalLearned, mastered },
      wordMap,
    });
  }

  // Build a new session for today
  const [words, questions, allStates, settingsRow] = await Promise.all([
    prisma.word.findMany(),
    prisma.question.findMany(),
    prisma.userWordState.findMany(),
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
    : DEFAULT_SETTINGS;

  // Build word state map (wordId → { R, P, U })
  const wordStateMap = new Map<number, Record<DimKey, ReturnType<typeof toSrsData> | null>>();
  for (const s of allStates) {
    if (!wordStateMap.has(s.wordId)) {
      wordStateMap.set(s.wordId, { R: null, P: null, U: null });
    }
    wordStateMap.get(s.wordId)![s.dimension as DimKey] = toSrsData(s);
  }

  const now = new Date();
  const queue = buildTodayQueue(words, questions, wordStateMap, settings, now);
  const { totalLearned, mastered } = computeStats(allStates);

  const queueWordIds = new Set(queue.map((q) => q.wordId));
  const wordMap = Object.fromEntries(
    words.filter((w) => queueWordIds.has(w.id)).map((w) => [w.id, { word: w.word, furigana: w.furigana }])
  );

  await prisma.dailySession.create({
    data: { date: today, queue: JSON.stringify(queue), cursor: 0, results: "[]" },
  });

  return NextResponse.json({
    date: today,
    queue,
    cursor: 0,
    results: [] as ReviewResult[],
    stats: { totalLearned, mastered },
    wordMap,
  });
}
