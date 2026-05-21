# 题目质量分展示 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在题目页透出 `Question.qualityScore`：用户层在 `< 70` 时显示「⚠ 此题质量存疑」提示标签（中文，用户显式指定）；开发者层始终显示 `Q:xx` 小标，受 `devStore.showQualityScore` 开关（位于设置页「开发者模式」）控制。

**Architecture:** 纯前端读路径改动。`qualityScore` 已存在于 Prisma `Question` 模型中，`findMany()` 已经把它带回；只需在三处 server component 把字段透传进 `QuestionData`，并在 `QuizCard` / `ListeningQuizCard` 渲染。devStore 增加客户端 boolean 控制开发者小标的可见性，不持久化。

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS（全局 CSS 在 `src/app/globals.css`） · Zustand · Prisma v7 + libSQL adapter

**Spec:** [docs/superpowers/specs/2026-05-19-question-quality-score-display-design.md](../specs/2026-05-19-question-quality-score-display-design.md)

**Testing:** 本项目 `package.json` 无单元测试 runner（只有 `next dev` / `next build`）。本改动是纯展示，按 spec §7 走人工验证矩阵：四档分数 × 两种 QuizCard × 开关 ON/OFF。每一步靠 `npx tsc --noEmit` 做类型检查、`next build` 做整体校验。

---

## File Map

| File | 改动类型 | 责任 |
|---|---|---|
| `src/store/devStore.ts` | Modify | 加 `showQualityScore: boolean` 状态 + setter |
| `src/components/settings/SettingsClient.tsx` | Modify | 设置页开发者模式 section 加 checkbox |
| `src/app/globals.css` | Modify | 新增 `.quality-warn` / `.dev-score` + 4 个 tone class |
| `src/components/practice/QuizCard.tsx` | Modify | `QuestionData` 加字段；渲染用户标签 + 开发分数 |
| `src/components/practice/ListeningQuizCard.tsx` | Modify | 同上 |
| `src/app/practice/page.tsx` | Modify | 序列化 question 时带 `qualityScore` |
| `src/app/practice/word/[wordId]/page.tsx` | Modify | 同上；类型注释同步 |
| `src/app/cram/page.tsx` | Modify | 同上；类型注释同步 |

---

## Task 1: devStore 加 `showQualityScore`

**Files:**
- Modify: `src/store/devStore.ts`

- [ ] **Step 1: 替换整个文件内容**

将 [src/store/devStore.ts](src/store/devStore.ts) 全文替换为：

```ts
"use client";
import { create } from "zustand";
import { setTimeOffset } from "@/lib/time";

interface DevState {
  timeOffset: number;
  showQualityScore: boolean;
  setTimeOffset: (ms: number) => void;
  setShowQualityScore: (v: boolean) => void;
  advanceDay: (days: number) => void;
}

export const useDevStore = create<DevState>((set, get) => ({
  timeOffset: 0,
  showQualityScore: false,

  setTimeOffset: (ms: number) => {
    setTimeOffset(ms);
    set({ timeOffset: ms });
  },

  setShowQualityScore: (v: boolean) => {
    set({ showQualityScore: v });
  },

  advanceDay: (days: number) => {
    const newOffset = get().timeOffset + days * 86400000;
    setTimeOffset(newOffset);
    set({ timeOffset: newOffset });
  },
}));
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS（无新 error；可能有原本就存在的 warnings，关注 devStore 相关项目）

- [ ] **Step 3: Commit**

```bash
git add src/store/devStore.ts
git commit -m "feat(devStore): 增加 showQualityScore 开关字段"
```

---

## Task 2: 全局 CSS 加质量分相关样式

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: 在文件末尾追加样式块**

打开 [src/app/globals.css](src/app/globals.css)，在文件最后追加：

```css
/* === Question quality score display === */
.quality-warn {
  font-size: 12px;
  color: #b07a3a;
  letter-spacing: 0.03em;
  padding: 6px 0 0;
}

