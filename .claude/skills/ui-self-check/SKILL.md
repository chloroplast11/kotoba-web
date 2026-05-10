---
name: ui-self-check
description: 用户显式要求「测试 UI / 自动测 UI / check UI / 看下页面对不对」时使用。通过 chrome-devtools MCP 打开 localhost:3000 截屏并读取 console，自查最近一次 UI 改动是否有视觉错位、控制台报错、断点响应失败。**仅在用户明确要求时触发，不要在普通改完代码后自动跑**。
---

# UI 自检流程

## 触发条件

仅当用户输入包含明确意图：「测试 UI」「自动测一下 UI」「check UI」「看看页面对不对」「截图看看」等。**不要主动触发**——光是「改了 UI 代码」不是触发条件。

## 前置检查

1. 用 `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` 确认 dev server 已启动。如果不是 200，停下告诉用户「请先启动 `bun dev`」，**不要自己起服务**。
2. 确认 `chrome-devtools` MCP 工具可用（应能看到 `mcp__chrome-devtools__take_screenshot` 等工具）。如果不可用，告诉用户「检查 .mcp.json 是否启用，可能需要 `/mcp` 重连」。

## 检查目标推断

根据本轮对话或 `git diff --name-only` 的改动文件推断要检查的路由：

| 改动路径 | 要检查的页面 |
|---|---|
| `src/components/library/**` 或 `src/app/library/**` | `/library`，并打开第一张词条 drawer |
| `src/components/learn/**` 或 `src/app/learn/**` | `/learn/1`（任一已知 wordId） |
| `src/app/practice/**` | `/practice` |
| `src/components/home/**` 或 `src/app/page.tsx` | `/` |
| `src/app/summary/**` | `/summary` |
| `src/app/settings/**` 或 `src/components/settings/**` | `/settings` |
| `src/components/layout/Masthead.tsx` | `/`、`/library`、`/settings` 全跑 |
| `src/app/globals.css` | 改动相关的全部页面（见上） |

如果改动跨多个区域，**最多检查 3 条路由**，避免冗余截图烧 token。

## 检查步骤

对每条选定路由：

1. `mcp__chrome-devtools__navigate_page`（url=`http://localhost:3000{path}`）
2. `mcp__chrome-devtools__take_screenshot`（full page）—— Claude 自己看图
3. `mcp__chrome-devtools__list_console_messages` —— 抓 error/warning
4. 桌面截图后，再用 `mcp__chrome-devtools__resize_page`（width=375, height=812）切到移动断点，再截一次（项目响应式断点是 720px，移动断点必须验）
5. 如果该页有 drawer/弹层（如 Library），用 `click` 工具点开第一张卡再截一张

## 报告格式

按路由分块列出，每块包含：

- **桌面**：✅ 正常 / ⚠️ 描述视觉问题（按钮错位、间距异常、颜色不对、文字被截）
- **移动**：✅ / ⚠️
- **Console**：error / warning 原文（如有）
- **如有问题**：定位到具体的 .tsx / .css 文件 + 行号，给出修复建议（不直接改，等用户确认）

最后给一句总结：「N 条路由全部通过 / 发现 N 个问题，建议修 X」。

## 项目硬规则提醒（CLAUDE.md）

检查文案问题时套这两条规则：

- **日语区 / 中文区**：首页/学/练/Library 卡面/总结/Masthead 必须日语；`/settings`、Library drawer 内部管理动作必须中文。错区文案算视觉 bug。
- **R/P/U 必须配日文全称**：孤立的 `R`、`P`、`U` 字母没有 `認識/産出/運用` 配对算 bug。

## 不要做

- ❌ 自己起 dev server / 杀进程 / 改端口
- ❌ 截图后用 Read 重新打开 .png 文件——MCP 已经把图片喂给你了
- ❌ 把所有路由都跑一遍——按改动范围裁剪
- ❌ 不要在每次代码 Edit 后都跑这个流程，只有用户说「测 UI」才跑
