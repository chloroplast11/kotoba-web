import { prisma } from "./db";
import { getMasteryTier, toSrsData } from "./srs";
import type { DimKey, SrsData } from "@/types/domain";

export type BucketKey = "mastered" | "learned" | "notYet";

export const LIBRARY_BUCKETS: BucketKey[] = ["mastered", "learned", "notYet"];

export interface LibraryItem {
  id: number;
  word: string;
  furigana: string;
  meaningZh: string;
  level: number;
  frequency: string;
  dimStates: Record<DimKey, SrsData | null>;
}

export interface LibraryBucket {
  items: LibraryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type LibraryResult = Record<BucketKey, LibraryBucket>;

function classify(dimStates: Record<DimKey, SrsData | null>): BucketKey {
  if (dimStates.R === null) return "notYet";
  const tiers = (["R", "P", "U"] as DimKey[]).map((d) =>
    getMasteryTier(dimStates[d])
  );
  if (tiers.every((t) => t === 2)) return "mastered";
  return "learned";
}

export interface QueryLibraryOpts {
  q: string;
  pageSize: number;
  pages: Record<BucketKey, number>;
}

export async function queryLibrary(opts: QueryLibraryOpts): Promise<LibraryResult> {
  const q = opts.q.trim();
  const where = q ? { word: { contains: q } } : undefined;

  const words = await prisma.word.findMany({
    where,
    orderBy: [{ frequency: "asc" }, { word: "asc" }],
    select: {
      id: true,
      word: true,
      furigana: true,
      meaningZh: true,
      level: true,
      frequency: true,
    },
  });

  const wordIds = words.map((w) => w.id);
  const states = wordIds.length
    ? await prisma.userWordState.findMany({
        where: { wordId: { in: wordIds } },
      })
    : [];

  const statesByWord = new Map<number, Record<DimKey, SrsData | null>>();
  for (const s of states) {
    if (!statesByWord.has(s.wordId)) {
      statesByWord.set(s.wordId, { R: null, P: null, U: null });
    }
    const dim = s.dimension as DimKey;
    if (dim === "R" || dim === "P" || dim === "U") {
      statesByWord.get(s.wordId)![dim] = toSrsData(s);
    }
  }

  const buckets: Record<BucketKey, LibraryItem[]> = {
    mastered: [],
    learned: [],
    notYet: [],
  };

  for (const w of words) {
    const dimStates =
      statesByWord.get(w.id) ?? { R: null, P: null, U: null };
    const item: LibraryItem = { ...w, dimStates };
    buckets[classify(dimStates)].push(item);
  }

  const result = {} as LibraryResult;
  for (const key of LIBRARY_BUCKETS) {
    const list = buckets[key];
    const totalPages = Math.max(1, Math.ceil(list.length / opts.pageSize));
    const page = Math.min(Math.max(1, opts.pages[key]), totalPages);
    const start = (page - 1) * opts.pageSize;
    result[key] = {
      items: list.slice(start, start + opts.pageSize),
      total: list.length,
      page,
      pageSize: opts.pageSize,
    };
  }

  return result;
}
