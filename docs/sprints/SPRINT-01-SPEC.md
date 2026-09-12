# Sprint 01：Question 核心题库实施规格

状态：按用户“开始第一阶段建设 / 继续”的指示实施。依据 PROJECT_PLAN.md 与 SPRINT_ROADMAP.md；不改变 D0～D17。

## 范围与目录

本次只实现 Sprint 1。Next.js App Router + React + TypeScript，Node.js 领域服务，better-sqlite3 + Drizzle，独立 Worker 入口（仅连库检查后退出）。不接入来源导入、模型、向量、去重、训练或调度。

- `src/app`：题库列表、创建、详情、编辑、词表管理，`/api` Route Handlers。
- `src/components`：交互表单与页面组件。
- `src/domain`：校验契约、题库与词表服务、导出。
- `src/db`、`drizzle`：Schema、连接和版本化迁移。
- `scripts`：迁移、Worker 入口。
- `tests`：独立临时数据库领域测试、Playwright 端到端测试。

## 字段级模型

全部主键为 UUID，时间为 UTC ISO 字符串；外键开启，写操作使用短事务，WAL + busy_timeout。

| 表 | 字段与约束 |
|---|---|
| questions | id；text 非空 ≤20000；taskType：EXPLAIN / DESIGN / IMPLEMENT / DEBUG / COMPARE / OTHER，默认 EXPLAIN；status：INBOX / ORGANIZED，默认 INBOX；creationMethod：USER_CREATED / MANUAL_IMPORT / WORKFLOW_IMPORT / MODEL_GENERATED；contentOrigin：SELF_CREATED / INTERVIEW / JD / PRACTICE / MODEL_GENERATED / OTHER；difficulty：UNKNOWN / EASY / MEDIUM / HARD；difficultySource：UNSPECIFIED / USER；notes、answer、hints 各 ≤20000；createdAt、updatedAt；archivedAt 可空；revision 乐观并发版本 |
| terms（Topic / Tag 的共享词表） | id；kind：TOPIC / TAG；name、nameKey（NFKC + 小写）同 kind 唯一；aliases JSON 数组；parentId 可空，仅 TOPIC 可拥有一级 TOPIC 父级；createdBy 固定 LOCAL_USER，creationSource 为 USER / SEED；createdAt、updatedAt |
| question_terms | questionId + termId 联合主键，外键限制删除；多领域、多标签 |
| original_wordings | id；questionId 外键；text 原文非空 ≤20000，保留空格；sourceType：SELF_CREATED / INTERVIEW / JD / PRACTICE / MODEL_GENERATED / OTHER；sourceLocator 非空 ≤2000（URL 或个人笔记位置）；extractionMethod 固定 MANUAL；confidence 可空；observedAt、createdAt |

首次迁移建立表、约束、索引；幂等初始化七个已确认一级领域。只创建用户题目，创建方式固定 USER_CREATED，内容来源固定 SELF_CREATED；其余枚举仅保留字段语义，不开放导入接口。难度由用户采用，不记录为来源难度。

Original Wording 是用户主动确认关联的原文，不支持随标准题编辑覆盖，也不产生面试出现记录。此阶段无 Evidence/Raw Document 表，因此保存独立来源类型、定位和观察时间，后续通过新迁移增加引用。

归档使用 archivedAt，与两种整理状态独立；恢复清空 archivedAt，保留归档前 status、问法、分类和备注。不提供物理删除。编辑带 revision，过期提交返回 409，避免多标签页覆盖。

## 页面与交互

- 全局左侧导航：题库、待整理、已归档、领域与标签；顶部显示本地题库；窄屏改为横向导航。
- 列表：标题、计数、新建、JSON 导出；关键词输入，状态/任务/难度/领域/标签筛选；题目卡片显示题文、属性、更新时间、命中依据；分页；空状态可新建或清除条件。
- 创建：只输入标准题目即可保存，其余默认值可展开整理；多选领域/标签；保存成功跳转详情；失败保留输入并显示原因，提交中禁用按钮。
- 详情：标准题目、属性、笔记/参考答案/提示、原始问法及定位；可编辑、归档/恢复、追加问法。
- 编辑：预填题目和分类，取消不提交；冲突提示刷新后重试；标准题目表单不包含问法字段。
- 词表：按领域/标签分组，新增、改名、编辑别名；领域最多两层；不删除，防止丢失已有关联。

## API 契约

响应为 `{ data: ... }`；错误为 `{ error: { code, message } }`，使用 400（输入）、404、409（冲突）、403（非本地/跨站）、500（脱敏失败）。仅接受 JSON 写入；校验字段、枚举、外键、长度和重复值。页面通过 API 调用领域服务；所有写入在领域层再次校验。

| 方法/路径 | 请求与响应 |
|---|---|
| GET /api/questions | q、status、taskType、difficulty、topicId、tagId、archive=active/archived/all、page；返回 items、total、page、pageSize |
| POST /api/questions | text 必填；taskType、status、difficulty、notes、answer、hints、topicIds、tagIds 可选；201 返回完整题目 |
| GET /api/questions/:id | 完整题目、terms、wordings |
| PATCH /api/questions/:id | revision 必填；可选编辑字段；不允许修改来源属性、问法、归档时间 |
| POST /api/questions/:id/archive 或 restore | 返回更新题目；重复操作幂等 |
| POST /api/questions/:id/wordings | text、sourceLocator 必填；sourceType 默认 OTHER、observedAt 默认当前；201 返回原文 |
| GET /api/terms | 领域与标签列表 |
| POST /api/terms | kind、name 必填；aliases 数组、parentId 可选；201 |
| PATCH /api/terms/:id | name、aliases 可编辑；父级建立后不移动 |
| GET /api/export | 一致性只读事务导出：formatVersion、exportedAt、questions（含归档）、terms、questionTerms、originalWordings；附件 JSON |

搜索采用字面包含，忽略英文大小写；`%`、`_` 是普通字符。搜索标准题、已确认问法和词表名称/别名，以 Question 去重；筛选 AND 组合；精确题文优先，其次更新时间与 ID 稳定排序；每页 20 项。

## 数据、风险与验证

默认数据目录 `./data`，可用 `YOWEB_DATA_DIR` 覆盖，`.env` 自动读取。迁移须显式运行；缺少迁移时报可操作的错误。生产/开发服务只绑定 127.0.0.1，API 限制本地主机与同源写入；无认证，不用于公网。

本阶段提供包含归档和关联的 JSON 导出，不声称完成 Sprint 8 自动备份/恢复 UI。SQLite 手动恢复必须先停 Web/Worker 并保留原库；README 提供安全备份办法。来源、模型密钥和检索评测样本不是 Sprint 1 的前置条件。

验证：空库迁移及重跑、七领域种子幂等、无来源创建、多个原文与编辑隔离、归档恢复、数据库关闭重开、组合筛选/字面查询、重复词表/非法父级/非法关联回滚、并发编辑冲突、完整导出；浏览器完成路线图示例，并测试错误提示、词表管理和移动布局；运行 typecheck、lint、test、test:e2e、build。
