#!/usr/bin/env python3
"""
Phase 1 数据生成管线主控脚本
依次运行：单词富化 -> 单词验证 -> 题目生成 -> 题目验证
"""

import os
import sys
import subprocess
import time
from datetime import datetime

def print_section(title: str):
    """打印分隔线和标题"""
    print("\n" + "="*70)
    print(f"  {title}")
    print("="*70 + "\n")

def run_script(script_name: str, description: str) -> bool:
    """运行 Python 脚本"""
    print_section(f"步骤：{description}")
    print(f"执行：python3 {script_name}")
    print(f"开始时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    start_time = time.time()

    try:
        result = subprocess.run(
            ["python3", script_name],
            check=True,
            text=True
        )

        elapsed = time.time() - start_time
        print(f"\n✓ {description}完成")
        print(f"耗时：{elapsed/60:.1f} 分钟\n")
        return True

    except subprocess.CalledProcessError as e:
        print(f"\n✗ {description}失败")
        print(f"错误代码：{e.returncode}")
        return False
    except KeyboardInterrupt:
        print(f"\n\n⚠ 用户中断了 {description}")
        return False
    except Exception as e:
        print(f"\n✗ 运行 {script_name} 时出错：{e}")
        return False

def check_env():
    """检查环境配置"""
    print_section("环境检查")

    # 检查 API key
    if not os.getenv("DEEPSEEK_API_KEY"):
        print("✗ 错误：未设置环境变量 DEEPSEEK_API_KEY")
        print("\n请设置 DeepSeek API Key：")
        print("  export DEEPSEEK_API_KEY='your-api-key'")
        return False

    print("✓ DEEPSEEK_API_KEY 已设置")

    # 检查输入文件
    if not os.path.exists("n2.json"):
        print("✗ 错误：找不到输入文件 n2.json")
        return False

    print("✓ n2.json 文件存在")

    # 检查 prompts 目录
    if not os.path.exists("prompts"):
        print("✗ 错误：找不到 prompts 目录")
        return False

    required_prompts = [
        "prompts/enrich_word.txt",
        "prompts/validate_word.txt",
        "prompts/generate_questions.txt",
        "prompts/validate_questions.txt"
    ]

    for prompt_file in required_prompts:
        if not os.path.exists(prompt_file):
            print(f"✗ 错误：找不到 {prompt_file}")
            return False

    print("✓ 所有 prompt 模板文件存在")

    # 检查 Python 依赖
    try:
        import openai
        import tqdm
        print("✓ Python 依赖包已安装")
    except ImportError as e:
        print(f"✗ 错误：缺少 Python 依赖包")
        print(f"\n请安装依赖：")
        print(f"  pip install -r requirements.txt // 或者 python3 -m pip install -r requirements.txt")
        return False

    print("\n所有环境检查通过！\n")
    return True

def main():
    print("\n" + "╔" + "="*68 + "╗")
    print("║" + " "*20 + "言葉帖 Phase 1 数据生成管线" + " "*20 + "║")
    print("╚" + "="*68 + "╝")

    start_time = time.time()

    # 环境检查
    if not check_env():
        sys.exit(1)

    # 步骤 1: 单词富化
    if not run_script("enrich_words.py", "单词富化"):
        print("\n管线在步骤 1 失败，已终止。")
        sys.exit(1)

    # 步骤 2: 单词验证
    if not run_script("validate_words.py", "单词验证"):
        print("\n管线在步骤 2 失败，已终止。")
        sys.exit(1)

    # 步骤 3: 题目生成
    if not run_script("generate_questions.py", "题目生成"):
        print("\n管线在步骤 3 失败，已终止。")
        sys.exit(1)

    # 步骤 4: 题目验证
    if not run_script("validate_questions.py", "题目验证"):
        print("\n管线在步骤 4 失败，已终止。")
        sys.exit(1)

    # 完成
    total_elapsed = time.time() - start_time

    print_section("管线完成")
    print("✓ 所有步骤成功完成！")
    print(f"\n总耗时：{total_elapsed/60:.1f} 分钟")
    print(f"完成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    print("\n生成的文件：")
    output_files = [
        ("n2_enriched.json", "富化后的单词数据"),
        ("n2_validated.json", "验证通过的单词"),
        ("validation_report.json", "单词验证报告"),
        ("n2_questions.json", "生成的题目"),
        ("n2_questions_validated.json", "验证通过的题目"),
        ("question_validation_report.json", "题目验证报告")
    ]

    for filename, desc in output_files:
        if os.path.exists(filename):
            size_kb = os.path.getsize(filename) / 1024
            print(f"  ✓ {filename:<35} ({size_kb:.1f} KB) - {desc}")
        else:
            print(f"  ✗ {filename:<35} (未生成)")

    print("\n下一步：")
    print("  1. 查看验证报告，检查质量")
    print("  2. 对于 needs_review 的数据进行人工复核")
    print("  3. 将 n2_questions_validated.json 集成到 index.html")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠ 管线被用户中断")
        sys.exit(1)
