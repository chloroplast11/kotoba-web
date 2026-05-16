# 错题集按题目粒度重构 · 设计文档

日期：2026-05-16
状态：已通过 brainstorming，待写实施计划

## 背景与问题

当前 `WrongAnswer` 表以 `(wordId, dimension)` 为唯一键，同一个单词同一个维度多次答错只会递增 `wrongCount`。结果：

- 错题集只知道"这个词在 R 维度错过 N 次"，不知道具体错的是哪道题
- 用户从错题集点击「打开学习页」后再进入练习，会跑进当日全局队列，而不是定位到具体错题
- "復習帖"的名字暗示是题目集合，实现却是单词集合，体验与定位不符

## 目标

- 错题以**题目**为粒度记录
- 用户能在错题集里直接看到错过的具体题目内容（题干、选项、自己当时的错选、正确答案、解析）
- 按单词聚合展示，保留"这个词我栽了几次"的整体感
- 后续答对该题自动从错题集移除，无需用户干预
- 用户可手动逐题标记"已掌握"
- 错题集是**纯展示**面板，不承担"重做题目"的交互流程

## 非目标

- 不做"重做错题"的练习流（已在 brainstorming 阶段明确放弃）
- 不做词级一键标记掌握
- 不做错题导出、错题搜索、错题筛选器（YAGNI，需要再加）
- 不影响 SRS 调度逻辑

## 数据模型

### `WrongAnswer` 重构

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

  question     Question @relation(fields: [questionId], references: [id])
  word         Word     @relation(fields: [wordId], references: [id])

  @@index([resolved, lastWrongAt])
  @@index([wordId, resolved])
}
```

字段说明：

- `questionId`：错题主轴，唯一索引。同一道题反复错只会更新这一条记录
- `wordId` / `dimension`：冗余字段，便于"按词聚合"和"按维度筛选/着色"在 API 层一次拿到，无需 join Question
- `wrongChoice`：记录用户最近一次错答时选择的选项 index（0..3）。多次错答时覆盖为最新一次
- `wrongCount` / `firstWrongAt` / `lastWrongAt` / `resolved`：语义不变
- 唯一约束从 `@@unique([wordId, dimension])` 改为 `@unique` on `questionId`

### `Question` 反向关系

`Question` 模型新增 `wrongAnswer WrongAnswer?` 反向关系字段。

### 迁移策略

老数据清空。新增 Prisma migration：

1. 删除旧 `WrongAnswer` 表
2. 重建新 schema
3. 不做数据迁移（dev 环境，按需重新触发错题）

## 写入逻辑（`/api/review`）

请求体已携带 `questionId`，无需改动接口。

```
当 correct === false：
  upsert WrongAnswer where questionId = body.questionId
    create: { questionId, wordId, dimension, wrongChoice }
    update: { wrongCount: +1, lastWrongAt: now, resolved: false, wrongChoice: 覆盖 }

当 correct === true：
  update WrongAnswer where questionId = body.questionId AND resolved = false
    set resolved = true
  （若不存在则 noop）
```

`wrongChoice` 来自前端：前端在 quiz 卡片提交 review 时附加 `wrongChoice` 字段（用户选的 option index）。`ReviewRequest` 类型新增 `wrongChoice?: number` 字段。答对时该字段可不传。

## 读取（`/api/mistakes`）

返回结构改为按词聚合：

```ts
type MistakeQuestionItem = {
  id: number;                  // WrongAnswer.id（PATCH /api/mistakes/[id] 使用）
  questionId: string;
  dimension: DimKey;
  type: string;
  question: string | null;
  options: string[];           // JSON.parse 后的数组
  correctIndex: number;
  wrongChoice: number;
  explanation: string | null;
  explanationZh: string | null;
  wrongCount: number;
  lastWrongAt: string;         // ISO
};

type MistakeWordGroup = {
  wordId: number;
  word: string;
  furigana: string;
  meaningZh: string;
  level: number;
  totalWrongQuestions: number;
  dimensions: DimKey[];        // 去重后的维度集合，UI 用作 pill 列表
  lastWrongAt: string;         // 该词最近一次错题时间，用于排序
  questions: MistakeQuestionItem[];
};

