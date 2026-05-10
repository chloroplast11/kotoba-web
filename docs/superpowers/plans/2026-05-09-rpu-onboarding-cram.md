# R/P/U Onboarding + 特訓モード 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 R/P/U 三维度的概念暴露给用户（onboarding + tooltip），并加入独立的「特訓モード」用于考前突击复习。

**Architecture:**
1. **Onboarding**：localStorage 状态 + 全屏 modal + 首页可点击副标题。设置页提供「再表示」入口。
2. **Tooltip**：通用 `<DimTooltip>` 组件（CSS hover + tap toggle），包住 Practice 的 DimPill 和 Library 的 DimBars。
3. **特訓モード**：独立路由 `/cram`，服务端构建队列（仅读 wordStates），客户端用 cramStore 跑题，**完全不写 DB**。结果页内嵌于 `/cram`，不持久化。`cramSize` 经 AppSettings 持久化（10–200，default 50）。

**Tech Stack:** Next.js 15 App Router · Prisma v7 · SQLite · Zustand · TypeScript · ts-fsrs。无 unit test 框架，pure 函数走 tsx 临时验证脚本，UI 走 `npm run dev` 浏览器手测。

**Spec：** [docs/superpowers/specs/2026-05-09-rpu-onboarding-cram-design.md](../specs/2026-05-09-rpu-onboarding-cram-design.md)

---

## Task 1: AppSettings 加 cramSize 字段（schema + types + API + store）

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/types/domain.ts`
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/store/settingsStore.ts`
- Create: `prisma/migrations/<timestamp>_add_cram_size/migration.sql`（由 `prisma migrate dev` 生成）

- [ ] **Step 1.1: schema 加字段**

修改 `prisma/schema.prisma`，在 `AppSettings` model 末尾加：

```prisma
model AppSettings {
  id                   Int     @id @default(1)
  dailyNewWords        Int     @default(4)
  practiceLowFreqUsage Boolean @default(false)
  activeLevels         String  @default("[2]")
  totalReviews         Int     @default(0)
  streak               Int     @default(0)
  timeOffset           Int     @default(0)
  cramSize             Int     @default(50)
}
```

- [ ] **Step 1.2: 跑 migration**

```bash
npx prisma migrate dev --name add_cram_size
```

预期：`prisma/migrations/<timestamp>_add_cram_size/` 目录被创建，`dev.db` 已升级。`src/generated/prisma` 自动重建。

如果命令失败提示 env 未加载：检查 `prisma.config.ts` 已经 `import "dotenv/config"`（应该已存在）；若仍失败，用 `tsx --env-file .env npx prisma migrate dev --name add_cram_size`。

- [ ] **Step 1.3: 更新 AppSettingsData 类型**

修改 `src/types/domain.ts`，给 `AppSettingsData` 接口加字段：

```ts
export interface AppSettingsData {
  dailyNewWords: number;
  practiceLowFreqUsage: boolean;
  activeLevels: number[];
  totalReviews: number;
  streak: number;
  timeOffset: number;
  cramSize: number;
}
```

- [ ] **Step 1.4: 更新 /api/settings route**

修改 `src/app/api/settings/route.ts`：

`DEFAULT_SETTINGS` 加 `cramSize: 50`：
```ts
const DEFAULT_SETTINGS = {
  id: 1,
  dailyNewWords: 4,
  practiceLowFreqUsage: false,
  activeLevels: JSON.stringify([2]),
  totalReviews: 0,
  streak: 0,
  timeOffset: 0,
  cramSize: 50,
};
```

`serialize` 加 `cramSize: row.cramSize`：
```ts
function serialize(row: Awaited<ReturnType<typeof getOrCreate>>): AppSettingsData {
  return {
    dailyNewWords: row.dailyNewWords,
    practiceLowFreqUsage: row.practiceLowFreqUsage,
    activeLevels: JSON.parse(row.activeLevels) as number[],
    totalReviews: row.totalReviews,
    streak: row.streak,
    timeOffset: row.timeOffset,
    cramSize: row.cramSize,
  };
}
```

`PATCH` 的 data 块加：
```ts
...(body.cramSize !== undefined && { cramSize: body.cramSize }),
```

- [ ] **Step 1.5: 更新 settingsStore defaults**

修改 `src/store/settingsStore.ts` 中的 `defaults` 对象，加 `cramSize: 50`：

```ts
const defaults: AppSettingsData = {
  dailyNewWords: 4,
  practiceLowFreqUsage: false,
  activeLevels: [2],
  totalReviews: 0,
  streak: 0,
  timeOffset: 0,
  cramSize: 50,
};
```

- [ ] **Step 1.6: 验证**

```bash
npm run dev
```

打开 http://localhost:3000/api/settings ，预期返回 JSON 含 `"cramSize": 50`。

```bash
curl -X PATCH http://localhost:3000/api/settings \
  -H 'Content-Type: application/json' \
  -d '{"cramSize": 80}'
```

预期：响应中 `cramSize: 80`，再次 GET 返回 80。改回：
```bash
curl -X PATCH http://localhost:3000/api/settings -H 'Content-Type: application/json' -d '{"cramSize": 50}'
```

- [ ] **Step 1.7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/types/domain.ts src/app/api/settings/route.ts src/store/settingsStore.ts
git commit -m "feat(settings): add cramSize field for 特訓モード"
```

---

## Task 2: 抽出 `<Stepper>` 组件 + 加 step prop

> 当前 Stepper 是 SettingsClient 内部的私有组件。要在多处复用并支持 step={5}，先抽出来。

**Files:**
- Create: `src/components/ui/Stepper.tsx`
- Modify: `src/components/settings/SettingsClient.tsx`

- [ ] **Step 2.1: 新建 `src/components/ui/Stepper.tsx`**

```tsx
"use client";

interface StepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}

