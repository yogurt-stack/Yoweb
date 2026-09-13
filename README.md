# Yoweb · 个人面试题库

基于 [项目计划](PROJECT_PLAN.md) 的本机 Web 应用。当前已实现 Sprint 1 核心题库与 Sprint 2 来源、证据和收录 Inbox。具体契约见 [Sprint 1 规格](docs/sprints/SPRINT-01-SPEC.md)、[Sprint 2 规格](docs/sprints/SPRINT-02-SPEC.md)，本轮结果见 [Sprint 2 验收记录](docs/sprints/SPRINT-02-REPORT.md)。

## 本机启动

需要 Node.js 22+ 和 npm。首次安装 better-sqlite3 时若无适配的预编译文件，需要本机 C/C++ 编译工具（macOS 可安装 Xcode Command Line Tools）。

```sh
npm ci
npm run db:migrate
npm run dev
```

打开 <http://127.0.0.1:3000>。如端口已被占用：`npm run dev -- --port 3001`。程序只绑定本机地址，没有账号或公网部署入口。

正式运行：

```sh
npm run build
npm start
```

停止服务使用启动终端中的 Ctrl+C。重启执行同样命令，题库会从本地数据库恢复。

## 数据目录与迁移

默认数据库是 `data/yoweb.sqlite`，开发和正式运行使用同一个数据目录。可复制 `.env.example` 为 `.env`，设置 `YOWEB_DATA_DIR` 为固定绝对路径；迁移、Web、Worker 必须使用相同配置。所有命令从项目根目录执行。

`npm run db:migrate` 从空库创建 Schema，并幂等初始化计划书中的七个一级领域。它可以重复执行，不会清空题库或重复添加已改名的初始领域。数据库未初始化时，页面提示先执行迁移。`drizzle/` 中的 SQL 和迁移元数据需要进入版本控制；不要修改已经应用的迁移，Schema 变更使用 `npm run db:generate` 生成下一份迁移后再运行 `db:migrate`。

SQLite 启用外键、WAL 和 5 秒繁忙等待。数据库、`.env`、依赖、测试截图和构建输出均已被 `.gitignore` 排除。

从 Sprint 1 升级需执行 `npm run db:migrate`，新增来源等 11 张表及 Original Wording 的可空证据引用，原始迁移不变。迁移前先保存数据库副本；本轮本机库已使用 SQLite 在线备份生成 `data/backups/before-sprint-02-1789224607880.sqlite`。旧库升级和重复迁移均有测试，已有题目、状态和原文不被改写。

## 已实现的操作

1. 点击「添加题目」，只填标准题目即可保存，无需来源。
2. 在创建或编辑时选择作答任务、参考难度、整理状态、多领域和多标签，保存个人备注、参考答案及提示。
3. 在「领域与标签」中手动新增/改名和管理别名；领域最多两层。新名称和别名不能与同类已有词条冲突。
4. 在详情页「关联原始问法」填写原文和定位，可追加多个。原文独立保存；标准题目编辑不会覆盖它，也不会自动产生真实面试出现记录。
5. 搜索题文、已确认问法、领域/标签及别名；筛选条件组合执行，不需要模型。搜索 `%`、`_` 只按字面匹配。
6. 归档题目后正常列表隐藏；从「已归档」进入详情恢复，原整理状态和关联完整保留。
7. 点击「导出题库」下载含归档、词表、关联、原文的版本化 JSON，可脱离页面阅读和迁移。
8. 在「来源材料」登记来源主机、平台、规则检查与权限依据；本地保存范围和模型外发权限分别记录，默认仅链接、外发未确认。
9. 点击「手动收录材料」，保存 URL、标题和个人笔记；获准时可附摘录/全文。手动添加候选题，保存后进入收录 Inbox，尚未进入正式题库。
10. 在审核页修改标准题、批量接受/忽略，或搜索并关联已有题。每项独立事务，失败项可重试，成功项不回滚；原文不能被标准题改写。
11. 对面经材料，在材料详情建立可区分的面试经历和公司/岗位/日期上下文，然后在题目详情明确确认报告出现。JD 只保存岗位上下文，普通汇编与练习材料不能建立面试经历。
12. 在题目详情分别查看资料收录次数和面试报告次数。前者按材料去重，后者按人工确认的经历去重；同一材料多版本不会增加次数。
13. 从材料详情继续收录/更新，保留旧版本和证据，新的题目变化需再次审核；页面失效可手动标记，已有合法证据与笔记继续保留。

