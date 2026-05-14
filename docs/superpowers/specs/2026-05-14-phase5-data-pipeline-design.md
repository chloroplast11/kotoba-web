# Phase 5 数据管线设计文档

> 2026-05-14
> 状态：设计阶段，待用户确认后产出实现计划

---

## 1. 目标

将 MVP 阶段的 450 个 N2 词扩展到 N2 全量 1831 词（新增 1382 词），并对**全量数据**（含 MVP 旧数据）进行 LLM 双模型交叉验证，作为 Phase 6 上线的数据门槛。

非目标：
- 不做 N3 / N1 等其他等级
- 不引入新题型（仅在新词上覆盖既有题型 + listening_kanji）
- 不做 schema 大改（仅加 2 个字段）

---

## 2. 核心约束（用户已确认的硬约束）

1. **不删 MVP 数据**：现有 450 词的富化数据和 2320 道题完整保留，新词在其上追加
2. **MVP 数据也需验证**：跑完后 MVP 也要被 LLM 验证一遍，产报告
3. **断点续传**：脚本能随时 Ctrl+C，重跑从下一条继续
4. **同时写 JSON 和 DB**：每生成一条立刻入 `dev.db`，不通过 Prisma seed.ts（那个会 deleteMany 清空学习进度）
5. **真正异源双模型**：生成 = DeepSeek，验证 = Qwen（不同训练谱系）
6. **OpenRouter 中国信用卡**：不能用 OpenAI / Anthropic / Google 系模型
7. **用户手动执行**：只交付脚本，不实际跑

---

## 3. 模型选型

| 角色 | 模型 | OpenRouter ID | 单价（输入/输出 per 1M tokens, 约值） |
|------|------|---------------|-------|
| 生成 | DeepSeek V4 Flash | `deepseek/deepseek-v4-flash` | $0.07 / $0.28 |
| 验证 | Qwen 2.5 72B Instruct | `qwen/qwen-2.5-72b-instruct` | $0.30 / $0.40 |

两者 model ID 均通过环境变量 `GENERATOR_MODEL` / `VALIDATOR_MODEL` 覆盖，便于切换。

---

## 4. 数据流

```
n2.json (1831 词)
    │
    ├─ 已富化 450 词 → 保留 in n2_enriched.json
    │
    └─ 待富化 1382 词
              │
              ▼
        ┌─────────────────┐
        │ Step 1: enrich  │ DeepSeek 富化 → n2_enriched.json (追加) + DB Word 表 upsert
        └─────────────────┘
              │
              ▼
        ┌──────────────────────┐
        │ Step 2: validate_enr │ Qwen 验证富化质量 → Word.qualityScore / needsReview
        └──────────────────────┘
              │
              ▼
        ┌────────────────────┐
        │ Step 3: generate_q │ DeepSeek 生成 6 题/词 (含 listening_kanji)
        └────────────────────┘ → n2_questions.json (追加) + Question 表 upsert
              │
              ▼
        ┌────────────────────┐
        │ Step 4: backfill_lk│ DeepSeek 给 MVP 450 词补 listening_kanji
        └────────────────────┘ → n2_questions.json (追加) + Question 表 upsert
              │
              ▼
        ┌────────────────────┐
        │ Step 5: validate_q │ Qwen 独立答题验证 → Question.qualityScore / needsReview
        └────────────────────┘
              │
              ▼
        ┌────────────────────┐
        │ Step 6: split_json │ 按维度切分 n2_questions.json
        └────────────────────┘ → n2_questions_R/P/U.json
```

每个 step 完整跑完后才进下一步。中间 Ctrl+C 不会丢数据。

---

## 5. 目录结构

```
kotobaWeb/
├── phase5/
│   ├── __init__.py
│   ├── run.py                 # 主入口 `python3 phase5/run.py <step> [--resume]`
│   ├── enrich.py              # Step 1
│   ├── validate_enrich.py     # Step 2
│   ├── generate_q.py          # Step 3
│   ├── backfill_lk.py         # Step 4
│   ├── validate_q.py          # Step 5
│   ├── split_json.py          # Step 6 (不调 LLM，纯本地)
│   ├── llm_client.py          # 共用：OpenRouter wrapper + 重试 + 限流
│   ├── db_writer.py           # 共用：sqlite3 upsert helpers
│   ├── progress.py            # 共用：断点续传状态管理
│   └── prompts/               # 拷自原 prompts/ 但有修订
│       ├── enrich_word.txt
│       ├── validate_word.txt
│       ├── generate_questions.txt
│       ├── backfill_lk.txt    # 新：只生成 1 道 listening_kanji
│       └── validate_questions.txt
├── prisma/
│   └── migrations/
│       └── <timestamp>_phase5_quality_fields/
│           └── migration.sql  # 加 qualityScore / needsReview
└── docs/superpowers/specs/
    └── 2026-05-14-phase5-data-pipeline-design.md (本文档)
```

