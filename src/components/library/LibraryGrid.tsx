"use client";
import LibCard from "./LibCard";
import type { DimKey, SrsData } from "@/types/domain";

interface WordCardData {
  id: number;
  word: string;
  furigana: string;
  meaningZh: string;
  frequency: string;
  dimStates: Record<DimKey, SrsData | null>;
}

export default function LibraryGrid({ words }: { words: WordCardData[] }) {
  const learned = words.filter((w) => w.dimStates.R !== null);
  const notYet = words.filter((w) => w.dimStates.R === null);

  return (
    <>
      {learned.length > 0 && (
        <>
          <div className="section-head">
            <h2>学習済み</h2>
            <span className="meta">{learned.length} 語</span>
          </div>
          <div className="lib-grid">
            {learned.map((w) => <LibCard key={w.id} data={w} />)}
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
            {notYet.map((w) => <LibCard key={w.id} data={w} />)}
          </div>
        </>
      )}
    </>
  );
}
