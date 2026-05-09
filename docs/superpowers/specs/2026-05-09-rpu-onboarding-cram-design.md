# R/P/U 暴露强化 + 特訓モード 设计

> 日期：2026-05-09
> 范围：README.md Phase 3 三项 todo
>   1. R/P/U onboarding：首次启动说明卡 + 首页常驻副标题
>   2. R/P/U tooltip：Practice 页 pill / Library 进度条 hover
>   3. 快速复习模式：跳过 Learn 页 / 考前突击模式（方案 B：独立模式）

---

## 0. 设计原则

- onboarding 状态走 localStorage（不进 schema）
- schema 仅新增 `AppSettings.cramSize` 一个字段（特訓題数配置）
- 特訓**答题不写 DB**：不动 SRS、不动 totalReviews、不动 UserWordState（仅读 cramSize）
- 复用现有 `<QuizCard>`、`pickQuestion`、维度交错逻辑，不重写
- 文案分区：学习区日语，设置区中文，与 CLAUDE.md 规则 1 一致

---

## 1. R/P/U Onboarding（说明 modal + 首页副标题）

### 1.1 全屏说明 modal

**触发**：客户端首次访问 `/`（home）时，若 `localStorage.getItem("kotoba_onboarding_seen_v1") !== "true"`，弹出 modal。

**版本号**：key 中加 `_v1`，将来改文案可 bump 到 `_v2` 强制重显。

**内容结构**（日语区，全部假名注音）：
```
言葉帖の学び方

ここは「先に理解、それから練習」の学習帖です。
言葉は3つの次元で身につきます：

[卡片1] R · 認識（にんしき）
        見て・聞いて意味が分かる

[卡片2] P · 産出（さんしゅつ）
        意味から正しい言葉を引き出せる

[卡片3] U · 運用（うんよう）
        文の中で正しく使える

新しい言葉はまず R から、慣れてくると P・U が解放されます。

[ 始める ]
```

**关闭行为**：点「始める」或点击遮罩 → 写入 `localStorage.kotoba_onboarding_seen_v1 = "true"` → 关闭。

### 1.2 首页常驻副标题

**位置**：`HomeClient` 的 `.home-hero .lede` 下方新增一行。

**HTML**：
```jsx
<button
  className="hero-sub-rpu"
  onClick={openOnboarding}
  aria-label="言葉帖の学び方をもう一度見る"
>
  認識・産出・運用 ── 三つの次元で言葉を学ぶ
</button>
```

**视觉**：button 形态但去除按钮样式（无背景、无边框、cursor pointer、hover 略变色），保持 hero 区域的静謐感。字号 13px，色 `--ink-faint`。

**功能**：点击 = 重新打开 onboarding modal（不会重置 localStorage，仅本次显示）。

### 1.3 設定页「再表示」入口

**位置**：`SettingsClient.tsx` 的「掌握度编辑」section 之后，加一个新 section「学习指引」（中文区）。

```
学习指引
   首次进入主页时显示的"言葉帖の学び方"说明，可以再看一次。
   [ 再次查看说明 ]
```

**功能**：清除 `localStorage.kotoba_onboarding_seen_v1` 并跳转到 `/`，让 modal 自然弹出。

### 1.4 状态管理

**新增**：`src/store/onboardingStore.ts`（Zustand，仅前端）
```ts
interface OnboardingState {
  modalOpen: boolean;
  open: () => void;          // 不写 localStorage
  dismiss: () => void;       // 写 localStorage + 关闭
  resetAndShow: () => void;  // 清 localStorage + 打开
}
```

由 `HomeClient` 在 mount 时检查 localStorage 决定是否首发开启。

### 1.5 文件清单

新建：
- `src/components/onboarding/OnboardingModal.tsx`
- `src/store/onboardingStore.ts`

修改：
- `src/components/home/HomeClient.tsx` — 副标题 + mount 检查 + 渲染 modal
- `src/components/settings/SettingsClient.tsx` — 加「再表示」入口
- `src/app/globals.css` — modal 样式 + `.hero-sub-rpu` 样式

---

## 2. R/P/U Tooltip（Practice pill / Library bar）

### 2.1 通用组件 `<DimTooltip>`

**新建**：`src/components/ui/DimTooltip.tsx`

**API**：
```tsx
<DimTooltip dim={"R" | "P" | "U"} state?={"locked" | "learning" | "mastered" | "new"}>
  {children}  {/* 锚点：pill / bar */}
</DimTooltip>
```

