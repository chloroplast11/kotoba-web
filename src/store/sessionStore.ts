"use client";
import { create } from "zustand";
import type { DimKey, QueueItem, ReviewResult } from "@/types/domain";
import { Rating } from "@/lib/srs";
import { getCurrentTime } from "@/lib/time";

interface SessionState {
  queue: QueueItem[];
  cursor: number;
  results: ReviewResult[];
  sessionDate: string | null;
  isLoaded: boolean;
  wordMap: Record<number, { word: string; furigana: string }>;

  loadSession: () => Promise<void>;
  submitAnswer: (
    wordId: number,
    dim: DimKey,
    questionId: string,
    correct: boolean,
    wrongChoice: number,
  ) => Promise<void>;
  advanceCursor: () => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  queue: [],
  cursor: 0,
  results: [],
  sessionDate: null,
  isLoaded: false,
  wordMap: {},

  loadSession: async () => {
    const res = await fetch("/api/session/today");
    if (!res.ok) return;
    const data = await res.json() as {
      queue: QueueItem[];
      cursor: number;
      results: ReviewResult[];
      date: string;
      wordMap: Record<number, { word: string; furigana: string }>;
    };
    set({
      queue: data.queue,
      cursor: data.cursor,
      results: data.results,
      sessionDate: data.date,
      wordMap: data.wordMap ?? {},
      isLoaded: true,
    });
  },

  submitAnswer: async (wordId, dim, questionId, correct, wrongChoice) => {
    const now = getCurrentTime();
    const rating = correct ? Rating.Good : Rating.Again;

    // Optimistic: append result locally
    const result: ReviewResult = { wordId, dim, correct, timestamp: now };
    set((s) => ({ results: [...s.results, result] }));

    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordId, dimension: dim, questionId, correct, rating, timestamp: now, wrongChoice }),
    });

    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { pruned?: boolean } | null;
      if (data?.pruned) {
        const cursor = get().cursor;
        const queue = get().queue;
        const trimmed = queue.filter((item, idx) => {
          if (idx <= cursor) return true;
          return !(item.wordId === wordId && item.dim === dim);
        });
        if (trimmed.length !== queue.length) set({ queue: trimmed });
      }
    }
  },

  advanceCursor: () => set((s) => ({ cursor: s.cursor + 1 })),

  reset: () => set({ queue: [], cursor: 0, results: [], sessionDate: null, isLoaded: false, wordMap: {} }),
}));
