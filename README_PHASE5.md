# Phase 5 数据管线使用指南

> N2 全量词扩展（红宝书 ~2335 词）+ 题目生成 + 双模型验证

## 前提条件

- Python 3.9+（推荐 `/Users/yuhang/miniconda3/bin/python3` 即 3.13，pytest 已安装在此 Python）
- `pip install openai tqdm` （脚本运行时依赖）
- OpenRouter API key（中国信用卡可付）
- Anki 红宝书牌组文件：`N2/collection.anki2`（本地，不入版本库）

## 环境变量

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."

# 可选覆盖（保留默认即用作者推荐的模型）
export GENERATOR_MODEL="deepseek/deepseek-v4-flash"
export VALIDATOR_MODEL="qwen/qwen-2.5-72b-instruct"

# 可选：指定 OpenRouter 的 provider 顺序（逗号分隔，前者优先）
# 例：DeepSeek 在 atlas-cloud 和 novita 上一般最快；Qwen 默认即可
export GENERATOR_PROVIDER_ORDER="atlas-cloud/fp8,novita,siliconflow/fp8"
export VALIDATOR_PROVIDER_ORDER=""   # 空 = 让 OpenRouter 自动路由
```

不设置或设为空字符串 = OpenRouter 自由路由（默认）。可在 OpenRouter 网站的模型详情页查看可用 provider ID。

数据库默认连接 `dev.db`（不可通过 env 覆盖；如需要改，修改 `phase5/db_writer.py` 中 `connect()` 的默认值）。

## 推荐执行顺序（每步独立、可断点续传）

```bash
# Step 1: 解析 Anki 牌组 → n2_words.json（约 2335 词），<1 min，免费
python3 -m phase5.import_anki

# Step 2: 复制 HyperTTS mp3 到 public/audio/words/，<1 min，免费
python3 -m phase5.import_audio --clear

# Step 3: 为每词生成题目（R/P/U，含 1 道 listening_kanji），约 60 min，~$3
python3 -m phase5.run generate-q

# Step 4: Qwen 验证所有题目（独立答题），约 45 min，~$5
python3 -m phase5.run validate-q

# Step 5: 按维度切分题目 JSON（不调 LLM），<1 min，免费
python3 -m phase5.run split-json

