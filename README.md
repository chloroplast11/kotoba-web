# 言葉帖 (Kotoba-Chō)

> 一个"先理解，后练习"的 JLPT 单词学习应用

📘 想了解产品愿景与设计哲学，看 [PRODUCT.md](./PRODUCT.md)
🤖 改代码前请先看 [CLAUDE.md](./CLAUDE.md)

---

## 当前状态

**Phase 2 完成** — Next.js 15 + TypeScript + Tailwind + Prisma + SQLite，全 450 个 N2 单词 + 2320 道题目已入库。

原型文件 `index.html` 保留作参考。

---

## 快速上手

```bash
npm install
npm run dev        # 启动开发服务器 http://localhost:3000
```

首次运行会自动从 `n2_enriched.json` / `n2_questions.json` 构建今日队列（无需手动导入，数据已在 `dev.db`）。

重置数据库：

```bash
npm run db:seed    # 清空并重新导入全部词汇和题目
```

---

## 项目结构

```
kotobaWeb/
├── src/
│   ├── app/               # Next.js App Router 页面
│   │   ├── page.tsx       # 首页（今日队列）
│   │   ├── learn/[wordId] # 单词学习页
│   │   ├── practice/      # 练习页
│   │   ├── library/       # 单词帖（全词网格）
│   │   ├── summary/       # 今日总结
│   │   ├── round2/        # 第二回过渡页
│   │   └── api/           # API Routes
│   ├── components/        # React 组件
│   ├── lib/               # 核心逻辑（srs, queue, db, constants）
│   ├── store/             # Zustand 状态管理
│   └── types/             # TypeScript 类型
├── prisma/
│   ├── schema.prisma      # 数据库模型
│   └── seed.ts            # 从 JSON 导入数据
├── dev.db                 # SQLite 数据库
├── index.html             # 原型文件（保留参考）
├── n2_enriched.json       # 450 个富化 N2 词汇
└── n2_questions.json      # 2320 道题目
```

---

## 设计决策（已确定）

- **目标用户**：自用 + 给别人用，前者优先
- **掌握度模型**：3 维度（**認識 R / 産出 P / 運用 U**）+ 软依赖解锁
  - R 始终解锁
  - P 在 R stability ≥ 3 天后解锁
  - U 在 P stability ≥ 3 天后解锁
  - 低频词 U 维度默认锁死（用户可手动开启）
- **新词当日两轮制**：
  - Round 1（即时测试效应）：学一个测一个
  - Round 2（间隔检索效应）：所有新词学完后用**不同的题**再测一遍
  - 低频词第一天只有 Round 1（减负）
- **SRS**：`ts-fsrs` v5，每个维度独立调度
- **视觉方向**：editorial × 日式静謐 — 大量留白、衬线字体、克制色彩

---

## 已完成（Phase 1 + Phase 2）

✅ 数据生成管线：450 个 N2 词富化 + 2320 道题目生成
✅ Next.js 15 + Prisma v7 + SQLite 全栈架构
✅ ts-fsrs 多维度 SRS 调度
✅ 首页（今日队列概览 + 统计）
✅ Learn 页：单词富化数据完整展示（例句/搭配/近义词/使用提示）
✅ Practice 页：4选1题目，含解析反馈
✅ Library 页：450 词卡片网格，R/P/U 进度可视化
✅ Summary 页：本日学习总结
✅ 多维度 SRS 调度（含新维度首次出题机制）
✅ 维度交错（避免 R/P/U 题目分块）
✅ 低频词 U 维度可选解锁
✅ 新词当日两轮制

---

## 后续 TODO

### Phase 3：体验细化

- [ ] 全 UI 文案改为日语（保留中/英文释义和缩略字母例外）
- [ ] R/P/U 三次元说明：首页宣传 + Library hover/tap 说明
- [ ] 每天的学习量用户可以设置
- [ ] 用户可以自己标记 R/P/U 掌握状态
- [ ] 「快进到第二天」开发者模式（`getCurrentTime()` 已预留接口）
- [ ] `Date.now()` → `getCurrentTime()` 统一

### Phase 4：题型扩展

- [ ] 听写题（TTS 朗读 → 选汉字 / 写假名）
- [ ] 假名 → 写汉字（IME 输入产出题）
- [ ] 句子重组（JLPT 文法常考）

### Phase 5：AI 批改题

- [ ] 造句题 + Claude 批改
- [ ] 中→日翻译 + AI 批改

### Phase 6：用户系统与部署

- [ ] Auth.js 接入
- [ ] 多用户数据隔离
- [ ] 部署到 Vercel + Neon/Supabase

### Phase 7：多 JLPT 等级支持

- [ ] N5/N4/N3/N1 数据生成
- [ ] 等级筛选与并行学习

---

## 技术备注

- Prisma v7 使用 `@prisma/adapter-libsql`，DATABASE_URL 格式为 `file:dev.db`
- SRS 字段映射见 `src/lib/srs.ts`
- 队列构建逻辑见 `src/lib/queue.ts`（纯函数，可独立测试）