旧的 `enrich_words.py` / `validate_words.py` / `generate_questions.py` / `validate_questions.py` / `pipeline.py` 保留作参考，**不删**（用户可对比修订内容）。

---

## 6. Schema 变更

新增字段：

```prisma
model Word {
  // ... existing fields
  qualityScore Int?       // 0-100, null = 未验证（MVP 老数据初始 null）
  needsReview  Boolean    @default(false)
}

model Question {
  // ... existing fields
  qualityScore Int?
  needsReview  Boolean    @default(false)
}
```

迁移命令（脚本里不自动跑，用户手动执行）：
```bash
npx prisma migrate dev --name phase5_quality_fields
```

跑了迁移后，Python 脚本 upsert 时才会写这两列。

---

## 7. 共用模块设计

### 7.1 `llm_client.py`

```python
class LLMClient:
    def __init__(self, model: str, concurrency: int = 8, rate_limit_qps: float = 8.0)
    def call(self, prompt: str, *, max_retries=3, timeout=90) -> dict | list  # 自动 strip ```json
    def call_many(self, prompts: list, *, progress_cb=None) -> Iterator[(idx, result_or_err)]
```

- 单一 OpenRouter `OpenAI(base_url=...)` client
- 内部 `ThreadPoolExecutor(max_workers=concurrency)` + `Semaphore` 限流
- 失败重试：指数退避（1s → 2s → 4s），429 / 5xx / JSONDecodeError 都重试
- 重试 3 次仍失败 → 抛 `LLMError`，调用方决定是否继续
- 强 JSON 模式：失败时打印原始响应前 500 字符方便 debug

### 7.2 `db_writer.py`

```python
def upsert_word(conn, enriched: dict) -> None
def upsert_question(conn, question: dict) -> None
def set_word_quality(conn, word_id: int, score: int, needs_review: bool) -> None
def set_question_quality(conn, q_id: str, score: int, needs_review: bool) -> None
def max_word_id(conn) -> int  # 用来给新词分配 ID
```

- 用 `sqlite3` 标准库
- `INSERT OR REPLACE` 语义（即 upsert）
- 字段映射严格对照 `prisma/schema.prisma`（手工维护，如 `meaning_zh` → `meaningZh`）
- 单条写入即提交（不开大事务，确保 Ctrl+C 安全）

### 7.3 `progress.py`

```python
class Progress:
    def __init__(self, step_name: str)  # 读 .phase5_progress/<step>.json
    def is_done(self, key: str) -> bool
    def mark_done(self, key: str) -> None  # 原子写
    def done_count(self) -> int
    def reset(self) -> None  # --force 时清空