export default function Stepper({ value, min, max, step = 1, onChange }: StepperProps) {
  const dec = () => {
    const next = Math.max(min, value - step);
    if (next !== value) onChange(next);
  };
  const inc = () => {
    const next = Math.min(max, value + step);
    if (next !== value) onChange(next);
  };
  return (
    <div className="stepper" role="group" aria-label="数值调节">
      <button
        type="button"
        className="stepper-btn"
        onClick={dec}
        disabled={value <= min}
        aria-label="减少"
      >
        −
      </button>
      <span className="stepper-value">{value}</span>
      <button
        type="button"
        className="stepper-btn"
        onClick={inc}
        disabled={value >= max}
        aria-label="增加"
      >
        +
      </button>
    </div>
  );
}
```

- [ ] **Step 2.2: 让 SettingsClient 改用新组件**

修改 `src/components/settings/SettingsClient.tsx`：

1. 删除文件中内联的 `interface StepperProps {...}` 和 `function Stepper(...) {...}` 整段（约第 15–48 行）
2. 在 import 区加：

```tsx
import Stepper from "@/components/ui/Stepper";
```

`<Stepper>` 用法不变（dailyNewWords 不传 step 默认 1）。

- [ ] **Step 2.3: 验证**

```bash
npm run dev
```

打开 http://localhost:3000/settings ，「每日新词数」stepper 仍然按 1 步进，行为与之前一致。

- [ ] **Step 2.4: Commit**

```bash
git add src/components/ui/Stepper.tsx src/components/settings/SettingsClient.tsx
git commit -m "refactor: extract Stepper to ui/Stepper with step prop"
```

---

## Task 3: 设置页加「特訓モード」section（cramSize 编辑器）

**Files:**
- Modify: `src/components/settings/SettingsClient.tsx`

- [ ] **Step 3.1: 加 state + section UI**

修改 `src/components/settings/SettingsClient.tsx`：

在 `dailyNewWords` 的 `useState` 下方，加：
```tsx
const [cramSize, setCramSize] = useState(initial.cramSize);
```

在 `commitDailyNewWords` 函数后面，加：
```tsx
async function commitCramSize(n: number) {
  setCramSize(n);
  await settings.update({ cramSize: n });
}
```

在「掌握度编辑」section（含「中文区」段落）和「开发者模式」section 之间，插入新 section：

```tsx
<div className="settings-section">
  <h2 className="settings-section-title">特訓モード</h2>
  <div className="settings-row">
    <div className="settings-row-text">
      <label htmlFor="cramSize">每次特訓題数</label>
      <p className="settings-row-desc">
        一次特訓拉多少题（10 ～ 200）。建议 30 ～ 80，过多容易疲劳。
      </p>
    </div>
    <div className="settings-row-input">
      <Stepper
        value={cramSize}
        min={10}
        max={200}
        step={5}
        onChange={commitCramSize}
      />
    </div>
  </div>
</div>
```

- [ ] **Step 3.2: 验证**

```bash
npm run dev
```

1. http://localhost:3000/settings 出现新「特訓モード」section
2. stepper 上下点击按 5 步进，最低 10、最高 200
3. 改完后刷新页面值保留
4. `curl http://localhost:3000/api/settings` 返回的 cramSize 与 UI 一致

- [ ] **Step 3.3: Commit**

```bash
git add src/components/settings/SettingsClient.tsx
git commit -m "feat(settings): add 特訓モード section with cramSize stepper"
```

---

## Task 4: 通用 `<DimTooltip>` 组件 + CSS

**Files:**
- Create: `src/components/ui/DimTooltip.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 4.1: 新建 DimTooltip 组件**

`src/components/ui/DimTooltip.tsx`:

```tsx
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
```

- [ ] **Step 4.2: 加 CSS**

修改 `src/app/globals.css`，在 `/* ── Misc ──` 之前（line ~370 附近）加：

```css
/* ── Dim tooltip ─────────────────────────────────────── */
.dim-tooltip-anchor {
  position: relative;
  display: inline-flex;
  cursor: help;
}
.dim-tooltip-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.15s, visibility 0.15s, transform 0.15s;
  z-index: 20;
  width: 220px;
  background: var(--ink);
  color: var(--paper);
  padding: 12px 14px;
  font-family: 'Noto Serif JP', serif;
  font-size: 12px;
  line-height: 1.6;
  text-align: left;
  text-transform: none;
  letter-spacing: normal;
  box-shadow: 0 4px 16px rgba(29, 41, 53, 0.18);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dim-tooltip-popup::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: var(--ink);
}
.dim-tooltip-popup strong {
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--paper-warm);
  font-weight: 600;
}
.dim-tooltip-popup em {
  font-family: 'Fraunces', serif;
  font-style: italic;
  font-size: 11px;
  color: var(--paper-warm);
  opacity: 0.7;
  margin-top: 2px;
}
.dim-tooltip-anchor:hover .dim-tooltip-popup,
.dim-tooltip-anchor[data-open="true"] .dim-tooltip-popup {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
}
@media (max-width: 720px) {
  .dim-tooltip-popup { width: 180px; font-size: 11px; }
}
```

- [ ] **Step 4.3: Commit**

```bash
git add src/components/ui/DimTooltip.tsx src/app/globals.css
git commit -m "feat(ui): add DimTooltip component for R/P/U explanations"
```

---

## Task 5: Practice DimPill 接入 DimTooltip

**Files:**
- Modify: `src/components/layout/DimPill.tsx`

- [ ] **Step 5.1: 改写 DimPill**

替换 `src/components/layout/DimPill.tsx` 全部内容：

```tsx
import DimTooltip from "@/components/ui/DimTooltip";
import { DIM_NAMES } from "@/lib/constants";
import type { DimKey } from "@/types/domain";

interface Props {
  dim: DimKey;
}

