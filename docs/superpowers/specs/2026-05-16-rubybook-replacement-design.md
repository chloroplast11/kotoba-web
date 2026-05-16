# 红宝书 N2 词表全量替换 — 设计文档

> 日期：2026-05-16
> 状态：Brainstorming 输出 / 等用户 review

---

## 1. 目标

将当前 DB 内的 450 个 N2 词 + 2320 道题，**全量替换**为从 Anki 红宝书牌组（`/N2/collection.anki2`）导出的 **2336 个词** + AI 重新生成的题目。同时配套精简 Word schema、重构 SRS 解锁逻辑、整合音频资源，并更新文档。

非目标（不在本次范围内）：

- 用户认证、N5/N1 扩展、AI 批改类题型 —— 维持现有 roadmap
- 用户进度迁移 —— dev 阶段直接清库

---

## 2. 数据源勘察结论

**`/Users/yuhang/kotobaWeb/N2/collection.anki2`**：SQLite，模板「红宝书卡牌」共 **2336 张**笔记（`mid=1452150778360`），7 个字段：

| 字段顺序 | 名称 | 样例 | 备注 |
|---|---|---|---|
| 0 | `Expression` | `相変わらず[あいかわらず]` | `汉字[假名]` 格式 |
| 1 | `声调` | `⓪` / `①` / `⓪③`（复合）| 带圈数字，可能出现复合 |
| 2 | `中文释义` | `<div>[副]依然，照旧</div>` | 含 HTML，开头有 `[词性]` 标签 |
| 3 | `例句` | `<div>△相変わらず忙しい毎日を送っている。/每天照旧过得很忙碌。</div>` | `△` 分割多句，`日文/中文` |
| 4 | `惯用/関係` | `<div>依然として（いぜんとして）⓪ [副]依然，依旧</div>` | 同义/相关词混合 |
| 5 | `同音` | 多数为空 | |
| 6 | `Pronunciation` | `[sound:hypertts-a4c4ca6...mp3]` | hash 引用 |

**`/Users/yuhang/kotobaWeb/N2/media`**：JSON，把磁盘上 `0/1/2/.../2330` 这种数字文件名映射回原 hash 文件名。

**`/Users/yuhang/kotobaWeb/N2/<id>`**：2331 个 MP3 文件，96kbps mono。

---

## 3. Schema 变更

### `Word` 表

```diff
  id               Int    @id        // 沿用 Int，存 Anki note id（13 位，安全范围内）
  word             String
  furigana         String
- romaji           String
  meaningZh        String
- meaningEn        String
  level            Int
  pos              String
- frequency        String
- usageNotes       String
  exampleSentences String
  synonyms         String
- antonyms         String
- collocations     String
+ pitchAccent      String?           // 红宝石「声调」字段原样存（⓪①②③④ 或 ⓪③ 复合）
+ homophones       String?           // 红宝石「同音」字段
+ audioFile        String?           // public/audio/words/ 下的文件名
  qualityScore     Int?
  needsReview      Boolean @default(false)
```

注意：

- `id` 类型保持 `Int`。Anki note id 是 13 位（约 1.45×10¹²），远小于 JS `Number.MAX_SAFE_INTEGER` (2⁵³ ≈ 9×10¹⁵)，且 Prisma + SQLite 后端的 `Int` 实际是 64-bit INTEGER，足够承载，无需改 BigInt，从而避免 `wordId: number → bigint` 的大面积改造。
- `pos` 保留：从 `中文释义` 字段开头的 `[副]` / `[名•自他動3]` / `[名]` 等正则抽。抽不到记 `""`，标记 `needsReview=true`。

### `AppSettings` 表

```diff
- practiceLowFreqUsage Boolean @default(false)
```

其他字段不变。

### 其他表

`Question` / `UserWordState` / `WrongAnswer` / `DailySession` 结构不变（`wordId` 保持 `Int`）。

---

## 4. SRS / 队列逻辑重构

### `src/lib/srs.ts`

```diff
- export function isDimensionUnlocked(
-   dim: DimKey,
-   dimStates: Record<DimKey, SrsData | null>,
-   frequency: string,
-   settings: Pick<AppSettingsData, "practiceLowFreqUsage">
- ): boolean
+ export function isDimensionUnlocked(
+   dim: DimKey,
+   dimStates: Record<DimKey, SrsData | null>
+ ): boolean
```

解锁规则简化为：

- `R` 始终解锁
- `P`：`R.stability >= UNLOCK_THRESHOLD` (= 3 天)
- `U`：`P.stability >= UNLOCK_THRESHOLD` (= 3 天)

### `src/lib/queue.ts`

`buildTodayQueue` 删除按 frequency 切池（高/中/低）的逻辑。新词来源变为单一池，按 `id`（即 Anki note id 顺序，红宝书原书章节顺序）取前 N 个未学的。