```

每 step 一个 progress 文件：`.phase5_progress/step1_enrich.json` 等，存已完成的 word_id / question_id 列表。

> ⚠ 进度文件比 JSON / DB 落后是允许的（最坏重做一条），反过来不行。所以顺序必须是：**写 JSON → 写 DB → 写 progress**。

---

## 8. 各步骤细节

### Step 1: `enrich.py` (DeepSeek)
- 读 `n2.json`，过滤已在 `n2_enriched.json` 中的词（按 `word` 字段）
- 待处理 ≈ 1382 词
- 新词 word_id = max(已有 word_id) + 1, 递增分配
- 每词调 LLM 一次，得到富化 dict
- atomic write n2_enriched.json (用 tmp + rename) → upsert Word 表 → mark progress
- prompt 文件：`phase5/prompts/enrich_word.txt`（基于原版，修订见 §10）

### Step 2: `validate_enrich.py` (Qwen)
- 输入：`n2_enriched.json` **全部 1832 词**（含 MVP 老数据）
- 对每个词调 Qwen 验证，得 `quality_score` + `issues`
- 写 `validation_report.json` 全量结果
- DB upsert `qualityScore` / `needsReview`（score < 90 → needs_review=true，score < 70 → 同时记入 `rejected_words.json` 待人工/重生成）
- `--retry-rejected` 子命令：把 rejected 重跑富化 1 次

### Step 3: `generate_q.py` (DeepSeek)
- 输入：`n2_enriched.json` 中**新增的 1382 词**（按 word_id > 450）
- 每词生成 6 题 = 5 道常规 + 1 道 listening_kanji
- prompt 沿用原 `generate_questions.txt`（修订见 §10）
- atomic write `n2_questions.json` (追加) → upsert Question 表 → mark progress

### Step 4: `backfill_lk.py` (DeepSeek)
- 输入：MVP 450 词（word_id ≤ 450）
- 每词只生成 1 道 listening_kanji 题
- prompt 文件：`phase5/prompts/backfill_lk.txt`（新写，从 generate_questions.txt 的 listening_kanji 段落抽出来）
- 写 `n2_questions.json` + upsert Question 表
- 题目 ID 格式：`word_<word_id>_listening_kanji_1`

### Step 5: `validate_q.py` (Qwen)
- 输入：`n2_questions.json` **全部约 10000+ 题**
- 按 word_id 分组批量验证（每批 ~6 题），prompt 让 Qwen 独立做题
- 写 `question_validation_report.json` + DB `Question.qualityScore` / `needsReview`
- `--sample-only PCT` 抽样模式（节省成本）
- `--dim R|P|U` 只验证某维度

### Step 6: `split_json.py`（纯本地，不调 LLM）
- 按 `dimension` 切 `n2_questions.json` → `n2_questions_R.json` / `_P.json` / `_U.json`
- 保留合并版 `n2_questions.json` 作为兜底
- 这一步可重复运行，无 LLM 成本

---

## 9. 主入口 `run.py`

```bash
python3 phase5/run.py enrich              # 跑 step 1
python3 phase5/run.py validate-enrich     # 跑 step 2
python3 phase5/run.py generate-q          # 跑 step 3
python3 phase5/run.py backfill-lk         # 跑 step 4
python3 phase5/run.py validate-q          # 跑 step 5
python3 phase5/run.py split-json          # 跑 step 6

python3 phase5/run.py all                 # 顺序跑 1-6（不推荐，建议每步看完报告再继续）