export default function DimPill({ dim }: Props) {
  return (
    <DimTooltip dim={dim}>
      <span className={`dimension-pill dim-${dim}`}>
        {dim}・{DIM_NAMES[dim]}
      </span>
    </DimTooltip>
  );
}
```

注意：移除 `showTooltip` prop 和原 `title` 属性。原 DimPill 是 server component（无 "use client"），新版本因为 children 含 client component (DimTooltip)，DimPill 自身仍可以是 server component（它只 render JSX，不直接调用 hooks）—— 让 Next.js 自动判定，不加 "use client"。

- [ ] **Step 5.2: 验证**

```bash
npm run dev
```

1. 进入 http://localhost:3000/practice （需要先有今日队列；如没有就走一遍 home → 学习一题）
2. 看到右上角 R/P/U pill，hover 上去：浮层显示「**R · 認識** · 見て・聞いて意味が分かる」
3. 移动端模拟器中点击 pill，浮层切换显示
4. 检查 console 无报错

- [ ] **Step 5.3: Commit**

```bash
git add src/components/layout/DimPill.tsx
git commit -m "feat(practice): wrap DimPill with DimTooltip"
```

---

## Task 6: Library DimBars 接入 DimTooltip（含 state）

**Files:**
- Modify: `src/components/library/DimBars.tsx`

- [ ] **Step 6.1: 改写 DimBars**

替换 `src/components/library/DimBars.tsx` 全部内容：

```tsx
import { getMasteryTier } from "@/lib/srs";
import DimTooltip, { type DimTooltipState } from "@/components/ui/DimTooltip";
import type { DimKey, SrsData } from "@/types/domain";

interface Props {
  dimStates: Record<DimKey, SrsData | null>;
}

const TIER_WIDTHS = ["0%", "50%", "100%"] as const;

function deriveState(srs: SrsData | null, locked: boolean): DimTooltipState {
  if (locked) return "locked";
  const tier = getMasteryTier(srs);
  if (tier === 0) return "new";
  if (tier === 1) return "learning";
  return "mastered";
}

export default function DimBars({ dimStates }: Props) {
  return (
    <div className="dim-bars">
      {(["R", "P", "U"] as DimKey[]).map((dim) => {
        const s = dimStates[dim];
        const locked = s === null;
        const tier = getMasteryTier(s);
        const fillClass = locked
          ? "locked"
          : tier === 0
            ? ""
            : tier === 2
              ? "mastered"
              : "learning";
        const fillWidth = locked ? "100%" : TIER_WIDTHS[tier];

        return (
          <DimTooltip key={dim} dim={dim} state={deriveState(s, locked)}>
            <div className="dim-bar">
              <span className="dim-bar-name">{dim}</span>
              <div className="dim-bar-track">
                <div
                  className={`dim-bar-fill ${fillClass}`}
                  style={!locked ? { width: fillWidth } : undefined}
                />
              </div>
            </div>
          </DimTooltip>
        );
      })}
    </div>
  );
}
```

注意：`<DimTooltip>` 内层是 `<div className="dim-bar">`，但 DimTooltip 用 `<span>` 作锚点。`<div>` 不能放 `<span>` 里。改 DimBars 里的内层为 `<span>` 并保持 inline-flex 布局，或改 DimTooltip 锚点为 `<span>` + display: inline-block 含 `<div>` 子元素其实也违反 HTML semantics。

**正确做法**：把 `<div className="dim-bar">` 改为 `<span className="dim-bar">`，CSS 已有 `flex: 1; display: flex; flex-direction: column;` 同样适用 span。

最终内部 JSX：

```tsx
<DimTooltip key={dim} dim={dim} state={deriveState(s, locked)}>
  <span className="dim-bar">
    <span className="dim-bar-name">{dim}</span>
    <span className="dim-bar-track">
      <span
        className={`dim-bar-fill ${fillClass}`}
        style={!locked ? { width: fillWidth } : undefined}
      />
    </span>
  </span>
</DimTooltip>
```

`.dim-bar-track` 现在也是 span，但有 `position: relative; overflow: hidden;` —— 给它加 `display: block` 保证 CSS 样式生效。

- [ ] **Step 6.2: 调整 CSS（span 化）**

修改 `src/app/globals.css`：

把 `.dim-bar-track` 加上 `display: block;`。原行：
```css
.dim-bar-track { width: 100%; height: 3px; background: var(--line); position: relative; overflow: hidden; }
```
改为：
```css
.dim-bar-track { width: 100%; height: 3px; background: var(--line); position: relative; overflow: hidden; display: block; }
```

并且让 DimTooltip anchor 在 dim-bars 中保持 flex 布局：

```css
.dim-bars .dim-tooltip-anchor { flex: 1; display: flex; }
```

加在 `.dim-bars .dim-bar` 之后即可。`.dim-bar` 自身的 `flex: 1` 保留不动（dim-tooltip-anchor 现在是它的父元素）。但 `.dim-bar` 自己也需要 `flex: 1` ——保留。

- [ ] **Step 6.3: 验证**

```bash
npm run dev
```

1. http://localhost:3000/library
2. hover 任一卡片底部的 R/P/U bar，浮层显示「**R · 認識** · 見て・聞いて意味が分かる · 学習中」(或对应状态)
3. 三根 bar 各自的 state 与底色一致
4. dim-bar 视觉与之前一致（颜色/宽度/锁定斜纹）
5. 点击卡片仍能打开 drawer（tooltip 的 stopPropagation 不应阻断卡片点击 —— 因为 DimTooltip onClick stopPropagation 后 LibCard 的 onClick 会被吞。**需要测试**）

如果点击 bar 触发 tooltip 后 drawer 不打开 —— 这是预期行为（tooltip 拦截了）。如果点击其他位置（lib-card 的标题/释义部分）能打开 drawer 即可。

- [ ] **Step 6.4: Commit**

```bash
git add src/components/library/DimBars.tsx src/app/globals.css
git commit -m "feat(library): wrap DimBars with DimTooltip showing state"
```

---

## Task 7: Onboarding store + Modal 组件 + CSS

**Files:**
- Create: `src/store/onboardingStore.ts`
- Create: `src/components/onboarding/OnboardingModal.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 7.1: 新建 onboardingStore**

`src/store/onboardingStore.ts`:

