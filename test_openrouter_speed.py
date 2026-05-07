#!/usr/bin/env python3
"""
OpenRouter 模型速度与效果测试脚本
测试多个模型生成题目的速度和质量，帮助选择最佳模型
"""

import json
import os
import sys
import time
from typing import Dict, List, Tuple
from openai import OpenAI
from datetime import datetime

# 配置
API_KEY = os.getenv("OPENROUTER_API_KEY")
if not API_KEY:
    print("错误：请设置环境变量 OPENROUTER_API_KEY")
    sys.exit(1)

BASE_URL = "https://openrouter.ai/api/v1"
PROMPT_FILE = "prompts/generate_questions.txt"

# 测试的模型列表（按推荐顺序）
TEST_MODELS = [
    {
        "name": "OpenAI GPT-3.5 Turbo",
        "id": "openai/gpt-3.5-turbo",
        "description": "价格最低、性能稳定，适合大批量题目生成"
    },
    {
        "name": "OpenAI GPT-4o Mini",
        "id": "openai/gpt-4o-mini",
        "description": "质量优于 3.5，成本低于标准 GPT-4"
    },
    {
        "name": "Anthropic Claude 3.5 Haiku",
        "id": "anthropic/claude-3.5-haiku",
        "description": "Claude 最快模型，平衡质量和速度"
    },
    {
        "name": "DeepSeek v4 flash (对照组)",
        "id": "deepseek/deepseek-v4-flash",
        "description": "当前使用的模型，作为对照"
    }
]

# 加载 prompt 模板
def load_prompt_template(filename: str) -> str:
    with open(filename, 'r', encoding='utf-8') as f:
        return f.read()

# 从富化数据中选取测试样本
def load_test_samples(n: int = 3) -> List[Dict]:
    """加载 n 个测试样本"""
    input_file = "n2_enriched.json"
    if not os.path.exists(input_file):
        print(f"错误：找不到 {input_file}")
        print("请先运行 enrich_words.py")
        sys.exit(1)

    with open(input_file, 'r', encoding='utf-8') as f:
        all_words = json.load(f)

    # 选择前 n 个单词作为测试样本
    return all_words[:n]

# 调用 API 生成题目并计时
def test_model(client: OpenAI, model_id: str, enriched_word: Dict, prompt_template: str) -> Tuple[List[Dict], float, bool]:
    """
    返回：(生成的题目, 耗时秒数, 是否成功)
    """
    prompt = prompt_template.format(
        enriched_word_json=json.dumps(enriched_word, ensure_ascii=False, indent=2)
    )

    start_time = time.time()

    try:
        response = client.chat.completions.create(
            model=model_id,
            messages=[{
                "role": "user",
                "content": prompt
            }],
            temperature=0.8,
            max_tokens=4000,
            timeout=90
        )

        elapsed = time.time() - start_time

        response_text = response.choices[0].message.content.strip()

        # 提取 JSON
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()

        questions = json.loads(response_text)

        # 验证返回格式
        if not isinstance(questions, list):
            return [], elapsed, False

        return questions, elapsed, True

    except json.JSONDecodeError as e:
        elapsed = time.time() - start_time
        print(f"    JSON 解析失败: {e}")
        return [], elapsed, False
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"    API 调用失败: {e}")
        return [], elapsed, False

# 评估题目质量
def evaluate_questions(questions: List[Dict]) -> Dict:
    """简单的质量评估"""
    if not questions:
        return {
            "count": 0,
            "dimensions": {"R": 0, "P": 0, "U": 0},
            "valid": False
        }

    dim_count = {"R": 0, "P": 0, "U": 0}
    for q in questions:
        dim = q.get("dimension", "R")
        if dim in dim_count:
            dim_count[dim] += 1

    # 至少要有 4 道题，且覆盖至少 2 个维度
    valid = len(questions) >= 4 and sum(1 for c in dim_count.values() if c > 0) >= 2

    return {
        "count": len(questions),
        "dimensions": dim_count,
        "valid": valid
    }

