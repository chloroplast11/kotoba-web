import type { DimKey } from "@/types/domain";

export const DIM_NAMES: Record<DimKey, string> = {
  R: "認識",
  P: "産出",
  U: "運用",
};

export const DIM_DESCRIPTIONS: Record<DimKey, string> = {
  R: "見て・聞いて意味が分かる",
  P: "意味から正しい言葉を引き出せる",
  U: "文の中で正しく使える",
};

export const UNLOCK_THRESHOLD = 3;

export const DIM_ORDER: DimKey[] = ["R", "P", "U"];
