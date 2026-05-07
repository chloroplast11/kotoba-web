import {
  FSRS,
  createEmptyCard,
  generatorParameters,
  Rating,
  type Card,
} from "ts-fsrs";
import type { UserWordState } from "@/generated/prisma";
import type { AppSettingsData, DimKey, MasteryLevel, SrsData } from "@/types/domain";
import { UNLOCK_THRESHOLD } from "./constants";

const f = new FSRS(generatorParameters({ enable_fuzz: false }));

export { Rating };

// Convert DB record → ts-fsrs Card
export function toFsrsCard(state: SrsData): Card {
  const empty = createEmptyCard();
  const now = new Date();
  const lastReview = state.lastReview ?? now;
  const due = state.due ?? now;
  const elapsedDays = Math.max(
    0,
    (now.getTime() - lastReview.getTime()) / 86400000
  );
  const scheduledDays = Math.max(
    0,
    (due.getTime() - lastReview.getTime()) / 86400000
  );
  return {
    ...empty,
    stability: state.stability,
    difficulty: state.difficulty,
    due,
    last_review: lastReview,
    reps: state.reps,
    lapses: state.lapses,
    state: state.fsrsState,
    elapsed_days: elapsedDays,
    scheduled_days: scheduledDays,
    learning_steps: 0,
  };
}

// ts-fsrs Card → DB update fields
export function fromFsrsCard(card: Card): Partial<UserWordState> {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due,
    lastReview: card.last_review ?? null,
    reps: card.reps,
    lapses: card.lapses,
    fsrsState: card.state,
  };
}

// Schedule a review and return updated DB fields
export function scheduleReview(
  state: SrsData | null,
  rating: Rating,
  now: Date
): Partial<UserWordState> {
  const card = state
    ? toFsrsCard(state)
    : createEmptyCard(now);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = f.repeat(card, now) as any;
  return fromFsrsCard(result[rating].card as Card);
}

// Mastery level: 0=new/locked, 1=learning, 2=mastered
export function getMasteryLevel(state: SrsData | null): MasteryLevel {
  if (!state || state.reps === 0) return 0;
  if (state.stability < 7) return 1;
  return 2;
}

// Whether a dimension is unlocked for practice
export function isDimensionUnlocked(
  dim: DimKey,
  dimStates: Record<DimKey, SrsData | null>,
  frequency: string,
  settings: Pick<AppSettingsData, "practiceLowFreqUsage">
): boolean {
  if (dim === "R") return true;

  if (dim === "P") {
    const r = dimStates.R;
    return !!r && r.stability >= UNLOCK_THRESHOLD;
  }

  if (dim === "U") {
    if (frequency === "low" && !settings.practiceLowFreqUsage) return false;
    const p = dimStates.P;
    return !!p && p.stability >= UNLOCK_THRESHOLD;
  }

  return false;
}

// Convert correct/incorrect answer to FSRS Rating
// Simplified: wrong=Again, right=Good (can be extended with Hard/Easy later)
export function answerToRating(correct: boolean): Rating {
  return correct ? Rating.Good : Rating.Again;
}

// Extract SrsData from UserWordState
export function toSrsData(state: UserWordState): SrsData {
  return {
    stability: state.stability,
    difficulty: state.difficulty,
    due: state.due,
    lastReview: state.lastReview,
    reps: state.reps,
    lapses: state.lapses,
    fsrsState: state.fsrsState,
    learnedAt: state.learnedAt,
  };
}
