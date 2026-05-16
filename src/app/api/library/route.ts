import { NextResponse } from "next/server";
import { queryLibrary, LIBRARY_BUCKETS } from "@/lib/library-query";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize = Number.isFinite(rawSize)
    ? Math.max(1, Math.min(200, rawSize))
    : 60;

  const pages = { mastered: 1, learned: 1, notYet: 1 };
  for (const key of LIBRARY_BUCKETS) {
    const raw = Number(searchParams.get(`p_${key}`));
    if (Number.isFinite(raw) && raw >= 1) pages[key] = Math.floor(raw);
  }

  const result = await queryLibrary({ q, pageSize, pages });
  return NextResponse.json(result);
}
