"use client";
import { create } from "zustand";

const KEY = "kotoba_onboarding_seen_v1";

interface OnboardingState {
  modalOpen: boolean;
  open: () => void;
  dismiss: () => void;
  resetAndShow: () => void;
  hasSeen: () => boolean;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  modalOpen: false,
  open: () => set({ modalOpen: true }),
  dismiss: () => {
    if (typeof window !== "undefined") localStorage.setItem(KEY, "true");
    set({ modalOpen: false });
  },
  resetAndShow: () => {
    if (typeof window !== "undefined") localStorage.removeItem(KEY);
    set({ modalOpen: true });
  },
  hasSeen: () => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(KEY) === "true";
  },
}));
