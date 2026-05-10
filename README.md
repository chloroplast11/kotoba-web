# 言葉帖 (Kotoba-Chō)

> 一个"先理解，后练习"的 JLPT 单词学习应用

📘 想了解产品愿景与设计哲学，看 [PRODUCT.md](./PRODUCT.md)
🤖 改代码前请先看 [CLAUDE.md](./CLAUDE.md)

---

## 当前状态

**Phase 2 完成** — Next.js 15 + TypeScript + Tailwind + Prisma + SQLite，全 450 个 N2 单词 + 2320 道题目已入库。

> ℹ️ **关于词量**：当前 450 词是 MVP 版本的规模，仅作为体验验证使用。每个词条的富化数据（例句、搭配、近义词、用法注释）+ 多维度题目都需要消耗大量模型 token 生成，因此 MVP 阶段先聚焦 N2 子集跑通学习闭环。**上线前会补齐 N3 ~ N1 全部等级词汇**（合计约 5000–7000 词）。

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

## 语言策略

UI 文案分两区：

- **学习/品牌区（日语）**：首页、学习页、练习页、Round2、单词帖卡面、今日总结、顶部导航、运行时提示（加载/错误/空状态）
- **设置/管理区（中文）**：设置页、开发者模式、Library 词条 drawer 内的管理动作（5 档掌握度按钮、关闭、打开学习页等）
- **数据字段**：`meaningZh` / 例句中文翻译保持中文；R/P/U 维度名（認識/産出/運用）保持日语

具体规则与例外详见 [PRODUCT.md](./PRODUCT.md) §4 和 [CLAUDE.md](./CLAUDE.md) 规则 1。

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

> 优先级根据 2026-05 竞品调研结论调整（详见 `~/.claude/plans/logical-mixing-clock.md`）。

### Phase 3：核心差异化补强 ⭐⭐⭐（当前阶段）

- [x] R/P/U onboarding：首次启动说明卡 + 首页常驻副标题
- [x] R/P/U tooltip：Practice 页 pill / Library 进度条 hover
- [x] 快速复习模式：跳过 Learn 页 / 考前突击模式
- [ ] TTS 朗读单词 / 例句（Web Speech API）
- [ ] 听力题型：听音选汉字 / 听音选意思
- [x] 每天学习量用户可设置
- [x] 用户可手动标记 R/P/U 掌握状态（3 档：未学 / 学习中 / 精通）
- [x] 「快进到第二天」开发者模式
- [x] `Date.now()` → `getCurrentTime()` 统一

### Phase 4：词库扩展 ⭐⭐

> 上线前必须完成 N3 ~ N1 全量生成（MVP 期 450 词仅用于体验验证）。

- [ ] **N3 数据生成**（最优先，约 1500 词）
- [ ] 等级筛选与并行学习
- [ ] 跨等级单词处理
- [ ] N4 / N5 / N1 渐进生成
- [ ] **上线门槛**：N3 / N2 / N1 三级词库齐全，富化数据 + 题目均通过双模型验证

### Phase 5：学习闭环 ⭐⭐

- [ ] 错题本
- [ ] 学习日历
- [ ] 例句配音

### Phase 6：部署
- [ ] Auth.js 接入
- [ ] 多用户数据隔离
- [ ] 部署到 Vercel + Neon/Supabase
- [ ] PWA 离线

### Phase 7：题型扩展与 AI 批改 ⭐

- [ ] 假名 → 写汉字（IME 输入产出题）
- [ ] 句子重组（JLPT 文法常考）
- [ ] 造句题 + Claude 批改
- [ ] 中→日翻译 + AI 批改

### Phase 8：长期探索

- [ ] 助记法 / 社区分享 / 多语种 UI（与"静謐 / 緻密"哲学需平衡）

---

## 技术备注

- Prisma v7 使用 `@prisma/adapter-libsql`，DATABASE_URL 格式为 `file:dev.db`
- SRS 字段映射见 `src/lib/srs.ts`
- 队列构建逻辑见 `src/lib/queue.ts`（纯函数，可独立测试）