.dev-score {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--ink-faint);
}
.dev-score.tone-good     { color: #4a8a4a; }
.dev-score.tone-mid      { color: var(--ink-faint); }
.dev-score.tone-warn     { color: #b07a3a; }
.dev-score.tone-unknown  { color: var(--ink-faint); opacity: 0.6; }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "style(globals): 新增题目质量分标签与开发者小标样式"
```

---

## Task 3: 设置页加开发者开关 checkbox

**Files:**
- Modify: `src/components/settings/SettingsClient.tsx`

- [ ] **Step 1: 在「开发者模式」section 的"重置"按钮后追加新行**

打开 [src/components/settings/SettingsClient.tsx](src/components/settings/SettingsClient.tsx)。在第 174 行 `</div>` 之前（也就是 `重置` 按钮所在的 `settings-actions` 关闭后、`settings-section` 关闭前），插入：

```tsx
        <div className="settings-row" style={{ marginTop: "20px" }}>
          <div className="settings-row-text">
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={dev.showQualityScore}
                onChange={(e) => dev.setShowQualityScore(e.target.checked)}
              />
              <span>显示题目质量分（Q:xx 小标）</span>
            </label>
            <p className="settings-row-desc">
              在题目右上角显示 AI 评分（0-100），便于排查低分题。仅本地生效，刷新页面不保留。
            </p>
          </div>
        </div>
```

定位提示：`重置` 按钮所在的 `<div className="settings-actions">...</div>` 块之后、`</div>` 关闭整个 `settings-section settings-dev` 之前。如果文件结构相对设计有偏移，按"在 `开发者模式` section 内、`重置`按钮之后"的语义插入。

文案保持**中文**（设置页属于中文区，依 CLAUDE.md 规则 1）。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/SettingsClient.tsx
git commit -m "feat(settings): 开发者模式增加题目质量分显示开关"
```

---

## Task 4: 题目数据序列化补 `qualityScore` — `practice/page.tsx`

**Files:**
- Modify: `src/app/practice/page.tsx:32-49`

- [ ] **Step 1: 在 questionsMap 构造里补字段**

打开 [src/app/practice/page.tsx](src/app/practice/page.tsx)。把 32–49 行替换为：

```ts
  const questionsMap = new Map(
    dbQuestions.map((q) => [
      q.id,
      {
        id: q.id,
        wordId: q.wordId,
        dimension: q.dimension as DimKey,
        type: q.type,
        question: q.question ?? "",
        options: JSON.parse(q.options) as QuestionOption[],
        correctIndex: q.correctIndex,
        explanation: q.explanation ?? null,
        explanationZh: q.explanationZh ?? null,
        qualityScore: q.qualityScore ?? null,
        word: "",
        furigana: "",
      },
    ])
  );
```

只新增了一行 `qualityScore: q.qualityScore ?? null,`。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 此时 `QuizCard` / `ListeningQuizCard` 的 `QuestionData` interface 还没加 `qualityScore`，所以**多余字段不会报错**（TypeScript structural typing 允许传入字段超集）。PASS 预期。

如果意外失败，记录错误信息后继续 Task 5—7（Task 5/6 会补齐 interface，届时再 typecheck）。

- [ ] **Step 3: Commit**

```bash
git add src/app/practice/page.tsx
git commit -m "feat(practice): 序列化 question 时带上 qualityScore"
```

---

## Task 5: 题目数据序列化补 `qualityScore` — `practice/word/[wordId]/page.tsx`

**Files:**
- Modify: `src/app/practice/word/[wordId]/page.tsx:43-66`

- [ ] **Step 1: 同步修改 questionMap 类型注解和构造**

打开 [src/app/practice/word/[wordId]/page.tsx](src/app/practice/word/[wordId]/page.tsx)。把 43–66 行替换为：

```ts
  const questionMap: Record<string, {
    id: string;
    wordId: number;
    dimension: DimKey;
    type: string;
    question: string;
    options: { text: string }[];
    correctIndex: number;
    explanation: string | null;
    explanationZh: string | null;
    qualityScore: number | null;
  }> = {};
  for (const q of questions) {
    questionMap[q.id] = {
      id: q.id,
      wordId: q.wordId,
      dimension: q.dimension as DimKey,
      type: q.type,
      question: q.question ?? "",
      options: JSON.parse(q.options),
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      explanationZh: q.explanationZh,
      qualityScore: q.qualityScore ?? null,
    };
  }
```

新增了类型注解里一行 + 构造里一行。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/practice/word/[wordId]/page.tsx
git commit -m "feat(practice/word): 序列化 question 时带上 qualityScore"
```

---

## Task 6: 题目数据序列化补 `qualityScore` — `cram/page.tsx`

**Files:**
- Modify: `src/app/cram/page.tsx:67-90`

- [ ] **Step 1: 修改 questionMap 类型注解和构造**

打开 [src/app/cram/page.tsx](src/app/cram/page.tsx)。把 67–90 行替换为：

```ts
  const questionMap: Record<string, {
    id: string;
    wordId: number;
    dimension: DimKey;
    type: string;
    question: string;
    options: { text: string }[];
    correctIndex: number;
    explanation: string | null;
    explanationZh: string | null;
    qualityScore: number | null;
  }> = {};
  for (const q of questions) {
    questionMap[q.id] = {
      id: q.id,
      wordId: q.wordId,
      dimension: q.dimension as DimKey,
      type: q.type,
      question: q.question ?? "",
      options: JSON.parse(q.options),
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      explanationZh: q.explanationZh,
      qualityScore: q.qualityScore ?? null,
    };
  }
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/cram/page.tsx
git commit -m "feat(cram): 序列化 question 时带上 qualityScore"
```

---

## Task 7: QuizCard 渲染用户标签 + 开发分数

**Files:**
- Modify: `src/components/practice/QuizCard.tsx`

- [ ] **Step 1: 修改 `QuestionData` interface（line 9–21）**

打开 [src/components/practice/QuizCard.tsx](src/components/practice/QuizCard.tsx)。把 9–21 行替换为：

```ts
interface QuestionData {
  id: string;
  wordId: number;
  dimension: DimKey;
  type: string;
  question: string;
  options: QuestionOption[];
  correctIndex: number;
  explanation: string | null;
  explanationZh: string | null;
  qualityScore: number | null;
  word: string;
  furigana: string;
}
```

- [ ] **Step 2: 在文件顶部 imports 后增加 devStore import**

在第 2 行 `import { useState } from "react";` 之后追加一行：

```ts
import { useDevStore } from "@/store/devStore";
```

- [ ] **Step 3: 在组件内引入开关与 tone 工具**

在第 40 行 `export default function QuizCard(...)` 函数体最顶部（`const [chosen, setChosen] = useState<number | null>(null);` 之前），追加：

```ts
  const showQualityScore = useDevStore((s) => s.showQualityScore);
```

并在文件末尾（最后一个 `}` 之前不可——放到 default export 函数之外，文件最底部）追加 helper：

```ts
function scoreToneClass(score: number | null): string {
  if (score == null) return "tone-unknown";
  if (score >= 90) return "tone-good";
  if (score >= 70) return "tone-mid";
  return "tone-warn";
}
```

放在 `export default function QuizCard(...) { ... }` 闭合大括号之后。

- [ ] **Step 4: 在 `quiz-header` 内补开发分数**

定位到第 72 行 `<MasteryPopover wordId={item.wordId} />`，在它之后（仍在外层 `<div style={{ display: "flex"...}}>` 内）插入：

```tsx
          {showQualityScore && (
            <span className={`dev-score ${scoreToneClass(question.qualityScore)}`}>
              Q:{question.qualityScore ?? "—"}
            </span>
          )}
```

- [ ] **Step 5: 在 `quiz-header` 关闭后、`quiz-stem` 之前插入用户标签**

定位到第 74 行 `</div>`（quiz-header 的关闭），在它之后、`<div className={\`quiz-stem ...\`}>` 之前插入：

```tsx
      {question.qualityScore != null && question.qualityScore < 70 && (
        <div className="quality-warn">⚠ 此题质量存疑</div>
      )}
```

- [ ] **Step 6: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/practice/QuizCard.tsx
git commit -m "feat(QuizCard): 渲染题目质量提示与开发者分数"
```

---

## Task 8: ListeningQuizCard 渲染用户标签 + 开发分数

**Files:**
- Modify: `src/components/practice/ListeningQuizCard.tsx`

- [ ] **Step 1: 修改 `QuestionData` interface（line 11–23）**

打开 [src/components/practice/ListeningQuizCard.tsx](src/components/practice/ListeningQuizCard.tsx)。把 11–23 行替换为：

```ts
interface QuestionData {
  id: string;
  wordId: number;
  dimension: DimKey;
  type: string;
  question: string;
  options: QuestionOption[];
  correctIndex: number;
  explanation: string | null;
  explanationZh: string | null;
  qualityScore: number | null;
  word: string;
  furigana: string;
}
```

- [ ] **Step 2: 增加 devStore import**

在第 2 行 `import { useState } from "react";` 之后追加：

```ts
import { useDevStore } from "@/store/devStore";
```

- [ ] **Step 3: 在组件内引入开关**

定位到 `export default function ListeningQuizCard(...)` 函数体顶部（第 46 行 `const [chosen, setChosen] = useState<number | null>(null);` 之前），追加：

```ts
  const showQualityScore = useDevStore((s) => s.showQualityScore);
```

并在文件末尾（最后一个 `}` 之后）追加同样的 helper：

```ts
function scoreToneClass(score: number | null): string {
  if (score == null) return "tone-unknown";
  if (score >= 90) return "tone-good";
  if (score >= 70) return "tone-mid";
  return "tone-warn";
}
```

注：与 Task 7 重复，但按 CLAUDE.md 「不要为不存在的需求做抽象」的原则，两文件内联同函数比建一个 `src/lib/qualityScore.ts` 更简洁。如果后续第三处用到，再抽。

- [ ] **Step 4: 在 `quiz-header` 内补开发分数**

定位到第 77 行 `<MasteryPopover wordId={item.wordId} />`，在它之后插入：

```tsx
          {showQualityScore && (
            <span className={`dev-score ${scoreToneClass(question.qualityScore)}`}>
              Q:{question.qualityScore ?? "—"}
            </span>
          )}
```

- [ ] **Step 5: 在 `quiz-header` 关闭后、`quiz-stem listening` 之前插入用户标签**

定位到第 79 行 `</div>`（quiz-header 关闭），在它之后、`<div className="quiz-stem listening"...>` 之前插入：

```tsx
      {question.qualityScore != null && question.qualityScore < 70 && (
        <div className="quality-warn">⚠ 此题质量存疑</div>
      )}
```

- [ ] **Step 6: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/practice/ListeningQuizCard.tsx
git commit -m "feat(ListeningQuizCard): 渲染题目质量提示与开发者分数"
```

---

## Task 9: Build 验证 + 人工测试矩阵

**Files:**
- 无新增/修改

- [ ] **Step 1: 跑一次完整 build**

Run: `npm run build`
Expected: 编译成功，无新增 TypeScript / lint 错误。如有，回到对应 Task 修复。

- [ ] **Step 2: 启动 dev server**

Run: `npm run dev`
Expected: 监听 `localhost:3000`，无运行时报错。

- [ ] **Step 3: 在 DB 里找出四档样本题用于人工验证**

```bash
sqlite3 dev.db "SELECT id, qualityScore FROM Question WHERE qualityScore IS NULL LIMIT 1;"
sqlite3 dev.db "SELECT id, qualityScore FROM Question WHERE qualityScore >= 90 LIMIT 1;"
sqlite3 dev.db "SELECT id, qualityScore FROM Question WHERE qualityScore >= 70 AND qualityScore < 90 LIMIT 1;"
sqlite3 dev.db "SELECT id, qualityScore FROM Question WHERE qualityScore < 70 LIMIT 1;"
```

记下四个 question id 与对应的 wordId，用于后续在浏览器里观察。如果 `qualityScore IS NULL` 没有结果（评分已全量完成），跳过 null 档。

- [ ] **Step 4: 手动验证矩阵**

打开浏览器（或用 chrome-devtools MCP）依次操作并核对：

1. **开关 OFF（默认状态）**
   - 进入 `/practice` 走几道题
   - **预期**：所有题右上角**不出现** `Q:xx`；`< 70` 的题在 quiz-header 下方挂"⚠ 此题质量存疑"，其它题没有标签
   - 检查 `/practice/word/<低分题对应的 wordId>` 同样正确
   - 检查 `/cram` 同样正确（如有 cram 入口）

2. **开关 ON**
   - 进入 `/settings`，勾上"显示题目质量分（Q:xx 小标）"
   - 回到 `/practice`，**预期**：每道题右上角出现 `Q:xx`，分别为绿色/灰色/暖色（按 spec §6 表格）；`< 70` 的题同时显示用户标签
   - null 档（如存在）显示 `Q:—`，灰色 0.6 透明
   - 切换到听力题（`ListeningQuizCard`），同样正确

3. **答题前/答题后**
   - 选一道 `< 70` 的题，确认答题前标签可见
   - 答完后，标签仍然可见、开发分数仍然在原位
   - 切换到下一题、再回头看，开关状态保持

4. **页面刷新**
   - 刷新页面，确认开关重置回 OFF（spec §6 明确：刷新页面不保留 — 这是预期行为）

- [ ] **Step 5: 若发现问题**

回到对应 Task 修复，再走一遍 typecheck → build → 人工验证。

- [ ] **Step 6: 最终 commit（如有 build artifacts 或微调）**

如果前述步骤全部干净通过，无需额外 commit。如有为修复 lint/build 错误而做的小改动，单独 commit：

```bash
git add -p   # 只 add 实际改动
git commit -m "fix: 题目质量分显示相关 build/lint 修正"
```

---

## Self-Review 结果

**Spec coverage：**

| Spec section | Task 覆盖 |
|---|---|
| §3 数据流（透传） | Task 4/5/6 |
| §4.1 devStore 新增 | Task 1 |
| §4.2 设置页 checkbox | Task 3 |
| §4.3 序列化路径 | Task 4/5/6（注：spec 提到 `session.ts`，实际查证发现 `session.ts` 不做 question 序列化，已在 plan File Map 中省略） |
| §4.4 QuizCard | Task 7 |
| §4.5 ListeningQuizCard | Task 8 |
| §4.6 globals.css | Task 2 |
| §5 视觉规约（位置/时机） | Task 7/8 步骤 4–5 |
| §6 边界（null / 100 / 69 / 70 / 关闭） | Task 9 步骤 4 测试矩阵 |
| §7 测试矩阵 | Task 9 |
| §8 不做的事 | 各 task 均不触发 |

**Spec 偏差**：spec §4.3 列出 `session.ts` 作为序列化点，实际代码中 `session.ts` 只做 word/state 序列化，question 序列化在 `practice/page.tsx`。Plan 已按代码事实更正。

**Placeholder scan：** 无 TBD / TODO / "类似 Task N" / 抽象描述。所有代码块均给出完整可粘贴内容。

**Type 一致性：**
- `qualityScore: number | null` 在 5 个文件（devStore 无；QuizCard、ListeningQuizCard、3 个 page）保持一致
- `scoreToneClass` 在 Task 7 和 Task 8 完全相同签名/逻辑（≥90 / ≥70 / 其它），与 Task 2 中 CSS 的 4 个 class 一一对应（含 `tone-unknown`）
- `useDevStore` 选择器签名 `(s) => s.showQualityScore` 两文件一致