# 通用参数
--concurrency N        # 默认 8
--force                # 忽略 progress 重跑
--limit N              # 只处理前 N 条（试跑用）
--dry-run              # 不调 LLM，只打印计划
```

环境变量：
```bash
export OPENROUTER_API_KEY=sk-or-v1-...
export GENERATOR_MODEL=deepseek/deepseek-v4-flash      # 可覆盖
export VALIDATOR_MODEL=qwen/qwen-2.5-72b-instruct      # 可覆盖
export DATABASE_PATH=./dev.db                          # 可覆盖
```

---

## 10. Prompt 修订

基于阅读原 prompt 发现的问题：

### 10.1 `enrich_word.txt` 修订
- 加要求：动词必须标注「他动 / 自动」（pos 字段细化）
- 加 frequency 判定示例（high: 日常对话/新闻常见；medium: 阅读时常见；low: 专业/书面）
- 强调 `<ruby>` 标注完整（CLAUDE.md 规则 2）

### 10.2 `generate_questions.txt` 修订
**关键**：原 prompt 规则 3 写「太简单的汉字不用加假名」与 CLAUDE.md 规则 2 冲突。改为：
> "所有数据库字段内容（题干、选项、解析）中的汉字**必须全部**用 `<ruby>` 标注假名（小学一年级水平的汉字如「人」「日」可豁免）。`listening_kanji` 题的 4 个选项是唯一例外。"

### 10.3 `backfill_lk.txt` 新文件
从 `generate_questions.txt` 的 listening_kanji 专项要求段落抽出，输入只接受一个富化词，输出只一道题。

### 10.4 `validate_word.txt` 修订
分维度打分：
```json
{
  "scores": {"furigana": 0-100, "examples": 0-100, "translation": 0-100, "completeness": 0-100},
  "quality_score": 加权平均,
  ...
}
```
方便后续定位问题域。

### 10.5 `validate_questions.txt` 修订
微调：明确"独立答题指令"放在最前，避免 LLM 偷看 `correct_index` 后再自圆其说。

---

## 11. 错误处理 / 重试策略

| 错误类型 | 重试 | 兜底 |
|---------|------|------|
| 429 (Rate limit) | 指数退避，最多 5 次 | 抛错暂停整个 step，提示用户降低并发 |
| 5xx | 3 次重试 | 跳过单条，记入 `failed_items.json` |
| JSON 解析失败 | 1 次重试（temperature 略降）| 跳过单条，记入 failed |
| 超时 (>90s) | 1 次重试 | 跳过单条 |
| LLM 验证 quality_score < 70 (rejected) | step 2/5 不重生成 | 记入 `rejected_*.json` 等人工 |
| Step 5 中 Qwen 独立答题与 correct_index 不一致 | 不重试 | 标 critical issue，needsReview=true |

跑完一个 step 后输出统计报告（成功/失败/needs_review/rejected 数量 + 总成本估算）。

---

## 12. 成本与时间预估

| 步骤 | 调用次数 | 模型 | 估 token/次 | 估成本 | 并发=8 估时 |
|------|---------|------|-----------|-------|----------|
| 1. enrich | 1382 | DS Flash | ~2K | $0.6 | ~25min |
| 2. validate_enrich | 1832 | Qwen 72B | ~3K | $2 | ~30min |
| 3. generate_q | 1382 | DS Flash | ~4K | $1.5 | ~30min |
| 4. backfill_lk | 450 | DS Flash | ~1.5K | $0.2 | ~10min |
| 5. validate_q | ~1800 批 | Qwen 72B | ~5K | $5 | ~45min |
| 6. split_json | 0 | - | - | $0 | <1min |
| **合计** | - | - | - | **≈ $9-12** | **≈ 2.5h** |

如果 OpenRouter 上 Qwen-2.5-72B 实际价格更高，验证步骤成本可能涨到 $20-25。生成成本基本稳定。

并行假设：8 并发 ≈ 1 词/秒 吞吐。如果限流被触发，自动降到 4 并发。

---

## 13. 输出文件清单

| 文件 | 内容 | 大小估算 |
|------|------|--------|
| `n2_enriched.json` | 1832 词富化数据（含老 450 + 新 1382） | ~3.6 MB |
| `n2_questions.json` | 全量题目 ~10000+ 道 | ~18-22 MB |
| `n2_questions_R.json` | R 维度题目 | ~7 MB |
| `n2_questions_P.json` | P 维度题目 | ~5 MB |
| `n2_questions_U.json` | U 维度题目 | ~6 MB |
| `validation_report.json` | 富化验证全量报告 | ~5 MB |
| `question_validation_report.json` | 题目验证全量报告 | ~15 MB |
| `rejected_words.json` | 验证 rejected 的词，待人工 | <1 MB |
| `rejected_questions.json` | 验证 rejected 的题 | ~2 MB |
| `failed_items.json` | LLM 调用 3 次失败的项 | <500 KB |
| `dev.db` | 同步入库 | ~30 MB |

---

## 14. 风险与未决事项

1. **OpenRouter 模型可用性**：DeepSeek V4 Flash / Qwen 2.5 72B 的 `provider order` 配置可能需要调（不同 provider 速度差异大），脚本里默认不强制 provider，OpenRouter 自动路由
2. **listening_kanji 题目质量**：原 prompt 在 MVP 阶段没经过实战验证，跑 backfill 前建议先 `--limit 10` 试跑 10 个看效果
3. **MVP 老数据被验证后大量 needsReview 怎么办**：暂不自动处理，留人工决定（重生成 vs 接受）
4. **schema migration 顺序**：用户必须先 `npx prisma migrate dev --name phase5_quality_fields`，再跑 Python 脚本，否则 upsert 会失败
5. **Prisma 客户端要重新生成**：migration 后跑 `npx prisma generate`，否则 Next.js 应用读不到新字段

---

## 15. 验收标准

- [ ] Step 1 跑完，`n2_enriched.json` 有 ≥ 1700 词（允许 5% 失败）
- [ ] Step 2 跑完，富化通过率（approved + needs_review）≥ 85%
- [ ] Step 3 跑完，平均 ≥ 5.5 题/词，三维度覆盖率 R≥30% / P≥20% / U≥20%
- [ ] Step 4 跑完，MVP 450 词每词新增 1 道 listening_kanji
- [ ] Step 5 跑完，题目通过率 ≥ 80%
- [ ] Step 6 跑完，三份分维度 JSON + 合并版同时存在
- [ ] 任意 step 中途 Ctrl+C 后重跑，已处理项不会重复调用 LLM
- [ ] `dev.db` 中 MVP 学习进度（UserWordState / WrongAnswer）完整保留
- [ ] 总成本 ≤ $25
