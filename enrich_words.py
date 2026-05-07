#!/usr/bin/env python3
"""
单词富化脚本
读取 n2.json，调用 LLM 为每个单词添加详细信息（例句、近义词、搭配等）
使用 deepseek-v4-pro（非思考模式，节省 token）
"""

import json
import os
import sys
from pathlib import Path
from typing import Dict, List
from openai import OpenAI
from tqdm import tqdm
import time

# 配置
API_KEY = os.getenv("DEEPSEEK_API_KEY")
if not API_KEY:
    print("错误：请设置环境变量 DEEPSEEK_API_KEY")
    sys.exit(1)

INPUT_FILE = "n2.json"
OUTPUT_FILE = "n2_enriched.json"
PROMPT_FILE = "prompts/enrich_word.txt"
MODEL = "deepseek-v4-pro"  # deepseek-v4-pro (高质量富化)
BASE_URL = "https://api.deepseek.com"

# 加载 prompt 模板
def load_prompt_template(filename: str) -> str:
    with open(filename, 'r', encoding='utf-8') as f:
        return f.read()

# 调用 DeepSeek API 富化单词
def enrich_word(client: OpenAI, word_data: Dict, prompt_template: str) -> Dict:
    prompt = prompt_template.format(
        word=word_data['word'],
        meaning=word_data['meaning'],
        furigana=word_data.get('furigana', ''),
        romaji=word_data.get('romaji', ''),
        level=word_data.get('level', 2)
    )

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{
                "role": "user",
                "content": prompt
            }],
            temperature=0.7,
            max_tokens=4000
        )

        response_text = response.choices[0].message.content.strip()

        # 提取 JSON（去除可能的 markdown 代码块标记）
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()

        enriched = json.loads(response_text)
        return enriched

    except json.JSONDecodeError as e:
        print(f"\n警告：{word_data['word']} 的返回内容不是有效 JSON: {e}")
        print(f"返回内容：{response_text[:200]}...")
        return None
    except Exception as e:
        print(f"\n错误：处理 {word_data['word']} 时出错: {e}")
        return None

def main():
    # 检查文件
    if not os.path.exists(INPUT_FILE):
        print(f"错误：找不到输入文件 {INPUT_FILE}")
        sys.exit(1)

    if not os.path.exists(PROMPT_FILE):
        print(f"错误：找不到 prompt 文件 {PROMPT_FILE}")
        sys.exit(1)

    # 加载数据
    print(f"读取 {INPUT_FILE}...")
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        words = json.load(f)

    print(f"共 {len(words)} 个单词")

    # 如果输出文件已存在，加载已处理的数据（支持断点续传）
    enriched_words = []
    processed_words = set()

    if os.path.exists(OUTPUT_FILE):
        print(f"检测到已有输出文件 {OUTPUT_FILE}，加载已处理数据...")
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            enriched_words = json.load(f)
        processed_words = {w['word'] for w in enriched_words}
        print(f"已处理 {len(processed_words)} 个单词，继续处理剩余单词...")

    # 加载 prompt 模板
    prompt_template = load_prompt_template(PROMPT_FILE)

    # 初始化 API 客户端
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

    # 处理每个单词
    words_to_process = [w for w in words if w['word'] not in processed_words]
    print(f"待处理：{len(words_to_process)} 个单词")

    for word_data in tqdm(words_to_process, desc="富化单词"):
        enriched = enrich_word(client, word_data, prompt_template)

        if enriched:
            enriched_words.append(enriched)

            # 每处理 10 个单词就保存一次（防止中断丢失数据）
            if len(enriched_words) % 10 == 0:
                # 添加 word_id
                for idx, word in enumerate(enriched_words, start=1):
                    word['word_id'] = idx
                with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
                    json.dump(enriched_words, f, ensure_ascii=False, indent=2)

        # API 限流：稍微延迟
        time.sleep(0.5)

    # 最终保存
    print(f"\n保存到 {OUTPUT_FILE}...")
    # 添加 word_id
    for idx, word in enumerate(enriched_words, start=1):
        word['word_id'] = idx
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(enriched_words, f, ensure_ascii=False, indent=2)

    print(f"完成！共富化 {len(enriched_words)} 个单词")
    print(f"成功率：{len(enriched_words)}/{len(words)} ({len(enriched_words)*100//len(words)}%)")

if __name__ == "__main__":
    main()
