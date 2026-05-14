"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DIM_NAMES, DIM_DESCRIPTIONS } from "@/lib/constants";
import { getCurrentDate } from "@/lib/time";
import type { WrongAnswerItem } from "@/types/domain";

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const now = getCurrentDate().getTime();
  const diffDays = Math.floor((now - then) / 86400000);
  if (diffDays <= 0) return "今日";
  if (diffDays === 1) return "昨日";
  if (diffDays < 7) return `${diffDays}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "long", day: "numeric" });
}

export default function MistakesClient() {
  const router = useRouter();
  const [items, setItems] = useState<WrongAnswerItem[] | null>(null);

  useEffect(() => {
    fetch("/api/mistakes")
      .then((r) => r.json())
      .then((data) => setItems(data.items as WrongAnswerItem[]))
      .catch(() => setItems([]));
  }, []);

  async function markResolved(id: number) {
    setItems((prev) => prev?.filter((it) => it.id !== id) ?? null);
    await fetch(`/api/mistakes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolved: true }),
    });
  }

  if (items === null) {
    return (
      <section className="home-hero">
        <div className="date-line">復習帖</div>
        <h1 style={{ fontSize: "32px" }}>読み込み中…</h1>
      </section>
    );
  }

  return (
    <>
      <section className="home-hero" style={{ marginBottom: "40px" }}>
        <div className="date-line">復習帖 · ふくしゅうちょう</div>
        <h1>
          忘れたところを、<br />もう一度。
        </h1>
        <p className="lede">
          {items.length > 0
            ? <>間違えた問題は <em style={{ color: "var(--accent)", fontStyle: "italic" }}>{items.length}</em> 件。落ち着いて、ひとつずつ。</>
            : "今のところ、復習が必要な言葉はありません。"}
        </p>
      </section>

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-jp">よくできました</div>
          <div className="empty-state-en">All clear. Keep going.</div>
        </div>
      ) : (
        <ul className="mistake-list">
          {items.map((it) => (
            <li key={it.id} className="mistake-row">
              <div className="mistake-main">
                <div className="mistake-word">
                  <ruby>
                    {it.word}
                    <rt>{it.furigana}</rt>
                  </ruby>
                </div>
                <div className="mistake-meaning">{it.meaningZh}</div>
                <div className="mistake-tags">
                  <span className={`dimension-pill dim-${it.dimension}`}>
                    {DIM_NAMES[it.dimension]}
                  </span>
                  <span className="mistake-meta">N{it.level}</span>
                  <span className="mistake-meta">× {it.wrongCount} 回</span>
                  <span className="mistake-meta">{formatRelativeDate(it.lastWrongAt)}</span>
                </div>
                <div className="mistake-hint">
                  {DIM_DESCRIPTIONS[it.dimension]}
                </div>
              </div>
              <div className="mistake-actions zh-zone">
                <button
                  type="button"
                  className="mistake-btn"
                  onClick={() => router.push(`/learn/${it.wordId}`)}
                >
                  打开学习页
                </button>
                <button
                  type="button"
                  className="mistake-btn mistake-btn-primary"
                  onClick={() => markResolved(it.id)}
                >
                  标记已掌握
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
