import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { openDatabase, migrateDatabase, type Connection } from '../src/db/connection';
import { Ingestion } from '../src/domain/ingestion';
import { Library } from '../src/domain/library';

let connection: Connection, ingest: Ingestion, library: Library, directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'yoweb-ingestion-'));
  connection = openDatabase(join(directory, 'test.sqlite'));
  migrateDatabase(connection);
  ingest = new Ingestion(connection);
  library = new Library(connection);
});
afterEach(() => {
  connection.sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

function source(type: 'OTHER' | 'GITHUB' | 'LEETCODE' = 'OTHER') {
  return ingest.createSource({
    name: '测试来源',
    type,
    host: 'example.org',
    rulesStatus: 'USER_CONFIRMED',
    policyNote: '测试自有内容，允许保存片段',
    localPolicy: 'EXCERPT',
    llmPolicy: 'DENY',
  });
}
function material(sourceId: string, overrides = {}) {
  return {
    sourceId,
    url: 'https://example.org/report',
    title: '自有测试面经',
    contentOrigin: 'INTERVIEW',
    localPolicy: 'EXCERPT',
    excerpt: '第一题：如何重试？\n第二题：如何停止？',
    notes: '个人笔记',
    candidates: [
      { text: '设计重试机制', originalText: '如何重试？', locator: '第 1 题', taskType: 'DESIGN' },
      { text: '设计停止条件', originalText: '如何停止？', locator: '第 2 题', taskType: 'DESIGN' },
    ],
    ...overrides,
  };
}
function accept(id: string, more: Record<string, unknown> = {}) {
  const result = ingest.review({ items: [{ id, revision: 1, decision: 'ACCEPT', ...more }] })[0];
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('接受失败');
  return result.item;
}

test('仅 URL/标题/笔记可以收录，不生成题目、原文或面试', () => {
  const s = ingest.createSource({ name: '链接来源', type: 'OTHER', host: 'example.org' });
  const batch = ingest.importManual({
    sourceId: s.id,
    url: 'https://example.org/link',
    title: '链接',
    notes: '个人笔记',
  });
  assert.equal(batch.items.length, 0);
  assert.equal(batch.version.excerpt, '');
  assert.equal(library.listQuestions().total, 0);
  const exported = library.exportData();
  assert.equal(exported.originalWordings.length, 0);
  assert.equal(exported.interviewOccurrences.length, 0);
  assert.equal(batch.version.llmPolicy, 'UNKNOWN');
});

test('权限独立校验且越界/虚构原文完整回滚', () => {
  assert.throws(() =>
    ingest.createSource({
      name: '违规来源',
      type: 'OTHER',
      host: 'example.org',
      localPolicy: 'FULL',
    }),
  );
  const s = source();
  for (const overrides of [
    { localPolicy: 'FULL' },
    { llmPolicy: 'ALLOW' },
    { localPolicy: 'METADATA_ONLY' },
    { fullText: '未获准全文' },
    { url: 'https://other.example/report' },
    { candidates: [{ text: '幻觉', originalText: '材料中没有这句', locator: '第 1 段' }] },
  ]) {
    assert.throws(() => ingest.importManual(material(s.id, overrides)));
  }
  assert.equal(ingest.listDocuments().length, 0);
  assert.equal(ingest.listBatches().length, 0);
  const blocked = ingest.createSource({
    name: '禁止',
    host: 'restricted.example',
    type: 'OTHER',
    rulesStatus: 'RESTRICTED',
  });
  assert.throws(() =>
    ingest.importManual({
      sourceId: blocked.id,
      url: 'https://restricted.example/a',
      title: '不允许',
    }),
  );
});

test('URL 规范化、候选重排及相同内容重复导入复用批次和版本', () => {
  const input = material(source().id),
    first = ingest.importManual(input);
  const second = ingest.importManual({
    ...input,
    url: 'https://example.org/report?utm_source=x#section',
    candidates: [...input.candidates].reverse(),
  });
  assert.equal(first.id, second.id);
  assert.equal(second.duplicate, true);
  assert.equal(second.unchanged, true);
  assert.equal(ingest.getDocument(first.document.id).versions.length, 1);
  accept(first.items[0].id);
  const third = ingest.importManual(input);
  assert.equal(third.items.find((i) => i.id === first.items[0].id)!.status, 'ACCEPTED');
  assert.equal(library.listQuestions().total, 1);
  assert.throws(() => ingest.importManual({ ...input, contentOrigin: 'JD' }));
  // Significant query parameters distinguish different materials.
  assert.notEqual(
    ingest.importManual({ ...input, url: 'https://example.org/report?page=2' }).document.id,
    first.document.id,
  );
});

test('修改后接受与忽略分离：原文不覆盖，只有接受的题进入正式题库', () => {
  const batch = ingest.importManual(material(source().id));
  assert.equal(library.listQuestions().total, 0);
  const item = accept(batch.items[0].id, { text: '设计可靠重试（修订）', taskType: 'IMPLEMENT' });
  assert.equal(item.status, 'EDITED');
  const q = library.getQuestion(item.acceptedQuestionId!);
  assert.equal(q.text, '设计可靠重试（修订）');
  assert.equal(q.creationMethod, 'MANUAL_IMPORT');
  assert.equal(q.contentOrigin, 'INTERVIEW');
  assert.equal(q.wordings[0].text, batch.items[0].originalText);
  assert.equal(q.wordings[0].evidenceId, item.evidenceId);
  assert.equal(
    ingest.review({ items: [{ id: batch.items[1].id, revision: 1, decision: 'IGNORE' }] })[0].ok,
    true,
  );
  assert.equal(library.listQuestions().total, 1);
  assert.equal(ingest.questionEvidence(q.id).occurrenceCount, 0);
});

test('审核幂等；冲突决定和过期版本不覆盖已处理项', () => {
  const batch = ingest.importManual(material(source().id)),
    first = accept(batch.items[0].id);
  assert.deepEqual(accept(batch.items[0].id), first);
  assert.equal(library.listQuestions().total, 1);
  assert.equal(
    ingest.review({ items: [{ id: first.id, revision: 1, decision: 'IGNORE' }] })[0].ok,
    false,
  );
  assert.equal(
    ingest.review({ items: [{ id: batch.items[1].id, revision: 9, decision: 'ACCEPT' }] })[0].ok,
    false,
  );
  assert.equal(ingest.getBatch(batch.id).items[1].status, 'REVIEW_PENDING');
});

test('批量部分失败保留成功项，失败候选可重试且不残留半条记录', () => {
  const batch = ingest.importManual(material(source().id));
  const results = ingest.review({
    items: [
      { id: batch.items[0].id, revision: 1, decision: 'ACCEPT' },
      { id: batch.items[1].id, revision: 1, decision: 'ACCEPT', targetQuestionId: randomUUID() },
      { id: 'bad', revision: 1, decision: 'ACCEPT' },
    ],
  });
  assert.deepEqual(
    results.map((r) => r.ok),
    [true, false, false],
  );
  assert.equal(library.listQuestions().total, 1);
  assert.equal(library.exportData().evidence.length, 1);
  assert.equal(ingest.getBatch(batch.id).items[1].status, 'REVIEW_PENDING');
  accept(batch.items[1].id);
  assert.equal(library.listQuestions().total, 2);
});

test('模拟落库中途失败，Question/原文/证据/Mention 全回滚并可重试', () => {
  const batch = ingest.importManual(material(source().id));
  connection.sqlite.exec(
    "CREATE TRIGGER reject_evidence BEFORE INSERT ON evidence BEGIN SELECT RAISE(ABORT, 'fixture failure'); END",
  );
  assert.equal(
    ingest.review({ items: [{ id: batch.items[0].id, revision: 1, decision: 'ACCEPT' }] })[0].ok,
    false,
  );
  const failed = library.exportData();
  assert.equal(failed.questions.length, 0);
  assert.equal(failed.originalWordings.length, 0);
  assert.equal(failed.evidence.length, 0);
  assert.equal(failed.questionMentions.length, 0);
  assert.equal(ingest.getBatch(batch.id).items[0].status, 'REVIEW_PENDING');
  connection.sqlite.exec('DROP TRIGGER reject_evidence');
  accept(batch.items[0].id);
});

test('已有题关联同资料多个片段/新版本只计一次 Mention，不改写题文', () => {
  const q = library.createQuestion({ text: '个人标准题' }),
    input = material(source().id),
    batch = ingest.importManual(input);
  for (const item of batch.items) accept(item.id, { targetQuestionId: q.id });
  assert.equal(ingest.questionEvidence(q.id).mentionCount, 1);
  assert.equal(ingest.questionEvidence(q.id).proofs.length, 2);
  const newer = ingest.importManual({
    ...input,
    excerpt: `${input.excerpt}\n补充说明`,
    notes: '新的笔记',
  });
  assert.notEqual(newer.version.id, batch.version.id);
  assert.equal(library.getQuestion(q.id).text, '个人标准题');
  accept(newer.items[0].id, { targetQuestionId: q.id });
  assert.equal(ingest.questionEvidence(q.id).mentionCount, 1);
  assert.equal(library.getQuestion(q.id).creationMethod, 'USER_CREATED');
  assert.equal(ingest.getDocument(batch.document.id).versions.length, 2);
  assert.ok(
    ingest
      .questionEvidence(q.id)
      .proofs.some((p) => p.version.id === batch.version.id && p.personalNote === '个人笔记'),
  );
});

test('GitHub 汇编、LeetCode 练习和 JD 只产生资料 Mention，不能建立面试经历', () => {
  const gh = source('GITHUB');
  for (const [index, contentOrigin] of ['OTHER', 'PRACTICE', 'JD', 'MODEL_GENERATED'].entries()) {
    const batch = ingest.importManual(
      material(gh.id, { contentOrigin, url: `https://example.org/${index}` }),
    );
    const item = accept(batch.items[0].id);
    assert.equal(ingest.questionEvidence(item.acceptedQuestionId!).mentionCount, 1);
    assert.equal(ingest.questionEvidence(item.acceptedQuestionId!).occurrenceCount, 0);
    assert.throws(() =>
      ingest.createInterview({ documentId: batch.document.id, reportKey: '不能创建' }),
    );
    if (contentOrigin === 'JD') {
      const job = ingest.createJob({
        documentId: batch.document.id,
        title: '后端工程师',
        companyName: '测试公司',
      });
      assert.equal(ingest.listJobs(batch.document.id)[0].id, job.id);
    }
  }
  assert.equal(library.exportData().interviews.length, 0);
});

test('人工确认面试出现，去重统计一段经历，跨题/跨材料证据拒绝', () => {
  const batch = ingest.importManual(material(source().id)),
    first = accept(batch.items[0].id),
    second = accept(batch.items[1].id);
  const input = {
    documentId: batch.document.id,
    reportKey: '叙述者 A 的面试',
    companyName: '测试公司',
    jobTitle: 'AI 工程师',
    dateFrom: '2026-09-01',
    round: '技术一面',
  };
  const interview = ingest.createInterview(input);
  assert.deepEqual(ingest.createInterview(input), interview);
  assert.equal(ingest.questionEvidence(first.acceptedQuestionId!).occurrenceCount, 0);
  const report = {
    interviewId: interview.id,
    evidenceId: first.evidenceId,
    reportNote: '原文第 1 题明确描述',
    confirmedReported: true,
  };
  const occurrence = ingest.addOccurrence(first.acceptedQuestionId!, report);
  assert.deepEqual(ingest.addOccurrence(first.acceptedQuestionId!, report), occurrence);
  assert.equal(ingest.questionEvidence(first.acceptedQuestionId!).occurrenceCount, 1);
  assert.equal(ingest.questionEvidence(second.acceptedQuestionId!).occurrenceCount, 0);
  assert.throws(() =>
    ingest.addOccurrence(first.acceptedQuestionId!, { ...report, confirmedReported: false }),
  );
  assert.throws(() => ingest.addOccurrence(second.acceptedQuestionId!, report));
  const other = ingest.importManual(
    material(batch.source.id, { url: 'https://example.org/other' }),
  );
  const otherInterview = ingest.createInterview({
    documentId: other.document.id,
    reportKey: '另一段经历',
  });
  assert.throws(() =>
    ingest.addOccurrence(first.acceptedQuestionId!, { ...report, interviewId: otherInterview.id }),
  );
  assert.throws(() => ingest.createInterview({ ...input, dateTo: '2026-08-31' }));
  assert.equal(library.exportData().companies.length, 1);
  assert.equal(library.exportData().jobs.length, 1);
});

test('失效材料保留已有证据，禁止收录状态拒绝新的接受', () => {
  const batch = ingest.importManual(material(source().id)),
    item = accept(batch.items[0].id);
  const before = ingest.questionEvidence(item.acceptedQuestionId!).proofs[0].excerpt;
  ingest.setDocumentStatus(batch.document.id, { status: 'UNAVAILABLE' });
  assert.equal(ingest.questionEvidence(item.acceptedQuestionId!).proofs[0].excerpt, before);
  assert.equal(ingest.getDocument(batch.document.id).versions.length, 1);
  ingest.setDocumentStatus(batch.document.id, { status: 'PROHIBITED' });
  assert.equal(
    ingest.review({ items: [{ id: batch.items[1].id, revision: 1, decision: 'ACCEPT' }] })[0].ok,
    false,
  );
  assert.equal(ingest.questionEvidence(item.acceptedQuestionId!).mentionCount, 1);
});

test('JSON 导出和关闭重开保留来源、版本与所有证据关系', () => {
  const batch = ingest.importManual(material(source().id)),
    item = accept(batch.items[0].id);
  const interview = ingest.createInterview({ documentId: batch.document.id, reportKey: 'A' });
  ingest.addOccurrence(item.acceptedQuestionId!, {
    interviewId: interview.id,
    evidenceId: item.evidenceId,
    reportNote: '明确问过',
    confirmedReported: true,
  });
  connection.sqlite.close();
  connection = openDatabase(join(directory, 'test.sqlite'));
  library = new Library(connection);
  ingest = new Ingestion(connection);
  const exported = JSON.parse(JSON.stringify(library.exportData()));
  assert.equal(exported.formatVersion, 2);
  assert.equal(exported.sources.length, 1);
  assert.equal(exported.documentVersions.length, 1);
  assert.equal(exported.questionMentions.length, 1);
  assert.equal(exported.interviewOccurrences.length, 1);
  assert.equal(exported.originalWordings[0].evidenceId, exported.evidence[0].id);
  assert.equal((connection.sqlite.pragma('foreign_key_check') as unknown[]).length, 0);
});

test('真实 Sprint 1 数据库升级不改写既有题目与原始问法，迁移可重跑', () => {
  const legacy = openDatabase(join(directory, 'legacy.sqlite')),
    folder = join(directory, 'legacy-migrations');
  try {
    mkdirSync(join(folder, 'meta'), { recursive: true });
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
    journal.entries = journal.entries.slice(0, 1);
    writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify(journal));
    copyFileSync('drizzle/0000_superb_leopardon.sql', join(folder, '0000_superb_leopardon.sql'));
    migrate(legacy.db, { migrationsFolder: folder });
    legacy.sqlite
      .prepare(
        "INSERT INTO questions(id,text,task_type,status,creation_method,content_origin,difficulty,difficulty_source,created_at,updated_at) VALUES ('legacy','旧题','DESIGN','ORGANIZED','USER_CREATED','SELF_CREATED','UNKNOWN','UNSPECIFIED','2026-09-01','2026-09-01')",
      )
      .run();
    legacy.sqlite
      .prepare(
        "INSERT INTO original_wordings(id,question_id,text,source_type,source_locator,extraction_method,observed_at,created_at) VALUES ('old-wording','legacy','  保留原文  ','SELF_CREATED','旧笔记','MANUAL','2026-09-01','2026-09-01')",
      )
      .run();
    const before = legacy.sqlite.prepare('SELECT * FROM questions').all();
    migrateDatabase(legacy);
    migrateDatabase(legacy);
    assert.deepEqual(legacy.sqlite.prepare('SELECT * FROM questions').all(), before);
    const original = legacy.sqlite
      .prepare('SELECT text,evidence_id FROM original_wordings')
      .get() as { text: string; evidence_id: string | null };
    assert.equal(original.text, '  保留原文  ');
    assert.equal(original.evidence_id, null);
    assert.equal((legacy.sqlite.pragma('foreign_key_check') as unknown[]).length, 0);
  } finally {
    legacy.sqlite.close();
  }
});
