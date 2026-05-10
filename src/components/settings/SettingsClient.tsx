"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSettingsStore } from "@/store/settingsStore";
import { useSessionStore } from "@/store/sessionStore";
import { useDevStore } from "@/store/devStore";
import type { AppSettingsData } from "@/types/domain";
import Stepper from "@/components/ui/Stepper";

const ONE_DAY_MS = 86400000;

interface Props {
  initial: AppSettingsData;
}

export default function SettingsClient({ initial }: Props) {
  const router = useRouter();
  const settings = useSettingsStore();
  const dev = useDevStore();

  const [dailyNewWords, setDailyNewWords] = useState(initial.dailyNewWords);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.isLoaded) settings.loadSettings();
    dev.setTimeOffset(initial.timeOffset);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const offsetDays = Math.round(dev.timeOffset / ONE_DAY_MS);

  async function commitDailyNewWords(n: number) {
    setDailyNewWords(n);
    await settings.update({ dailyNewWords: n });

    let hint = "已保存。";
    const res = await fetch("/api/session/today");
    if (res.ok) {
      const data = (await res.json()) as { appliedNewCount: number; desiredNewCount: number };
      if (data.appliedNewCount === data.desiredNewCount) {
        hint = "已保存，今日队列已同步。";
      } else {
        hint = `已保存。今天已经认识 ${data.appliedNewCount} 个新词，调整将从明天起以 ${data.desiredNewCount} 个生效。`;
      }
    }
    useSessionStore.getState().reset();
    setSavedHint(hint);
    router.refresh();
    setTimeout(() => setSavedHint(null), 5000);
  }

  async function shiftTime(deltaDays: number) {
    dev.advanceDay(deltaDays);
    const newOffset = dev.timeOffset + deltaDays * ONE_DAY_MS;
    await fetch("/api/session/today", { method: "DELETE" });
    await settings.update({ timeOffset: newOffset });
    router.refresh();
  }

  async function resetTime() {
    dev.setTimeOffset(0);
    await fetch("/api/session/today", { method: "DELETE" });
    await settings.update({ timeOffset: 0 });
    router.refresh();
  }

  return (
    <div className="zh-zone">
      <section className="home-hero" style={{ marginBottom: "32px" }}>
        <h1>设置</h1>
        <p className="lede">
          学习节奏由自己掌握，不多不少，刚刚好。
        </p>
      </section>

      <div className="settings-section">
        <h2 className="settings-section-title">学习设置</h2>
        <div className="settings-row">
          <div className="settings-row-text">
            <label htmlFor="dailyNewWords">每日新词数</label>
            <p className="settings-row-desc">
              新学的单词数量。一次太多反而难以记牢，建议 4 ～ 8。
            </p>
          </div>
          <div className="settings-row-input">
            <Stepper
              value={dailyNewWords}
              min={1}
              max={20}
              onChange={commitDailyNewWords}
            />
          </div>
        </div>
        {savedHint && <div className="settings-hint">{savedHint}</div>}
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">掌握度编辑</h2>
        <p className="settings-row-desc">
          R・認識／P・産出／U・運用 三个维度的熟练度，可在
          <a href="/library" style={{ color: "var(--ink)", borderBottom: "1px solid var(--ink-faint)" }}>单词帖</a>
          中点击单词，从 3 个档位（未学／学习中／精通）里手动选择。
        </p>
      </div>

      <div className="settings-section settings-dev">
        <h2 className="settings-section-title">开发者模式</h2>
        <p className="settings-row-desc">
          快进时间，预览 SRS 调度行为。注意：每次快进会清空当日的学习数据。
        </p>
        <div className="settings-row">
          <div className="settings-row-text">
            <label>当前时间偏移</label>
            <p className="settings-row-desc">
              {offsetDays === 0 ? "0 天（实时）" : `${offsetDays > 0 ? "+" : ""}${offsetDays} 天`}
            </p>
          </div>
        </div>
        <div className="settings-actions">
          <button className="btn btn-secondary" onClick={() => shiftTime(1)}>
            +1 天
          </button>
          <button className="btn btn-secondary" onClick={() => shiftTime(7)}>
            +1 周
          </button>
          <button className="btn btn-secondary" onClick={resetTime}>
            重置
          </button>
        </div>
      </div>
    </div>
  );
}
