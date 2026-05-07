import { prisma } from "@/lib/db";
import Masthead from "@/components/layout/Masthead";
import LibraryGrid from "@/components/library/LibraryGrid";
import { toSrsData } from "@/lib/srs";
import type { DimKey } from "@/types/domain";

export default async function LibraryPage() {
  const [words, allStates] = await Promise.all([
    prisma.word.findMany({ orderBy: [{ frequency: "asc" }, { word: "asc" }] }),
    prisma.userWordState.findMany(),
  ]);

  const statesByWord = new Map<number, Record<DimKey, ReturnType<typeof toSrsData> | null>>();
  for (const s of allStates) {
    if (!statesByWord.has(s.wordId)) statesByWord.set(s.wordId, { R: null, P: null, U: null });
    statesByWord.get(s.wordId)![s.dimension as DimKey] = toSrsData(s);
  }

  const wordData = words.map((w) => ({
    id: w.id,
    word: w.word,
    furigana: w.furigana,
    meaningZh: w.meaningZh,
    frequency: w.frequency,
    dimStates: statesByWord.get(w.id) ?? { R: null, P: null, U: null },
  }));

  return (
    <div className="app">
      <Masthead />
      <div className="section-head" style={{ marginTop: "0" }}>
        <h2>単語帖</h2>
        <span className="meta">{words.length} 語 · N2</span>
      </div>
      <LibraryGrid words={wordData} />
    </div>
  );
}