```ts
"use client";
import { create } from "zustand";

const KEY = "kotoba_onboarding_seen_v1";

interface OnboardingState {
  modalOpen: boolean;
  open: () => void;
  dismiss: () => void;
  resetAndShow: () => void;
  hasSeen: () => boolean;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  modalOpen: false,
  open: () => set({ modalOpen: true }),
  dismiss: () => {
    if (typeof window !== "undefined") localStorage.setItem(KEY, "true");
    set({ modalOpen: false });
  },
  resetAndShow: () => {
    if (typeof window !== "undefined") localStorage.removeItem(KEY);
    set({ modalOpen: true });
  },
  hasSeen: () => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(KEY) === "true";
  },
}));
```

- [ ] **Step 7.2: 新建 OnboardingModal**

`src/components/onboarding/OnboardingModal.tsx`:

```tsx
"use client";
import { useOnboardingStore } from "@/store/onboardingStore";

export default function OnboardingModal() {
  const open = useOnboardingStore((s) => s.modalOpen);
  const dismiss = useOnboardingStore((s) => s.dismiss);

  if (!open) return null;

  return (
    <div className="onboarding-root" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-overlay" onClick={dismiss} />
      <div className="onboarding-panel">
        <h2 id="onboarding-title" className="onboarding-title">言葉帖の学び方</h2>
        <p className="onboarding-lede">
          ここは「先に理解、それから練習」の学習帖です。<br />
          言葉は3つの次元で身につきます。
        </p>

        <ul className="onboarding-dims">
          <li>
            <span className="onboarding-dim-letter dim-R">R</span>
            <span className="onboarding-dim-name">認識（にんしき）</span>
            <span className="onboarding-dim-desc">見て・聞いて意味が分かる</span>
          </li>
          <li>
            <span className="onboarding-dim-letter dim-P">P</span>
            <span className="onboarding-dim-name">産出（さんしゅつ）</span>
            <span className="onboarding-dim-desc">意味から正しい言葉を引き出せる</span>
          </li>
          <li>
            <span className="onboarding-dim-letter dim-U">U</span>
            <span className="onboarding-dim-name">運用（うんよう）</span>
            <span className="onboarding-dim-desc">文の中で正しく使える</span>
          </li>
        </ul>

        <p className="onboarding-foot">
          新しい言葉はまず R から、慣れてくると P・U が解放されます。
        </p>

        <button className="btn" onClick={dismiss}>始める</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7.3: 加 CSS**

修改 `src/app/globals.css`，在 `/* ── Word detail drawer ──` 之前加：

```css
/* ── Onboarding modal ────────────────────────────────── */
.onboarding-root { position: fixed; inset: 0; z-index: 100; }
.onboarding-overlay {
  position: absolute; inset: 0;
  background: rgba(29, 41, 53, 0.42);
  backdrop-filter: blur(3px);
}
.onboarding-panel {
  position: relative;
  max-width: 520px;
  margin: 8vh auto 0;
  padding: 48px 40px 40px;
  background: var(--paper);
  box-shadow: 0 16px 48px rgba(29, 41, 53, 0.24);
}
.onboarding-title {
  font-family: 'Noto Serif JP', serif;
  font-weight: 500;
  font-size: 28px;
  letter-spacing: 0.02em;
  margin-bottom: 16px;
  color: var(--ink);
}
.onboarding-lede {
  font-family: 'Noto Serif JP', serif;
  font-size: 14px; line-height: 1.8;
  color: var(--ink-soft); font-weight: 300;
  margin-bottom: 28px;
}
.onboarding-dims {
  list-style: none;
  display: flex; flex-direction: column; gap: 14px;
  margin-bottom: 28px;
}
.onboarding-dims li {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 14px; row-gap: 2px;
  padding: 14px 16px;
  background: var(--paper-warm);
  border-left: 2px solid var(--ink);
}
.onboarding-dim-letter {
  grid-row: 1 / 3;
  grid-column: 1;
  align-self: center;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 22px; font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink);
  width: 28px; text-align: center;
}
.onboarding-dim-letter.dim-R { color: var(--celadon); }
.onboarding-dim-letter.dim-P { color: var(--moss); }
.onboarding-dim-letter.dim-U { color: var(--accent); }
.onboarding-dim-name {
  grid-row: 1; grid-column: 2;
  font-family: 'Noto Serif JP', serif;
  font-size: 15px; font-weight: 500; color: var(--ink);
}
.onboarding-dim-desc {
  grid-row: 2; grid-column: 2;
  font-family: 'Noto Serif JP', serif;
  font-size: 12px; color: var(--ink-soft);
  font-weight: 300; line-height: 1.6;
}
.onboarding-foot {
  font-family: 'Noto Serif JP', serif; font-size: 13px;
  color: var(--ink-faint); line-height: 1.7;
  margin-bottom: 28px; font-weight: 300;
}
@media (max-width: 720px) {
  .onboarding-panel { margin: 4vh 16px 0; padding: 36px 24px 28px; }
  .onboarding-title { font-size: 22px; }
}
```

- [ ] **Step 7.4: Commit**

```bash
git add src/store/onboardingStore.ts src/components/onboarding/OnboardingModal.tsx src/app/globals.css
git commit -m "feat(onboarding): add R/P/U onboarding modal with localStorage gate"
```

---

## Task 8: Home 接入 onboarding modal + 副标题

**Files:**
- Modify: `src/components/home/HomeClient.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 8.1: 改 HomeClient**

修改 `src/components/home/HomeClient.tsx`：

import 区加：
```tsx
import OnboardingModal from "@/components/onboarding/OnboardingModal";
import { useOnboardingStore } from "@/store/onboardingStore";
```

在已有的 `useEffect` 之后再加一段（首次访问检查）：
```tsx
useEffect(() => {
  if (!useOnboardingStore.getState().hasSeen()) {
    useOnboardingStore.getState().open();
  }
}, []);
```

