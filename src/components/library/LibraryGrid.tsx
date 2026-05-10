"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import LibCard from "./LibCard";
import WordDetailDrawer from "./WordDetailDrawer";
import type { DimKey, SrsData } from "@/types/domain";

interface WordCardData {
  id: number;
  word: string;
  furigana: string;
  meaningZh: string;
  level: number;
  frequency: string;
  dimStates: Record<DimKey, SrsData | null>;
}

export default function LibraryGrid({ words }: { words: WordCardData[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const learned = words.filter((w) => w.dimStates.R !== null);
  const notYet = words.filter((w) => w.dimStates.R === null);
  const selected = selectedId !== null ? words.find((w) => w.id === selectedId) ?? null : null;

  return (
    <>
      {learned.length > 0 && (
        <>
          <div className="section-head">
            <h2>学習済み</h2>
            <span className="meta">{learned.length} 語</span>
          </div>
          <div className="lib-grid">
            {learned.map((w) => <LibCard key={w.id} data={w} onSelect={setSelectedId} />)}
          </div>
        </>
      )}
      {notYet.length > 0 && (
        <>
          <div className="section-head">
            <h2>未学習</h2>
            <span className="meta">{notYet.length} 語</span>
          </div>
          <div className="lib-grid">
            {notYet.map((w) => <LibCard key={w.id} data={w} onSelect={setSelectedId} />)}
          </div>
        </>
      )}

      {selected && (
        <WordDetailDrawer
          word={selected}
          onClose={() => setSelectedId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </>
  );
}
