"use client";
import { useEffect, useRef, useState } from "react";
import { DIM_NAMES, DIM_DESCRIPTIONS } from "@/lib/constants";
import { getMasteryTier, type MasteryTier } from "@/lib/srs";
import { useSessionStore } from "@/store/sessionStore";
import type { DimKey, SrsData } from "@/types/domain";

interface Props {
  wordId: number;
}

const TIER_LABELS: Array<{ tier: MasteryTier; label: string }> = [
  { tier: 0, label: "未学" },
  { tier: 1, label: "学习中" },
  { tier: 2, label: "精通" },
];

function fakeStateForTier(tier: MasteryTier): SrsData | null {
  if (tier === 0) return null;
  return {
    stability: tier === 1 ? 3.5 : 15,
    difficulty: 5,
    due: null,
    lastReview: null,
    reps: 1,
    lapses: 0,
    fsrsState: 2,
    learnedAt: null,
  };
}

export default function MasteryPopover({ wordId }: Props) {
  const [open, setOpen] = useState(false);
  const [dimStates, setDimStates] = useState<Record<DimKey, SrsData | null> | null>(null);
  const [pending, setPending] = useState<DimKey | null>(null);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    setDimStates(null);
    setOpen(false);
  }, [wordId]);

  useEffect(() => {
    if (!open) return;
    if (dimStates) return;
    let cancelled = false;
    fetch(`/api/mastery?wordId=${wordId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setDimStates(data.dimStates ?? { R: null, P: null, U: null });
      })
      .catch(() => {
        if (!cancelled) setDimStates({ R: null, P: null, U: null });
      });
    return () => {
      cancelled = true;
    };
  }, [open, wordId, dimStates]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen((v) => !v);
  }

  async function setTier(dim: DimKey, tier: MasteryTier) {
    setPending(dim);
    setDimStates((prev) => ({
      R: prev?.R ?? null,
      P: prev?.P ?? null,
      U: prev?.U ?? null,
      [dim]: fakeStateForTier(tier),
    }));
    try {
      await fetch("/api/mastery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordId, dimension: dim, level: tier }),
      });
      if (tier === 2) {
        await useSessionStore.getState().loadSession();
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <span
      ref={ref}
      className="mastery-popover-anchor"
      data-open={open ? "true" : "false"}
    >
      <button
        type="button"
        className="mastery-popover-trigger"
        onClick={toggle}
        aria-label="習得度を編集"
      >
        習得度
      </button>
      {open && (
        <span className="mastery-popover-popup zh-zone" role="dialog">
          <span className="mastery-popover-title">编辑掌握度</span>
          {(["R", "P", "U"] as DimKey[]).map((dim) => {
            const current = dimStates ? getMasteryTier(dimStates[dim]) : 0;
            const loading = !dimStates;
            return (
              <span key={dim} className="mastery-popover-row">
                <span className="mastery-row-label">
                  <span className="mastery-dim-letter">{dim}</span>
                  <span className="mastery-dim-name">{DIM_NAMES[dim]}</span>
                  <span className="mastery-dim-desc">{DIM_DESCRIPTIONS[dim]}</span>
                </span>
                <span className="mastery-segments">
                  {TIER_LABELS.map(({ tier, label }) => (
                    <button
                      key={tier}
                      type="button"
                      className={`mastery-segment ${current === tier ? "active" : ""}`}
                      disabled={loading || pending === dim}
                      onClick={() => current !== tier && setTier(dim, tier)}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              </span>
            );
          })}
        </span>
      )}
    </span>
  );
}
