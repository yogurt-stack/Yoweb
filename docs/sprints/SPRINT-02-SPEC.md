# Sprint 02：来源、证据与收录 Inbox

状态：根据用户“进行下一阶段”开始实施；沿用 Sprint 1 已验证的题库，不改变 D0～D17。

## 本阶段范围

手动登记来源，录入 URL、标题、合法摘录及个人笔记；可手动添加候选题，进入收录 Inbox 后接受、修改后接受、关联已有题目或忽略。建立材料版本、证据、资料 Mention 和人工确认的 Interview Occurrence，分别展示统计。支持公司、岗位、面试经历最小上下文及材料失效状态。

不请求外部站点、不接入模型、不自动提取、不做语义去重/合并，也不自动创建面试出现记录。手动输入同一材料可识别重复；这不是自动判定两道题相同。

## 增量数据模型

新增表使用 UUID 与 UTC ISO 时间，外键限制物理删除。原有 Question 与整理状态保留。Original Wording 新增可空 `evidenceId` 外键，旧原始问法无需迁移到伪造的来源对象。

| 对象 | 核心字段与约束 |
|---|---|
| Source | name、type（NIUKE/GITHUB/LEETCODE/COMPANY/BLOG/OTHER/SELF）、host；仅 MANUAL 获取；rulesStatus（UNCHECKED/USER_CONFIRMED/RESTRICTED）、policyNote；localPolicy（METADATA_ONLY/EXCERPT/FULL）、llmPolicy（UNKNOWN/DENY/ALLOW）；host + type 唯一 |
| Raw Document | sourceId、canonicalUrl 唯一、contentOrigin（与 Question 同枚举）、currentVersionId、status（VALID/UNAVAILABLE/NEEDS_CHECK/PROHIBITED）、firstObservedAt、lastCheckedAt；来源和内容类型建立后不可静默变更 |
| Raw Document Version | documentId、fingerprint（同材料内唯一）、title、excerpt、fullText、notes、localPolicy、llmPolicy、observedAt；历史版本不覆盖 |
| Import Batch | documentVersionId、fingerprint 唯一、createdAt；重复相同材料版本和候选输入返回已有批次 |
| Import Item | batchId、proposedText、taskType、originalText、locator、fingerprint、status（REVIEW_PENDING/ACCEPTED/EDITED/IGNORED）、revision、acceptedQuestionId、evidenceId、reviewedAt；原始问法与采用的标准题分离 |
| Evidence | questionId、documentVersionId、sourceUrl、scope（LINK/EXCERPT）、excerpt、personalNote、locator、observedAt、localPolicy、llmPolicy；相同题目/版本/证据指纹唯一 |
| Question Mention | questionId、documentId 联合唯一，firstEvidenceId、createdAt；一份资料的多个版本或多个片段只计一次 |
| Company | name、nameKey 唯一 |
| Job | companyId 可空、title、url 可空、documentId 可空（仅 JD）、identityKey 唯一、observedAt；岗位要求不自动生成题目/面试 |
| Interview | documentId（仅 INTERVIEW 材料）、reportKey（该材料内可区分的一段经历）、companyId/jobId 可空、dateFrom/dateTo 可空、round、credibility、notes；documentId + reportKey 唯一 |
| Interview Occurrence | questionId、interviewId 联合唯一、evidenceId、reportNote、confirmedBy、createdAt；必须人工明确确认，证据必须属于该题与该经历来源材料 |

正文、摘录、个人笔记单字段上限 20000 字。候选题每批最多 50，关键词仍按 Sprint 1 语义。版本指纹包含允许保存的内容、标题、个人笔记及权限快照；无实质变化只更新最近检查时间，不新增版本或 Mention。

## 内容权限与证据规则

