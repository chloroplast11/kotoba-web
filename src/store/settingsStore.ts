"use client";
import { create } from "zustand";
import type { AppSettingsData } from "@/types/domain";
import { setTimeOffset } from "@/lib/time";

interface SettingsState extends AppSettingsData {
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  update: (patch: Partial<AppSettingsData>) => Promise<void>;
}

const defaults: AppSettingsData = {
  dailyNewWords: 4,
  practiceLowFreqUsage: false,
  activeLevels: [2],
  totalReviews: 0,
  streak: 0,
  timeOffset: 0,
  cramSize: 50,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  ...defaults,
  isLoaded: false,

  loadSettings: async () => {
    const res = await fetch("/api/settings");
    if (!res.ok) return;
    const data = (await res.json()) as AppSettingsData;
    setTimeOffset(data.timeOffset ?? 0);
    set({ ...data, isLoaded: true });
  },

  update: async (patch) => {
    set(patch); // Optimistic update
    if (patch.timeOffset !== undefined) setTimeOffset(patch.timeOffset);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  },
}));