把 `.lede` 后面（`</section>` 之前）插入副标题：
```tsx
<button
  type="button"
  className="hero-sub-rpu"
  onClick={() => useOnboardingStore.getState().open()}
  aria-label="言葉帖の学び方をもう一度見る"
>
  認識・産出・運用 ── 三つの次元で言葉を学ぶ
</button>
```

在组件最外层 `<div>` 末尾（`{results.length > 0 && ...}` 之后），加：
```tsx
<OnboardingModal />
```

- [ ] **Step 8.2: 加 CSS**

修改 `src/app/globals.css`，在 `.home-hero .lede {...}` 后面加：

```css
.hero-sub-rpu {
  display: inline-block;
  margin-top: 18px;
  padding: 0;
  background: none;
  border: 0;
  border-bottom: 1px dotted var(--ink-faint);
  font-family: 'Noto Serif JP', serif;
  font-size: 13px;
  letter-spacing: 0.05em;
  color: var(--ink-faint);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}
.hero-sub-rpu:hover {
  color: var(--ink);
  border-bottom-color: var(--ink);
}
```

- [ ] **Step 8.3: 验证**

```bash
# 清掉 localStorage 模拟首次访问
```

浏览器打开 http://localhost:3000 ，DevTools Console 跑：
```js
localStorage.removeItem("kotoba_onboarding_seen_v1"); location.reload();
```

预期：
1. 页面加载后 modal 自动弹出
2. 看到三段 R/P/U 说明（颜色对应 dim-R/P/U）
3. 点「始める」或遮罩 → modal 关闭
4. 刷新页面，**不再弹出**（localStorage 已写入 true）
5. 页面 hero 区下方有一行小字「認識・産出・運用 ── 三つの次元で言葉を学ぶ」
6. 点这行小字 → modal 重新打开（但不重置 localStorage，刷新仍不会自动弹）

- [ ] **Step 8.4: Commit**

```bash
git add src/components/home/HomeClient.tsx src/app/globals.css
git commit -m "feat(home): add R/P/U onboarding modal trigger and hero subtitle"
```

---

## Task 9: 设置页加「学习指引」section（再表示入口）

**Files:**
- Modify: `src/components/settings/SettingsClient.tsx`

- [ ] **Step 9.1: 加 import + section**

修改 `src/components/settings/SettingsClient.tsx`：

import 区加：
```tsx
import { useOnboardingStore } from "@/store/onboardingStore";
```

在 `commitCramSize` 函数后面加：
```tsx
function showOnboarding() {
  useOnboardingStore.getState().resetAndShow();
  router.push("/");
}
```

在「特訓モード」section 后面、「开发者模式」section 前面，插入：
```tsx
<div className="settings-section">
  <h2 className="settings-section-title">学习指引</h2>
  <p className="settings-row-desc" style={{ marginBottom: "12px" }}>
    首次进入主页时显示的「言葉帖の学び方」说明，可以再看一次。
  </p>
  <div className="settings-actions">
    <button className="btn btn-secondary" onClick={showOnboarding}>
      再次查看说明
    </button>
  </div>
</div>
```

- [ ] **Step 9.2: 验证**

```bash
npm run dev
```

1. http://localhost:3000/settings 看到新「学习指引」section
2. 点击「再次查看说明」→ 跳转到首页 + modal 自动弹出
3. 关闭 modal 后刷新首页，**应再次自动弹出**（resetAndShow 已清掉 localStorage，关闭只是这次的事，但下次仍然会触发首次检查）。等等：dismiss 关闭时会写 `localStorage.setItem(KEY, "true")`，所以关闭后刷新就不会再弹。这是预期行为：「再次查看」= 看一次，看完恢复"已读"状态。

- [ ] **Step 9.3: Commit**

```bash
git add src/components/settings/SettingsClient.tsx
git commit -m "feat(settings): add 学习指引 section to re-show onboarding"
```

---

## Task 10: `buildCramQueue` 纯函数

**Files:**
- Create: `src/lib/cram.ts`
- Create: `scripts/verify-cram-queue.ts`（临时验证脚本）

- [ ] **Step 10.1: 写验证脚本（先写"测试"）**

`scripts/verify-cram-queue.ts`:

```ts
import type { Word, Question } from "@/generated/prisma";
import type { AppSettingsData, DimKey, SrsData } from "@/types/domain";
import { buildCramQueue } from "@/lib/cram";

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
```

- [ ] **Step 10.2: 跑脚本（先确认失败）**

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-cram-queue.ts
```

预期：失败，因为 `buildCramQueue` 不存在 —— 报错 "Cannot find module '@/lib/cram'"。

- [ ] **Step 10.3: 实现 buildCramQueue**

`src/lib/cram.ts`:

```ts
import type { Word, Question } from "@/generated/prisma";
import type { AppSettingsData, DimKey, SrsData } from "@/types/domain";
import { isDimensionUnlocked, getMasteryTier } from "./srs";
import { FREQ_ORDER } from "./constants";

export interface CramItem {
  wordId: number;
  dim: DimKey;
  questionId: string;
}

type WordStateMap = Map<number, Record<DimKey, SrsData | null>>;

