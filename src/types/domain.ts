export type DimKey = "R" | "P" | "U";
export type MasteryLevel = 0 | 1 | 2;
export type FrequencyLevel = "high" | "mid" | "low";

export type ListenMode = "listen_kanji" | "listen_meaning";

export interface QueueItem {
  wordId: number;
  dim: DimKey;
  questionId: string;
  round?: 1 | 2;
  isNew?: boolean;
  isNewDim?: boolean;
  urgency?: number;
  audioMode?: ListenMode;
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
}

export interface MistakeQuestionItem {
  id: number;
  questionId: string;
  dimension: DimKey;
  type: string;
  question: string | null;
  options: QuestionOption[];
  correctIndex: number;
  wrongChoice: number;
  explanation: string | null;
  explanationZh: string | null;
  wrongCount: number;
  lastWrongAt: string;
}

export interface MistakeWordGroup {
  wordId: number;
  word: string;
  furigana: string;
  meaningZh: string;
  level: number;
  totalWrongQuestions: number;
  dimensions: DimKey[];
  lastWrongAt: string;
  questions: MistakeQuestionItem[];
}

export interface MistakesResponse {
  groups: MistakeWordGroup[];
}

export interface CalendarDay {
  date: string;
  count: number;
  hasNew: boolean;
}

export interface AppSettingsData {
  dailyNewWords: number;
  practiceLowFreqUsage: boolean;
  activeLevels: number[];
  totalReviews: number;
  streak: number;
  timeOffset: number;
  cramSize: number;
  audioAutoplay: boolean;
  listeningRatio: number;
}
