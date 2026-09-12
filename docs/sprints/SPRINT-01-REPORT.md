# Sprint 1 实施与验证记录

日期：2026-09-12。状态：实现和自动化验收完成，等待用户体验验收；未进入 Sprint 2。

## 已交付

- Next.js 16 / React 19 / TypeScript 应用、Node.js 领域服务、SQLite + Drizzle 版本化迁移。
- 无来源创建 Question，列表/详情/编辑，任务类型、参考难度、两种整理状态，多领域/标签，备注、参考答案、提示。
- 独立的多个 Original Wording：保留原文空格、内容类型、定位及观察时间，编辑标准题不会覆盖原文。
- 归档/恢复，默认列表隐藏归档，恢复保留整理状态和关联。
- 字面关键词、原始问法、受控词表和别名查询，明确筛选、命中依据、20 项分页。
- 领域/标签新增、改名和别名管理，领域最多两层，人工确认创建；JSON 全量导出包含归档和关联。
- 本机绑定、页面/API Host 检查、跨站写入拒绝、JSON 校验、请求大小限制、事务回滚及过期编辑冲突保护。
- Worker 入口连库检查后退出；README 启动、迁移、测试、导出及手动数据保存说明。

## 主要文件

| 模块 | 文件 |
|---|---|
| 规格 | `docs/sprints/SPRINT-01-SPEC.md` |
| 数据结构与迁移 | `src/db/schema.ts`、`src/db/connection.ts`、`drizzle/0000_superb_leopardon.sql`、`drizzle/meta/` |
| 领域规则 | `src/domain/contracts.ts`、`src/domain/library.ts`、`src/domain/server.ts` |
| API / 本机访问 | `src/app/api/[...path]/route.ts`、`src/proxy.ts`、`src/http/local.ts` |
| 页面 | `src/app/page.tsx`、`src/app/questions/`、`src/app/taxonomy/page.tsx`、`src/app/globals.css` |
| 交互 | `src/components/forms.tsx`、`src/components/navigation.tsx` |
| 运行与测试 | `scripts/`、`tests/`、`playwright.config.ts`、`package.json`、`README.md` |

`AGENTS.md` 和 `CLAUDE.md` 由当前 Next.js 开发服务首次启动自动生成，保留为后续开发入口。已经核对安装版本附带的 Route Handler、Proxy 和 Server/Client Components 指南。原始 PROJECT_PLAN.md 和 SPRINT_ROADMAP.md 未改动。

## 验证结果

| 检查 | 结果与证据 |
|---|---|
| 空库迁移、重复迁移 | 通过；领域测试使用各自独立临时库，默认本机库也已迁移 |
| `npm test` | 10/10 通过：建题、原文隔离、重开数据库、归档恢复、失败回滚、版本冲突、词表边界、检索、分页、导出及外键约束 |
| `npm run test:e2e` | 4/4 通过，包含生产构建；完整浏览器演示、输入失败保留、API 错误路径、独立生产 Web 进程退出再启动 |
| 生产进程重启 | 保存已整理题目和原文并归档 → 关闭生产进程 → 新进程连接同库 → 完整对象一致 → 恢复原状态并读取页面 |
| 桌面 / 手机 | Chromium 1280px 与 390px 截图已人工查看，手机无水平溢出；创建、编辑、搜索、归档、恢复、导出均通过浏览器操作 |
| 筛选交互 | 清除后输入和下拉值重置，再提交不会复活旧条件 |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过 |
| `npm run format:check` | 通过；按 fix 技能意图使用项目自己的 npm/Prettier/ESLint 命令 |
| `npm run worker` | 连库成功后正常退出 |
| `npm audit --omit=dev` | 0 漏洞；开发工具链告警见 README |

浏览器报告位于 `playwright-report/index.html`，截图为 `test-results/library-desktop.png` 和 `test-results/library-mobile.png`，均不进入 Git。测试数据与正式 `data/` 隔离；没有向正式库写入演示题目。

首轮浏览器测试出现下拉框定位和 Next.js 路由播报器导致的测试定位冲突，已改为按控件角色及表单范围定位，最终完整重跑通过。实现检查同时修复了清除筛选后无控表单可能保留旧值的问题。

## 实施假设与后续边界

1. 第一阶段按路线图解释为 Sprint 1（计划书的基础工程阶段），不是来源导入阶段。
2. 用户“开始建设 / 继续”作为本阶段实施授权，先落规格后实现；D0～D17 未变更。
3. 整理状态只有 INBOX/ORGANIZED，归档为独立时间字段，符合可恢复语义。
4. Topic/Tag 共用带 kind 的词表；逻辑上分别管理，关联时验证类别。Original Wording 此阶段通过人工提交即确认关联，并保存独立原文定位；Evidence 等外键后续迁移引入。
5. 本轮选择路线图允许的“基础数据导出”，没有实现 JSON 导入、自动备份或恢复 UI；不把导出称为一键恢复。
6. 没有实现采集、模型、向量、关系合并、训练或调度。检索为本地包含查询，尚未进行 Sprint 6 的语义评估和大数据量性能评估。

用户可按 README 启动后体验路线图的 Coding Agent 示例；用户体验验收尚待完成。下一阶段需另行按 Sprint 2 规格推进。
