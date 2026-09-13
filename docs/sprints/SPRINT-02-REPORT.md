# Sprint 2 实施与验证记录

日期：2026-09-12。状态：实现与自动化验收完成，待用户体验验收；未进入 Sprint 3。

## 已实现的能力

来源登记与权限标记、URL/标题/个人笔记录入、按权限保存摘录或全文、手动添加候选题、收录 Inbox、批量接受/忽略、修改后接受、关联已有题、材料版本与失效状态、证据追溯、资料 Mention 和人工确认的 Interview Occurrence，以及公司/岗位/面试经历上下文。

同一材料版本和同一批候选重复导入返回已有批次，不重置审核结果。审核前不创建正式题目；新建题的创建方式是 MANUAL_IMPORT、内容来源取材料类型。关联既有题只追加证据，不改变其题文、分类或原有内容来源。

资料收录按 Question + Raw Document 去重；面试报告按 Question + Interview 去重，必须由用户通过现有证据明确确认。普通汇编、JD、练习材料不能建立 Interview；JD 可单独保存岗位上下文。新版本不覆盖旧题文或旧证据，失效状态也不删除历史内容。

## 主要变更文件

| 模块 | 文件 |
|---|---|
| 实施规格 | `docs/sprints/SPRINT-02-SPEC.md` |
| 增量迁移 | `drizzle/0001_cold_toro.sql`、`drizzle/meta/0001_snapshot.json`、迁移 journal |
| 领域模型 | `src/db/schema.ts`、`src/domain/ingestion-contracts.ts` |
| 收录与审核服务 | `src/domain/ingestion.ts`、`src/domain/server.ts` |
| API | `src/app/api/[...path]/route.ts` |
| 页面与交互 | `src/app/sources/`、`src/app/imports/`、`src/app/inbox/`、`src/app/documents/`、`src/components/ingestion-forms.tsx`、`src/components/source-views.tsx` |
| 现有题库集成 | Question 详情、导航、编辑说明、`Library.exportData()` 的 formatVersion 2 导出 |
| 测试 | `tests/ingestion.test.ts`、`tests/e2e/sprint-02.spec.ts`、旧导出测试的版本断言、Playwright 生产服务配置 |
| 运行说明 | `README.md` |

原有计划书和路线图未改变。沿用 D0～D17 的数据语义，未新增依赖、外部请求、模型调用或自动抓取流程。

## 数据保护与迁移

本机库升级前使用 SQLite 在线备份生成：

`data/backups/before-sprint-02-1789224607880.sqlite`

新增 11 张表，保留原 4 张表；Original Wording 只增加可空的 Evidence 引用。已执行 `npm run db:migrate`，没有修改已应用的 `0000` 迁移。旧库升级测试通过真正的 Sprint 1 SQL 初始化数据库、写入旧题/原文后应用 Sprint 2 迁移，验证原题字段逐项不变、原文空格保留、证据引用为 NULL、外键完整性正常；重复迁移仍通过。

测试全部使用独立临时 SQLite，不往正式库写入演示材料。备份与数据库不进入 Git。

## 验证结果

| 检查 | 结果 |
|---|---|
| `npm test` | 23/23 通过：原 10 项回归 + 13 项来源、权限、审核、统计和迁移测试 |
| `npm run test:e2e` | 7/7 通过，命令内含生产构建；包含原 Sprint 1 浏览器/API/独立进程重启回归 |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过 |
| `npm run format:check` | 通过；按 fix 技能意图使用项目现有 npm/Prettier/ESLint 命令处理测试格式问题 |
| `git diff --check` | 通过 |
| 桌面与手机检查 | 查看 1280px 审核页面及 390px 证据页截图；没有水平溢出，移动导航按两行排布 |

新增领域验证包括：

- 仅 URL/标题/笔记收录不强制原文、不生成题目或面试。
- 未确认权限、超出保存范围、外发越界、不属于来源主机和虚构原文均被拒绝，事务全回滚。
- URL 追踪参数、候选顺序变化与重复提交不会增加版本/批次；已审核结果不被复活为待审核。
- 修改后接受保留原文；忽略不入库；同决定重试幂等、冲突决定和过期版本返回失败。
- 批量混合成功/失败逐项返回；使用 SQLite 触发器模拟写入 Evidence 中途失败，确认题目、原文、证据、Mention 全部回滚，移除故障后可重试。
- 同资料多个片段和新版本关联已有题时只计一次 Mention，既有题文、创建方式不变，历史证据保留。
- GitHub 普通汇编、练习、JD 和模型生成材料不会自动成为真实面试经历。
- 用户确认报告出现前次数为 0；同一经历重复确认只计一次；跨题、跨材料证据和未经确认的请求被拒绝。
- 页面失效保留已有证据；停止收录拒绝新接受；导出与数据库重开后保留新关联。

浏览器演示使用自有测试夹具，不访问真实外部站点：

1. 登记面经来源和摘录权限 → 手动输入三个候选 → 两项批量接受（其中一项修改后接受）、一项忽略 → 建立一段含公司/岗位的面试经历 → 只为第一题确认面试报告 → 第一题显示 1 份资料 / 1 段报告，第二题显示 1 份资料 / 0 段报告。
2. 只保存 JD 链接与个人笔记 → 候选关联已有自建题 → 原题文本和 SELF_CREATED 属性保持不变 → 保存岗位上下文 → 标记页面失效 → 重复收录复用同批次，证据和一次资料计数继续保留，面试次数仍为 0。
3. 通过真实 API 验证权限越界、批量部分失败及失败项后续忽略。

报告：`playwright-report/index.html`。截图：`test-results/sprint-02-review.png`、`sprint-02-evidence.png`、`sprint-02-evidence-mobile.png`。

测试初次启动与现有 3000 端口开发服务争用 Next.js 开发锁，已将 E2E 服务改为独立 3100 端口的生产服务；测试不再需要停止日常开发页面。另修正了包含“个人笔记”的下拉选项造成的测试定位歧义，以及长页截图的滚动位置，最终完整重跑通过。

## 假设与已知边界

- 用户“进行下一阶段”作为进入 Sprint 2 的授权；本轮只完成 Sprint 2。
- 来源规则和许可由用户人工记录，没有自动验证外部网站条款。来源权限目前在登记时确定，不提供权限编辑；材料状态可调整。
- 手动候选没有模型提取置信度，页面明确标注人工整理；没有构造虚假的模型分数。
- 同一材料内通过经历标识区分 Interview；不同材料是否为同一经历的转载需要人工辨别，不做自动实体合并。
- 来源与 Inbox 当前采用个人规模的完整列表；未实现大规模分页、自动调度或检索评测。
- JSON 导出已包含新增实体与关系，自动备份、JSON 导入和恢复界面仍在后续阶段；本轮迁移前备份不意味着完成 Sprint 8。
- GitHub 白名单自动导入、LLM、Embedding、去重合并与训练未实现；下一阶段按 Sprint 3 规格另行推进。
