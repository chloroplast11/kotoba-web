"use client";
import { useEffect, useState } from "react";
import { WordEntryBody, type WordData } from "@/components/learn/WordEntry";

interface Props {
  wordId: number;
  open: boolean;
  onClose: () => void;
}

const cache = new Map<number, WordData>();

export default function WordInfoSheet({ wordId, open, onClose }: Props) {
  const [word, setWord] = useState<WordData | null>(() => cache.get(wordId) ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (cache.has(wordId)) {
      setWord(cache.get(wordId)!);
      return;
    }
    let cancelled = false;
    setError(false);
    fetch(`/api/words/${wordId}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data: WordData) => {
        if (cancelled) return;
        cache.set(wordId, data);
        setWord(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, wordId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="word-sheet-root" role="dialog" aria-modal="true" aria-label="単語の詳細">
      <div className="word-sheet-backdrop" onClick={onClose} />
      <div className="word-sheet-panel">
        <button
          type="button"
          className="word-sheet-close"
          onClick={onClose}
          aria-label="閉じる"
        >
          ×
        </button>
        <div className="word-sheet-grabber" aria-hidden="true" />
        <div className="word-sheet-scroll">
          {error ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--ink-faint)", fontFamily: "'Noto Serif JP', serif" }}>
              読み込みに失敗しました
            </div>
          ) : !word ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--ink-faint)", fontFamily: "'Noto Serif JP', serif" }}>
              読み込み中…
            </div>
          ) : (
            <WordEntryBody word={word} autoPlay={false} />
          )}
        </div>
      </div>
    </div>
  );
}