# 最后：入库
npm run db:seed
```

总预估：**~2 小时 / ~$8**（实际依 OpenRouter 限流而定）。

## Step 1：import-anki — 解析 Anki 牌组

```bash
python3 -m phase5.import_anki
```

- 输入：`N2/collection.anki2`（SQLite 格式的 Anki 数据库）
- 输出：`n2_words.json`（约 2335 词）
- 提取字段：`word / furigana / meaningZh / level / pos / exampleSentences / pitchAccent? / homophones?`
- 词条按红宝书章节顺序排列（`word.id` 升序），新词学习顺序由此决定

## Step 2：import-audio — 复制 HyperTTS 音频

```bash
python3 -m phase5.import_audio           # 增量复制（已存在的跳过）
python3 -m phase5.import_audio --clear   # 先清空再全量复制
```

- 来源：Anki 牌组内置的 HyperTTS mp3（从 `N2/collection.anki2` 中的 media 目录提取）
- 目标：`public/audio/words/<wordId>.mp3`
- 这批文件已 committed 到仓库，正常情况下只需在首次建库或更换牌组时重跑

## Step 3：generate-q — 生成题目

```bash
python3 -m phase5.run generate-q
```

- 输入：`n2_words.json`（来自 Step 1）
- 为每词生成 R/P/U 三维度题目（含 1 道 `listening_kanji`）
- 输出：`n2_questions.json`（合并版）

`n2_words.json` 包含的字段：`word / furigana / meaningZh / level / pos / exampleSentences / pitchAccent? / homophones?`。注意不含 `frequency / usageNotes / antonyms / collocations / meaningEn / romaji`。

## Step 4：validate-q — 验证题目

```bash
python3 -m phase5.run validate-q
```

Qwen 作为独立验证器，独立做每道题，比对答案一致性。主要检查：
- 答案唯一性（最关键）
- 答案正确性
- 干扰项合理性
- 假名标注完整性

## Step 5：split-json — 切分题目 JSON

```bash
python3 -m phase5.run split-json
```

将 `n2_questions.json` 按维度切分为 `n2_questions_R.json` / `_P.json` / `_U.json`。不调 LLM，<1 min。

## 通用参数（每步通用）

| 参数 | 含义 |
|------|------|
| `--concurrency N` | 并发数（默认 8）。OpenRouter 限流时降到 4 |
| `--limit N` | 只处理前 N 条（试跑用） |
| `--force` | 忽略 progress 强制重跑（report 文件也会被清空） |
| `--dry-run` | 只打印计划，不调 LLM、不写 DB |

特定步骤额外参数：

- `validate-q --dim R|P|U` — 只验证某维度（progress 文件按 dim 分开存储）
- `validate-q --sample-pct 20` — 随机抽 20% 验证（基于固定种子，可复现）

## 断点续传

- 中途 Ctrl-C 安全：每个 step 在每条数据上都按 **DB 写 → JSON 写 → progress 写** 顺序持久化
- 进度文件：`.phase5_progress/<step>.json`
- 失败项：`failed_items.json`（按 step + word_id 分类，手动复查）
- 写入顺序保证：每次 LLM 调用返回后立刻 DB upsert + JSON 写 + progress 标记；Ctrl-C 时正在并发执行的 LLM 调用（最多 N 个，N=concurrency）会丢失，下次重跑时这些 N 条会重复调用 LLM；DB upsert 幂等所以不会出现 "JSON 有但 DB 没有" 的不一致

## 输出文件

| 文件 | 内容 | 何时产出 |
|------|------|---------|
| `n2_words.json` | 全量词汇（约 2335 词） | Step 1 |
| `n2_questions.json` | 全量题目（合并版） | Step 3 |
| `n2_questions_R.json` / `_P.json` / `_U.json` | 按维度切分 | Step 5 |
| `question_validation_report.json` | 题目验证报告 | Step 4 |
| `rejected_questions.json` | 题目 rejected 列表（待人工） | Step 4 |
| `failed_items.json` | LLM 调用失败 / 校验失败的项 | 任意 step |
| `dev.db` | 同步入库（Word + Question 表） | 实时 |
| `public/audio/words/<id>.mp3` | 单词读音（HyperTTS） | Step 2 |

## 故障排查

- **429 Rate Limit**：降并发到 4：`--concurrency 4`
- **大量 rejected**：先用 `--limit 10` 试跑看 prompt 是否需要调整
- **进度文件混乱**：删除 `.phase5_progress/<step>.json` 后用 `--force` 重跑（注意会清空对应的 report 文件）
- **LLM client 卡住不返回**：`phase5/llm_client.py` 的 `chat.completions.create` 调用设置了 `timeout=60`；如果仍卡，检查 provider 路由，或切换 `GENERATOR_PROVIDER_ORDER`
- **OpenRouter 模型路由慢**：在 `GENERATOR_PROVIDER_ORDER` 中明确指定较快的 provider（如 `atlas-cloud/fp8,novita`）

## 跑完后

1. 查看 `rejected_questions.json`，人工挑出最重要的几条修订
2. （可选）查看 `failed_items.json`，对失败项手动重跑：`--force` 后只跑前几条试试
3. `npm run db:seed` 入库
4. 重启 dev server：`npm run dev`
5. 进 `/library` 验证新词都出现了，进度条与 R/P/U 数据正常
6. 进 `/practice` 验证题目可以正常答题

## 模型替换说明

- 想改更便宜的验证模型：`export VALIDATOR_MODEL="z-ai/glm-4.6"` 或 `"qwen/qwen3-coder"`（注意 coder 的日语能力略弱）
- 想用更强的生成模型：`export GENERATOR_MODEL="qwen/qwen3-max"`（成本会涨 10x+）

## 相关文档

- spec：`docs/superpowers/specs/2026-05-14-phase5-data-pipeline-design.md`
- plan：`docs/superpowers/plans/2026-05-14-phase5-data-pipeline.md`
- 项目规范：`CLAUDE.md`
- 产品愿景：`docs/PRODUCT.md`
