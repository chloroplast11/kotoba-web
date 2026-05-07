# Phase 1 数据生成管线使用文档

## 概述

这是「言葉帖」项目的 Phase 1 数据生成管线，用于将 N2 词表富化为完整的学习数据库，包括：

- 单词详细信息（例句、近义词、搭配等）
- 覆盖 R/P/U 三维度的测试题目
- 跨模型质量验证

## 文件结构

```
kotobaWeb/
├── n2.json                        # 输入：原始 N2 词表 (1831 词)
├── prompts/                       # Prompt 模板目录
│   ├── enrich_word.txt           # 单词富化 prompt
│   ├── validate_word.txt         # 单词验证 prompt
│   ├── generate_questions.txt    # 题目生成 prompt
│   └── validate_questions.txt    # 题目验证 prompt
├── enrich_words.py               # 步骤 1：单词富化
├── validate_words.py             # 步骤 2：单词验证
├── generate_questions.py         # 步骤 3：题目生成
├── validate_questions.py         # 步骤 4：题目验证
├── pipeline.py                   # 主控脚本（一键运行全流程）
└── requirements.txt              # Python 依赖
```

## 技术栈

- **LLM**: deepseek-v4-pro（非思考模式，节省 token）
- **语言**: Python 3.8+
- **依赖**: openai, tqdm

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 设置 API Key

```bash
export DEEPSEEK_API_KEY='your-deepseek-api-key'
```

### 3. 运行完整管线

```bash
python3 pipeline.py
```

管线会依次执行 4 个步骤：
1. 单词富化 (enrich_words.py)
2. 单词验证 (validate_words.py)
3. 题目生成 (generate_questions.py)
4. 题目验证 (validate_questions.py)

### 4. 查看输出

生成的文件：

| 文件 | 说明 |
|------|------|
| `n2_enriched.json` | 富化后的单词数据 |
| `n2_validated.json` | 验证通过的单词（approved + needs_review） |
| `validation_report.json` | 单词验证详细报告 |
| `n2_questions.json` | 生成的所有题目 |
| `n2_questions_validated.json` | 验证通过的题目 |
| `question_validation_report.json` | 题目验证详细报告 |

## 分步运行

如果需要单独运行某个步骤（例如调试或断点续传）：

### 步骤 1：单词富化

```bash
python3 enrich_words.py
```

为每个单词添加：
- 词性、使用频率
- 2-3 个例句（带假名标注）
- 近义词、反义词
- 常用搭配
- 用法说明

**支持断点续传**：如果中断，再次运行会从上次停止的地方继续。

### 步骤 2：单词验证

```bash
python3 validate_words.py
```

跨模型验证富化数据的质量，检查：
- 假名标注准确性
- 例句自然度
- 翻译准确性
- 信息完整性

输出验证状态：
- `approved`: 质量分 ≥90，可直接使用
- `needs_review`: 质量分 70-89，建议人工复核
- `rejected`: 质量分 <70，需要重新生成

### 步骤 3：题目生成

```bash
python3 generate_questions.py
```

为每个验证通过的单词生成 4-6 道题目，覆盖三个维度：
- **R (认识)**: 看到/听到能理解 - 选义、选词、近义词等
- **P (产出)**: 能从意思提取出词 - 填空、词形变化等
- **U (运用)**: 能在句子中正确使用 - 语境推断、用法判断等

**支持断点续传**：脚本会在每个单词的题目成功生成后立即保存到 `n2_questions.json`，下次运行时会从已经生成过题目的单词后继续。
### 步骤 4：题目验证

```bash
python3 validate_questions.py
```

独立验证题目质量，检查：
- 答案唯一性（最关键）
- 答案正确性
- 干扰项合理性
- 假名标注完整性
- 维度匹配度

验证器会**独立做题**，如果答案与标注不一致会标记为 critical issue。

## 数据格式

### 富化后的单词数据格式

```json
{
  "word": "題名",
  "furigana": "だいめい",
  "romaji": "daimei",
  "meaning_zh": "标题",
  "meaning_en": "title",
  "level": 2,
  "pos": "名词",
  "frequency": "high",
  "example_sentences": [
    {
      "ja": "<ruby>本<rt>ほん</rt></ruby>の<ruby>題名<rt>だいめい</rt></ruby>を<ruby>付<rt>つ</rt></ruby>ける。",
      "ja_plain": "本の題名を付ける。",
      "zh": "给书起标题",
      "en": "Give a title to the book"
    }
  ],
  "synonyms": ["タイトル", "表題"],
  "antonyms": [],
  "collocations": ["題名を付ける", "題名をつける"],
  "usage_notes": "本や映画などの名前を指す"
}
```

### 题目数据格式

