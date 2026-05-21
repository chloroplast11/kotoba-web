# 题目质量分展示设计

> 在题目页展示 `Question.qualityScore`：用户侧低分挂"质量存疑"标签，开发者侧始终显示数字小标（受开关控制）。

---

## 1. 背景与目标

`phase5/validate_static.py` + LLM 评分流程会给每道题打一个 `quality_score`（0–100），已经回写到 `Question.qualityScore` 字段（Prisma schema 已存在 `qualityScore Int?`）。

本设计在不改 schema、不改 seed、不新增 API 的前提下，把这个分数透出到题目页：

- **用户侧**（无开关）：`qualityScore < 70` 时，在题目头部下方挂一条 "⚠ 此题质量存疑"，提示用户该题可能有错，让用户答完不至于一头雾水。
- **开发者侧**（受 `devStore.showQualityScore` 开关控制）：在题目头部右侧挂一个 `Q:xx` 小标，便于扫题时随手识别低分题。开关放在 `/settings` 的「开发者模式」section。

数据已在 DB；本设计只做"读路径"。

## 2. 范围

**包含**：

- `devStore` 增加 `showQualityScore: boolean`（默认 `false`，纯前端，不写 DB）
- 设置页「开发者模式」section 增加 checkbox 切换 `showQualityScore`
- 题目数据序列化路径补上 `qualityScore` 透传
- `QuizCard` / `ListeningQuizCard` 渲染两类视觉元素
- `globals.css` 新增对应样式

**不包含**：

- 不改 `prisma/schema.prisma`（字段已存在）
- 不改 `prisma/seed.ts`（seed 流程之外的事）
- 不新增 API route
- 不动 SRS / 队列 / 解锁逻辑
- 不做评分 → DB 的 import 脚本（由 phase5 现有流程负责，不在本设计内）

## 3. 数据流

```
DB (Question.qualityScore: Int?)
  └─ prisma.question.findMany()          [src/lib/session.ts / app/practice/page.tsx]
     └─ session/practice route → 序列化为 QuestionData
        └─ QuizCard / ListeningQuizCard  [新 qualityScore prop]
           ├─ 用户层：qualityScore != null && < 70 → "質に疑問あり" badge
           └─ 开发层：始终渲染（受 devStore.showQualityScore 控制可见性）
```

## 4. 改动清单

### 4.1 `src/store/devStore.ts`

新增字段 + setter：

```ts
interface DevState {
  timeOffset: number;
  showQualityScore: boolean;          // 新增
  setTimeOffset: (ms: number) => void;
  setShowQualityScore: (v: boolean) => void;  // 新增
  advanceDay: (days: number) => void;
}
```

默认值 `showQualityScore: false`。状态保存在 Zustand 内存中（与 `timeOffset` 同级，不持久化到 `AppSettings`）。

### 4.2 `src/components/settings/SettingsClient.tsx`

在「开发者模式」section（约 line 151 起）的 `+1 天/+1 周/重置` 按钮组之后追加一行：

```
[ ] 显示题目质量分（Q:xx 小标）
说明：在题目右上角显示 AI 评分（0-100），便于排查低分题。仅本地生效。
```

文案中文（设置页属于中文区，符合 CLAUDE.md 规则 1）。

### 4.3 题目数据序列化路径

`QuestionData` 接口（同时存在于 `QuizCard.tsx` 和 `ListeningQuizCard.tsx`）增加：

```ts
qualityScore: number | null;
```

序列化处需要把 `q.qualityScore ?? null` 带上。涉及位置：

- `src/lib/session.ts`：构建 today session 时
- `src/app/practice/page.tsx`：读取 question 后传给 `PracticeClient`
- `src/app/practice/word/[wordId]/page.tsx`：单词级练习页
- `src/app/cram/page.tsx`：突击模式

具体每处的调整点在实现计划阶段定位。**原则**：原本怎么传 `explanation` / `explanationZh`，就在同一处补 `qualityScore`。

### 4.4 `src/components/practice/QuizCard.tsx`

在 `quiz-header` 内（现有 `MasteryPopover` 之后）渲染开发分数：

