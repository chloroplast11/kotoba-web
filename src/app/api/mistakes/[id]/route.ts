import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { resolved?: boolean };
  const resolved = body.resolved ?? true;

  await prisma.wrongAnswer.update({
    where: { id: numId },
    data: { resolved },
  });
  return NextResponse.json({ ok: true });
}