```json
{
  "id": "word_題名_meaning_choice_1",
  "word_id": "題名",
  "dimension": "R",
  "type": "meaning_choice",
  "question": "「<ruby>題名<rt>だいめい</rt></ruby>」の<ruby>意味<rt>いみ</rt></ruby>は？",
  "question_plain": "「題名」の意味は？",
  "options": [
    {
      "text": "<ruby>標題<rt>ひょうだい</rt></ruby>、タイトル",
      "text_plain": "標題、タイトル"
    },
    {
      "text": "<ruby>問題<rt>もんだい</rt></ruby>の<ruby>名前<rt>なまえ</rt></ruby>",
      "text_plain": "問題の名前"
    }
  ],
  "correct_index": 0,
  "explanation": "「<ruby>題名<rt>だいめい</rt></ruby>」は...",
  "explanation_plain": "「題名」は...",
  "explanation_zh": "「題名」表示..."
}
```

## 重要规则

### 假名标注规则

所有日语汉字必须用 `<ruby>` 标签标注假名：

```html
<ruby>題名<rt>だいめい</rt></ruby>
```

这是 CLAUDE.md 的强制规则，确保学习者能正确读出所有汉字。

### 维度定义

- **R (Recognition 认识)**: 看到词能理解意思
- **P (Production 产出)**: 能从意思中提取出正确的词
- **U (Usage 运用)**: 能在句子中正确使用

每个单词至少生成：R≥2 题，P≥1 题，U≥1 题

### 使用频率判定

- `high`: 日常对话高频词
- `medium`: 中等频率
- `low`: 低频或专业词汇

这个字段影响 U 维度的解锁条件（低频词的 U 可选学习）。

## 成本估算

使用 DeepSeek-Chat（非思考模式）：

- 单词富化：约 1000-1500 tokens/词
- 单词验证：约 500-800 tokens/词
- 题目生成：约 2000-3000 tokens/词（生成 4-6 题）
- 题目验证：约 1000-1500 tokens/批（10 题）

**1831 个 N2 词预估总 token 用量**：约 800 万 - 1200 万 tokens

DeepSeek 价格（截至 2025 年）：
- Input: $0.14 / M tokens
- Output: $0.28 / M tokens

**预估总成本**：$2-4 USD（具体取决于 input/output 比例）

## 质量保证

### 两阶段验证

1. **单词验证**：验证富化数据的准确性和完整性
2. **题目验证**：独立做题验证答案唯一性和正确性

### 质量指标

- 单词通过率目标：≥85%
- 题目通过率目标：≥80%
- 平均质量分：≥85

### 人工复核建议

优先复核：
1. `needs_review` 状态的数据
2. 有 `critical` 级别 issue 的项目
3. 低频词的例句和用法
4. U 维度题目（最难生成）

## 故障排查

### 问题：返回内容不是有效 JSON

**原因**：LLM 返回了额外的文字说明

**解决**：脚本已内置 JSON 提取逻辑（去除 markdown 代码块标记）。如果仍有问题，检查 prompt 是否强调了"只输出 JSON"。

### 问题：API 限流

**解决**：
1. 脚本已内置延迟（0.3-0.5 秒/请求）
2. 如果仍被限流，修改脚本中的 `time.sleep()` 参数增加延迟

### 问题：中断后如何继续

**解决**：
- `enrich_words.py` 和 `generate_questions.py` 支持断点续传
- 直接重新运行即可，脚本会自动跳过已处理的数据
- `validate_*.py` 脚本也会增量保存，但建议完整运行以保证一致性

### 问题：验证通过率太低

**原因**：
1. Prompt 不够清晰
2. 模型输出不稳定
3. 验证标准过严

**解决**：
1. 调整 `prompts/` 中的 prompt 模板
2. 降低 `temperature` 参数（当前 0.7-0.8）
3. 查看 validation_report.json 找出常见问题类型，针对性优化 prompt

## 下一步

完成 Phase 1 后：

1. **人工抽查**：抽查 50-100 个单词和题目，确认质量
2. **集成到 index.html**：将 `n2_questions_validated.json` 的数据整合到原型中
3. **Phase 2**：迁移到 Next.js，使用真实数据库（PostgreSQL）
4. **扩展到其他等级**：复用管线处理 N5/N4/N3/N1 词表

## 常见问题

**Q: 为什么不用思考模式（deepseek-reasoner）？**

A: 为了节省 token 成本。非思考模式对于这类结构化数据生成任务已经足够，思考模式主要用于复杂推理任务。

**Q: 能用其他 LLM 吗？**

A: 可以。只需修改脚本中的 API 调用部分（例如改用 OpenAI、Claude 等），prompt 模板通用。

**Q: 数据会有版权问题吗？**

A: 词表本身（n2.json）来自公开的 JLPT 词表，不涉及版权。富化后的例句和题目是 LLM 生成的原创内容，属于项目资产。

**Q: 多久能跑完全量 1831 词？**

A: 取决于 API 速度和限流。参考时间：
- 单步：30-60 分钟
- 完整管线：2-4 小时

建议先跑 50-100 个词测试，确认质量后再跑全量。

## 联系与反馈

如有问题或改进建议，请在项目 issue 中反馈。
