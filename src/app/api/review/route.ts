import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scheduleReview, answerToRating, isDimensionUnlocked, toSrsData, getMasteryLevel } from "@/lib/srs";
import { applyTimeOffset, todayDateString } from "@/lib/time";
import type { DimKey, ReviewResult } from "@/types/domain";

interface ReviewRequest {
  wordId: number;
  dimension: DimKey;
  questionId: string;
  correct: boolean;
  timestamp: number;
  learnOnly?: boolean;
}

export async function POST(req: Request) {
  const body = (await req.json()) as ReviewRequest;
  const { wordId, dimension, correct, timestamp, learnOnly } = body;

  const settingsRow = await prisma.appSettings.findUnique({ where: { id: 1 } });
  applyTimeOffset(settingsRow?.timeOffset);

  const now = new Date(timestamp);

  // learnOnly: just mark learnedAt without scheduling SRS
  if (learnOnly) {
    await prisma.userWordState.upsert({
      where: { wordId_dimension: { wordId, dimension } },
      create: { wordId, dimension, learnedAt: now },
      update: { learnedAt: now },
    });
    return NextResponse.json({ ok: true });
  }

  const rating = answerToRating(correct);

  // Get current state for this (word, dim)
  const current = await prisma.userWordState.findUnique({
    where: { wordId_dimension: { wordId, dimension } },
  });

  const currentSrs = current ? toSrsData(current) : null;
  const updates = scheduleReview(currentSrs, rating, now);

  // Upsert the word state
  const newState = await prisma.userWordState.upsert({
    where: { wordId_dimension: { wordId, dimension } },
    create: {
      wordId,
      dimension,
      learnedAt: dimension === "R" ? now : null,
      ...updates,
    },
    update: updates,
  });

  // If this is R dimension first-ever answer (learnedAt not set yet), set it
  if (dimension === "R" && current && !current.learnedAt) {
    await prisma.userWordState.update({
      where: { id: newState.id },
      data: { learnedAt: now },
    });
  }

  // Append result to today's session
  const today = todayDateString();
  const session = await prisma.dailySession.findUnique({ where: { date: today } });
  if (session) {
    const results: ReviewResult[] = JSON.parse(session.results);
    results.push({ wordId, dim: dimension, correct, timestamp });
    await prisma.dailySession.update({
      where: { date: today },
      data: {
        results: JSON.stringify(results),
        cursor: session.cursor + 1,
      },
    });
  }

  // Update global totalReviews counter
  await prisma.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1, totalReviews: 1 },
    update: { totalReviews: { increment: 1 } },
  });

  if (!correct) {
    await prisma.wrongAnswer.upsert({
      where: { wordId_dimension: { wordId, dimension } },
      create: { wordId, dimension, lastWrongAt: now, firstWrongAt: now },
      update: { resolved: false, wrongCount: { increment: 1 }, lastWrongAt: now },
    });
  }

  // Check if any new dimensions were unlocked
  const allDimStates = await prisma.userWordState.findMany({ where: { wordId } });
  const word = await prisma.word.findUnique({ where: { id: wordId } });

  const dimMap: Record<DimKey, ReturnType<typeof toSrsData> | null> = { R: null, P: null, U: null };
  for (const s of allDimStates) dimMap[s.dimension as DimKey] = toSrsData(s);

  const settingsData = {
    practiceLowFreqUsage: settingsRow?.practiceLowFreqUsage ?? false,
  };

  const unlockedDimensions: DimKey[] = [];
  for (const dim of ["P", "U"] as DimKey[]) {
    if (!dimMap[dim] || dimMap[dim]!.reps === 0) {
      const wasLocked = !isDimensionUnlocked(dim, dimMap, word?.frequency ?? "mid", settingsData);
      if (!wasLocked) unlockedDimensions.push(dim);
    }
  }

  return NextResponse.json({
    nextDue: newState.due?.toISOString() ?? null,
    stability: newState.stability,
    masteryLevel: getMasteryLevel(toSrsData(newState)),
    unlockedDimensions,
  });
}