### `src/lib/constants.ts`

`UNLOCK_THRESHOLD = 3` 保留。frequency 相关常量（如有）删除。

### Stores

- `src/store/settingsStore.ts`：删 `practiceLowFreqUsage`
- `src/components/SettingsPage`（或 `/settings` 页面对应组件）：删低频词 U 维度切换的 UI

---

## 5. UI 渲染调整

原则：**字段存在则展示，缺失则段落整体不渲染**（不显示 "暂无 / —"）。

需要扫一遍以下组件，移除对已删字段的引用，并对新增字段加上展示（前两个）/ 透传（音频）：

| 组件位置 | 删除 | 新增 |
|---|---|---|
| `src/components/learn/*`（单词学习页）| meaningEn / antonyms / collocations / usageNotes / frequency 徽章 | pitchAccent（在假名旁标记）/ homophones 段落 / audio 播放控件接入 `audioFile` |
| `src/components/library/*` | 同上 | 同上（按需）|
| 首页今日队列卡 | frequency 颜色/分组 | — |
| Library 词条 drawer | 同上 | 同上 |
| Practice 题目卡 | — | 音频题统一从 `audioFile` 读 |

具体引用点开 plan 时再扫。

---

## 6. 数据导入 Pipeline（重构 `phase5/`）

### 新流程

```
phase5/
├── import_anki.py         (新) collection.anki2 → n2_words.json
├── import_audio.py        (新) media JSON + N2/<id> 文件 → public/audio/words/
├── generate_q.py          (改) 输入字段精简，prompt 重写
├── validate_q.py          (基本不动) Qwen 验证题目
├── split_json.py          (不动)
└── prompts/
    └── generate_questions.txt   (重写)
```

**删除文件**：

- `phase5/enrich.py` & `prompts/enrich_word.txt`
- `phase5/validate_enrich.py` & `prompts/validate_word.txt`
- `phase5/backfill_lk.py` & `prompts/backfill_lk.txt`（红宝石每词有音频，`listening_kanji` 在 `generate_q` 中作为必出题型，不再 backfill）

`phase5/run.py` 同步更新 `STEPS` / `ORDER` 字典。

### Step 1 — `import_anki.py`

读 SQLite，对每条 note：

1. 拆 `Expression` → `word` + `furigana`（正则 `^(.+?)\[(.+?)\]$`，未匹配则记 failed）
2. `声调` → `pitchAccent`（原样字符串，空串当 `null`）
3. `中文释义`：
   - BeautifulSoup 剥 HTML
   - 开头 `[xxx]` 抽出来 → `pos`（多个标签如 `[名•自他動3]` 整体存）
   - 余下文本 → `meaningZh`
4. `例句`：
   - 剥 HTML
   - 按 `△` 切句，每句按**首个** `/` 拆 `日文 / 中文`
   - 输出 JSON array `[{"jp": "...", "zh": "..."}, ...]`
5. `惯用/関係` 剥 HTML → `synonyms`（保留原始字符串，因红宝石本身就是混合内容）
6. `同音` 剥 HTML → `homophones`
7. `Pronunciation` 正则 `\[sound:(hypertts-[a-f0-9]+\.mp3)\]` → `audioHash`（暂存，下一步用）
8. `note id` → `id`（int64）

输出 `n2_words.json`（按 note id 升序）。

### Step 2 — `import_audio.py`

1. 读 `N2/media` JSON 得到 `{disk_id: original_filename}` 映射；建反向 `{hypertts-hash.mp3: disk_id}`
2. 遍历 `n2_words.json`，每条 `audioHash` 查反向映射
3. 拷贝 `N2/<disk_id>` → `public/audio/words/<word_id>.mp3`
4. 写回 `n2_words.json` 的 `audioFile = "<word_id>.mp3"`
5. **覆盖** `public/audio/words/` 下旧 TTS 文件（用户选择 A）
6. `public/audio/manifest.json` 同步更新

`public/audio/sentences/` 保留不动（红宝石无例句音频，沿用 msedge-tts 生成）。

### Step 3 — `generate_q.py`（改）

- 输入：`n2_words.json`（新格式，缺 `meaning_en / frequency / antonyms / collocations / usage_notes`）
- prompt 模板 `prompts/generate_questions.txt` 重写，仅基于：`word / furigana / pitchAccent / meaningZh / pos / exampleSentences / synonyms / homophones`
- 输出：每词 4–8 题，必出一道 `listening_kanji`，维度覆盖 R/P/U
- 输出文件改名：`n2_questions.json` 保持（产物文件名不变，避免外围引用面波及）

### Step 4 — `validate_q.py`

字段层面无变化。但因为新词量从 450 → 2336，**预算估算**：

- 题目总数 ~11000+（按平均 5 题/词）
- 验证调用按当前并发与单价线性放大，事先确认 budget