```tsx
{showQualityScore && (
  <span className={`dev-score ${scoreToneClass(question.qualityScore)}`}>
    Q:{question.qualityScore ?? "—"}
  </span>
)}
```

在 `quiz-header` 之后、`quiz-stem` 之前渲染用户标签：

```tsx
{question.qualityScore != null && question.qualityScore < 70 && (
  <div className="quality-warn">⚠ 此题质量存疑</div>
)}
```

通过 `useDevStore((s) => s.showQualityScore)` 读取开关。

`scoreToneClass` 是组件级或 util 级小函数：

- `null` → `"tone-unknown"`
- `>= 90` → `"tone-good"`
- `>= 70` → `"tone-mid"`
- `< 70` → `"tone-warn"`

### 4.5 `src/components/practice/ListeningQuizCard.tsx`

同 4.4，结构对称。注意：听力题目的 stem 区域结构不同，但用户标签仍挂在 `quiz-header` 之后、`quiz-stem.listening` 之前。

### 4.6 `src/app/globals.css`

新增三块样式：

```css
.quality-warn {
  font-size: 12px;
  color: var(--warn-soft, #b07a3a);
  letter-spacing: 0.05em;
  padding: 4px 0 0;
}

.dev-score {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  color: var(--ink-faint);
}
.dev-score.tone-good  { color: #4a8a4a; }
.dev-score.tone-mid   { color: var(--ink-faint); }
.dev-score.tone-warn  { color: #b07a3a; }
.dev-score.tone-unknown { color: var(--ink-faint); opacity: 0.6; }
```

颜色变量沿用 `globals.css` 现有体系；如有更合适的现有变量，实现时替换。

## 5. 视觉规约

| 元素 | 位置 | 时机 | 控制 |
|---|---|---|---|
| 用户标签 `⚠ 此题质量存疑` | quiz-header 下方独立行 | 答题前+答题后均可见 | 无开关，`< 70` 自动亮 |
| 开发者分数 `Q:xx` | quiz-header 右侧（MasteryPopover 之后） | 始终可见 | `devStore.showQualityScore` |

**文案分区**：

- 用户标签 → **中文**（用户显式指定。这是对 CLAUDE.md 规则 1 「题目页是日语区」的有意例外：该标签语义偏"对题目本身的元信息提示"，更接近系统级警告而非学习内容，用中文反而比日语更直接传达"这不是题目的一部分"）
- 设置页开关说明 → 中文区（管理类配置）

设置页文案符合 CLAUDE.md 规则 1；用户标签属于经用户授权的规则例外。

## 6. 边界情况

| 情况 | 行为 |
|---|---|
| `qualityScore = null`（未评分） | 用户标签：不显示；开发分数：显示 `Q:—`（仅开关开启时） |
| `qualityScore = 100` | 用户：不显示；开发：绿色 `Q:100` |
| `qualityScore = 69` | 用户：标签亮；开发：暖色 `Q:69` |
| `qualityScore = 70` | 用户：不显示（严格 `< 70`）；开发：灰色 `Q:70` |
| 开关关闭 | 开发分数完全不渲染；用户标签不受影响 |

## 7. 测试

手动验证矩阵：

- 选取四个真实 `qualityScore`（null / 95 / 75 / 60）的题目，分别在 `/practice` 和 `/practice/word/[wordId]` 出现
- 开关 ON / OFF 各跑一次
- 听力题（`ListeningQuizCard`）和普通题（`QuizCard`）各覆盖一次
- 确认答题后揭晓答案时，两个元素仍然按预期显示

无自动化测试新增（这是纯展示改动，逻辑面非常薄）。

## 8. 不做的事

- 不展示 `validation_status` / `issues` / `suggestions`（用户决定只暴露 `qualityScore`）
- 不把开关持久化到 `AppSettings` / DB（开发者本机用，刷新页面重置可以接受）
- 不在 Library / Cram / Round2 之外的地方挂这些元素（除非走的也是 `QuizCard` / `ListeningQuizCard`，那就自动跟着生效）
- 不做用户举报/跳过低分题功能（仅提示，行为不变）
- 不展示 `Word.qualityScore`（schema 中同名字段存在于 `Word` 表，但本设计只读 `Question.qualityScore`）