**渲染结构**：
```html
<span class="dim-tooltip-anchor">
  {children}
  <span class="dim-tooltip-popup" role="tooltip">
    <strong>R · 認識</strong>
    <span>見て・聞いて意味が分かる</span>
    {state && <em>{stateLabel(state)}</em>}
  </span>
</span>
```

**`stateLabel` 映射**：
- `locked` → 「未解放」
- `learning` → 「学習中」
- `mastered` → 「習得済み」
- `new` → 「未学習」

**触发**：
- 桌面：`:hover .dim-tooltip-anchor` → popup 显示（CSS 控制，opacity + visibility 过渡）
- 移动：tap 切换 `aria-expanded` + `data-open` 状态（受控 useState），点击外部关闭

### 2.2 应用到 Practice

**修改** `src/components/layout/DimPill.tsx`：

```tsx
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

移除原 `title` 属性（被自定义 tooltip 替代）。

### 2.3 应用到 Library

**修改** `src/components/library/DimBars.tsx`：

每个 bar 包一层 `<DimTooltip>`，state 由 `locked / tier` 推导：
- `locked` → "locked"
- `tier === 0 && !locked` → "new"
- `tier === 1` → "learning"
- `tier === 2` → "mastered"

移除原 `title` 属性。

### 2.4 文件清单

新建：
- `src/components/ui/DimTooltip.tsx`

修改：
- `src/components/layout/DimPill.tsx`
- `src/components/library/DimBars.tsx`
- `src/app/globals.css` — `.dim-tooltip-*` 样式

---

## 3. 特訓モード（cram mode）

### 3.1 入口

**位置**：`HomeClient` actions 行，在「単語帖を開く」之后追加 secondary 按钮「特訓モード」。

```jsx
<button
  className="btn btn-secondary"
  onClick={() => router.push("/cram")}
>
  特訓モード
</button>
```

**禁用条件**：`initialData.stats.totalLearned === 0`（HomeClient 已有此字段）→ 按钮 disabled，hover tooltip 「学習を始めてから利用できます」。

### 3.2 路由 & 流程

**单页路由**：`/cram`，内部状态机切换 quiz / done 两态（不再开 `/cram/summary` 子路由，因为 cramStore 是 in-memory，路由跳转不带价值）。

```
[/cram phase=quiz]
   ↓ 答完最后一题
[/cram phase=done] ← 结果页
   ↓ 「もう一度」or「戻る」
```

### 3.3 队列构建 — `buildCramQueue`

**新建** `src/lib/cram.ts`：

```ts
export function buildCramQueue(
  words: Word[],
  questions: Question[],
  wordStates: Map<number, Record<DimKey, SrsData | null>>,
  settings: AppSettingsData,
  size: number = 50
): CramItem[]
```

**逻辑**：
1. 遍历所有 `wordStates` 中 `R.learnedAt !== null` 的 word（即用户已学过的）
2. 按 `activeLevels` 过滤
3. 对每个 word 遍历 R/P/U 三维度：
   - 跳过未解锁（`isDimensionUnlocked` 返回 false）
   - 跳过已精通（`getMasteryTier(state) === 2`）
   - 收集为 candidate `{ wordId, dim, tier }`
4. 排序：tier 升序（0 优先）→ frequency 升序（high 优先）→ 随机打散同 bucket
5. 维度交错（复用 queue.ts 的 R/P/U 轮转），保持节奏
6. 取前 `size` 个
7. 对每个 candidate 调 `pickQuestion`（fresh 优先，可重复使用）

**返回类型**：
```ts
interface CramItem {
  wordId: number;
  dim: DimKey;
  questionId: string;
}
```

**`size` 来源**：`AppSettings.cramSize`（默认 50，范围 10–200）。

**Schema 改动**：`prisma/schema.prisma` 给 `AppSettings` 加字段：
```prisma
cramSize Int @default(50)
```
需要跑 `npx prisma migrate dev --name add_cram_size`。

**`AppSettingsData` 类型**：`src/types/domain.ts` 同步加 `cramSize: number`。

**`/api/settings` route**：PATCH 接受 `cramSize`，GET 返回 `cramSize`。

**Settings 页 UI**（中文区，新 section「特訓モード」）：
```
特訓モード
   每次特訓題数
   一次特訓拉多少题。建议 30–80，过多容易疲劳。
   [ Stepper · step=5 · min=10 · max=200 ]
