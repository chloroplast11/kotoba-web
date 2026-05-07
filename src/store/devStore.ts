"use client";
import { create } from "zustand";
import { setTimeOffset } from "@/lib/time";

interface DevState {
  timeOffset: number;
  setTimeOffset: (ms: number) => void;
  advanceDay: (days: number) => void;
}

export const useDevStore = create<DevState>((set, get) => ({
  timeOffset: 0,

  setTimeOffset: (ms: number) => {
    setTimeOffset(ms);
    set({ timeOffset: ms });
  },

  advanceDay: (days: number) => {
    const newOffset = get().timeOffset + days * 86400000;
    setTimeOffset(newOffset);
    set({ timeOffset: newOffset });
  },
}));
