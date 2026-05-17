import { prisma } from "@/lib/db";
import { applyTimeOffset } from "@/lib/time";
import type { AppSettingsData } from "@/types/domain";
import Masthead from "@/components/layout/Masthead";
import SettingsClient from "@/components/settings/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const row = await prisma.appSettings.findUnique({ where: { id: 1 } });
  applyTimeOffset(row?.timeOffset);

  const initial: AppSettingsData = row
    ? {
        dailyNewWords: row.dailyNewWords,
        activeLevels: JSON.parse(row.activeLevels) as number[],
        totalReviews: row.totalReviews,
        streak: row.streak,
        timeOffset: row.timeOffset,
        cramSize: row.cramSize ?? 50,
        audioAutoplay: row.audioAutoplay ?? true,
        listeningRatio: row.listeningRatio ?? 30,
      }
    : {
        dailyNewWords: 4,
        activeLevels: [2],
        totalReviews: 0,
        streak: 0,
        timeOffset: 0,
        cramSize: 50,
        audioAutoplay: true,
        listeningRatio: 30,
      };

  return (
    <div className="app">
      <Masthead />
      <SettingsClient initial={initial} />
    </div>
  );
}