```

**`<Stepper>` 扩展**：加可选 `step?: number`（默认 1），dailyNewWords 不传保持现状，cramSize 传 `step={5}`。

### 3.4 服务端入口

**新建** `src/app/cram/page.tsx`：
- 服务端 fetch words / questions / wordStates / settings
- 调 `buildCramQueue`
- 把队列 + 题目 map + 词 map 序列化后传给 `<CramClient>`

如队列为空（无可练词）→ 渲染空状态：
```
特訓する言葉がありません
習得済みの言葉ばかりです。新しい言葉を学びましょう。
[ 戻る ]
```

### 3.5 客户端 — `CramClient`

**新建** `src/components/cram/CramClient.tsx`。

**状态管理**：新建 `src/store/cramStore.ts`（Zustand，**不持久化**）
```ts
interface CramState {
  queue: CramItem[];
  cursor: number;
  results: { wordId: number; dim: DimKey; questionId: string; correct: boolean }[];
  init: (queue: CramItem[]) => void;
  submitAnswer: (correct: boolean) => void;
  advance: () => void;
  reset: () => void;
}
```

**渲染**：
- `phase === "quiz"`（cursor < queue.length）→ 复用 `<QuizCard>` 渲染当前题
- `phase === "done"`（cursor >= queue.length）→ 渲染 `<CramSummary>`

**关键差异 vs 普通 Practice**：
- `handleAnswer` **只调 cramStore.submitAnswer**，不调 `/api/review`
- 没有 Round 1/2 概念（`item.round` 字段不存在）
- 不写 `learnedAt`、不更新 `UserWordState`

### 3.6 结果页 `<CramSummary>`

**渲染**（与首页同风格的 summary-card）：

```
特訓完了

正答率   {correct}/{total} · {rate}%
語彙数   {uniqueWords} 語

[按词列表，每词显示 N/M · rate]

[ もう一度 ]   [ ホームに戻る ]
```

**「もう一度」按钮**：
- 重新调用 `buildCramQueue`（重新拉数据 - 走 server action 或重新进入 `/cram`）
- 最简方案：调用 `router.refresh()` + cramStore.reset()，重新进入 `<CramClient>` 初始化路径

**「ホームに戻る」**：cramStore.reset() + `router.push("/")`

### 3.7 不写 DB 验证清单

- [ ] `/cram/page.tsx` 服务端**只读**：fetchAll words/questions/states，无 mutation
- [ ] `CramClient.handleAnswer` 不调用 `fetch("/api/review")`
- [ ] 不调用 `useSettingsStore.update({ totalReviews: ... })`
- [ ] 不调用 `useSessionStore` 的任何 mutation
- [ ] cramStore 完全前端 state，刷新即丢

### 3.8 文件清单

新建：
- `src/lib/cram.ts` — `buildCramQueue`
- `src/store/cramStore.ts`
- `src/app/cram/page.tsx` — 服务端入口
- `src/components/cram/CramClient.tsx`
- `src/components/cram/CramSummary.tsx`

修改：
- `prisma/schema.prisma` — `AppSettings.cramSize Int @default(50)` + migration
- `src/types/domain.ts` — `AppSettingsData.cramSize: number`
- `src/store/settingsStore.ts` — defaults 加 `cramSize: 50`
- `src/app/api/settings/route.ts` — GET/PATCH 处理 cramSize
- `src/components/home/HomeClient.tsx` — 加「特訓モード」按钮
- `src/components/settings/SettingsClient.tsx` — 加「特訓モード」section（cramSize stepper）
- `src/components/ui/Stepper`（如已抽出）或 inline `Stepper` — 增加 `step?: number` prop
- `src/app/globals.css` — cram-summary 视觉（可复用 .summary-card）

---

## 4. 验证 & 多日模拟

按 CLAUDE.md 要求，改 cram 队列时手动验证：

1. **空状态**：未学任何词 → 按钮 disabled
2. **第 1 天学完 4 词后进 cram**：可练 R 维度（已学但未精通），P/U 仍未解锁不出
3. **第 12 天**：P 维度首次解锁，cram 队列应包含 P
4. **「もう一度」**：第二次队列应再次随机化（不必完全去重，但顺序应不同）

---

## 5. 不在本次范围

- 听力题型（独立 todo）
- TTS（独立 todo）
- N3/N4/N5 词库扩展
- 跨设备同步 onboarding 状态（用 localStorage 即可）
