#!/usr/bin/env python3
"""
题目验证脚本
独立验证生成的题目，确保答案唯一性和准确性
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

INPUT_FILE = "n2_questions.json"
OUTPUT_FILE = "n2_questions_validated.json"
REPORT_FILE = "question_validation_report.json"
PROMPT_FILE = "prompts/validate_questions.txt"
MODEL = "deepseek-chat"  # 使用非思考模式快速验证
BASE_URL = "https://api.deepseek.com"
BATCH_SIZE = 10  # 每次验证多少道题（同一个单词的题目）

# 加载 prompt 模板
def load_prompt_template(filename: str) -> str:
    with open(filename, 'r', encoding='utf-8') as f:
        return f.read()

# 调用 DeepSeek API 验证题目（批量）
def validate_questions_batch(client: OpenAI, questions: List[Dict], prompt_template: str) -> Dict:
    prompt = prompt_template.format(
        questions_json=json.dumps(questions, ensure_ascii=False, indent=2)
    )

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{
                "role": "user",
                "content": prompt
            }],
            temperature=0.3,  # 验证需要确定性
            max_tokens=4000
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
        print(f"\n警告：验证返回不是有效 JSON: {e}")
        print(f"返回内容：{response_text[:200]}...")
        return None
    except Exception as e:
        print(f"\n错误：验证题目时出错: {e}")
        return None

def main():
    # 检查文件
    if not os.path.exists(INPUT_FILE):
        print(f"错误：找不到输入文件 {INPUT_FILE}")
        print(f"请先运行 generate_questions.py 生成题目")
        sys.exit(1)

    if not os.path.exists(PROMPT_FILE):
        print(f"错误：找不到 prompt 文件 {PROMPT_FILE}")
        sys.exit(1)

    # 加载数据
    print(f"读取 {INPUT_FILE}...")
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        all_questions = json.load(f)

    print(f"共 {len(all_questions)} 道题目待验证")

    # 按单词分组
    questions_by_word = {}
    for q in all_questions:
        word_id = q.get('word_id', 'unknown')
        if word_id not in questions_by_word:
            questions_by_word[word_id] = []
        questions_by_word[word_id].append(q)

    print(f"涉及 {len(questions_by_word)} 个单词")

    # 加载 prompt 模板
    prompt_template = load_prompt_template(PROMPT_FILE)

    # 初始化 API 客户端
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

    # 验证结果
    all_validations = []
    approved_questions = []
    needs_review_questions = []
    rejected_questions = []

    # 批量验证（按单词）
    word_ids = list(questions_by_word.keys())

    for word_id in tqdm(word_ids, desc="验证题目"):
        questions = questions_by_word[word_id]

        validation = validate_questions_batch(client, questions, prompt_template)

        if validation:
            all_validations.append({
                'word_id': word_id,
                'validation': validation
            })

            # 根据每道题的验证状态分类
            question_validations = validation.get('question_validations', [])

            for i, q_val in enumerate(question_validations):
                if i < len(questions):
                    question = questions[i]
                    question_with_validation = {
                        **question,
                        'validation': q_val
                    }

                    status = q_val.get('validation_status', 'needs_review')
                    if status == 'approved':
                        approved_questions.append(question_with_validation)
                    elif status == 'rejected':
                        rejected_questions.append(question_with_validation)
                    else:
                        needs_review_questions.append(question_with_validation)

            # 每验证 20 个单词保存一次
            if len(all_validations) % 20 == 0:
                with open(REPORT_FILE, 'w', encoding='utf-8') as f:
                    json.dump(all_validations, f, ensure_ascii=False, indent=2)

        # API 限流
        time.sleep(0.4)

    # 保存验证报告
    print(f"\n保存验证报告到 {REPORT_FILE}...")
    with open(REPORT_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_validations, f, ensure_ascii=False, indent=2)

    # 保存验证通过的题目
    validated_questions = approved_questions + needs_review_questions
    print(f"保存验证通过的题目到 {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(validated_questions, f, ensure_ascii=False, indent=2)

    # 统计报告
    print("\n" + "="*60)
    print("题目验证完成！")
    print("="*60)
    print(f"总计：{len(all_questions)} 道题")
    print(f"✓ 通过 (approved): {len(approved_questions)} 道")
    print(f"⚠ 需复核 (needs_review): {len(needs_review_questions)} 道")
    print(f"✗ 拒绝 (rejected): {len(rejected_questions)} 道")
    print(f"\n通过率：{(len(approved_questions)/len(all_questions)*100):.1f}%")
    print(f"可用率：{(len(validated_questions)/len(all_questions)*100):.1f}%")

    # 统计维度覆盖
    dim_stats = {'R': 0, 'P': 0, 'U': 0}
    for q in validated_questions:
        dim = q.get('dimension', 'R')
        if dim in dim_stats:
            dim_stats[dim] += 1

    print(f"\n验证通过的题目维度分布：")
    print(f"  R (认识): {dim_stats['R']} 题")
    print(f"  P (产出): {dim_stats['P']} 题")
    print(f"  U (运用): {dim_stats['U']} 题")

    # 统计问题
    if all_validations:
        total_issues = 0
        critical_issues = 0
        for val in all_validations:
            q_vals = val['validation'].get('question_validations', [])
            for q_val in q_vals:
                issues = q_val.get('issues', [])
                total_issues += len(issues)
                critical_issues += sum(1 for i in issues if i.get('severity') == 'critical')

        if total_issues > 0:
            print(f"\n发现 {total_issues} 个问题")
            print(f"  严重: {critical_issues}")
            print(f"  警告: {total_issues - critical_issues}")

    print("\n详细报告见：" + REPORT_FILE)

if __name__ == "__main__":
    main()
