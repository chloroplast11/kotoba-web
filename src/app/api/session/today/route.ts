import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyTimeOffset } from "@/lib/time";
import { loadOrReconcileTodaySession } from "@/lib/session";
import type { AppSettingsData } from "@/types/domain";
import type { UserWordState } from "@/generated/prisma";

const DEFAULT_SETTINGS: AppSettingsData = {
  dailyNewWords: 4,
  practiceLowFreqUsage: false,
  activeLevels: [2],
  totalReviews: 0,
  streak: 0,
  timeOffset: 0,
  cramSize: 50,
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
  const settingsRow = await prisma.appSettings.findUnique({ where: { id: 1 } });
  applyTimeOffset(settingsRow?.timeOffset);

  const settings: AppSettingsData = settingsRow
    ? {
        dailyNewWords: settingsRow.dailyNewWords,
        practiceLowFreqUsage: settingsRow.practiceLowFreqUsage,
        activeLevels: JSON.parse(settingsRow.activeLevels) as number[],
        totalReviews: settingsRow.totalReviews,
        streak: settingsRow.streak,
        timeOffset: settingsRow.timeOffset,
        cramSize: settingsRow.cramSize ?? 50,
      }
    : DEFAULT_SETTINGS;

  const { session, queue, results, appliedNewCount, desiredNewCount, allStates, wordMap } =
    await loadOrReconcileTodaySession(settings);

  const { totalLearned, mastered } = computeStats(allStates);

  return NextResponse.json({
    date: session.date,
    queue,
    cursor: session.cursor,
    results,
    stats: { totalLearned, mastered },
    wordMap,
    appliedNewCount,
    desiredNewCount,
  });
}

export async function DELETE() {
  await prisma.dailySession.deleteMany();
  return NextResponse.json({ ok: true });
}
