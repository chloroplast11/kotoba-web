import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { CalendarDay } from "@/types/domain";

export const dynamic = "force-dynamic";

interface QueueItemMin {
  isNew?: boolean;
  wordId: number;
}
interface ReviewResultMin {
  wordId: number;
  correct: boolean;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month=YYYY-MM required" }, { status: 400 });
  }

  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const sessions = await prisma.dailySession.findMany({
    where: { date: { gte: start, lt: nextMonth } },
    select: { date: true, queue: true, results: true },
  });

  const days: CalendarDay[] = sessions.map((s) => {
    const queue = JSON.parse(s.queue) as QueueItemMin[];
    const results = JSON.parse(s.results) as ReviewResultMin[];
    const newIds = new Set(queue.filter((q) => q.isNew).map((q) => q.wordId));
    const hasNew = results.some((r) => newIds.has(r.wordId));
    return { date: s.date, count: results.length, hasNew };
  });

  return NextResponse.json({ days });
}
