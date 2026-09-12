# Yoweb · 个人面试题库

基于 [项目计划](PROJECT_PLAN.md) 的本机 Web 应用。当前实现 Sprint 1：Question 核心题库；具体契约见 [Sprint 1 规格](docs/sprints/SPRINT-01-SPEC.md)。

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

## 已实现的操作

1. 点击「添加题目」，只填标准题目即可保存，无需来源。
2. 在创建或编辑时选择作答任务、参考难度、整理状态、多领域和多标签，保存个人备注、参考答案及提示。
3. 在「领域与标签」中手动新增/改名和管理别名；领域最多两层。新名称和别名不能与同类已有词条冲突。
4. 在详情页「关联原始问法」填写原文和定位，可追加多个。原文独立保存；标准题目编辑不会覆盖它，也不会自动产生真实面试出现记录。
5. 搜索题文、已确认问法、领域/标签及别名；筛选条件组合执行，不需要模型。搜索 `%`、`_` 只按字面匹配。
6. 归档题目后正常列表隐藏；从「已归档」进入详情恢复，原整理状态和关联完整保留。
7. 点击「导出题库」下载含归档、词表、关联、原文的版本化 JSON，可脱离页面阅读和迁移。

多标签页过期编辑会返回冲突并保留当前输入，请先自行复制需要保留的输入，再刷新获取新版本。词表新增后，需要重新进入题目编辑页以选择新词条。

## 手动保存与恢复数据

Sprint 1 提供完整 JSON 导出，尚无 JSON 导入或自动备份/恢复界面。JSON 导出是可迁移数据，不等于已实现一键恢复。

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

- `npm test`：10 项领域测试，每项使用独立临时 SQLite，测试后移除本测试创建的目录。
- `npm run test:e2e`：先构建生产版本，然后运行浏览器演示、错误路径、API 校验及独立生产进程停止/重启验证。测试使用临时目录及 3100 端口，不写入 `data/`，不会复用已启动的服务。macOS 已有 Google Chrome 时自动使用；其他环境先执行 `npx playwright install chromium`。也可设置 `PLAYWRIGHT_CHANNEL=chrome` 使用本机 Chrome。
- 浏览器报告：`playwright-report/index.html`；桌面/手机截图：`test-results/library-desktop.png`、`test-results/library-mobile.png`。E2E 临时数据保留在系统临时目录方便检查，不属于正式题库。
- `npm run worker`：连接迁移后的数据库，输出检查结果后退出。它是后续 Worker 的入口骨架，本阶段没有定时任务。
- `npm run format`：仅格式化实现、测试和配置，不改动原始计划书。项目使用 npm 的 Prettier/ESLint 命令，对应 fix 技能的格式化与 lint 检查步骤。

## 工程结构

```text
src/app/         Next.js 页面和 /api Route Handlers
src/components/ 表单、导航
src/domain/     输入契约、Question/Original Wording/Topic/Tag 领域服务
src/db/         Drizzle Schema、SQLite 连接和迁移初始化
src/http/       本机请求边界
src/proxy.ts    页面与 API 的本地主机检查
drizzle/        版本化数据库迁移
scripts/        迁移和 Worker 入口
tests/          领域测试及浏览器/生产重启测试
```

页面读取通过服务层；写入通过 JSON API，再由领域服务校验并事务提交。Topic 和 Tag 共用带 `kind` 判别的受控词表，Question 可以拥有任意多个关联。归档时间与 INBOX/ORGANIZED 整理状态独立，避免恢复时丢失原状态。

## 当前边界

来源采集、Evidence、Import Inbox、LLM、Embedding、去重合并、训练、调度和自动备份属于后续 Sprint，尚未实现。原始问法本阶段保存原文类型、定位和观察时间，后续迁移再增加 Source/Evidence 外键。列表每页 20 项，本阶段采用 SQLite 包含查询，不声称已经实现语义检索或大规模检索优化。

依赖版本由 `package-lock.json` 固定。本轮 `npm audit --omit=dev` 无漏洞；完整审计报告 Drizzle Kit 开发工具链的旧 esbuild 存在 4 条中等告警（同一依赖链）。本项目不启动 Drizzle Studio/esbuild 开发服务器；未采用审计建议的破坏性降级，后续应随 Drizzle Kit 稳定版修复升级。
