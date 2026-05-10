"use client";
import { create } from "zustand";
import type { DimKey } from "@/types/domain";
import type { CramItem } from "@/lib/cram";

export interface CramResult {
  wordId: number;
  dim: DimKey;
  questionId: string;
  correct: boolean;
}

interface CramState {
  queue: CramItem[];
  cursor: number;
  results: CramResult[];
  initialized: boolean;
  init: (queue: CramItem[]) => void;
  submitAnswer: (correct: boolean) => void;
  advance: () => void;
  reset: () => void;
}

export const useCramStore = create<CramState>((set, get) => ({
  queue: [],
  cursor: 0,
  results: [],
  initialized: false,

  init: (queue) => set({ queue, cursor: 0, results: [], initialized: true }),

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

  reset: () => set({ queue: [], cursor: 0, results: [], initialized: false }),
}));
