import type { Word, Question } from "@/generated/prisma";
import type { AppSettingsData, DimKey, SrsData } from "@/types/domain";
import { isDimensionUnlocked, getMasteryTier } from "./srs";

export interface CramItem {
  wordId: number;
  dim: DimKey;
  questionId: string;
}

type WordStateMap = Map<number, Record<DimKey, SrsData | null>>;

function pickQuestion(
  wordId: number,
  dim: DimKey,
  questions: Question[],
  usedIds: Set<string>
): Question | null {
  // Cram mode 是纯文字模式，过滤掉 listening_kanji（没有音频播放上下文，题干会失效）
  const candidates = questions.filter(
    (q) => q.wordId === wordId && q.dimension === dim && q.type !== "listening_kanji"
  );
  if (candidates.length === 0) return null;
  const fresh = candidates.filter((q) => !usedIds.has(q.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Candidate {
  wordId: number;
  dim: DimKey;
  tier: number;
}

export function buildCramQueue(
  words: Word[],
  questions: Question[],
  wordStates: WordStateMap,
  settings: AppSettingsData,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _now: Date
): CramItem[] {
  const activeLevels = new Set(settings.activeLevels);
  const candidates: Candidate[] = [];

  const wordById = new Map(words.map((w) => [w.id, w]));

  for (const [wordId, dimStates] of wordStates.entries()) {
    const word = wordById.get(wordId);
    if (!word) continue;
    if (!activeLevels.has(word.level)) continue;
    if (!dimStates.R?.learnedAt) continue;

    for (const dim of ["R", "P", "U"] as DimKey[]) {
      if (!isDimensionUnlocked(dim, dimStates)) continue;
      const tier = getMasteryTier(dimStates[dim]);
      if (tier === 2) continue;
      candidates.push({ wordId, dim, tier });
    }
  }

  // Sort: tier asc → random
  candidates.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return Math.random() - 0.5;
  });

  const limit = Math.max(0, Math.min(settings.cramSize, candidates.length));
  const top = candidates.slice(0, limit);

  // Interleave by dimension
  const byDim: Record<DimKey, Candidate[]> = { R: [], P: [], U: [] };
  for (const c of top) byDim[c.dim].push(c);
  for (const d of ["R", "P", "U"] as DimKey[]) byDim[d] = shuffle(byDim[d]);

  const ordered: Candidate[] = [];
  while (byDim.R.length || byDim.P.length || byDim.U.length) {
    const r = byDim.R.shift();
    const p = byDim.P.shift();
    const u = byDim.U.shift();
    if (r) ordered.push(r);
    if (p) ordered.push(p);
    if (u) ordered.push(u);
  }

  // Pick questions
  const used = new Set<string>();
  const out: CramItem[] = [];
  for (const c of ordered) {
    const q = pickQuestion(c.wordId, c.dim, questions, used);
    if (!q) continue;
    used.add(q.id);
    out.push({ wordId: c.wordId, dim: c.dim, questionId: q.id });
  }
  return out;
}