### Step 5 — `split_json.py`

不动。

### `phase5/db_writer.py`

`upsert_word` SQL 重写，去掉 5 字段、加 3 字段、id 类型变 BigInt。

---

## 7. 现有 DB / Migrations 处理

走 **`prisma migrate reset`** 直接清库（用户已确认）。

新增 migration：`<timestamp>_rubybook_replacement`

- `Word`：drop 6 列（`romaji` / `meaningEn` / `frequency` / `usageNotes` / `antonyms` / `collocations`）+ add 3 列（`pitchAccent` / `homophones` / `audioFile`）
- `AppSettings`：drop 1 列（`practiceLowFreqUsage`）
- 外键表 `wordId` 类型不变

然后 `pnpm db:seed`（或 `prisma db seed`）跑新版 `seed.ts`，从 `n2_words.json` + `n2_questions.json` 导入。

---

## 8. 文档更新

### `docs/PRODUCT.md`

- §「低频词 U 维度默认锁死」条目删除（第 49 行附近）
- §「低频词只有 Round 1」段删除（第 112 行附近）
- 词表规模：450 → 2336
- 显示字段说明：新增「声调（pitch accent）展示在假名旁」「同音词作为辅助辨析」
- 移除 `meaningEn` / `antonyms` / `collocations` / `usageNotes` 字段相关章节

### `README.md`

- 项目状态描述更新词表规模
- 提到音频源来自红宝书 hypertts mp3
- 安装/启动步骤如有引用旧 phase5 步骤的，同步删除

### `README_PHASE5.md`

- 重写 pipeline 章节：删 enrich / validate-enrich / backfill-lk，加 import-anki / import-audio
- 更新使用示例与依赖说明

### `README_PIPELINE.md`

- 如涉及字段说明，同步删/加

### `CLAUDE.md`

- 「强制规则」中提到 frequency 的部分（若有）调整
- 「已知技术债」清单复核（部分项目可能因本次重构消解）

---

## 9. 执行顺序建议（写 plan 时细化）

为避免一次提交太大，建议拆 4 个 PR / commit batch：

1. **Batch A — Schema + Import**：prisma migration + seed.ts 改 + phase5 新增 import-anki/import-audio + 生成 `n2_words.json` + 拷贝音频。此时**词进了库但 Question 表为空**。
2. **Batch B — 逻辑重构**：SRS / queue / settings / stores 改造。dev.db 此时跑起来，不出题就能浏览 Library。
3. **Batch C — UI 改造**：组件层去字段 / 加字段。
4. **Batch D — 题目 AI 重生成**：generate-q 改造 + prompt 重写 + 跑全量 + validate。这块单独，因为耗时长。

文档（PRODUCT/README）随对应 batch 增量更新，最后一次过一遍。

---

## 10. 风险 / 待验证

- **声调复合格式**：观察到 `⓪③` 类，需扫一遍全表确认还有什么其他形式（`⓪/①`？`①、②`？），决定要不要在 schema 层做归一化。先按 `String` 原样存兜底。
- **HTML 残留**：剥 HTML 的实现要稳定（部分 note 有 `<div>` 嵌套 / `<br>` / 空 `<div>`）。建议用 BeautifulSoup 而非正则。
- **空字段比例**：观察到「同音」字段多数为空，「惯用/関係」也常空。`String?` nullable 兜底。
- **POS 抽取失败**：用正则 `^\s*\[([^\]]+)\]` 抽。失败比例若高，可批量人工审核，或让 AI 在 generate-q 阶段顺便回填。
- **id 数值跳变**：原 id 是 1~450 顺序号，新 id 是 13 位 Anki note id；URL `/learn/[id]` 等地方对接收任意整数应该已经鲁棒，但 seed 调试/手测 URL 时会更难输入。
- **题目重生成成本**：~2336 词 × 5 题 ≈ 11700 次 LLM call（按当前 DeepSeek 价位估算几美刀级），跑前 `--limit` 抽样验证 prompt 效果。

---

## 11. 验收标准（done 的定义）

- [ ] `prisma migrate reset` 后 schema 与本文档 §3 一致
- [ ] `n2_words.json` 含 ~2336 条，关键字段非空率 > 95%
- [ ] `public/audio/words/<id>.mp3` 数量 ≈ 词数（缺失数 < 5）
- [ ] `n2_questions.json` 每词 4–8 题，含 listening_kanji
- [ ] 单元测试：`isDimensionUnlocked` 新签名、`buildTodayQueue` 无频率分池
- [ ] 多日模拟 Day 1 → Day 30 跑通（CLAUDE.md §「多日行为模拟」）
- [ ] PRODUCT.md / README.md / README_PHASE5.md / CLAUDE.md 已更新

---

_文档结束。等用户审。_
