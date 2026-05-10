import type { Word, Question } from "../src/generated/prisma";
import type { AppSettingsData, DimKey, SrsData } from "../src/types/domain";
import { buildCramQueue } from "../src/lib/cram";

function makeWord(id: number, frequency: "high" | "mid" | "low", level = 2): Word {
  return {
    id,
    word: `w${id}`,
    furigana: "",
    romaji: "",
    meaningZh: "",
    meaningEn: "",
    level,
    pos: "",
    frequency,
    usageNotes: "",
    exampleSentences: "[]",
    synonyms: "[]",
    antonyms: "[]",
    collocations: "[]",
  };
}

function makeQuestion(id: string, wordId: number, dim: DimKey): Question {
  return {
    id,
    wordId,
    dimension: dim,
    type: "mcq",
    question: "",
    questionPlain: "",
    options: "[]",
    correctIndex: 0,
    explanation: null,
    explanationPlain: null,
    explanationZh: null,
  };
}

function makeState(opts: Partial<SrsData> & { learnedAt: Date | null }): SrsData {
  return {
    stability: 0,
    difficulty: 0,
    due: null,
    lastReview: null,
    reps: 0,
    lapses: 0,
    fsrsState: 0,
    ...opts,
  };
}

const settings: AppSettingsData = {
  dailyNewWords: 4, practiceLowFreqUsage: false, activeLevels: [2],
  totalReviews: 0, streak: 0, timeOffset: 0, cramSize: 50,
};

const now = new Date();

// Setup: 5 words, all learned, R has been reviewed but not mastered
const words: Word[] = [1, 2, 3, 4, 5].map((i) => makeWord(i, i <= 2 ? "high" : "mid"));
const questions: Question[] = words.flatMap((w) => [
  makeQuestion(`q${w.id}-R-1`, w.id, "R"),
  makeQuestion(`q${w.id}-R-2`, w.id, "R"),
  makeQuestion(`q${w.id}-P-1`, w.id, "P"),
  makeQuestion(`q${w.id}-U-1`, w.id, "U"),
]);

// Word 1: R reps=2 stab=4 (learning, P unlocked, P state empty), word 2: R mastered (skip), word 3: R learning low stab P locked
const states = new Map<number, Record<DimKey, SrsData | null>>([
  [1, { R: makeState({ learnedAt: now, reps: 2, stability: 4 }), P: null, U: null }],
  [2, { R: makeState({ learnedAt: now, reps: 5, stability: 12 }), P: makeState({ learnedAt: null, reps: 0 }), U: null }], // R mastered, P just unlocked
  [3, { R: makeState({ learnedAt: now, reps: 1, stability: 2 }), P: null, U: null }], // R learning, P locked
  [4, { R: makeState({ learnedAt: now, reps: 3, stability: 8 }), P: makeState({ learnedAt: null, reps: 1, stability: 1 }), U: null }], // R learning, P learning
  [5, { R: null, P: null, U: null }], // not learned
]);

const queue = buildCramQueue(words, questions, states, settings, now);

console.log("Queue length:", queue.length);
for (const item of queue) {
  console.log(`  word=${item.wordId} dim=${item.dim} qid=${item.questionId}`);
}

// Assertions
const expectations: Array<[string, boolean]> = [
  ["should not contain word 5 (not learned)", !queue.some((i) => i.wordId === 5)],
  ["should not contain word 2 R (mastered, stab >= 11)", !queue.some((i) => i.wordId === 2 && i.dim === "R")],
  ["should contain word 2 P (just unlocked)", queue.some((i) => i.wordId === 2 && i.dim === "P")],
  ["should contain word 1 R (learning)", queue.some((i) => i.wordId === 1 && i.dim === "R")],
  ["should not contain word 3 P (P locked: R stab < 3)", !queue.some((i) => i.wordId === 3 && i.dim === "P")],
  ["should contain word 4 R and P", queue.some((i) => i.wordId === 4 && i.dim === "R") && queue.some((i) => i.wordId === 4 && i.dim === "P")],
  ["all queue items must have valid questionId", queue.every((i) => questions.some((q) => q.id === i.questionId))],
  ["queue size <= cramSize", queue.length <= settings.cramSize],
];

let pass = 0, fail = 0;
for (const [label, ok] of expectations) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
