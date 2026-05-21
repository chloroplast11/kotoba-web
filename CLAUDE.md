# CLAUDE.md

> 给 Claude Code 的协作指南。修改本仓库代码前请先通读。

---

## 项目概览

「言葉帖」是一款日语单词学习 Web 应用。当前处于 **Phase 2**——Next.js 15 + TypeScript + Tailwind + Prisma + SQLite，约 2335 个 N2 词汇（红宝书全量）已入库。

详细的产品愿景、设计哲学、功能规划见 `docs/PRODUCT.md`。这份文档只讲**改代码时要遵守什么**。

---

## 当前文件结构

```
kotobaWeb/
├── src/
│   ├── app/               # Next.js App Router（页面 + API Routes）
│   ├── components/        # React 组件（layout / home / learn / practice / library）
│   ├── lib/               # 核心逻辑：srs.ts · queue.ts · db.ts · constants.ts · time.ts
│   ├── store/             # Zustand stores（sessionStore · settingsStore · devStore）
│   └── types/             # TypeScript 类型（domain.ts）
├── prisma/
│   ├── schema.prisma      # 数据模型（Word · Question · UserWordState · DailySession · AppSettings）
│   └── seed.ts            # 从 JSON 导入数据
├── dev.db                 # SQLite 数据库
├── index.html             # 原型文件（保留参考，不再修改）
├── n2_words.json          # ~2335 个 N2 词汇（来自 Anki 红宝书牌组，seed 数据源）
└── n2_questions.json      # 题目（由 phase5/generate-q 生成，seed 数据源）
```

---

## 强制规则（违反 = 破坏产品定位）

### 规则 1：UI 文案分区（日语区 / 中文区）⭐

文案按"使用场景"分两区，新增文案前先判断属于哪一区：

**日语区（必须日语）**
- 首页 / 学习页 / 练习页 / Round2 / 单词帖卡面 / 今日总结 —— 学习与品牌区
- 顶部导航 Masthead（首页 / 学ぶ / 単語帳 / 今日のまとめ / 設定 等导航文字）
- 运行时提示：加载中、错误提示、空状态、tooltip —— 属于学习氛围

**中文区（必须中文）**
- 设置页 `/settings`（含「开发者模式」）—— 配置/管理动作
- Library 词条 drawer 内的管理动作（3 档掌握度按钮、关闭、打开学习页等）
- 内部错误页 / 调试页（若有）

**数据字段（与上述无关）**
- `meaningZh` / 例句的中文翻译 —— 本来就是中文
- R / P / U 缩略字母 —— **首次出现必须配日文全称（認識・産出・運用）**

判断原则：「面向用户学习」用日语；「面向用户配置/管理产品」用中文。详见 `docs/PRODUCT.md` §4。

### 规则 2：所有汉字必须配假名注音 ⭐

凡是出现日语汉字的地方（题干、选项等），必须配假名。

**实现方式（任选）**：

方式 A（括号注音）：
```
「題名（だいめい）」を使った文を作りなさい
```

方式 B（HTML ruby 标签，适合长句）：
```html
<ruby>題名<rt>だいめい</rt></ruby>を使った文を作りなさい
```

**例外**：以下情况无需注音：
- 平假名、片假名词
- **所有 UI chrome 元素**：按钮、标签、导航、标题、状态提示、空状态文案等固定字符串
- **`listening_kanji` 题型的 4 个选项**：为了不让用户"看着假名做听力题"，该题型选项刻意保留为裸汉字（题干、解析仍按规则正常注音）。
- **例文（`exampleSentences`）**：红宝书替换后的数据源不再提供 ruby 注音，例文以裸文本展示。

**必须注音的内容仅限数据库来源**：题干（`question` 字段）、选项、同音語（`homophones`）等 DB 字段内容。

### 规则 3：项目内生成的 md、txt 等文件用中文，UI 文案才用日语

### 规则 4：等级（level）不要硬编码

显示等级时用 `word.level` 动态拼接（`N${word.level}`），不要写死 "N2"。等级相关设置走 `AppSettings.activeLevels`。

### 规则 5：时间相关计算用 `getCurrentTime()` 而非 `Date.now()`

为了支持开发者模式时间快进，所有当前时间判断必须经过：

