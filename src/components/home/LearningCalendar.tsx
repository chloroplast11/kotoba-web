"use client";
import { useEffect, useMemo, useState } from "react";
import { getCurrentDate, todayDateString } from "@/lib/time";
import type { CalendarDay } from "@/types/domain";

const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function intensity(count: number): "none" | "low" | "mid" | "high" {
  if (count === 0) return "none";
  if (count <= 10) return "low";
  if (count <= 20) return "mid";
  return "high";
}

export default function LearningCalendar() {
  const today = useMemo(() => getCurrentDate(), []);
  const [cursorMonth, setCursorMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [byDate, setByDate] = useState<Record<string, CalendarDay>>({});
  const [loading, setLoading] = useState(true);

  const monthStr = monthKey(cursorMonth);
  const todayStr = todayDateString();
  const currentMonthStr = monthKey(today);
  const canGoForward = monthStr < currentMonthStr;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/calendar?month=${monthStr}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const map: Record<string, CalendarDay> = {};
        for (const d of data.days as CalendarDay[]) map[d.date] = d;
        setByDate(map);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [monthStr]);

  const cells = useMemo(() => {
    const firstDay = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth(), 1);
    const daysInMonth = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + 1, 0).getDate();
    const startWeekday = firstDay.getDay();
    const out: ({ day: number; date: string } | null)[] = [];
    for (let i = 0; i < startWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${cursorMonth.getFullYear()}-${String(cursorMonth.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      out.push({ day: d, date });
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursorMonth]);

  const monthLabel = `${cursorMonth.getFullYear()} 年 ${cursorMonth.getMonth() + 1} 月`;

  return (
    <div className="calendar-card">
      <div className="calendar-head">
        <button
          type="button"
          className="calendar-nav"
          onClick={() => setCursorMonth(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() - 1, 1))}
          aria-label="前月"
        >
          ◀
        </button>
        <div className="calendar-title">
          <span className="calendar-label">学びの記録</span>
          <span className="calendar-month">{monthLabel}</span>
        </div>
        <button
          type="button"
          className="calendar-nav"
          onClick={() => setCursorMonth(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + 1, 1))}
          disabled={!canGoForward}
          aria-label="次月"
        >
          ▶
        </button>
      </div>

      <div className="calendar-weekrow">
        {WEEK_LABELS.map((w) => (
          <span key={w} className="calendar-weekday">{w}</span>
        ))}
      </div>

      <div className="calendar-grid" aria-hidden={loading}>
        {cells.map((cell, idx) => {
          if (!cell) return <span key={`e${idx}`} className="calendar-cell empty" />;
          const data = byDate[cell.date];
          const count = data?.count ?? 0;
          const lvl = intensity(count);
          const hasNew = data?.hasNew ?? false;
          const isToday = cell.date === todayStr;
          const title = count > 0
            ? `${cell.date} · ${count} 問${hasNew ? "（新出語含む）" : ""}`
            : `${cell.date} · 記録なし`;
          return (
            <span
              key={cell.date}
              className={`calendar-cell lvl-${lvl}${isToday ? " is-today" : ""}${hasNew ? " has-new" : ""}`}
              title={title}
            >
              <span className="calendar-dot" />
            </span>
          );
        })}
      </div>
    </div>
  );
}