type MistakesResponse = { groups: MistakeWordGroup[] };
```

实现要点：

- `WrongAnswer` 查询 `resolved = false`，join `question` 和 `word`
- 按 `wordId` 在内存里分组
- 每个 group 内题目按 `lastWrongAt` 倒序
- group 之间按 `lastWrongAt` 倒序（取组内最大值）

## PATCH `/api/mistakes/[id]`

语义不变：把指定 `WrongAnswer.id` 标记为 `resolved = true`。粒度从"词+维度"变成"单题"，但代码层面不需要额外改动（仍然是按主键 update）。

## 前端（`MistakesClient`）

### Hero 区

- 标题、副标题不变
- 「間違えた問題は N 件」中的 N 改为 `groups.reduce((a, g) => a + g.totalWrongQuestions, 0)`

### 列表（每个词一个 `<li>`）

**折叠态**（默认）：

- 单词（ruby 注音）
- 中文释义
- 一组维度 pill（去重后该词有错题的维度，使用现有 `.dimension-pill.dim-R/P/U` 样式）
- 元信息行：`N{level}` · `{totalWrongQuestions} 題` · `{相対時間}`
- 整行点击切换展开/折叠（无显式按钮，光标变 pointer）
- 不显示「打开学习页」「标记已掌握」（这些动作下移到题级）

**展开态**：

- 折叠态内容保留
- 下方逐道题展示：
  - 题干（保留来自 DB 的 ruby HTML，使用 `dangerouslySetInnerHTML`，与现有 QuizCard 一致）
  - 4 个选项垂直排列：
    - 正确答案：左侧 ✓ 图标，绿色边框/底色
    - 用户错选：左侧 ✗ 图标，红色边框/底色
    - 其余两个：默认色
    - 监听题型（`listening_kanji` 等）选项内容仍是裸汉字，不额外加注音（遵循 CLAUDE.md 规则 2 例外）
  - 解析：优先 `explanationZh`，无则 `explanation`，再无则不显示
  - 单条元信息：`{dimensionPill}` · `× {wrongCount} 回` · `{相対時間}`
  - 右上角「标记已掌握」按钮（中文，zh-zone）

### 文案分区

- 日语区（学习/品牌内容）：hero 文案、单词、注音、释义、题干、选项、解析、维度 pill 名称（認識/産出/運用）、"件 / 題 / 回"、相对时间
- 中文区（管理动作）：「标记已掌握」按钮
- 严格遵循 CLAUDE.md §规则 1

### CSS 新增

在 `globals.css` 内复用现有变量，新增：

- `.mistake-row.expandable`：cursor pointer，hover 时背景色微调
- `.mistake-question-list`：展开容器，左侧 padding 缩进
- `.mistake-question`：单题卡片
- `.mistake-option`：选项基础样式
- `.mistake-option-correct` / `.mistake-option-wrong`：正确/错选标记色
- `.mistake-explanation`：解析样式（小一号、次要色）

颜色统一走 `--accent`、`--text`、`--text-muted` 等已有变量；正确/错选颜色用现有的 success/error 语义色（如无则新增 `--success` `--error` CSS 变量）。

## 影响范围

需要修改的文件：

- `prisma/schema.prisma` — `WrongAnswer` 重构 + `Question` 反向关系
- `prisma/migrations/<新>` — 删表重建
- `src/types/domain.ts` — `WrongAnswerItem` 删除，新增 `MistakeQuestionItem` / `MistakeWordGroup` / `MistakesResponse`；`ReviewRequest` 新增 `wrongChoice?: number`
- `src/app/api/review/route.ts` — 错答写入逻辑（按 questionId upsert + 记录 wrongChoice）+ 答对自动 resolve
- `src/app/api/mistakes/route.ts` — 返回结构改为分组
- `src/app/api/mistakes/[id]/route.ts` — 语义不变，确认 OK
- `src/components/practice/QuizCard.tsx` — 提交 review 时携带 `wrongChoice`
- `src/components/practice/ListeningQuizCard.tsx` — 同上
- `src/components/mistakes/MistakesClient.tsx` — 重写为分组展开 UI
- `src/app/globals.css` — 新增样式

不动：

- `/learn/[id]`、`/practice`、`/round2`、`/library`、`/summary`
- SRS 调度逻辑（`src/lib/srs.ts`）
- 队列构建（`src/lib/queue.ts`）
- Cram 模块（无 WrongAnswer 写入路径）

## 测试与验收

手动验收清单：

1. 在练习中答错一道题 → 该题进入错题集，能展开看到自己的错选高亮
2. 同一道题再次答错 → 错题集内仍只一条记录，`wrongCount` +1，`wrongChoice` 更新为最新错选
3. 后续在练习中答对该题 → 错题集中该条记录消失（自动 resolve）
4. 同一个词错过 R / P 两个维度共 3 道题 → 错题集显示 1 个词组，展开看到 3 道题，折叠态展示两个维度 pill
5. 在错题集点单条「标记已掌握」→ 该题从列表消失，但同词的其他错题保留
6. 错题集为空 → 显示既有空状态文案
7. 文案分区遵守（除"标记已掌握"按钮外全部日语，含相对时间格式）
8. 听力汉字选择题（`listening_kanji`）选项保持裸汉字不注音

## 已知边界

- 用户在 Round1 与 Round2 内同一道题被重复出现，若先错后对：第二次答对会清除错题。这是预期行为。
- 答对自动 resolve 只在 review API 走通时生效；如果未来增加 cram 或其他答题入口，需要同步接入相同逻辑（届时再处理）。
- `wrongChoice` 只保留最近一次的错选，不保留历史，符合 brainstorming 决议（同题多次错算同一条）。

## 后续工作

完成本设计后，使用 `superpowers:writing-plans` 技能产出实施计划。
