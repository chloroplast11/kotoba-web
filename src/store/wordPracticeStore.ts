"use client";
import { create } from "zustand";
import type { DimKey } from "@/types/domain";
import type { WordPracticeItem } from "@/lib/wordPractice";
import { getCurrentTime } from "@/lib/time";

export interface WordPracticeResult {
  wordId: number;
  dim: DimKey;
  questionId: string;
  correct: boolean;
}

interface WordPracticeState {
  queue: WordPracticeItem[];
  cursor: number;
  results: WordPracticeResult[];
  startedAt: number;
  initialized: boolean;
  init: (queue: WordPracticeItem[]) => void;
  submitAnswer: (correct: boolean) => void;
  advance: () => void;
  reset: () => void;
}

export const useWordPracticeStore = create<WordPracticeState>((set, get) => ({
  queue: [],
  cursor: 0,
  results: [],
  startedAt: 0,
  initialized: false,

  init: (queue) =>
    set({
      queue,
      cursor: 0,
      results: [],
      startedAt: getCurrentTime(),
      initialized: true,
    }),

  submitAnswer: (correct) => {
    const { queue, cursor, results } = get();
    const item = queue[cursor];
    if (!item) return;
    set({
      results: [
        ...results,
        { wordId: item.wordId, dim: item.dim, questionId: item.questionId, correct },
      ],
    });
  },

  advance: () => set((s) => ({ cursor: s.cursor + 1 })),

  reset: () =>
    set({ queue: [], cursor: 0, results: [], startedAt: 0, initialized: false }),
}));
