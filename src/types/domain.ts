export type DimKey = "R" | "P" | "U";
export type MasteryLevel = 0 | 1 | 2;
export type FrequencyLevel = "high" | "mid" | "low";

export interface QueueItem {
  wordId: number;
  dim: DimKey;
  questionId: string;
  round?: 1 | 2;
  isNew?: boolean;
  isNewDim?: boolean;
  urgency?: number;
}

export interface ReviewResult {
  wordId: number;
  dim: DimKey;
  correct: boolean;
  timestamp: number;
}

export interface SrsData {
  stability: number;
  difficulty: number;
  due: Date | null;
  lastReview: Date | null;
  reps: number;
  lapses: number;
  fsrsState: number;
  learnedAt: Date | null;
}

export type DimStateMap = Record<DimKey, SrsData | null>;

export interface WordStateEntry {
  R: SrsData | null;
  P: SrsData | null;
  U: SrsData | null;
}

export interface ExampleSentence {
  ja: string;
  ja_plain: string;
  zh: string;
  en: string;
}

export interface QuestionOption {
  text: string;
  text_plain: string;
}

export interface AppSettingsData {
  dailyNewWords: number;
  practiceLowFreqUsage: boolean;
  activeLevels: number[];
  totalReviews: number;
  streak: number;
  timeOffset: number;
  cramSize: number;
}
