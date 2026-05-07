# CLAUDE.md

> 给 Claude Code 的协作指南。修改本仓库代码前请先通读。

---

## 项目概览

「言葉帖」是一款日语单词学习 Web 应用。当前处于**视觉与交互原型阶段**——单文件 HTML，纯前端，localStorage 持久化。

详细的产品愿景、设计哲学、功能规划见 `PRODUCT.md`。这份文档只讲**改代码时要遵守什么**。

---

## 当前文件结构

```
kotobaWeb/
├── index.html       # 原型本体，单文件包含 HTML + CSS + 种子数据 + 主逻辑
├── PRODUCT.md       # 产品文档（设计意图）
├── CLAUDE.md        # 本文档（开发协作约定）
└── README.md        # 开发者快速上手
└── n2.json         # 待富化n2单词列表
```

`index.html` 内有两个 `<script>` 块：
1. **第一个**：`SEED_WORDS` 与 `SEED_QUESTIONS` 数据（约 8 个词、45 道题）
2. **第二个**：状态管理、SRS 调度、路由、所有视图渲染函数

迁移到正式项目时（Phase 2），结构会拆解到 Next.js 项目里，但当前阶段不要拆。

---

## 强制规则（违反 = 破坏产品定位）

### 规则 1：所有 UI 文案使用日语 ⭐

按钮、标题、提示文字、tooltip、空状态、错误提示——全部日语。

**唯一允许的非日语**：
- 单词的中文/英文释义（`meaning_zh` / `meaning_en` 字段内容）
- 例句的中文翻译
- R / P / U 等缩略字母 —— **但首次出现必须配日文全称（認識・産出・運用）**

❌ 不要写：
```html
<button>Start today's session</button>
<h1>Today, you'll meet 4 new words</h1>
```

✅ 要写：
```html
<button>本日の学習を始める</button>
<h1>今日は <em>4</em> 個の新しい言葉に出会います</h1>
```

**注意**：当前原型的 `index.html` 里仍有少量英文 UI 文案（如 hero 区域），属于历史遗留，需要在下次大改时清理。新增代码不允许新增英文 UI 文案。

### 规则 2：所有汉字必须配假名注音 ⭐

凡是出现日语汉字的地方（题干、选项、解析、按钮文字、提示语等），必须配假名。

### 规则 3：项目内生成的md,txt等用中文，UI上的文案才有日语

**实现方式（任选）**：

方式 A（括号注音，简单）：
```
「題名（だいめい）」を使った文を作りなさい
```

方式 B（HTML ruby 标签，更优雅，适合长句）：
```html
<ruby>題名<rt>だいめい</rt></ruby>を使った文を作りなさい
```

**例外**：
- 平假名、片假名词无需注音（本来就是假名）
- 已确认低于用户当前学习等级的词可考虑省略（例如 N3 用户学 N2 时，N5 词不必再注）—— 但当前阶段没有等级判断逻辑，**所有汉字都要注**

**当前状态**：种子数据中很多题干和选项的汉字没有假名注音，这是已知问题，需要修复。修题库或加新题时务必加注。

### 规则 3：R / P / U 必须明确暴露给用户 ⭐

R、P、U 是产品差异化的核心，但用户不会自己知道这是什么。所有出现 R/P/U 的位置必须有日文说明：

```javascript
const dimNames = {
  R: '認識',  // Recognition
  P: '産出',  // Production
  U: '運用'   // Usage
};

const dimDescriptions = {
  R: '見て・聞いて意味が分かる',
  P: '意味から正しい言葉を引き出せる',
  U: '文の中で正しく使える'
};
```

UI 上：
- Practice 页的 dimension-pill 必须显示日文名（已实现）
- Library 页的 R/P/U 进度条必须能 hover/tap 显示说明
- 首页或 Library 必须有"三次元方法"的常驻说明区
- Onboarding 页（待实现）必须用一整页讲清楚

**绝不允许**只显示一个孤零零的 "R" 字母。

### 规则 4：等级（level）不要硬编码