多标签页过期编辑会返回冲突并保留当前输入，请先自行复制需要保留的输入，再刷新获取新版本。词表新增后，需要重新进入题目编辑页以选择新词条。

来源主机、类型和材料内容类型建立后不支持静默更换。来源权限目前在登记时确定；后续配置维护会随来源适配继续完善。保存原文前需记录人工检查与依据，候选原文必须能在本次允许保存的摘录/全文中逐字找到。仅链接模式请填写个人整理的候选题，不粘贴原文。相同链接/版本/候选重复提交会返回已有批次，不重新创建已审核题目。不同材料是否为同一经历的转载不自动判断，应避免重复建立独立经历。

## 手动保存与恢复数据

当前提供完整 JSON 导出，尚无 JSON 导入或自动备份/恢复界面。Sprint 2 导出的 `formatVersion` 为 2，保留题库原字段并追加来源、材料版本、收录批次/候选、证据、Mention、公司/岗位、Interview 和 Occurrence。JSON 导出是可迁移数据，不等于已实现一键恢复。

需要 SQLite 文件备份时，先停止本项目所有 Web 和 Worker 进程，再复制整个配置的数据目录到一个新的版本化目录；不要在运行中仅复制 `.sqlite` 而忽略 `-wal`。恢复时保留当前数据目录，创建新的目录放入备份，通过 `YOWEB_DATA_DIR` 指向该副本，运行迁移后启动应用检查；确认完整前不覆盖原库。

## 验证命令

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:e2e
npm run worker
```

- `npm test`：23 项领域测试，每项使用独立临时 SQLite，包括 Sprint 1 回归、真实旧库升级、权限越界、重复收录、审核幂等、模拟数据库中途失败、双口径统计、证据错配及导出。
- `npm run test:e2e`：先构建生产版本，然后运行 7 项浏览器/API/进程重启验收。测试以独立生产服务使用临时目录及 3100 端口，不写入 `data/`，不会复用已启动的服务或争用 3000 端口开发服务的锁。macOS 已有 Google Chrome 时自动使用；其他环境先执行 `npx playwright install chromium`。也可设置 `PLAYWRIGHT_CHANNEL=chrome` 使用本机 Chrome。
- 浏览器报告：`playwright-report/index.html`；截图包含 `test-results/library-desktop.png`、`library-mobile.png`、`sprint-02-review.png`、`sprint-02-evidence.png` 和 `sprint-02-evidence-mobile.png`。E2E 临时数据保留在系统临时目录方便检查，不属于正式题库。
- `npm run worker`：连接迁移后的数据库，输出检查结果后退出。它是后续 Worker 的入口骨架，本阶段没有定时任务。
- `npm run format`：仅格式化实现、测试和配置，不改动原始计划书。项目使用 npm 的 Prettier/ESLint 命令，对应 fix 技能的格式化与 lint 检查步骤。

## 工程结构

```text
src/app/         Next.js 页面和 /api Route Handlers
src/components/ 表单、导航
src/domain/     题库领域服务、来源/材料/审核/证据/面试上下文服务及输入契约
src/db/         Drizzle Schema、SQLite 连接和迁移初始化
src/http/       本机请求边界
src/proxy.ts    页面与 API 的本地主机检查
drizzle/        版本化数据库迁移
scripts/        迁移和 Worker 入口
tests/          领域测试及浏览器/生产重启测试
```

页面读取通过服务层；写入通过 JSON API，再由领域服务校验并事务提交。Topic 和 Tag 共用带 `kind` 判别的受控词表，Question 可以拥有任意多个关联。归档时间与 INBOX/ORGANIZED 整理状态独立，避免恢复时丢失原状态。

## 当前边界

自动来源采集、LLM、Embedding、去重合并、训练、调度和自动备份属于后续 Sprint，尚未实现。本阶段没有访问任何外部材料站点，来源权限由用户手动记录；也没有模型提取置信度。原始问法已可通过 Evidence 追溯材料版本，原有无证据引用的原文继续保留。题库列表每页 20 项，采用 SQLite 包含查询；来源与 Inbox 当前面向个人小规模材料，尚无大规模分页与性能评估。

依赖版本由 `package-lock.json` 固定，Sprint 2 未增改依赖版本。Sprint 1 的 `npm audit --omit=dev` 无漏洞；当时完整审计报告 Drizzle Kit 开发工具链的旧 esbuild 存在 4 条中等告警（同一依赖链）。本项目不启动 Drizzle Studio/esbuild 开发服务器；未采用审计建议的破坏性降级，后续应随 Drizzle Kit 稳定版修复升级。