function pickQuestion(
  wordId: number,
  dim: DimKey,
  questions: Question[],
  usedIds: Set<string>
): Question | null {
  const candidates = questions.filter(
    (q) => q.wordId === wordId && q.dimension === dim
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

interface Candidate {
  wordId: number;
  dim: DimKey;
  tier: number;
  freqRank: number;
}

export function buildCramQueue(
  words: Word[],
  questions: Question[],
  wordStates: WordStateMap,
  settings: AppSettingsData,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _now: Date
): CramItem[] {
  const activeLevels = new Set(settings.activeLevels);
  const candidates: Candidate[] = [];

  for (const [wordId, dimStates] of wordStates.entries()) {
    const word = words.find((w) => w.id === wordId);
    if (!word) continue;
    if (!activeLevels.has(word.level)) continue;
    if (!dimStates.R?.learnedAt) continue;

    for (const dim of ["R", "P", "U"] as DimKey[]) {
      if (!isDimensionUnlocked(dim, dimStates, word.frequency, settings)) continue;
      const tier = getMasteryTier(dimStates[dim]);
      if (tier === 2) continue;
      candidates.push({
        wordId,
        dim,
        tier,
        freqRank: FREQ_ORDER[word.frequency] ?? 99,
      });
    }
  }

  // Sort: tier asc → freqRank asc → random
  candidates.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.freqRank !== b.freqRank) return a.freqRank - b.freqRank;
    return Math.random() - 0.5;
  });

  const limit = Math.max(0, Math.min(settings.cramSize, candidates.length));
  const top = candidates.slice(0, limit);

  // Interleave by dimension
  const byDim: Record<DimKey, Candidate[]> = { R: [], P: [], U: [] };
  for (const c of top) byDim[c.dim].push(c);
  for (const d of ["R", "P", "U"] as DimKey[]) byDim[d] = shuffle(byDim[d]);

  const ordered: Candidate[] = [];
  while (byDim.R.length || byDim.P.length || byDim.U.length) {
    const r = byDim.R.shift();
    const p = byDim.P.shift();
    const u = byDim.U.shift();
    if (r) ordered.push(r);
    if (p) ordered.push(p);
    if (u) ordered.push(u);
  }

  // Pick questions
  const used = new Set<string>();
  const out: CramItem[] = [];
  for (const c of ordered) {
    const q = pickQuestion(c.wordId, c.dim, questions, used);
    if (!q) continue;
    used.add(q.id);
    out.push({ wordId: c.wordId, dim: c.dim, questionId: q.id });
  }
  return out;
}
```

- [ ] **Step 10.4: 跑脚本（确认通过）**

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-cram-queue.ts
```

预期：所有断言通过，最末输出 `8 passed, 0 failed`，exit code 0。

如果 tsx 不识别 `@/` 路径别名，安装并加 `--require tsconfig-paths/register` 或改脚本里 import 为相对路径（`../src/lib/cram`、`../src/types/domain`、`../src/generated/prisma`）。先尝试默认运行；失败时改相对路径重试。

- [ ] **Step 10.5: Commit**

```bash
git add src/lib/cram.ts scripts/verify-cram-queue.ts
git commit -m "feat(cram): add buildCramQueue pure function with verification script"
```

---

## Task 11: cramStore（前端非持久化）

**Files:**
- Create: `src/store/cramStore.ts`

- [ ] **Step 11.1: 新建 cramStore**

`src/store/cramStore.ts`:

```ts
"use client";
import { create } from "zustand";
import type { DimKey } from "@/types/domain";
import type { CramItem } from "@/lib/cram";

export interface CramResult {
  wordId: number;
  dim: DimKey;
  questionId: string;
  correct: boolean;
}

interface CramState {
  queue: CramItem[];
  cursor: number;
  results: CramResult[];
  initialized: boolean;
  init: (queue: CramItem[]) => void;
  submitAnswer: (correct: boolean) => void;
  advance: () => void;
  reset: () => void;
}

export const useCramStore = create<CramState>((set, get) => ({
  queue: [],
  cursor: 0,
  results: [],
  initialized: false,

  init: (queue) => set({ queue, cursor: 0, results: [], initialized: true }),

  submitAnswer: (correct) => {
    const { queue, cursor, results } = get();
    const item = queue[cursor];
    if (!item) return;
    set({
      results: [
        ...results,
        { wordId: item.wordId, dim: item.dim, questionId: item.questionId, correct },
      ],
    });
  },

  advance: () => set((s) => ({ cursor: s.cursor + 1 })),

  reset: () => set({ queue: [], cursor: 0, results: [], initialized: false }),
}));
```

- [ ] **Step 11.2: 验证**

```bash
npm run dev   # 仅确保 ts 编译通过
```

或单独 `npx tsc --noEmit` 验证类型 OK。

- [ ] **Step 11.3: Commit**

```bash
git add src/store/cramStore.ts
git commit -m "feat(cram): add non-persistent cramStore"
```

---

## Task 12: CramSummary 组件

**Files:**
- Create: `src/components/cram/CramSummary.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 12.1: 新建 CramSummary**

`src/components/cram/CramSummary.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useCramStore } from "@/store/cramStore";

interface Props {
  wordMap: Record<number, { word: string; furigana: string }>;
  onRetry: () => void;
}