当前 `level: 2` 散布在数据里，UI 上"N2"也是写死的。后续要支持 N5–N1 全等级。

新代码要做的：
- 等级相关计算走 `state.settings.activeLevels`（数组，例 `[2]` 或 `[2, 3]`）
- 显示等级时用 `${'N' + word.level}` 而非硬编码
- 新词配额按等级配置：`state.settings.dailyNewWordsByLevel = { 2: 4, 3: 2 }`
- 数据生成脚本（Phase 1）要支持任意等级，不要写死 N2

### 规则 5：时间相关计算用 `getCurrentTime()` 而非 `Date.now()`

为了支持"快进到第二天"功能（开发者模式），所有跟当前时间相关的判断必须经过统一接口：

```javascript
// state 中维护
state.timeOffset = 0;  // 毫秒

function getCurrentTime() {
  return Date.now() + state.timeOffset;
}
```

替换所有 `Date.now()`、`new Date()` 中的当前时间计算。例外：纯展示用的本地化日期格式可以直接用 `new Date(getCurrentTime())`。

**注意**：当前代码大量使用 `Date.now()`，这是已知技术债。重构时优先处理。

---

## 状态管理

### State 结构

```javascript
state = {
  wordState: {
    [wordId]: {
      R: { stability, difficulty, last_review, next_due, reps, lapses },
      P: { ...同上 },
      U: { ...同上 },
      learned_at  // 首次学习的时间戳
    }
  },
  todayQueue: [{ wordId, dim, questionId, round?, isNew?, isNewDim? }],
  todayCursor: 0,
  todayStarted: ISOString,
  todayResults: [{ wordId, dim, correct, timestamp }],
  settings: {
    practiceLowFreqUsage: false,
    dailyNewWords: 4,
    activeLevels: [2],          // 待加：当前学习的等级数组
    dailyNewWordsByLevel: {}    // 待加
  },
  timeOffset: 0,                // 待加：开发者模式时间快进
  totalReviews: 0,
  streak: 0
}
```

### 持久化

通过 `loadState()` / `saveState()` 读写 localStorage。`STORAGE_KEY = 'kotoba-cho-v1'`。

**版本升级提示**：State schema 变更时要：
1. 改 `STORAGE_KEY` 后缀（如 v2），强制清除旧状态；或
2. 在 `loadState` 里加 migration 逻辑把旧 schema 升上来

---

## SRS 算法

简化的 FSRS-like 实现，不是真正的 FSRS。Phase 2 迁移到 Next.js 时换成 `ts-fsrs` 库。

关键函数：
- `newSrs()` — 创建初始 SRS 记录
- `updateSrs(srs, correct, quality)` — 答题后更新（quality 0=Again, 1=Hard, 2=Good, 3=Easy）
- `masteryLevel(srs)` — 0=新/锁定，1=学习中，2=精通
- `isDimensionUnlocked(wordId, dim)` — 软依赖解锁判断

### 解锁阈值

```javascript
// R 始终解锁
// P 解锁条件：R.stability >= 3 天
// U 解锁条件：P.stability >= 3 天 且 (词非低频 OR 用户已开启低频 U)
```

修改阈值时务必同时更新 `PRODUCT.md` 与 `README.md`，三处保持一致。

---

## 队列构建逻辑

`buildTodayQueue()` 负责生成今日队列。结构：

1. **复习项**：从 `state.wordState` 中找已到期的 (词, 维度) 对 + 新解锁但未练习的维度（`isNewDim`）
2. **新词 Round 1**：每个新词配一道 R 题，`isNew: true, round: 1`
3. **新词 Round 2**：高/中频词的 Round 2，配**不同的** R 题，顺序打乱
4. **题目去重**：`pickQuestion` 会避免今日队列内重复使用同一题
5. **维度交错**：复习项按 R/P/U 轮转排列，避免连续同维度疲劳

修改这块时要同时维护：
- 不破坏 Round 1 → Round 2 的题目唯一性
- 不破坏维度交错
- 新词在 Learn 页之前不能进 Practice

