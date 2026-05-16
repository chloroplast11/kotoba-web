import { prisma } from "@/lib/db";
import Masthead from "@/components/layout/Masthead";
import LibraryGrid from "@/components/library/LibraryGrid";
import { queryLibrary } from "@/lib/library-query";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

export default async function LibraryPage() {
  const [initial, totalWords] = await Promise.all([
    queryLibrary({
      q: "",
      pageSize: PAGE_SIZE,
      pages: { mastered: 1, learned: 1, notYet: 1 },
    }),
    prisma.word.count(),
  ]);

  return (
    <div className="app">
      <Masthead />
      <div className="section-head" style={{ marginTop: "0" }}>
        <h2>単語帖</h2>
        <span className="meta">{totalWords} 語 · N2</span>
      </div>
      <LibraryGrid initial={initial} pageSize={PAGE_SIZE} />
    </div>
  );
}
