# 错题集按题目粒度重构 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把错题集从「单词+维度」粒度改为「题目」粒度。用户能看到具体错的是哪道题、当时的错选与正确答案，后续答对自动收敛。

**Architecture:** `WrongAnswer` 表主轴改为 `questionId`，新增 `wrongChoice` 字段。`/api/review` 错答时按 questionId upsert，答对时把同 questionId 的未解决记录标记 resolved。`/api/mistakes` 返回按词聚合的结构。MistakesClient 改为折叠/展开 UI，展开显示题目细节。

**Tech Stack:** Next.js 16 · Prisma 7 + SQLite (libSQL adapter) · React 19 · Zustand 5 · TypeScript

**Spec:** [2026-05-16-mistake-book-question-level-design.md](../specs/2026-05-16-mistake-book-question-level-design.md)

**Testing approach:** 项目目前无单元测试框架。本计划使用手动验收（dev server + 浏览器）作为验证手段，每个任务末尾要么通过 `npx tsc --noEmit` 类型检查 + 编译，要么通过手动操作触发实际行为后比对预期。

---

## File Map

- 修改：`prisma/schema.prisma` — `WrongAnswer` 模型重构、`Question` 反向关系
- 新增：`prisma/migrations/<timestamp>_wrong_answer_by_question/migration.sql` — Prisma 自动生成
- 修改：`src/types/domain.ts` — 移除 `WrongAnswerItem`，新增 `MistakeQuestionItem` / `MistakeWordGroup` / `MistakesResponse`
- 修改：`src/app/api/review/route.ts` — 错答按 questionId upsert + 记录 wrongChoice；答对自动 resolve
- 修改：`src/components/practice/QuizCard.tsx` — `onAnswer` 签名加 `wrongChoice` 参数
- 修改：`src/components/practice/ListeningQuizCard.tsx` — 同上
- 修改：`src/components/practice/PracticeClient.tsx` — `handleAnswer` 接收并传递 `wrongChoice`
- 修改：`src/components/practice/WordPracticeClient.tsx` — 同上
- 修改：`src/store/sessionStore.ts` — `submitAnswer` 签名加 `wrongChoice`
- 修改：`src/app/api/mistakes/route.ts` — 返回按词分组结构
- 修改：`src/components/mistakes/MistakesClient.tsx` — 折叠/展开 UI
- 修改：`src/app/globals.css` — 新增展开样式
- 无变更：`src/app/api/mistakes/[id]/route.ts`（PATCH 逻辑天然按 id 工作）

---

## Task 1: 重构 Prisma schema 和迁移数据库

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_wrong_answer_by_question/migration.sql` (auto)

- [ ] **Step 1: 修改 schema.prisma 中 `WrongAnswer` 模型**

把 [prisma/schema.prisma](../../prisma/schema.prisma#L68-L81) 的 `WrongAnswer` 块替换为：

```prisma
model WrongAnswer {
  id           Int      @id @default(autoincrement())
  questionId   String   @unique
  wordId       Int
  dimension    String
  wrongChoice  Int
  resolved     Boolean  @default(false)
  wrongCount   Int      @default(1)
  firstWrongAt DateTime @default(now())
  lastWrongAt  DateTime @default(now())

  question Question @relation(fields: [questionId], references: [id])
  word     Word     @relation(fields: [wordId], references: [id])

  @@index([resolved, lastWrongAt])
  @@index([wordId, resolved])
}
```

- [ ] **Step 2: 在 `Question` 模型末尾加反向关系**

在 `Question` 模型的 `word Word @relation(...)` 那一行之后追加：

```prisma
  wrongAnswer WrongAnswer?