---

## 视图与路由

```javascript
// 注册的视图
'home' | 'learn' | 'practice' | 'round2_intro' | 'library' | 'summary'
```

每个视图对应一个 `render*()` 函数，由 `render(params)` 路由分发。

`navigate(view, params)` 切换视图，会重新渲染整个 `#app` 容器。

**注意**：当前没有真正的 URL 路由，刷新页面会回到 home。Phase 2 迁移到 Next.js 时用 App Router 解决。

---

## CSS 约定

- CSS 变量集中在 `:root`，禁止在组件里写死颜色
- 用 BEM-like 命名（`.lib-card`、`.lib-card-word`、`.lib-card-meaning`）
- 字体堆栈固定，不要在新代码里引入新字体
- 响应式断点：`@media (max-width: 720px)` 一道，已经在文件底部统一处理

---

## 改动 checklist（每次提交前自检）

- [ ] 涉及当前时间的判断走 `getCurrentTime()` 了吗？（如果该函数还没引入，是不是该顺便引入？）
- [ ] R/P/U 字母出现的地方有日文说明吗？
- [ ] 等级数字硬编码了吗？应该走 `state.settings.activeLevels`
- [ ] State schema 变了吗？是否需要 migration？
- [ ] 改了 SRS 阈值？是否同步更新了 PRODUCT.md / README.md？
- [ ] 改了路由或队列逻辑？跑一遍多日模拟（参考下方）

---

## 多日行为模拟（验证 SRS / 队列时用）

修改 `buildTodayQueue` 或 SRS 时，最少要跑一次 Day 1 → Day 4 → Day 12 → Day 30 的模拟，确保：

- Day 1：4 个高频新词，Round 1 + Round 2 共 8 题
- Day 4：Day 1 高频词 R 维度第一次复习；新词配额转移到剩余高/中频
- Day 12：Day 1 词的 P 维度首次解锁（NEW-DIM）
- Day 30：U 维度开始出现，混合多种题型

模拟脚本可以用 Node 跑（参考之前的 commit history），关键是手动覆盖 `Date.now`（或新引入的 `getCurrentTime`）来快进时间。

---

## 已知技术债

按重要度排序：

1. **UI 部分英文残留**——主要在 home 页的 hero 文案、Library 页的副标题。次重大改时统一清理为日文。
2. **大量汉字缺假名注音**——种子题库（context_inference、wrong_usage）的题干和选项是高优先级补的对象。
3. **`Date.now()` 全局散布**——快进功能开发时一并改成 `getCurrentTime()`。
4. **R/P/U 缺乏 hover/tap 说明**——目前只在 Practice 页 Pill 上显示日文名，Library 页的 R/P/U 进度条标签没说明。
5. **Library 页缺少等级筛选器**——当前所有 N2 词混在一起，多等级支持时必加。
6. **`level` 硬编码 N2**——见规则 4。
7. **状态 schema 没版本号**——Phase 2 迁移时要加。

---

## 当前不该做的事

- 不要把 `index.html` 拆成多文件——当前阶段单文件是有意为之，便于分发
- 不要引入构建工具（Vite / Webpack 等）——Phase 2 迁移 Next.js 时一起做
- 不要引入 React、Vue 等框架——同上
- 不要做用户认证——Phase 5 才考虑
- 不要做 AI 批改题（造句、翻译）——Phase 4 才考虑
- 不要先扩到 N5/N1 数据——先把 N2 数据管线跑通（Phase 1）

---

## 沟通约定

修改时如果对设计意图不确定，先看 `PRODUCT.md`。如果 PRODUCT.md 没说，问用户。**不要默默做选择**——例如：

- 加一个新功能但不知道放在哪个导航位置 → 问
- 改了一个文案但不确定语气 → 问
- 看到一处看似 bug 但可能是设计 → 问

特别是与"静謐"原则可能冲突的添加（动画、提示音、连胜数字、彩色徽章等），一定要先问。