export default function CramSummary({ wordMap, onRetry }: Props) {
  const router = useRouter();
  const results = useCramStore((s) => s.results);
  const reset = useCramStore((s) => s.reset);

  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

  const byWord = new Map<number, { right: number; wrong: number }>();
  for (const r of results) {
    const e = byWord.get(r.wordId) ?? { right: 0, wrong: 0 };
    if (r.correct) e.right++; else e.wrong++;
    byWord.set(r.wordId, e);
  }

  function handleHome() {
    reset();
    router.push("/");
  }

  return (
    <div>
      <section className="home-hero" style={{ marginBottom: "32px" }}>
        <div className="date-line">特訓モード · 完了</div>
        <h1>
          正答率 <em>{rate}%</em>
        </h1>
        <p className="lede">
          {correct} / {total} 問正解。 {byWord.size} 語に触れました。
        </p>
      </section>

      <div className="summary-card">
        <h3>語彙ごとの結果</h3>
        <ul className="summary-list">
          {[...byWord.entries()].map(([wordId, s]) => {
            const sub = s.right + s.wrong;
            const r = sub > 0 ? Math.round((s.right * 100) / sub) : 0;
            const cls = r >= 75 ? "good" : r < 50 ? "bad" : "";
            return (
              <li key={wordId}>
                <span className="word">{wordMap[wordId]?.word ?? `ID:${wordId}`}</span>
                <span className={`result ${cls}`}>{s.right}/{sub} · {r}%</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="actions" style={{ marginTop: "32px" }}>
        <button className="btn" onClick={onRetry}>もう一度</button>
        <button className="btn btn-secondary" onClick={handleHome}>ホームに戻る</button>
      </div>

      <p style={{
        marginTop: "24px",
        fontFamily: "'Fraunces', serif",
        fontStyle: "italic",
        fontSize: "12px",
        color: "var(--ink-faint)",
      }}>
        ※ 特訓モードの結果はSRSスケジュールに記録されません。
      </p>
    </div>
  );
}
```

- [ ] **Step 12.2: Commit**

```bash
git add src/components/cram/CramSummary.tsx
git commit -m "feat(cram): add CramSummary result page"
```

---

## Task 13: /cram route + CramClient

**Files:**
- Create: `src/app/cram/page.tsx`
- Create: `src/components/cram/CramClient.tsx`

- [ ] **Step 13.1: 服务端 page**

`src/app/cram/page.tsx`:

```tsx
import { prisma } from "@/lib/db";
import { buildCramQueue } from "@/lib/cram";
import { toSrsData } from "@/lib/srs";
import { getCurrentDate } from "@/lib/time";
import type { AppSettingsData, DimKey, SrsData } from "@/types/domain";
import CramClient from "@/components/cram/CramClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CramPage() {
  const [words, questions, statesRows, settingsRow] = await Promise.all([
    prisma.word.findMany(),
    prisma.question.findMany(),
    prisma.userWordState.findMany(),
    prisma.appSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        dailyNewWords: 4,
        practiceLowFreqUsage: false,
        activeLevels: JSON.stringify([2]),
        totalReviews: 0,
        streak: 0,
        timeOffset: 0,
        cramSize: 50,
      },
      update: {},
    }),
  ]);

  const settings: AppSettingsData = {
    dailyNewWords: settingsRow.dailyNewWords,
    practiceLowFreqUsage: settingsRow.practiceLowFreqUsage,
    activeLevels: JSON.parse(settingsRow.activeLevels) as number[],
    totalReviews: settingsRow.totalReviews,
    streak: settingsRow.streak,
    timeOffset: settingsRow.timeOffset,
    cramSize: settingsRow.cramSize,
  };

  const wordStates = new Map<number, Record<DimKey, SrsData | null>>();
  for (const w of words) {
    wordStates.set(w.id, { R: null, P: null, U: null });
  }
  for (const row of statesRows) {
    const dim = row.dimension as DimKey;
    const cell = wordStates.get(row.wordId);
    if (!cell) continue;
    cell[dim] = toSrsData(row);
  }

  const queue = buildCramQueue(words, questions, wordStates, settings, getCurrentDate());

  if (queue.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-jp">特訓する言葉がありません</div>
        <div className="empty-state-en">
          習得済みの言葉ばかりです。新しい言葉を学んでから戻ってください。
        </div>
        <Link className="btn" href="/">ホームに戻る</Link>
      </div>
    );
  }

  const questionMap: Record<string, {
    id: string;
    wordId: number;
    dimension: DimKey;
    type: string;
    question: string;
    questionPlain: string;
    options: { text: string; text_plain: string }[];
    correctIndex: number;
    explanation: string | null;
    explanationZh: string | null;
  }> = {};
  for (const q of questions) {
    questionMap[q.id] = {
      id: q.id,
      wordId: q.wordId,
      dimension: q.dimension as DimKey,
      type: q.type,
      question: q.question,
      questionPlain: q.questionPlain,
      options: JSON.parse(q.options),
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      explanationZh: q.explanationZh,
    };
  }

  const wordMap: Record<number, { word: string; furigana: string }> = {};
  for (const w of words) {
    wordMap[w.id] = { word: w.word, furigana: w.furigana };
  }

  return <CramClient queue={queue} questionMap={questionMap} wordMap={wordMap} />;
}
```

- [ ] **Step 13.2: 客户端 CramClient**

`src/components/cram/CramClient.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCramStore } from "@/store/cramStore";
import QuizCard from "@/components/practice/QuizCard";
import CramSummary from "./CramSummary";
import type { CramItem } from "@/lib/cram";
import type { DimKey, QueueItem, QuestionOption } from "@/types/domain";

interface QuestionData {
  id: string;
  wordId: number;
  dimension: DimKey;
  type: string;
  question: string;
  questionPlain: string;
  options: QuestionOption[];
  correctIndex: number;
  explanation: string | null;
  explanationZh: string | null;
}

interface Props {
  queue: CramItem[];
  questionMap: Record<string, QuestionData>;
  wordMap: Record<number, { word: string; furigana: string }>;
}

