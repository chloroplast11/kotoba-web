import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyTimeOffset, getCurrentDate } from "@/lib/time";
import { toSrsData } from "@/lib/srs";
import type { DimKey, SrsData } from "@/types/domain";

interface MasteryRequest {
  wordId: number;
  dimension: DimKey;
  level: 0 | 1 | 2;
}

const TIER_PRESETS: Record<1 | 2, { stability: number; dueDays: number }> = {
  1: { stability: 3.5, dueDays: 3 },
  2: { stability: 15, dueDays: 15 },
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wordId = Number(searchParams.get("wordId"));
  if (!Number.isFinite(wordId)) {
    return NextResponse.json({ error: "invalid wordId" }, { status: 400 });
  }

  const rows = await prisma.userWordState.findMany({ where: { wordId } });
  const dimStates: Record<DimKey, SrsData | null> = { R: null, P: null, U: null };
  for (const r of rows) {
    if (r.dimension === "R" || r.dimension === "P" || r.dimension === "U") {
      dimStates[r.dimension] = toSrsData(r);
    }
  }
  return NextResponse.json({ dimStates });
}

export async function PATCH(req: Request) {
  const { wordId, dimension, level } = (await req.json()) as MasteryRequest;

  if (!["R", "P", "U"].includes(dimension)) {
    return NextResponse.json({ error: "invalid dimension" }, { status: 400 });
  }
  if (![0, 1, 2].includes(level)) {
    return NextResponse.json({ error: "invalid level" }, { status: 400 });
  }

  const settingsRow = await prisma.appSettings.findUnique({ where: { id: 1 } });
  applyTimeOffset(settingsRow?.timeOffset);

  if (level === 0) {
    await prisma.userWordState.deleteMany({ where: { wordId, dimension } });
    return NextResponse.json({ ok: true });
  }

  const preset = TIER_PRESETS[level];
  const now = getCurrentDate();
  const due = new Date(now.getTime() + preset.dueDays * 86400000);

  await prisma.userWordState.upsert({
    where: { wordId_dimension: { wordId, dimension } },
    create: {
      wordId,
      dimension,
      stability: preset.stability,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      fsrsState: 2,
      learnedAt: now,
      lastReview: now,
      due,
    },
    update: {
      stability: preset.stability,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      fsrsState: 2,
      learnedAt: now,
      lastReview: now,
      due,
    },
  });

  return NextResponse.json({ ok: true });
}
