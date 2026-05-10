"use client";
import { useEffect, useRef, useState } from "react";
import { DIM_NAMES, DIM_DESCRIPTIONS } from "@/lib/constants";
import type { DimKey } from "@/types/domain";

export type DimTooltipState = "locked" | "new" | "learning" | "mastered";

const STATE_LABELS: Record<DimTooltipState, string> = {
  locked: "未解放",
  new: "未学習",
  learning: "学習中",
  mastered: "習得済み",
};

interface Props {
  dim: DimKey;
  state?: DimTooltipState;
  children: React.ReactNode;
}

export default function DimTooltip({ dim, state, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

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

  return (
    <span
      ref={ref}
      className="dim-tooltip-anchor"
      data-open={open ? "true" : "false"}
      onClick={toggle}
    >
      {children}
      <span className="dim-tooltip-popup" role="tooltip">
        <strong>{dim}・{DIM_NAMES[dim]}</strong>
        <span>{DIM_DESCRIPTIONS[dim]}</span>
        {state && <em>{STATE_LABELS[state]}</em>}
      </span>
    </span>
  );
}