```typescript
// src/lib/time.ts
getCurrentTime(): number   // Date.now() + offset
getCurrentDate(): Date
todayDateString(): string  // "YYYY-MM-DD"
```

时间偏移量由 `devStore.timeOffset` 控制，通过 `setTimeOffset()` 设置。

---

## 架构要点

### SRS（ts-fsrs v5）

核心封装在 `src/lib/srs.ts`：
- `scheduleReview(state, rating, now)` — 答题后更新，返回 DB 更新字段
- `getMasteryLevel(state)` — 0=新/锁定，1=学习中，2=精通（stability ≥ 7）
- `isDimensionUnlocked(dim, dimStates)` — 解锁判定

**解锁阈值**（`UNLOCK_THRESHOLD = 3`，改了同步更新 `docs/PRODUCT.md`）：
```
R 始终解锁
P：R.stability >= 3 天
U：P.stability >= 3 天
```

### 队列构建

纯函数 `buildTodayQueue()` 在 `src/lib/queue.ts`，接受数据作为参数（不读全局状态），方便测试。改动时维护：
- Round 1 → Round 2 题目唯一性
- 维度交错（R/P/U 轮转）
- 新词在 Learn 页之前不能进 Practice

### 路由

```
/              → 首页（今日队列）
/learn/[id]   → 单词学习页
/practice     → 练习页
/round2       → 第二回过渡页
/library      → 单词帖
/summary      → 今日总结
/api/*        → API Routes（settings · session/today · review · words）
```

### CSS

- CSS 变量集中在 `src/app/globals.css` 的 `:root`，禁止在组件里写死颜色
- 字体堆栈固定，不要引入新字体
- 响应式断点：`@media (max-width: 720px)`

---

## 改动 checklist（每次提交前自检）

- [ ] 涉及当前时间的判断走 `getCurrentTime()` 了吗？
- [ ] R/P/U 字母出现的地方有日文说明吗？
- [ ] 等级数字是否硬编码？应走 `word.level` 或 `settings.activeLevels`
- [ ] 改了 SRS 解锁阈值？是否同步更新了 `PRODUCT.md`？
- [ ] 改了队列逻辑？跑一遍多日模拟（见下方）

---

## 多日行为模拟（验证 SRS / 队列时用）

修改 `buildTodayQueue` 或 SRS 时，最少要跑一次 Day 1 → Day 4 → Day 12 → Day 30 的模拟，确保：

- Day 1：4 个新词（按 word.id 升序取前 N），Round 1 + Round 2 共 8 题
- Day 4：Day 1 词 R 维度第一次复习；新词配额取剩余 id 靠前的词
- Day 12：Day 1 词的 P 维度首次解锁（NEW-DIM）
- Day 30：U 维度开始出现，混合多种题型

用 `devStore.advanceDay(n)` 快进时间，或直接操作 `setTimeOffset()`。

---

## 已知技术债

1. **大量汉字缺假名注音**——题库中 `question` 字段有 ruby，但 `explanation` 字段部分缺失
2. **`Date.now()` 仍散布在部分组件**——快进功能开发时一并改
4. **Library 页缺少等级筛选器**——多等级支持时必加
5. **Practice 页面刷新后 Zustand 状态丢失**——需从 `/api/session/today` 重新加载
6. **声调（pitchAccent）和同音語（homophones）的 UI 展示**——字段已入库，Learn 页展示尚待实现

---

## 当前不该做的事

- 不要修改 `index.html`——保留作原型参考
- 不要做用户认证——Phase 6 才考虑
- 不要做 AI 批改题（造句、翻译）——Phase 5 才考虑
- 不要先扩到 N5/N1 数据——先把 N2 体验跑通

---

## 沟通约定

修改时如果对设计意图不确定，先看 `PRODUCT.md`。如果 PRODUCT.md 没说，问用户。**不要默默做选择**——例如：

- 加一个新功能但不知道放在哪个导航位置 → 问
- 改了一个文案但不确定语气 → 问
- 看到一处看似 bug 但可能是设计 → 问

特别是与"静謐"原则可能冲突的添加（动画、提示音、连胜数字、彩色徽章等），一定要先问。

---

## 通用代码规范

- 嵌套不超过 4 层
- 单文件不超过 400 行，超了就拆
- 不写注释，除非 WHY 非常不显然
- 输出追求简洁，但推理过程必须详尽
