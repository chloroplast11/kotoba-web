#!/usr/bin/env python3
"""
单词验证脚本
使用另一个模型验证富化后的单词数据质量
使用 DeepSeek-Chat（非思考模式）进行快速验证
"""

import json
import os
import sys
from typing import Dict, List
from openai import OpenAI
from tqdm import tqdm
import time

# 配置
API_KEY = os.getenv("DEEPSEEK_API_KEY")
if not API_KEY:
    print("错误：请设置环境变量 DEEPSEEK_API_KEY")
    sys.exit(1)

INPUT_FILE = "n2_enriched.json"
OUTPUT_FILE = "n2_validated.json"
REPORT_FILE = "validation_report.json"
PROMPT_FILE = "prompts/validate_word.txt"
MODEL = "deepseek-chat"  # 使用非思考模式快速验证
BASE_URL = "https://api.deepseek.com"

# 加载 prompt 模板
def load_prompt_template(filename: str) -> str:
    with open(filename, 'r', encoding='utf-8') as f:
        return f.read()

# 调用 DeepSeek API 验证单词
def validate_word(client: OpenAI, enriched_word: Dict, prompt_template: str) -> Dict:
    prompt = prompt_template.format(
        enriched_word_json=json.dumps(enriched_word, ensure_ascii=False, indent=2)
    )

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{
                "role": "user",
                "content": prompt
            }],
            temperature=0.3,  # 验证需要更确定性
            max_tokens=2000
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

        validation = json.loads(response_text)
        return validation

    except json.JSONDecodeError as e:
        print(f"\n警告：{enriched_word.get('word', 'unknown')} 的验证返回不是有效 JSON: {e}")
        print(f"返回内容：{response_text[:200]}...")
        return None
    except Exception as e:
        print(f"\n错误：验证 {enriched_word.get('word', 'unknown')} 时出错: {e}")
        return None

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

    print(f"共 {len(enriched_words)} 个单词待验证")

    # 加载 prompt 模板
    prompt_template = load_prompt_template(PROMPT_FILE)

    # 初始化 API 客户端
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

    # 验证结果
    validation_results = []
    approved_words = []
    needs_review_words = []
    rejected_words = []

    # 处理每个单词
    for enriched_word in tqdm(enriched_words, desc="验证单词"):
        validation = validate_word(client, enriched_word, prompt_template)

        if validation:
            validation_results.append(validation)

            # 根据验证状态分类
            status = validation.get('validation_status', 'needs_review')
            word_with_validation = {
                **enriched_word,
                'validation': validation
            }

            if status == 'approved':
                approved_words.append(word_with_validation)
            elif status == 'rejected':
                rejected_words.append(word_with_validation)
            else:
                needs_review_words.append(word_with_validation)

            # 每验证 20 个单词保存一次
            if len(validation_results) % 20 == 0:
                with open(REPORT_FILE, 'w', encoding='utf-8') as f:
                    json.dump(validation_results, f, ensure_ascii=False, indent=2)

        # API 限流
        time.sleep(0.3)

    # 保存验证报告
    print(f"\n保存验证报告到 {REPORT_FILE}...")
    with open(REPORT_FILE, 'w', encoding='utf-8') as f:
        json.dump(validation_results, f, ensure_ascii=False, indent=2)

    # 保存验证通过的单词
    validated_words = approved_words + needs_review_words
    print(f"保存验证通过的单词到 {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(validated_words, f, ensure_ascii=False, indent=2)

    # 统计报告
    print("\n" + "="*60)
    print("验证完成！")
    print("="*60)
    print(f"总计：{len(enriched_words)} 个单词")
    print(f"✓ 通过 (approved): {len(approved_words)} 个")
    print(f"⚠ 需复核 (needs_review): {len(needs_review_words)} 个")
    print(f"✗ 拒绝 (rejected): {len(rejected_words)} 个")
    print(f"\n通过率：{(len(approved_words)/len(enriched_words)*100):.1f}%")
    print(f"可用率：{(len(validated_words)/len(enriched_words)*100):.1f}%")

    # 统计主要问题
    if validation_results:
        avg_score = sum(v.get('quality_score', 0) for v in validation_results) / len(validation_results)
        print(f"平均质量分：{avg_score:.1f}")

        # 统计问题类型
        all_issues = []
        for v in validation_results:
            all_issues.extend(v.get('issues', []))

        if all_issues:
            print(f"\n发现 {len(all_issues)} 个问题")
            critical_count = sum(1 for i in all_issues if i.get('severity') == 'critical')
            warning_count = sum(1 for i in all_issues if i.get('severity') == 'warning')
            print(f"  严重: {critical_count}")
            print(f"  警告: {warning_count}")

    print("\n详细报告见：" + REPORT_FILE)

if __name__ == "__main__":
    main()