export default function CramClient({ queue, questionMap, wordMap }: Props) {
  const router = useRouter();
  const cram = useCramStore();
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    if (!cram.initialized) cram.init(queue);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const liveQueue = cram.initialized ? cram.queue : queue;
  const cursor = cram.cursor;
  const item = liveQueue[cursor];
  const done = cursor >= liveQueue.length;

  function handleAnswer(correct: boolean) {
    cram.submitAnswer(correct);
    setAnswered(true);
  }
  function handleNext() {
    setAnswered(false);
    cram.advance();
  }
  function handleRetry() {
    cram.reset();
    setAnswered(false);
    router.refresh();
  }

  if (done) {
    return <CramSummary wordMap={wordMap} onRetry={handleRetry} />;
  }

  if (!item) {
    return (
      <div className="empty-state">
        <div className="empty-state-jp">読み込み中...</div>
      </div>
    );
  }

  const question = questionMap[item.questionId];
  if (!question) {
    return (
      <div className="empty-state">
        <div className="empty-state-jp">問題が見つかりません</div>
      </div>
    );
  }

  const w = wordMap[item.wordId];
  const questionWithMeta = {
    ...question,
    word: w?.word ?? "",
    furigana: w?.furigana ?? "",
  };

  // Adapt CramItem to QueueItem shape. CramItem has no round/isNew/isNewDim,
  // so QuizCard's getRoundLabel falls through to the "復習" tag, which is fine.
  const queueLikeItem: QueueItem = {
    wordId: item.wordId,
    dim: item.dim,
    questionId: item.questionId,
  };

  return (
    <div>
      <QuizCard
        key={cursor}
        item={queueLikeItem}
        question={questionWithMeta}
        index={cursor}
        total={liveQueue.length}
        onAnswer={handleAnswer}
      />
      {answered && (
        <div
          className="quiz-actions"
          style={{ maxWidth: "720px", margin: "0 auto", padding: "0 0 32px" }}
        >
          <span />
          <button className="btn" onClick={handleNext}>次へ →</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 13.3: 验证**

```bash
npm run dev
```

1. 确保已经至少学过几个词（home → 学习 → 答题，让 `UserWordState.R.learnedAt` 有值）
2. 浏览器手动访问 http://localhost:3000/cram
3. 看到第一道题（`<QuizCard>` 渲染）
4. 答题 → 出现「次へ →」按钮
5. 点几次「次へ」走到队列尾部 → 看到 CramSummary 结果页
6. 点「もう一度」→ `router.refresh()` + reset，重新进入第一道题
7. 点「ホームに戻る」→ 跳到 `/`
8. **关键**：在 cram 期间，打开 Network 面板，确认**没有任何 `/api/review` 请求**；DB 中 `UserWordState` 不变（可在 `prisma studio` 中确认）

- [ ] **Step 13.4: Commit**

```bash
git add src/app/cram/page.tsx src/components/cram/CramClient.tsx
git commit -m "feat(cram): add /cram route with CramClient"
```

---

## Task 14: 首页加「特訓モード」入口按钮

**Files:**
- Modify: `src/components/home/HomeClient.tsx`

- [ ] **Step 14.1: 加按钮**

修改 `src/components/home/HomeClient.tsx`：

`<div className="actions">` 内，在两个已有按钮之后追加第三个：

```tsx
<button
  className="btn btn-secondary"
  onClick={() => router.push("/cram")}
  disabled={totalLearned === 0}
  title={totalLearned === 0 ? "学習を始めてから利用できます" : undefined}
>
  特訓モード
</button>
```

- [ ] **Step 14.2: 验证**

```bash
npm run dev
```

1. http://localhost:3000 看到「特訓モード」按钮
2. 如 `totalLearned === 0` → 按钮 disabled，hover 显示提示
3. 点击 → 跳转 `/cram`，正常进入
4. 队列空（罕见）→ 进入 /cram 后看到「特訓する言葉がありません」空状态

- [ ] **Step 14.3: Commit**

```bash
git add src/components/home/HomeClient.tsx
git commit -m "feat(home): add 特訓モード entry button"
```

---

## Task 15: 全流程 smoke test + 清理验证脚本

**Files:**
- Delete: `scripts/verify-cram-queue.ts`

- [ ] **Step 15.1: 全流程手测**

```bash
npm run dev
```

走一遍：

1. **首次访问**：浏览器隐身窗 + 清 localStorage → 访问 `/` → onboarding modal 弹出
2. 关闭 modal → 看到 hero 副标题「認識・産出・運用 ── 三つの次元で言葉を学ぶ」
3. 点副标题 → modal 重弹
4. 「本日の学習を始める」→ 走完一两轮（产生 UserWordState）
5. 回 home → 「特訓モード」可点
6. /cram → 答几道 → 检查 Network **无 `/api/review`**
7. 走完队列 → CramSummary 显示统计 + 注释「※ 特訓モードの結果はSRSスケジュールに記録されません」
8. 「もう一度」→ 队列重新加载，前几道题与首次顺序应有差异（shuffle 生效）
9. 「ホームに戻る」→ 回首页，cramStore 已 reset
10. /settings → 改 cramSize 到 30 → 回 /cram → 队列上限变为 30
11. /settings → 「再次查看说明」→ 跳首页 + modal 弹
12. /practice 与 /library → tooltip 在 hover/tap 下显示，文案正确

- [ ] **Step 15.2: 类型检查 + build**

```bash
npx tsc --noEmit
npm run build
```

预期：均无错误。如果 build 报错（unused vars、type 不匹配），按提示修复。

- [ ] **Step 15.3: 删除临时验证脚本**

```bash
rm scripts/verify-cram-queue.ts
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 15.4: 更新 README todo 状态**

修改 `README.md` 的 Phase 3 三项 todo（line 117-119），从 `- [ ]` 改为 `- [x]`：

```markdown
- [x] R/P/U onboarding：首次启动说明卡 + 首页常驻副标题
- [x] R/P/U tooltip：Practice 页 pill / Library 进度条 hover
- [x] 快速复习模式：跳过 Learn 页 / 考前突击模式
```

- [ ] **Step 15.5: Commit**

```bash
git add README.md scripts
git commit -m "chore: complete Phase 3 R/P/U exposure + 特訓モード todos"
```

---

## 验证清单（实施完后自检）

- [ ] `/api/settings` GET/PATCH 正常处理 cramSize
- [ ] Stepper 在 /settings 两个位置都正常工作（dailyNewWords step=1，cramSize step=5）
- [ ] DimTooltip 在 Practice pill 上 hover 显示
- [ ] DimTooltip 在 Library bar 上 hover 显示，state 正确（locked/new/learning/mastered）
- [ ] Onboarding modal 首次访问自动弹，关闭后写 localStorage
- [ ] 副标题点击重开 modal
- [ ] 设置页「再次查看说明」清掉 localStorage 并跳首页弹 modal
- [ ] /cram 队列正确（已学未精通的解锁维度，不含未学/已精通/锁定的）
- [ ] /cram **无任何 fetch /api/review 请求**
- [ ] /cram 走完进 CramSummary，结果统计正确
- [ ] 「もう一度」refresh 后队列与上次有差异（shuffle 生效）
- [ ] 「ホームに戻る」reset cramStore 并跳首页
- [ ] cramSize 变更后 /cram 队列上限同步
- [ ] CLAUDE.md 规则 1（日语区/中文区分）：cram UI 都在日语区；settings 「特訓モード」section 在中文区（zh-zone 包裹）
- [ ] CLAUDE.md 规则 6（getCurrentTime）：本次没引入新的 `Date.now()` 直接调用
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run build` 通过
