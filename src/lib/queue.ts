import type { Word, Question } from "@/generated/prisma";
import type { AppSettingsData, DimKey, ListenMode, QueueItem, SrsData } from "@/types/domain";
import { getMasteryTier, isDimensionUnlocked } from "./srs";

type WordStateMap = Map<number, Record<DimKey, SrsData | null>>;
type TypeFilter = "listening_kanji" | "non_listening" | "any";

const LISTENING_KANJI_TYPE = "listening_kanji";

function applyTypeFilter(qs: Question[], filter: TypeFilter): Question[] {
  if (filter === "listening_kanji") return qs.filter((q) => q.type === LISTENING_KANJI_TYPE);
  if (filter === "non_listening") return qs.filter((q) => q.type !== LISTENING_KANJI_TYPE);
  return qs;
}

function pickQuestion(
  wordId: number,
  dim: DimKey,
  questions: Question[],
  usedIds: Set<string>,
  typeFilter: TypeFilter = "any"
): Question | null {
  const candidates = applyTypeFilter(
    questions.filter((q) => q.wordId === wordId && q.dimension === dim),
    typeFilter
  );
  if (candidates.length === 0) return null;
  const fresh = candidates.filter((q) => !usedIds.has(q.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getEmptySrsData(): SrsData {
  return {
    stability: 0,
    difficulty: 0,
    due: null,
    lastReview: null,
    reps: 0,
    lapses: 0,
    fsrsState: 0,
    learnedAt: null,
  };
}

export function buildTodayQueue(
  words: Word[],
  questions: Question[],
  wordStates: WordStateMap,
  settings: AppSettingsData,
  now: Date
): QueueItem[] {
  const nowMs = now.getTime();

  // ── Part A: Reviews (already-learned words) ──────────────────
  const reviewItems: Array<{ wordId: number; dim: DimKey; urgency: number; isNewDim?: boolean }> = [];

  for (const [wordId, dimStates] of wordStates.entries()) {
    const word = words.find((w) => w.id === wordId);
    if (!word) continue;

    for (const dim of ["R", "P", "U"] as DimKey[]) {
      if (!isDimensionUnlocked(dim, dimStates)) continue;

      const srs = dimStates[dim] ?? getEmptySrsData();
      if (getMasteryTier(srs) === 2) continue;

      if (srs.reps > 0 && srs.due && srs.due.getTime() <= nowMs) {
        reviewItems.push({ wordId, dim, urgency: nowMs - srs.due.getTime() });
      } else if (srs.reps === 0 && dim !== "R") {
        reviewItems.push({ wordId, dim, urgency: 0, isNewDim: true });
      }
    }
  }

  reviewItems.sort((a, b) => b.urgency - a.urgency);

  // ── Part B: New words for today ───────────────────────────────
  const learnedIds = new Set(
    [...wordStates.entries()]
      .filter(([, ws]) => ws.R?.learnedAt !== null)
      .map(([id]) => id)
  );

  const newCandidates = words
    .filter((w) => !learnedIds.has(w.id))
    .sort((a, b) => a.id - b.id)
    .slice(0, settings.dailyNewWords);

  // ── Question picker ───────────────────────────────────────────
  const usedQuestionIds = new Set<string>();

  function pick(wordId: number, dim: DimKey, typeFilter: TypeFilter = "any"): Question | null {
    const q = pickQuestion(wordId, dim, questions, usedQuestionIds, typeFilter);
    if (q) usedQuestionIds.add(q.id);
    return q;
  }

  // ── Build the queue ───────────────────────────────────────────
  const finalQueue: QueueItem[] = [];
  const round2Staged: Array<{ wordId: number; dim: DimKey }> = [];

  // Round 1: learn-and-test pairs (听音题不进新词流程)
  for (const word of newCandidates) {
    const q1 = pick(word.id, "R", "non_listening");
    if (!q1) continue;
    finalQueue.push({ wordId: word.id, dim: "R", isNew: true, round: 1, questionId: q1.id });

    // Stage Round 2 if another non-listening question exists
    const remaining = questions.filter(
      (q) =>
        q.wordId === word.id &&
        q.dimension === "R" &&
        q.type !== LISTENING_KANJI_TYPE &&
        !usedQuestionIds.has(q.id)
    );
    if (remaining.length > 0) {
      round2Staged.push({ wordId: word.id, dim: "R" });
    }
  }

  // Round 2: assign questions after shuffling
  for (const item of shuffle(round2Staged)) {
    const q = pick(item.wordId, item.dim, "non_listening");
    if (q) finalQueue.push({ wordId: item.wordId, dim: item.dim, isNew: true, round: 2, questionId: q.id });
  }

  // Part C: Reviews — decide listening mode first, then pick a matching question
  const ratio = Math.max(0, Math.min(100, settings.listeningRatio ?? 30));
  const reviewWithQs: QueueItem[] = [];
  for (const item of reviewItems) {
    let audioMode: ListenMode | undefined;
    let q: Question | null = null;

    const eligibleForListening = item.dim === "R" && !item.isNewDim && ratio > 0;
    if (eligibleForListening && Math.random() * 100 < ratio) {
      const preferKanji = Math.random() < 0.5;
      if (preferKanji) {
        q = pick(item.wordId, item.dim, "listening_kanji");
        if (q) {
          audioMode = "listen_kanji";
        } else {
          q = pick(item.wordId, item.dim, "non_listening");
          if (q) audioMode = "listen_meaning";
        }
      } else {
        q = pick(item.wordId, item.dim, "non_listening");
        if (q) audioMode = "listen_meaning";
      }
    }

    if (!q) {
      q = pick(item.wordId, item.dim, "non_listening");
    }

    if (q) {
      reviewWithQs.push({
        wordId: item.wordId,
        dim: item.dim,
        questionId: q.id,
        urgency: item.urgency,
        isNewDim: item.isNewDim,
        audioMode,
      });
    }
  }

  const byDim: Record<DimKey, QueueItem[]> = { R: [], P: [], U: [] };
  for (const x of reviewWithQs) byDim[x.dim].push(x);
  for (const d of ["R", "P", "U"] as DimKey[]) byDim[d] = shuffle(byDim[d]);

  const interleaved: QueueItem[] = [];
  while (byDim.R.length || byDim.P.length || byDim.U.length) {
    const r = byDim.R.shift();
    const p = byDim.P.shift();
    const u = byDim.U.shift();
    if (r) interleaved.push(r);
    if (p) interleaved.push(p);
    if (u) interleaved.push(u);
  }

  return [...finalQueue, ...interleaved];
}

export function reconcileNewWordsInQueue(
  currentQueue: QueueItem[],
  cursor: number,
  desiredNewCount: number,
  words: Word[],
  questions: Question[],
  wordStates: WordStateMap
): QueueItem[] {
  const round1NewItems = currentQueue
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.isNew && item.round === 1);
  const currentNewCount = round1NewItems.length;

  if (currentNewCount === desiredNewCount) return currentQueue;

  const usedQuestionIds = new Set(currentQueue.map((q) => q.questionId));
  const queueWordIds = new Set(currentQueue.filter((q) => q.isNew).map((q) => q.wordId));

  if (desiredNewCount > currentNewCount) {
    const learnedIds = new Set(
      [...wordStates.entries()]
        .filter(([, ws]) => ws.R?.learnedAt !== null)
        .map(([id]) => id)
    );
    const candidates = words
      .filter((w) => !learnedIds.has(w.id) && !queueWordIds.has(w.id))
      .sort((a, b) => a.id - b.id)
      .slice(0, desiredNewCount - currentNewCount);

    const round1Additions: QueueItem[] = [];
    const round2Additions: Array<{ wordId: number; dim: DimKey }> = [];

    for (const word of candidates) {
      const q1 = pickQuestion(word.id, "R", questions, usedQuestionIds, "non_listening");
      if (!q1) continue;
      usedQuestionIds.add(q1.id);
      round1Additions.push({ wordId: word.id, dim: "R", isNew: true, round: 1, questionId: q1.id });

      const remaining = questions.filter(
        (q) =>
          q.wordId === word.id &&
          q.dimension === "R" &&
          q.type !== LISTENING_KANJI_TYPE &&
          !usedQuestionIds.has(q.id)
      );
      if (remaining.length > 0) {
        round2Additions.push({ wordId: word.id, dim: "R" });
      }
    }

    const round2Items: QueueItem[] = [];
    for (const item of shuffle(round2Additions)) {
      const q = pickQuestion(item.wordId, item.dim, questions, usedQuestionIds, "non_listening");
      if (!q) continue;
      usedQuestionIds.add(q.id);
      round2Items.push({ wordId: item.wordId, dim: item.dim, isNew: true, round: 2, questionId: q.id });
    }

    let lastRound1Idx = -1;
    let lastRound2Idx = -1;
    currentQueue.forEach((item, idx) => {
      if (item.isNew && item.round === 1) lastRound1Idx = idx;
      if (item.isNew && item.round === 2) lastRound2Idx = idx;
    });

    const out = [...currentQueue];
    const round2Insert = lastRound2Idx >= 0 ? lastRound2Idx + 1 : lastRound1Idx + 1 + round1Additions.length;
    out.splice(lastRound1Idx + 1, 0, ...round1Additions);
    const adjusted = lastRound2Idx >= 0 ? round2Insert + round1Additions.length : round2Insert;
    out.splice(adjusted, 0, ...round2Items);
    return out;
  }

  const toRemove = currentNewCount - desiredNewCount;
  const removableRound1Indices: number[] = [];
  for (let i = round1NewItems.length - 1; i >= 0; i--) {
    const { idx } = round1NewItems[i];
    if (idx < cursor) break;
    removableRound1Indices.push(idx);
    if (removableRound1Indices.length >= toRemove) break;
  }
  if (removableRound1Indices.length === 0) return currentQueue;

  const removedWordIds = new Set(removableRound1Indices.map((idx) => currentQueue[idx].wordId));
  const removedIndexSet = new Set(removableRound1Indices);

  return currentQueue.filter((item, idx) => {
    if (removedIndexSet.has(idx)) return false;
    if (item.isNew && item.round === 2 && removedWordIds.has(item.wordId) && idx >= cursor) return false;
    return true;
  });
}
