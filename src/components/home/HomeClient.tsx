"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/sessionStore";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// (useSessionStore imported for setState access below)
import { useSettingsStore } from "@/store/settingsStore";
import { getCurrentDate } from "@/lib/time";
import type { ReviewResult } from "@/types/domain";
import OnboardingModal from "@/components/onboarding/OnboardingModal";
import { useOnboardingStore } from "@/store/onboardingStore";

interface SessionData {
  queue: { isNew?: boolean; wordId: number }[];
  cursor: number;
  results: ReviewResult[];
  stats: { totalLearned: number; mastered: number };
  wordMap: Record<number, { word: string; furigana: string }>;
}

function currentSeasonLabel() {
  const m = getCurrentDate().getMonth() + 1;
  if (m >= 3 && m <= 5) return "春";
  if (m >= 6 && m <= 8) return "夏";
  if (m >= 9 && m <= 11) return "秋";
  return "冬";
}

function formatDate() {
  return getCurrentDate().toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
}

interface Props {
  initialData: SessionData;
}

export default function HomeClient({ initialData }: Props) {
  const router = useRouter();
  const session = useSessionStore();
  const settings = useSettingsStore();

  useEffect(() => {
    useSessionStore.setState({
      queue: initialData.queue as typeof session.queue,
      cursor: initialData.cursor,
      results: initialData.results,
      wordMap: initialData.wordMap,
      isLoaded: true,
    });
    if (!settings.isLoaded) settings.loadSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!useOnboardingStore.getState().hasSeen()) {
      useOnboardingStore.getState().open();
    }
  }, []);

  const queue = session.isLoaded ? session.queue : initialData.queue;
  const cursor = session.isLoaded ? session.cursor : initialData.cursor;
  const results = session.isLoaded ? session.results : initialData.results;
  const wordMap = session.isLoaded ? session.wordMap : initialData.wordMap;
  const { totalLearned, mastered } = initialData.stats;
  const totalReviews = settings.totalReviews;

  const newWordIds = new Set(queue.filter((q) => q.isNew).map((q) => q.wordId));
  const newWordsToday = newWordIds.size;
  const reviewsToday = queue.filter((q) => !q.isNew).length;
  const remaining = queue.length - cursor;

  function handleStart() {
    if (remaining === 0) {
      router.push("/library");
      return;
    }
    const item = queue[cursor];
    if (!item) return;
    if ((item as { isNew?: boolean; wordId?: number }).isNew) {
      router.push(`/learn/${(item as { wordId: number }).wordId}`);
    } else {
      router.push("/practice");
    }
  }

  // Group today's results by wordId for "Today so far" section
  const byWord = new Map<number, { right: number; wrong: number; word?: string; furigana?: string }>();
  for (const r of results) {
    const entry = byWord.get(r.wordId) ?? { right: 0, wrong: 0 };
    if (r.correct) entry.right++; else entry.wrong++;
    byWord.set(r.wordId, entry);
  }

  return (
    <div>
      <div style={{ position: "relative" }}>
        <div className="kanji-mark km1">言</div>
        <section className="home-hero">
          <div className="date-line">{formatDate()} · {currentSeasonLabel()}</div>
          <h1>
            今日は <em>{newWordsToday}</em> 個の新しい言葉に出会い、
            <br /><em>{reviewsToday}</em> 個を復習します。
          </h1>
          <p className="lede">
            語彙はフラッシュカードの束ではありません。
            それぞれの言葉は、用法・近縁語・文脈とともに届きます。
            まず読み、次に練習しましょう。
          </p>
          <button
            type="button"
            className="hero-sub-rpu"
            onClick={() => useOnboardingStore.getState().open()}
            aria-label="言葉帖の学び方をもう一度見る"
          >
            認識・産出・運用 ── 三つの次元で言葉を学ぶ
          </button>
        </section>
      </div>

      <div className="stats-row">
        <div className="stat">
          <div className="stat-num">{remaining}<span className="unit">問</span></div>
          <div className="stat-label">本日の残り</div>
        </div>
        <div className="stat">
          <div className="stat-num">{totalLearned}</div>
          <div className="stat-label">出会った語彙</div>
        </div>
        <div className="stat">
          <div className="stat-num">{mastered}</div>
          <div className="stat-label">習得済み</div>
        </div>
        <div className="stat">
          <div className="stat-num">{totalReviews}</div>
          <div className="stat-label">累計復習</div>
        </div>
      </div>

      <div className="actions">
        <button className="btn" onClick={handleStart}>
          {remaining > 0 ? "本日の学習を始める →" : "本日完了 — 単語帖を見る"}
        </button>
        <button className="btn btn-secondary" onClick={() => router.push("/library")}>
          単語帖を開く
        </button>
      </div>

      {results.length > 0 && (
        <>
          <div className="section-head">
            <h2>本日の歩み</h2>
            <span className="meta">{results.length} responses</span>
          </div>
          <div className="summary-card">
            <h3>今日の成果</h3>
            <ul className="summary-list">
              {[...byWord.entries()].map(([wordId, s]) => {
                const total = s.right + s.wrong;
                const rate = total > 0 ? Math.round(s.right * 100 / total) : 0;
                const cls = rate >= 75 ? "good" : rate < 50 ? "bad" : "";
                return (
                  <li key={wordId}>
                    <span className="word">{wordMap[wordId]?.word ?? `ID:${wordId}`}</span>
                    <span className={`result ${cls}`}>{s.right}/{total} · {rate}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
      <OnboardingModal />
    </div>
  );
}
