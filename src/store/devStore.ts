"use client";
import { create } from "zustand";
import { setTimeOffset } from "@/lib/time";

interface DevState {
  timeOffset: number;
  showQualityScore: boolean;
  setTimeOffset: (ms: number) => void;
  setShowQualityScore: (v: boolean) => void;
  advanceDay: (days: number) => void;
}

export const useDevStore = create<DevState>((set, get) => ({
  timeOffset: 0,
  showQualityScore: false,

  setTimeOffset: (ms: number) => {
    setTimeOffset(ms);
    set({ timeOffset: ms });
  },

  setShowQualityScore: (v: boolean) => {
    set({ showQualityScore: v });
  },

  advanceDay: (days: number) => {
    const newOffset = get().timeOffset + days * 86400000;
    setTimeOffset(newOffset);
    set({ timeOffset: newOffset });
  },
}));