- 默认只存链接/元数据/个人笔记，外发权限 UNKNOWN；本地保存与模型外发是独立选项。
- Source 只有用户记录已检查及判断依据，才可选择保存摘录/全文或允许外发。RESTRICTED 来源禁止收录；来源与材料 URL 主机必须一致或为其子域。
- 材料保存级别不能超过 Source 许可上限；外发 ALLOW 必须同时有 Source ALLOW。本阶段不实际调用模型。
- METADATA_ONLY 不接受材料摘录、全文或候选原文；EXCERPT 不接受全文。候选原文若填写，必须是本次允许保存材料内容中的字面片段；否则校验失败，事务不落部分数据。
- 只有带原文的候选会生成 Original Wording。只存链接时可输入个人整理的候选题及笔记，证据标为链接，不伪造原文。
- 手动审核新建题目的 creationMethod 是 MANUAL_IMPORT，contentOrigin 取材料类型；关联已有题只追加证据，不覆盖既有题文、来源属性或分类。
- 材料更新只生成新版本和审核批次，绝不静默改写既有 Question。历史证据继续指向原版本。
- 标记页面失效不会删除历史版本、证据和笔记。PROHIBITED 停止新的接受/证据关联，但保留既有记录；不通过页面状态切换自动撤销历史合法内容。

## 审核与统计

每项接受在独立短事务中完成 Question（或用户指定已有题）→ Evidence → 可选 Original Wording → Mention → 标记已审核。事务失败保持待审核。批量请求逐项执行并返回各项成功/失败，不因一项失败丢失其余成功项。

所有写入带运行时校验。审核携带 revision 防止多标签页覆盖；重复已经完成的相同决定幂等，冲突决定返回 409。编辑只修改待审核题目文本和任务，不改写原始问法；“修改后接受”作为一个事务。

资料收录次数 = distinct documentId；面试报告次数 = distinct interviewId，且必须有用户确认的 Occurrence。创建 Interview 本身不会增加某题面试次数；JD、练习和普通汇编材料不能创建 Interview。相同经历重复报告同一道题只计一次。不同材料是否描述同一真实经历不自动判断，用户应避免将转载重复建立为独立经历。

## 页面与 API

保留题库导航，增加「来源材料」「收录 Inbox」。表单失败保留输入、提交期间禁用操作、审核结果区分逐项成功与失败。

| 页面 | 交互 |
|---|---|
| /sources | 来源登记与权限说明、已有来源列表、材料列表、手动收录入口 |
| /sources/:id | 来源策略及该来源材料列表 |
| /imports/new | 选来源、URL、类型、标题、保存/外发级别、合法内容与笔记；手动增减候选，提交进入批次详情 |
| /inbox | 待审核批次与候选数量，以及已处理记录入口 |
| /imports/:id | 材料证据预览、候选原文与标准题并列、逐项编辑/选择已有题、批量接受/忽略、逐项结果；已接受可跳题目 |
| /documents/:id | 当前/历史版本、失效状态、笔记、权限、收录批次；INTERVIEW 材料添加经历，JD 材料添加岗位上下文 |
| /questions/:id | 独立资料/面试次数、证据链接与片段、面试上下文；从已有面经证据手动确认报告出现；可通过材料审核为该题后补来源 |

API 保持 `/api` JSON `{ data }` / `{ error }` 包装与本机同源写入限制。新增：

- `GET/POST /sources`、`GET /sources/:id`
- `GET /documents`、`GET/PATCH /documents/:id`（PATCH 仅状态）
- `POST /imports/manual`、`GET /imports/:id`、`GET /inbox`
- `POST /inbox/review`：`items: [{ id, revision, decision: ACCEPT|IGNORE, text?, taskType?, targetQuestionId? }]`
- `POST /interviews`、`POST /jobs`（公司通过人工名称规范化建立）
- `GET /questions/:id/evidence`、`POST /questions/:id/occurrences`：`interviewId、evidenceId、reportNote、confirmedReported: true`
- 全量导出升级 formatVersion 2，追加新表，保留原字段。

## 迁移与验收

先备份当前本机库，再运行新增迁移；不重写 Sprint 1 初始迁移。验证旧库升级后原 Question/原始问法未改变，空库迁移与重跑也必须通过。

领域测试覆盖：权限越界全回滚、只保存 URL/元数据、重复 URL/内容与批次幂等、旧原文隔离、版本变化不覆盖题文、同资料多版本不重复计 Mention、相同经历不重复计 Occurrence、JD/GitHub 汇编/练习不自动成为面试、跨题/跨材料证据拒绝、批量部分失败和审核冲突、来源失效后的历史保留、导出新关联。

浏览器走完路线图双候选面经示例，另验证仅链接收录、修改后接受、忽略、关联已有题、失效状态及移动布局。运行全部领域测试、类型/lint/格式检查、构建与端到端回归。GitHub API、模型和训练仍留在后续阶段。
