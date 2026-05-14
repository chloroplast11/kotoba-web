import type { Question } from "@/generated/prisma";
import type { DimKey } from "@/types/domain";

export interface WordPracticeItem {
  wordId: number;
  dim: DimKey;
  questionId: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildWordPracticeQueue(
  wordId: number,
  questions: Question[]
): WordPracticeItem[] {
  // word practice 走文字版，跳过 listening_kanji（无音频播放上下文）
  const own = questions.filter((q) => q.wordId === wordId && q.type !== "listening_kanji");

  const byDim: Record<DimKey, WordPracticeItem[]> = { R: [], P: [], U: [] };
  for (const q of own) {
    const dim = q.dimension as DimKey;
    if (dim !== "R" && dim !== "P" && dim !== "U") continue;
    byDim[dim].push({ wordId, dim, questionId: q.id });
  }
  for (const d of ["R", "P", "U"] as DimKey[]) byDim[d] = shuffle(byDim[d]);

  const ordered: WordPracticeItem[] = [];
  while (byDim.R.length || byDim.P.length || byDim.U.length) {
    const r = byDim.R.shift();
    const p = byDim.P.shift();
    const u = byDim.U.shift();
    if (r) ordered.push(r);
    if (p) ordered.push(p);
    if (u) ordered.push(u);
  }
  return ordered;
}
