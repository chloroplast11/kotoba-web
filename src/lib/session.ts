import { prisma } from "@/lib/db";
import { buildTodayQueue, reconcileNewWordsInQueue } from "@/lib/queue";
import { getCurrentDate, todayDateString } from "@/lib/time";
import { toSrsData } from "@/lib/srs";
import type { AppSettingsData, DimKey, QueueItem, ReviewResult } from "@/types/domain";
import type { DailySession, UserWordState, Word } from "@/generated/prisma";

type WordMap = Record<number, { word: string; furigana: string }>;

export interface TodaySession {
  session: DailySession;
  queue: QueueItem[];
  results: ReviewResult[];
  appliedNewCount: number;
  desiredNewCount: number;
  allStates: UserWordState[];
  wordMap: WordMap;
}

function countRound1New(queue: QueueItem[]): number {
  return queue.filter((q) => q.isNew && q.round === 1).length;
}

export async function loadOrReconcileTodaySession(
  settings: AppSettingsData
): Promise<TodaySession> {
  const today = todayDateString();
  const desiredNewCount = settings.dailyNewWords;

  const [existing, allStates] = await Promise.all([
    prisma.dailySession.findUnique({ where: { date: today } }),
    prisma.userWordState.findMany(),
  ]);

  const wordStateMap = new Map<number, Record<DimKey, ReturnType<typeof toSrsData> | null>>();
  for (const s of allStates) {
    if (!wordStateMap.has(s.wordId)) {
      wordStateMap.set(s.wordId, { R: null, P: null, U: null });
    }
    wordStateMap.get(s.wordId)![s.dimension as DimKey] = toSrsData(s);
  }

  let session: DailySession;
  let queue: QueueItem[];
  let words: Word[] | null = null;

  if (!existing) {
    const [w, questions] = await Promise.all([
      prisma.word.findMany(),
      prisma.question.findMany(),
    ]);
    words = w;
    queue = buildTodayQueue(w, questions, wordStateMap, settings, getCurrentDate());
    session = await prisma.dailySession.create({
      data: { date: today, queue: JSON.stringify(queue), cursor: 0, results: "[]" },
    });
  } else {
    queue = JSON.parse(existing.queue) as QueueItem[];
    const currentNewCount = countRound1New(queue);

    if (currentNewCount !== desiredNewCount) {
      const [w, questions] = await Promise.all([
        prisma.word.findMany(),
        prisma.question.findMany(),
      ]);
      words = w;
      const reconciled = reconcileNewWordsInQueue(
        queue,
        existing.cursor,
        desiredNewCount,
        w,
        questions,
        wordStateMap
      );
      if (countRound1New(reconciled) !== currentNewCount) {
        queue = reconciled;
        session = await prisma.dailySession.update({
          where: { date: today },
          data: { queue: JSON.stringify(queue) },
        });
      } else {
        session = existing;
      }
    } else {
      session = existing;
    }
  }

  const appliedNewCount = countRound1New(queue);
  const results = JSON.parse(session.results) as ReviewResult[];
  const allIds = [...new Set([...queue, ...results].map((q) => q.wordId))];

  const queueWords: Word[] = words
    ? words.filter((w) => allIds.includes(w.id))
    : await prisma.word.findMany({ where: { id: { in: allIds } } });

  const wordMap: WordMap = Object.fromEntries(
    queueWords.map((w) => [w.id, { word: w.word, furigana: w.furigana }])
  );

  return { session, queue, results, appliedNewCount, desiredNewCount, allStates, wordMap };
}
