import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { AppSettingsData } from "@/types/domain";

const DEFAULT_SETTINGS = {
  id: 1,
  dailyNewWords: 4,
  activeLevels: JSON.stringify([2]),
  totalReviews: 0,
  streak: 0,
  timeOffset: 0,
  cramSize: 50,
};

async function getOrCreate() {
  return prisma.appSettings.upsert({
    where: { id: 1 },
    create: DEFAULT_SETTINGS,
    update: {},
  });
}

function serialize(row: Awaited<ReturnType<typeof getOrCreate>>): AppSettingsData {
  return {
    dailyNewWords: row.dailyNewWords,
    activeLevels: JSON.parse(row.activeLevels) as number[],
    totalReviews: row.totalReviews,
    streak: row.streak,
    timeOffset: row.timeOffset,
    cramSize: row.cramSize,
    audioAutoplay: row.audioAutoplay,
    listeningRatio: row.listeningRatio,
  };
}

export async function GET() {
  const row = await getOrCreate();
  return NextResponse.json(serialize(row));
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as Partial<AppSettingsData>;
  const row = await getOrCreate();

  const updated = await prisma.appSettings.update({
    where: { id: 1 },
    data: {
      ...(body.dailyNewWords !== undefined && { dailyNewWords: body.dailyNewWords }),
      ...(body.activeLevels !== undefined && {
        activeLevels: JSON.stringify(body.activeLevels),
      }),
      ...(body.totalReviews !== undefined && { totalReviews: body.totalReviews }),
      ...(body.streak !== undefined && { streak: body.streak }),
      ...(body.timeOffset !== undefined && { timeOffset: body.timeOffset }),
      ...(body.cramSize !== undefined && { cramSize: body.cramSize }),
      ...(body.audioAutoplay !== undefined && { audioAutoplay: body.audioAutoplay }),
      ...(body.listeningRatio !== undefined && { listeningRatio: body.listeningRatio }),
    },
  });

  void row;
  return NextResponse.json(serialize(updated));
}
