"use client";
import DimBars from "./DimBars";
import type { DimKey, SrsData } from "@/types/domain";

interface WordCardData {
  id: number;
  word: string;
  furigana: string;
  meaningZh: string;
  dimStates: Record<DimKey, SrsData | null>;
}

interface Props {
  data: WordCardData;
  onSelect: (wordId: number) => void;
}

export default function LibCard({ data, onSelect }: Props) {
  return (
    <div className="lib-card" onClick={() => onSelect(data.id)}>
      <div className="lib-card-furi">{data.furigana}</div>
      <div className="lib-card-word">{data.word}</div>
      <div className="lib-card-meaning">{data.meaningZh}</div>
      <DimBars dimStates={data.dimStates} />
    </div>
  );
}
