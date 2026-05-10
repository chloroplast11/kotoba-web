"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getMasteryTier, type MasteryTier } from "@/lib/srs";
import { DIM_NAMES, DIM_DESCRIPTIONS } from "@/lib/constants";
import type { DimKey, SrsData } from "@/types/domain";

interface WordDetail {
  id: number;
  word: string;
  furigana: string;
  meaningZh: string;
  level: number;
  frequency: string;
  dimStates: Record<DimKey, SrsData | null>;
}

interface Props {
  word: WordDetail;
  onClose: () => void;
  onChanged: () => void;
}

const TIER_LABELS: Array<{ tier: MasteryTier; label: string }> = [
  { tier: 0, label: "未学" },
  { tier: 1, label: "学习中" },
  { tier: 2, label: "精通" },
];

const FREQ_LABELS: Record<string, string> = {
  high: "頻出",
  mid: "中頻",
  low: "低頻",
};

export default function WordDetailDrawer({ word, onClose, onChanged }: Props) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function setTier(dim: DimKey, tier: MasteryTier) {
    await fetch("/api/mastery", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordId: word.id, dimension: dim, level: tier }),
    });
    onChanged();
  }

  return (
    <div className="drawer-root" role="dialog" aria-modal="true">
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer-panel">
        <button className="drawer-close" onClick={onClose} aria-label="关闭">
          ×
        </button>

        <div className="drawer-head">
          <div className="lib-card-furi">{word.furigana}</div>
          <div className="entry-word">{word.word}</div>
          <div className="lib-card-meaning">{word.meaningZh}</div>
          <div className="tag-row" style={{ marginTop: "8px" }}>
            <span className={`tag freq-${word.frequency}`}>
              {FREQ_LABELS[word.frequency] ?? word.frequency}
            </span>
            <span className="tag">N{word.level}</span>
          </div>
        </div>

        <div className="drawer-section">
          <div className="zh-zone">
            <h3 className="drawer-section-title">编辑掌握度</h3>
            <p className="drawer-section-desc">
              R・認識：看到/听到能反应过来 ／ P・産出：从意思能写/选出词 ／ U・運用：能在句子里正确使用
            </p>
          </div>

          {(["R", "P", "U"] as DimKey[]).map((dim) => {
            const current = getMasteryTier(word.dimStates[dim]);
            return (
              <div key={dim} className="mastery-row">
                <div className="mastery-row-label">
                  <span className="mastery-dim-letter">{dim}</span>
                  <span className="mastery-dim-name">{DIM_NAMES[dim]}</span>
                  <span className="mastery-dim-desc">{DIM_DESCRIPTIONS[dim]}</span>
                </div>
                <div className="mastery-segments zh-zone">
                  {TIER_LABELS.map(({ tier, label }) => (
                    <button
                      key={tier}
                      className={`mastery-segment ${current === tier ? "active" : ""}`}
                      onClick={() => current !== tier && setTier(dim, tier)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="drawer-actions zh-zone">
          <button className="btn" onClick={() => router.push(`/learn/${word.id}?from=library`)}>
            打开学习页 →
          </button>
        </div>
      </aside>
    </div>
  );
}