```

- [ ] **Step 3: 生成并应用迁移**

由于改了唯一约束并新增了 NOT NULL 列 `wrongChoice`，需要先清空表再迁移。

Run:
```bash
npx prisma migrate dev --name wrong_answer_by_question
```

如果 Prisma 提示需要 reset 或 data loss，确认 `y`。迁移会自动清空 `WrongAnswer` 表（spec 决议 a：dev 数据清空重来）。

Expected: 在 `prisma/migrations/` 下出现新目录 `<timestamp>_wrong_answer_by_question/`，包含 `migration.sql`；命令终止时打印 `Already in sync` 或 `Applied migration`。

- [ ] **Step 4: 重新生成 Prisma Client**

Run:
```bash
npx prisma generate
```

Expected: `src/generated/prisma/` 内文件刷新，输出 `Generated Prisma Client (...)`.

- [ ] **Step 5: 类型检查**

Run:
```bash
npx tsc --noEmit
```

Expected: 类型错误将出现在仍使用旧 `WrongAnswer` 字段的代码处（`src/app/api/review/route.ts` / `src/app/api/mistakes/route.ts` / `src/components/mistakes/MistakesClient.tsx` / `src/types/domain.ts` 等）。**这些错误预期存在**，由后续任务消除；本步骤只是确认 schema 改动已被识别。

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(mistakes): 重构 WrongAnswer schema 为题目粒度"
```

---

## Task 2: 更新 domain 类型

**Files:**
- Modify: `src/types/domain.ts`

- [ ] **Step 1: 替换 `WrongAnswerItem` 为新类型**

