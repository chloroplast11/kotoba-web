#!/usr/bin/env python3
"""
题目生成脚本
为每个验证通过的单词生成 4-6 道测试题，覆盖 R/P/U 三个维度
使用 deepseek-v4-pro（非思考模式，节省 token）
"""

import json
import os
import sys
from typing import Dict, List
from openai import OpenAI
from tqdm import tqdm
import time

# 配置
API_KEY = os.getenv("OPENROUTER_API_KEY")  # 改为 OpenRouter
if not API_KEY:
    print("错误：请设置环境变量 OPENROUTER_API_KEY")
    sys.exit(1)

INPUT_FILE = "n2_enriched.json"  # MVP 阶段直接从富化数据生成，跳过验证
OUTPUT_FILE = "n2_questions.json"
PROMPT_FILE = "prompts/generate_questions.txt"
MODEL = "deepseek/deepseek-v4-flash"  # 保持相同模型
BASE_URL = "https://openrouter.ai/api/v1"  # 改为 OpenRouter

# 加载 prompt 模板
def load_prompt_template(filename: str) -> str:
    with open(filename, 'r', encoding='utf-8') as f:
        return f.read()

# 安全地写入 JSON 文件，避免写入过程中损坏已有输出
def safe_write_json(filename: str, data: List[Dict]) -> None:
    temp_filename = filename + '.tmp'
    with open(temp_filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(temp_filename, filename)

# 调用 DeepSeek API 生成题目（带重试）
def generate_questions(client: OpenAI, enriched_word: Dict, prompt_template: str, max_retries: int = 2) -> List[Dict]:
    prompt = prompt_template.format(
        enriched_word_json=json.dumps(enriched_word, ensure_ascii=False, indent=2)
    )

    word = enriched_word.get('word', 'unknown')

    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=MODEL,
                messages=[{
                    "role": "user",
                    "content": prompt
                }],
                temperature=0.8,  # 题目生成需要一定创造性
                timeout=90,  # 90 秒超时
                extra_body={
                    "provider": {
                        "order": ["atlas-cloud/fp8", "novita", "siliconflow/fp8"]
                    }
                }
            )

            response_text = response.choices[0].message.content.strip()

            # 提取 JSON
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()

            if not response_text:
                print(f"\n警告：{word} 返回了空文本，可能是模型未成功生成内容")
                if attempt < max_retries - 1:
                    time.sleep(1)
                    continue
                return []

            try:
                questions = json.loads(response_text)
            except json.JSONDecodeError as e:
                print(f"\n警告：{word} JSON 解析失败 (尝试 {attempt+1}/{max_retries}): {e}")
                if hasattr(response, 'usage'):
                    print(f"模型使用 tokens：{response.usage}")
                print(f"原始返回内容：{response_text[:800]!r}")
                print("提示：这通常意味着模型输出被截断或返回了不完整的 JSON。")
                if attempt < max_retries - 1:
                    time.sleep(1)
                    continue
                return []

            # 确保返回的是数组
            if not isinstance(questions, list):
                print(f"\n警告：{word} 返回的不是数组 (尝试 {attempt+1}/{max_retries})")
                if attempt < max_retries - 1:
                    time.sleep(1)
                    continue
                return []

            # 验证题目数量
            if len(questions) < 4:
                print(f"\n警告：{word} 只生成了 {len(questions)} 道题 (尝试 {attempt+1}/{max_retries})")
                if attempt < max_retries - 1:
                    time.sleep(1)
                    continue

            return questions

        except json.JSONDecodeError as e:
            print(f"\n警告：{word} JSON 解析失败 (尝试 {attempt+1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            return []
        except Exception as e:
            print(f"\n错误：{word} 生成失败 (尝试 {attempt+1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            return []

    return []

def main():
    # 检查文件
    if not os.path.exists(INPUT_FILE):
        print(f"错误：找不到输入文件 {INPUT_FILE}")
        print(f"请先运行 enrich_words.py 生成富化数据")
        sys.exit(1)

    if not os.path.exists(PROMPT_FILE):
        print(f"错误：找不到 prompt 文件 {PROMPT_FILE}")
        sys.exit(1)

    # 加载数据
    print(f"读取 {INPUT_FILE}...")
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        enriched_words = json.load(f)

    print(f"共 {len(enriched_words)} 个单词需要生成题目")

    # 如果输出文件已存在，加载已生成的题目（支持断点续传）
    all_questions = []
    processed_words = set()

    if os.path.exists(OUTPUT_FILE):
        print(f"检测到已有输出文件 {OUTPUT_FILE}，加载已生成的题目...")
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            all_questions = json.load(f)
        processed_words = {q['word_id'] for q in all_questions}
        print(f"已处理 {len(processed_words)} 个单词，继续处理剩余单词...")

    # 加载 prompt 模板
    prompt_template = load_prompt_template(PROMPT_FILE)

    # 初始化 API 客户端
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

    # 过滤待处理单词
    words_to_process = [w for w in enriched_words if w['word_id'] not in processed_words]
    print(f"待处理：{len(words_to_process)} 个单词")

    # 统计
    total_questions = len(all_questions)
    dimension_stats = {'R': 0, 'P': 0, 'U': 0}
    failed_words = []

    # 处理每个单词
    for word_data in tqdm(words_to_process, desc="生成题目"):
        questions = generate_questions(client, word_data, prompt_template)

        if questions:
            all_questions.extend(questions)

            # 统计维度覆盖
            for q in questions:
                dim = q.get('dimension', 'R')
                if dim in dimension_stats:
                    dimension_stats[dim] += 1

            # 生成每个单词后立即持久化，支持断点续传
            safe_write_json(OUTPUT_FILE, all_questions)
            total_questions = len(all_questions)
        else:
            failed_words.append(word_data['word'])

        # API 限流（增加到 1 秒，避免 rate limit）
        time.sleep(1)

    # 最终保存
    print(f"\n保存到 {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)

    # 统计报告
    print("\n" + "="*60)
    print("题目生成完成！")
    print("="*60)
    print(f"处理单词数：{len(enriched_words)}")
    print(f"成功：{len(enriched_words) - len(failed_words)} 个")
    print(f"失败：{len(failed_words)} 个")
    if failed_words:
        print(f"失败单词：{', '.join(failed_words[:20])}" + ("..." if len(failed_words) > 20 else ""))
    print(f"生成题目数：{len(all_questions)}")
    if len(enriched_words) > 0:
        print(f"平均每词题数：{len(all_questions)/len(enriched_words):.1f}")
    print(f"\n维度分布：")
    print(f"  R (认识): {dimension_stats['R']} 题")
    print(f"  P (产出): {dimension_stats['P']} 题")
    print(f"  U (运用): {dimension_stats['U']} 题")

if __name__ == "__main__":
    main()
