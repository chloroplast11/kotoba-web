"use client";
import { useRouter } from "next/navigation";
import DimBars from "./DimBars";
import type { DimKey, SrsData } from "@/types/domain";

interface WordCardData {
  id: number;
  word: string;
  furigana: string;
  meaningZh: string;
  frequency: string;
  dimStates: Record<DimKey, SrsData | null>;
}

export default function LibCard({ data }: { data: WordCardData }) {
  const router = useRouter();
  return (
    <div className="lib-card" onClick={() => router.push(`/learn/${data.id}`)}>
      <div className="lib-card-furi">{data.furigana}</div>
      <div className="lib-card-word">{data.word}</div>
      <div className="lib-card-meaning">{data.meaningZh}</div>
      <DimBars dimStates={data.dimStates} />
    </div>
  );
}
