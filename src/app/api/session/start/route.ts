import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { todayDateString } from "@/lib/time";

// Called when user explicitly starts a new day's session
export async function POST() {
  const today = todayDateString();

  // Idempotent: if session already exists for today, just return it
  const existing = await prisma.dailySession.findUnique({ where: { date: today } });
  if (existing) {
    return NextResponse.json({ date: today, alreadyStarted: true });
  }

  // Session will be built on first GET /api/session/today
  return NextResponse.json({ date: today, alreadyStarted: false });
}