打开 [src/types/domain.ts](../../src/types/domain.ts#L55-L67)，删除 `WrongAnswerItem` interface 整段，替换为：

```ts
export interface MistakeQuestionItem {
  id: number;
  questionId: string;
  dimension: DimKey;
  type: string;
  question: string | null;
  options: QuestionOption[];
  correctIndex: number;
  wrongChoice: number;
  explanation: string | null;
  explanationZh: string | null;
  wrongCount: number;
  lastWrongAt: string;
}

export interface MistakeWordGroup {
  wordId: number;
  word: string;
  furigana: string;
  meaningZh: string;
  level: number;
  totalWrongQuestions: number;
  dimensions: DimKey[];
  lastWrongAt: string;
  questions: MistakeQuestionItem[];
}

export interface MistakesResponse {
  groups: MistakeWordGroup[];
}
```

`QuestionOption` 已在文件中定义（`{ text: string }`），无需新增。

- [ ] **Step 2: 类型检查**

Run:
```bash
npx tsc --noEmit
```

Expected: 仍存在错误，但不再因为 `WrongAnswerItem` 不存在而抱怨——而是 `src/app/api/mistakes/route.ts` 和 `src/components/mistakes/MistakesClient.tsx` 仍引用 `WrongAnswerItem`（下一步处理）。

- [ ] **Step 3: Commit**

```bash
git add src/types/domain.ts
git commit -m "feat(mistakes): 添加按题目粒度的错题集类型"
```

---

## Task 3: 重写 review API 写入逻辑

**Files:**
- Modify: `src/app/api/review/route.ts`

- [ ] **Step 1: 修改 `ReviewRequest` 接口添加 `wrongChoice`**

打开 [src/app/api/review/route.ts](../../src/app/api/review/route.ts#L8-L15)，把 `ReviewRequest` interface 改为：

```ts
interface ReviewRequest {
  wordId: number;
  dimension: DimKey;
  questionId: string;
  correct: boolean;
  timestamp: number;
  learnOnly?: boolean;
  wrongChoice?: number;
}
```

并把 [src/app/api/review/route.ts:19](../../src/app/api/review/route.ts#L19) 的解构改为：

```ts
const { wordId, dimension, correct, timestamp, learnOnly, questionId, wrongChoice } = body;
```

- [ ] **Step 2: 替换错答 upsert 逻辑 + 答对自动 resolve**

把 [src/app/api/review/route.ts:88-94](../../src/app/api/review/route.ts#L88-L94) 的 `if (!correct) { ... }` 整块替换为：

```ts
  if (!correct) {
    await prisma.wrongAnswer.upsert({
      where: { questionId },
      create: {
        questionId,
        wordId,
        dimension,
        wrongChoice: wrongChoice ?? -1,
        firstWrongAt: now,
        lastWrongAt: now,
      },
      update: {
        resolved: false,
        wrongCount: { increment: 1 },
        lastWrongAt: now,
        wrongChoice: wrongChoice ?? -1,
      },
    });
  } else {
    await prisma.wrongAnswer.updateMany({
      where: { questionId, resolved: false },
      data: { resolved: true },
    });
  }
```

注：`updateMany` 在记录不存在时不会报错，只是 noop——正符合需求。`wrongChoice ?? -1` 兜底：理论上错答必有 choice，前端传不上来时存 `-1` 表示未知。

- [ ] **Step 3: 类型检查 + 启动 dev server 触发编译**

Run:
```bash
npx tsc --noEmit
```

Expected: 该文件内不再有错误（错误集中到仍未更新的 `mistakes` API 和 UI 文件）。

- [ ] **Step 4: Commit**

```bash
git add src/app/api/review/route.ts
git commit -m "feat(mistakes): review API 按题目记录错题、答对自动 resolve"
```

---

## Task 4: 透传 wrongChoice 到练习组件

**Files:**
- Modify: `src/components/practice/QuizCard.tsx`
- Modify: `src/components/practice/ListeningQuizCard.tsx`
- Modify: `src/components/practice/PracticeClient.tsx`
- Modify: `src/components/practice/WordPracticeClient.tsx`
- Modify: `src/store/sessionStore.ts`

- [ ] **Step 1: 修改 QuizCard 的 `onAnswer` 签名与调用**

在 [src/components/practice/QuizCard.tsx:28](../../src/components/practice/QuizCard.tsx#L28)，把：

```ts
  onAnswer: (correct: boolean) => void;
```

改为：

```ts
  onAnswer: (correct: boolean, chosenIndex: number) => void;
```

在 [src/components/practice/QuizCard.tsx:49](../../src/components/practice/QuizCard.tsx#L49)，把：

```ts
    onAnswer(idx === question.correctIndex);
```

改为：

```ts
    onAnswer(idx === question.correctIndex, idx);
```

- [ ] **Step 2: 修改 ListeningQuizCard 的 `onAnswer` 签名与调用**

[src/components/practice/ListeningQuizCard.tsx:31](../../src/components/practice/ListeningQuizCard.tsx#L31) 改为：

```ts
  onAnswer: (correct: boolean, chosenIndex: number) => void;
```

[src/components/practice/ListeningQuizCard.tsx:57](../../src/components/practice/ListeningQuizCard.tsx#L57) 改为：

```ts
    onAnswer(idx === correctIndex, idx);
```

- [ ] **Step 3: 修改 sessionStore.submitAnswer 签名**

在 [src/store/sessionStore.ts:16-21](../../src/store/sessionStore.ts#L16-L21)，把 `submitAnswer` 类型声明改为：

```ts
  submitAnswer: (
    wordId: number,
    dim: DimKey,
    questionId: string,
    correct: boolean,
    wrongChoice: number,
  ) => Promise<void>;
```

在 [src/store/sessionStore.ts:54](../../src/store/sessionStore.ts#L54)，把实现签名改为：

```ts
  submitAnswer: async (wordId, dim, questionId, correct, wrongChoice) => {
```

在 [src/store/sessionStore.ts:65](../../src/store/sessionStore.ts#L65)，把 fetch body 改为：

```ts
      body: JSON.stringify({ wordId, dimension: dim, questionId, correct, rating, timestamp: now, wrongChoice }),
```

- [ ] **Step 4: 修改 PracticeClient.handleAnswer**

[src/components/practice/PracticeClient.tsx:88-92](../../src/components/practice/PracticeClient.tsx#L88-L92) 改为：

```ts
  function handleAnswer(correct: boolean, chosenIndex: number) {
    if (!item) return;
    setAnswered(true);
    session.submitAnswer(item.wordId, item.dim, item.questionId, correct, chosenIndex);
  }
```

`handleAnswer` 已经传给 `QuizCard` 和 `ListeningQuizCard` 的 `onAnswer`，不用再改。

- [ ] **Step 5: 修改 WordPracticeClient.handleAnswer**

打开 `src/components/practice/WordPracticeClient.tsx`，搜索 `function handleAnswer`，把它改为接收两个参数并把 `chosenIndex` 透传给 `session.submitAnswer`。具体调整：

- 把函数签名从 `function handleAnswer(correct: boolean)` 改为 `function handleAnswer(correct: boolean, chosenIndex: number)`
- 把 `session.submitAnswer(...)` 调用的最后一个参数补上 `chosenIndex`

如果 `WordPracticeClient` 不是直接调用 `session.submitAnswer` 而是自己处理，则相应位置加上 `chosenIndex`。

- [ ] **Step 6: 类型检查**

Run:
```bash
npx tsc --noEmit
```

Expected: 练习侧无错误。剩余错误集中在 `src/app/api/mistakes/route.ts` 和 `src/components/mistakes/MistakesClient.tsx`。

- [ ] **Step 7: Commit**

```bash
git add src/components/practice src/store/sessionStore.ts
git commit -m "feat(mistakes): 练习提交透传 wrongChoice"
```

---

## Task 5: 重写 mistakes GET API

**Files:**
- Modify: `src/app/api/mistakes/route.ts`

- [ ] **Step 1: 替换整个文件**

把 [src/app/api/mistakes/route.ts](../../src/app/api/mistakes/route.ts) 整个替换为：

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { DimKey, MistakeQuestionItem, MistakeWordGroup, QuestionOption } from "@/types/domain";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.wrongAnswer.findMany({
    where: { resolved: false },
    orderBy: { lastWrongAt: "desc" },
    include: { word: true, question: true },
  });

  const groups = new Map<number, MistakeWordGroup>();

  for (const r of rows) {
    let parsedOptions: QuestionOption[];
    try {
      parsedOptions = JSON.parse(r.question.options) as QuestionOption[];
    } catch {
      parsedOptions = [];
    }

    const qItem: MistakeQuestionItem = {
      id: r.id,
      questionId: r.questionId,
      dimension: r.dimension as DimKey,
      type: r.question.type,
      question: r.question.question,
      options: parsedOptions,
      correctIndex: r.question.correctIndex,
      wrongChoice: r.wrongChoice,
      explanation: r.question.explanation,
      explanationZh: r.question.explanationZh,
      wrongCount: r.wrongCount,
      lastWrongAt: r.lastWrongAt.toISOString(),
    };

    const existing = groups.get(r.wordId);
    if (existing) {
      existing.questions.push(qItem);
      existing.totalWrongQuestions += 1;
      if (!existing.dimensions.includes(qItem.dimension)) {
        existing.dimensions.push(qItem.dimension);
      }
      if (r.lastWrongAt.toISOString() > existing.lastWrongAt) {
        existing.lastWrongAt = r.lastWrongAt.toISOString();
      }
    } else {
      groups.set(r.wordId, {
        wordId: r.wordId,
        word: r.word.word,
        furigana: r.word.furigana,
        meaningZh: r.word.meaningZh,
        level: r.word.level,
        totalWrongQuestions: 1,
        dimensions: [qItem.dimension],
        lastWrongAt: r.lastWrongAt.toISOString(),
        questions: [qItem],
      });
    }
  }

  const sortedGroups = [...groups.values()].sort((a, b) =>
    b.lastWrongAt.localeCompare(a.lastWrongAt),
  );

  return NextResponse.json({ groups: sortedGroups });
}
```

注：`rows` 由 Prisma 按 `lastWrongAt desc` 排序，因此每个 group 内 `questions` 也自然按错题时间倒序——保留默认顺序即可。

- [ ] **Step 2: 类型检查**

Run:
```bash
npx tsc --noEmit
```

Expected: 该文件无错误。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mistakes/route.ts
git commit -m "feat(mistakes): GET API 返回按词分组的错题"
```

---

## Task 6: 重写 MistakesClient UI

**Files:**
- Modify: `src/components/mistakes/MistakesClient.tsx`

- [ ] **Step 1: 替换整个文件**

把 [src/components/mistakes/MistakesClient.tsx](../../src/components/mistakes/MistakesClient.tsx) 整个替换为：

```tsx
"use client";
import { useEffect, useState } from "react";
import RubyText from "@/components/ui/RubyText";
import { DIM_NAMES, DIM_DESCRIPTIONS } from "@/lib/constants";
import { getCurrentDate } from "@/lib/time";
import type { MistakeQuestionItem, MistakeWordGroup } from "@/types/domain";

const OPTION_LABELS = ["A", "B", "C", "D"];

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
  const [groups, setGroups] = useState<MistakeWordGroup[] | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/mistakes")
      .then((r) => r.json())
      .then((data) => setGroups(data.groups as MistakeWordGroup[]))
      .catch(() => setGroups([]));
  }, []);

  function toggle(wordId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(wordId)) next.delete(wordId);
      else next.add(wordId);
      return next;
    });
  }

  async function markQuestionResolved(wrongAnswerId: number, wordId: number) {
    setGroups((prev) => {
      if (!prev) return prev;
      return prev
        .map((g) => {
          if (g.wordId !== wordId) return g;
          const remaining = g.questions.filter((q) => q.id !== wrongAnswerId);
          if (remaining.length === 0) return null;
          return { ...g, questions: remaining, totalWrongQuestions: remaining.length };
        })
        .filter((g): g is MistakeWordGroup => g !== null);
    });
    await fetch(`/api/mistakes/${wrongAnswerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolved: true }),
    });
  }

  if (groups === null) {
    return (
      <section className="home-hero">
        <div className="date-line">復習帖</div>
        <h1 style={{ fontSize: "32px" }}>読み込み中…</h1>
      </section>
    );
  }

  const totalQuestions = groups.reduce((a, g) => a + g.totalWrongQuestions, 0);

  return (
    <>
      <section className="home-hero" style={{ marginBottom: "40px" }}>
        <div className="date-line">復習帖 · ふくしゅうちょう</div>
        <h1>
          忘れたところを、<br />もう一度。
        </h1>
        <p className="lede">
          {totalQuestions > 0
            ? <>間違えた問題は <em style={{ color: "var(--accent)", fontStyle: "italic" }}>{totalQuestions}</em> 件。落ち着いて、ひとつずつ。</>
            : "今のところ、復習が必要な問題はありません。"}
        </p>
      </section>

      {groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-jp">よくできました</div>
          <div className="empty-state-en">All clear. Keep going.</div>
        </div>
      ) : (
        <ul className="mistake-list">
          {groups.map((g) => {
            const isOpen = expanded.has(g.wordId);
            return (
              <li key={g.wordId} className="mistake-row expandable">
                <button
                  type="button"
                  className="mistake-row-toggle"
                  onClick={() => toggle(g.wordId)}
                  aria-expanded={isOpen}
                >
                  <div className="mistake-main">
                    <div className="mistake-word">
                      <ruby>
                        {g.word}
                        <rt>{g.furigana}</rt>
                      </ruby>
                    </div>
                    <div className="mistake-meaning">{g.meaningZh}</div>
                    <div className="mistake-tags">
                      {g.dimensions.map((d) => (
                        <span key={d} className={`dimension-pill dim-${d}`}>
                          {DIM_NAMES[d]}
                        </span>
                      ))}
                      <span className="mistake-meta">N{g.level}</span>
                      <span className="mistake-meta">{g.totalWrongQuestions} 題</span>
                      <span className="mistake-meta">{formatRelativeDate(g.lastWrongAt)}</span>
                    </div>
                  </div>
                  <span className="mistake-chevron" aria-hidden="true">{isOpen ? "−" : "+"}</span>
                </button>

                {isOpen && (
                  <div className="mistake-question-list">
                    {g.questions.map((q) => (
                      <MistakeQuestion
                        key={q.id}
                        q={q}
                        onResolve={() => markQuestionResolved(q.id, g.wordId)}
                      />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function MistakeQuestion({ q, onResolve }: { q: MistakeQuestionItem; onResolve: () => void }) {
  const isListeningKanji = q.type === "listening_kanji";
  return (
    <div className="mistake-question">
      <div className="mistake-question-stem">
        {q.question ? <RubyText html={q.question} /> : <span className="mistake-meta">（題文なし）</span>}
      </div>
      <div className="mistake-question-options">
        {q.options.map((opt, idx) => {
          const isCorrect = idx === q.correctIndex;
          const isWrongChoice = idx === q.wrongChoice;
          const cls = [
            "mistake-option",
            isCorrect ? "mistake-option-correct" : "",
            isWrongChoice && !isCorrect ? "mistake-option-wrong" : "",
          ].filter(Boolean).join(" ");
          return (
            <div key={idx} className={cls}>
              <span className="mistake-option-marker">
                {isCorrect ? "✓" : isWrongChoice ? "✗" : OPTION_LABELS[idx]}
              </span>
              <span>
                {isListeningKanji ? opt.text : <RubyText html={opt.text} />}
              </span>
            </div>
          );
        })}
      </div>
      {(q.explanationZh || q.explanation) && (
        <div className="mistake-explanation">
          {q.explanationZh ?? q.explanation}
        </div>
      )}
      <div className="mistake-question-foot">
        <div className="mistake-question-meta">
          <span className={`dimension-pill dim-${q.dimension}`}>{DIM_NAMES[q.dimension]}</span>
          <span className="mistake-meta">× {q.wrongCount} 回</span>
          <span className="mistake-meta">{formatRelativeDate(q.lastWrongAt)}</span>
          <span className="mistake-hint">{DIM_DESCRIPTIONS[q.dimension]}</span>
        </div>
        <button
          type="button"
          className="mistake-btn mistake-btn-primary zh-zone"
          onClick={onResolve}
        >
          标记已掌握
        </button>
      </div>
    </div>
  );
}

```

- [ ] **Step 2: 类型检查**

Run:
```bash
npx tsc --noEmit
```

Expected: 整个项目类型 0 错误。

- [ ] **Step 3: Commit**

```bash
git add src/components/mistakes/MistakesClient.tsx
git commit -m "feat(mistakes): UI 改为按词聚合+展开看错题详情"
```

---

## Task 7: 新增 CSS 样式

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: 在 mistake 区块末尾追加样式**

打开 [src/app/globals.css](../../src/app/globals.css)，在 [src/app/globals.css:981](../../src/app/globals.css#L981)（`.mistake-btn.mistake-btn-primary:hover` 之后、`/* ── Responsive ──` 之前）插入：

```css
.mistake-row.expandable {
  display: block;
  padding: 0;
}
.mistake-row-toggle {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 4px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.mistake-row-toggle:hover { background: rgba(29, 41, 53, 0.02); }
.mistake-chevron {
  font-size: 22px;
  color: var(--ink-faint);
  flex-shrink: 0;
  line-height: 1;
  padding-top: 4px;
  font-family: 'IBM Plex Mono', monospace;
}
.mistake-question-list {
  padding: 0 4px 22px 4px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.mistake-question {
  padding: 18px;
  background: var(--paper-warm);
  border: 1px solid var(--line);
  border-radius: 4px;
}
.mistake-question-stem {
  font-family: 'Noto Serif JP', serif;
  font-size: 16px;
  line-height: 1.7;
  color: var(--ink);
  margin-bottom: 14px;
}
.mistake-question-stem ruby rt {
  font-size: 10px;
  color: var(--ink-faint);
  letter-spacing: 0.06em;
}
.mistake-question-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}
.mistake-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--line);
  background: var(--paper);
  font-family: 'Noto Serif JP', serif;
  font-size: 14px;
  color: var(--ink-soft);
  line-height: 1.5;
}
.mistake-option ruby rt {
  font-size: 10px;
  color: var(--ink-faint);
}
.mistake-option-marker {
  flex-shrink: 0;
  width: 22px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: var(--ink-faint);
  text-align: center;
}
.mistake-option-correct {
  border-color: var(--celadon);
  background: rgba(122, 155, 138, 0.10);
  color: var(--ink);
}
.mistake-option-correct .mistake-option-marker {
  color: var(--celadon);
  font-weight: 600;
}
.mistake-option-wrong {
  border-color: var(--accent);
  background: rgba(197, 83, 90, 0.08);
  color: var(--ink);
}
.mistake-option-wrong .mistake-option-marker {
  color: var(--accent);
  font-weight: 600;
}
.mistake-explanation {
  font-family: 'Noto Serif JP', serif;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-soft);
  padding: 10px 12px;
  background: var(--paper);
  border-left: 2px solid var(--line-strong);
  margin-bottom: 14px;
}
.mistake-question-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.mistake-question-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
```

并在 `@media (max-width: 720px)` 块（约 [src/app/globals.css:998-1000](../../src/app/globals.css#L998)）末尾追加：

```css
  .mistake-row.expandable { flex-direction: column; }
  .mistake-row-toggle { flex-direction: row; padding: 18px 4px; }
  .mistake-question { padding: 14px; }
  .mistake-question-foot { flex-direction: column; align-items: flex-start; }
  .mistake-question-foot .mistake-btn { width: 100%; }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(mistakes): 新增错题展开 UI 样式"
```

---

## Task 8: 手动验收

**Files:** 无变更

- [ ] **Step 1: 启动 dev server**

Run:
```bash
npm run dev
```

Expected: 输出 `▲ Next.js ... - Local: http://localhost:3000`，无 build error。

- [ ] **Step 2: 验收清单（在浏览器执行）**

按顺序操作并对照预期：

1. **首次错答记录**：进入 `/practice`，故意答错一道题 → 立即访问 `/mistakes` → 看到该词组出现在列表中，词级 pill 显示该维度，"1 題"，"今日"
2. **展开查看**：点击该词组所在行 → 题目卡片展开，看到题干（带注音）、4 个选项（正确选项绿底 ✓、自己选的红底 ✗）、解析、维度 pill + 错过 1 回 + 今日
3. **同题再错**：回到练习再次答错同一题（可借助 `cram` 或新一日队列）→ 错题集仍是 1 题，但 "× 2 回"
4. **答对自动消失**：再次答对该题 → 刷新 `/mistakes`，该题从列表消失（若该词只此一题，则整个词组消失）
5. **多维度同词**：让同一个词在 R 和 P 两个维度都各错一题 → 错题集中该词组的 dimension pill 显示两个，"2 題"，展开看到 2 道题分别标 R / P
6. **手动标记**：展开某题，点「标记已掌握」→ 该题立即从列表消失（乐观更新），刷新页面验证持久化
7. **空状态**：把所有错题清完 → 显示 `よくできました / All clear. Keep going.`
8. **文案分区**：除「标记已掌握」按钮（中文）外，其余所有文案为日语（hero、维度名、"題"/"回"、相对时间）
9. **听力题型**：让一道 `listening_kanji` 题进入错题集 → 展开后 4 个选项保留裸汉字（无 ruby）

- [ ] **Step 3: 若 1-9 全部通过，无新增 commit；若发现 bug，修复并在该任务名下追加 commit**

- [ ] **Step 4: 类型 + 编译终检**

Run:
```bash
npx tsc --noEmit && npm run build
```

Expected: 0 error, build success。

---

## 收尾

完成 Task 1-8 后：

- 错题集已按题目粒度运作
- 设计文档 + 实施计划已落盘并 commit
- 不需要进一步动作

如需对照 spec，参见 [docs/superpowers/specs/2026-05-16-mistake-book-question-level-design.md](../specs/2026-05-16-mistake-book-question-level-design.md)。