def main():
    print("OpenRouter 模型速度与效果测试")
    print("=" * 60)

    # 检查 prompt 文件
    if not os.path.exists(PROMPT_FILE):
        print(f"错误：找不到 {PROMPT_FILE}")
        sys.exit(1)

    # 加载测试样本
    print("\n加载测试样本...")
    test_samples = load_test_samples(n=3)  # 测试 3 个单词
    print(f"测试单词：{', '.join([w['word'] for w in test_samples])}")

    # 加载 prompt
    prompt_template = load_prompt_template(PROMPT_FILE)

    # 初始化客户端
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

    # 测试结果
    results = []

    # 测试每个模型
    for model_info in TEST_MODELS:
        print(f"\n{'=' * 60}")
        print(f"测试模型：{model_info['name']}")
        print(f"模型 ID：{model_info['id']}")
        print(f"描述：{model_info['description']}")
        print(f"{'=' * 60}")

        model_result = {
            "model": model_info['name'],
            "model_id": model_info['id'],
            "times": [],
            "success_count": 0,
            "total_questions": 0,
            "quality_scores": [],
            "samples": []
        }

        # 对每个测试样本生成题目
        for i, word_data in enumerate(test_samples, 1):
            word = word_data['word']
            print(f"\n  [{i}/{len(test_samples)}] 测试单词：{word}")

            questions, elapsed, success = test_model(client, model_info['id'], word_data, prompt_template)

            model_result['times'].append(elapsed)

            sample_result = {
                "word": word,
                "elapsed": elapsed,
                "success": success,
                "question_count": 0,
                "dimensions": {"R": 0, "P": 0, "U": 0},
                "questions": questions if success else []
            }

            if success:
                model_result['success_count'] += 1
                quality = evaluate_questions(questions)
                model_result['total_questions'] += quality['count']
                model_result['quality_scores'].append(quality)
                sample_result['question_count'] = quality['count']
                sample_result['dimensions'] = quality['dimensions']

                print(f"    ✓ 成功 - 耗时 {elapsed:.2f}s")
                print(f"    生成 {quality['count']} 题：R={quality['dimensions']['R']}, P={quality['dimensions']['P']}, U={quality['dimensions']['U']}")
            else:
                print(f"    ✗ 失败 - 耗时 {elapsed:.2f}s")

            model_result['samples'].append(sample_result)

            # 避免触发限流
            time.sleep(1)

        # 计算平均值
        avg_time = sum(model_result['times']) / len(model_result['times']) if model_result['times'] else 0
        success_rate = model_result['success_count'] / len(test_samples) * 100
        avg_questions = model_result['total_questions'] / model_result['success_count'] if model_result['success_count'] > 0 else 0

        model_result['avg_time'] = avg_time
        model_result['success_rate'] = success_rate
        model_result['avg_questions'] = avg_questions

        results.append(model_result)

        print(f"\n  汇总：")
        print(f"    平均耗时：{avg_time:.2f}s")
        print(f"    成功率：{success_rate:.1f}%")
        print(f"    平均题数：{avg_questions:.1f}")

    # 输出最终对比报告
    print(f"\n\n{'=' * 60}")
    print("对比报告")
    print(f"{'=' * 60}")
    print(f"\n{'模型':<30} {'平均耗时':<12} {'成功率':<10} {'平均题数'}")
    print("-" * 60)

    for r in results:
        print(f"{r['model']:<30} {r['avg_time']:<12.2f} {r['success_rate']:<10.1f} {r['avg_questions']:.1f}")

    # 找出最快的成功模型
    successful_models = [r for r in results if r['success_rate'] >= 66.7]  # 至少 2/3 成功
    if successful_models:
        fastest = min(successful_models, key=lambda x: x['avg_time'])
        print(f"\n推荐模型：{fastest['model']}")
        print(f"  模型 ID：{fastest['model_id']}")
        print(f"  平均耗时：{fastest['avg_time']:.2f}s")
        print(f"  成功率：{fastest['success_rate']:.1f}%")

    # 保存详细结果
    output_file = f"test_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n详细结果已保存到：{output_file}")

if __name__ == "__main__":
    main()
