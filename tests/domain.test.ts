import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDatabase, migrateDatabase, type Connection } from '../src/db/connection';
import { Library } from '../src/domain/library';
import { DomainError } from '../src/domain/contracts';

let connection: Connection, library: Library, directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'yoweb-domain-'));
  connection = openDatabase(join(directory, 'test.sqlite'));
  migrateDatabase(connection);
  library = new Library(connection);
});
afterEach(() => {
  connection.sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

test('空库迁移可重复，种子领域改名后不会复活旧名称', () => {
  assert.equal(library.listTerms().length, 7);
  const agent = library.listTerms().find((t) => t.name === 'Agent')!;
  library.updateTerm(agent.id, { name: '智能体', aliases: ['Agent'] });
  migrateDatabase(connection);
  assert.equal(library.listTerms().length, 7);
  assert.equal(library.listTerms().find((t) => t.id === agent.id)!.name, '智能体');
  assert.equal(connection.sqlite.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(connection.sqlite.pragma('integrity_check', { simple: true }), 'ok');
});

test('无来源创建 Question，创建方式与内容来源独立', () => {
  const q = library.createQuestion({ text: '如何设计 Coding Agent 的工具重试机制？' });
  assert.equal(q.status, 'INBOX');
  assert.equal(q.creationMethod, 'USER_CREATED');
  assert.equal(q.contentOrigin, 'SELF_CREATED');
  assert.equal(q.difficulty, 'UNKNOWN');
  assert.deepEqual(q.wordings, []);
  assert.deepEqual(q.topics, []);
  assert.equal(library.listQuestions().total, 1);
});

test('多个原始问法保留原文与定位，标准题编辑不覆盖原文', () => {
  const q = library.createQuestion({ text: '设计重试机制' });
  const first = library.addWording(q.id, {
    text: '  工具调用失败了，如何重试？\n',
    sourceType: 'SELF_CREATED',
    sourceLocator: '个人笔记 / 第 3 节',
  });
  library.addWording(q.id, {
    text: '怎样实现可靠重试？',
    sourceLocator: '笔记 / 第 4 节',
    observedAt: '2026-01-01T10:00:00Z',
  });
  const revision = library.getQuestion(q.id).revision;
  const updated = library.updateQuestion(q.id, {
    text: '设计幂等、退避与重试上限',
    taskType: 'DESIGN',
    status: 'ORGANIZED',
    difficulty: 'HARD',
    notes: '关键点',
    answer: '有限重试',
    hints: '先考虑失败',
    revision,
  });
  assert.equal(updated.wordings.length, 2);
  assert.deepEqual(
    updated.wordings.find((w) => w.id === first.id),
    first,
  );
  assert.equal(first.text, '  工具调用失败了，如何重试？\n');
  assert.equal(updated.difficultySource, 'USER');
  assert.throws(() => library.updateQuestion(q.id, { revision: updated.revision, wordings: [] }));
});

test('归档幂等、恢复保留整理状态及所有关联，关闭重开后仍可恢复', () => {
  const topic = library.listTerms()[0],
    tag = library.createTerm({ kind: 'TAG', name: 'Tool Calling' });
  const q = library.createQuestion({
    text: '归档验证',
    status: 'ORGANIZED',
    topicIds: [topic.id],
    tagIds: [tag.id],
  });
  library.addWording(q.id, { text: '原始问法', sourceLocator: '个人笔记' });
  const archived = library.setArchived(q.id, true);
  assert.equal(library.listQuestions().total, 0);
  assert.equal(library.listQuestions({ archive: 'archived' }).total, 1);
  assert.deepEqual(library.setArchived(q.id, true), archived);
  connection.sqlite.close();
  connection = openDatabase(join(directory, 'test.sqlite'));
  library = new Library(connection);
  assert.deepEqual(library.getQuestion(q.id), archived);
  const restored = library.setArchived(q.id, false);
  assert.equal(restored.status, 'ORGANIZED');
  assert.equal(restored.wordings.length, 1);
  assert.equal(restored.topics[0].id, topic.id);
  assert.equal(restored.tags[0].id, tag.id);
  assert.equal(library.listQuestions().total, 1);
  assert.equal(restored.archivedAt, null);
});

test('非法输入、非法关联及编辑事务失败均不会留下部分修改', () => {
  const tag = library.createTerm({ kind: 'TAG', name: '事务' });
  for (const input of [
    { text: '   ' },
    { text: 'x', status: 'MASTERED' },
    { text: 'x', creationMethod: 'MODEL_GENERATED' },
    { text: 'x', topicIds: [randomUUID()] },
    { text: 'x', topicIds: [tag.id] },
    { text: 'x'.repeat(20001) },
  ]) {
    assert.throws(() => library.createQuestion(input));
  }
  assert.equal(library.listQuestions().total, 0);
  const q = library.createQuestion({ text: '保存前', tagIds: [tag.id] });
  assert.throws(() =>
    library.updateQuestion(q.id, {
      revision: q.revision,
      text: '不应保存',
      topicIds: [randomUUID()],
    }),
  );
  assert.deepEqual(library.getQuestion(q.id), q);
  assert.throws(() => library.addWording(q.id, { text: '', sourceLocator: '笔记' }));
  assert.throws(() => library.addWording(q.id, { text: '原文', sourceLocator: '' }));
  assert.throws(() => library.addWording(randomUUID(), { text: '原文', sourceLocator: '笔记' }));
  assert.equal(library.exportData().originalWordings.length, 0);
});

test('过期编辑返回冲突，归档不被旧编辑撤销', () => {
  const q = library.createQuestion({ text: '原题' });
  library.updateQuestion(q.id, { revision: q.revision, text: '新题' });
  assert.throws(
    () => library.updateQuestion(q.id, { revision: q.revision, text: '旧页面的编辑' }),
    (e: unknown) => e instanceof DomainError && e.status === 409,
  );
  const current = library.getQuestion(q.id);
  library.setArchived(q.id, true);
  assert.throws(() =>
    library.updateQuestion(q.id, { revision: current.revision, status: 'ORGANIZED' }),
  );
  assert.ok(library.getQuestion(q.id).archivedAt);
});

test('词表名称及别名规范化去重，父级限制两层且标签不可做父级', () => {
  const topic = library.createTerm({ kind: 'TOPIC', name: '工具', aliases: ['tools'] });
  assert.throws(() => library.createTerm({ kind: 'TOPIC', name: 'ＴＯＯＬＳ' }));
  assert.throws(() => library.createTerm({ kind: 'TOPIC', name: 'new', aliases: ['tools'] }));
  assert.throws(() => library.createTerm({ kind: 'TAG', name: 'same', aliases: ['SAME'] }));
  const child = library.createTerm({ kind: 'TOPIC', name: '重试', parentId: topic.id });
  assert.throws(() => library.createTerm({ kind: 'TOPIC', name: '退避', parentId: child.id }));
  assert.throws(() => library.createTerm({ kind: 'TAG', name: '失败', parentId: topic.id }));
  const tag = library.createTerm({ kind: 'TAG', name: '工具' });
  assert.throws(() => library.createTerm({ kind: 'TOPIC', name: '标签的子级', parentId: tag.id }));
  assert.throws(() =>
    library.createTerm({ kind: 'TOPIC', name: '无父级', parentId: randomUUID() }),
  );
  const q = library.createQuestion({ text: '测试', topicIds: [topic.id] });
  library.updateTerm(topic.id, { name: '工具工程', aliases: ['工具', 'tools'] });
  assert.equal(library.getQuestion(q.id).topics[0].name, '工具工程');
});

test('关键词字面包含、原文去重、词表别名和 AND 筛选独立可用', () => {
  const topic = library.listTerms().find((t) => t.name === 'Agent')!;
  const tag = library.createTerm({ kind: 'TAG', name: 'Tool Calling', aliases: ['工具调用'] });
  const q = library.createQuestion({
    text: 'retry 100%_safe',
    taskType: 'DESIGN',
    status: 'ORGANIZED',
    difficulty: 'MEDIUM',
    topicIds: [topic.id],
    tagIds: [tag.id],
  });
  library.addWording(q.id, { text: '失败如何重试', sourceLocator: '笔记 1' });
  library.addWording(q.id, { text: '另一个失败问法', sourceLocator: '笔记 2' });
  library.createQuestion({ text: 'unrelated', taskType: 'EXPLAIN' });
  for (const q of ['RETRY', '%_', '失败', '工具调用', 'Agent'])
    assert.equal(library.listQuestions({ q }).total, 1);
  const results = library.listQuestions({
    q: '失败',
    taskType: 'DESIGN',
    difficulty: 'MEDIUM',
    status: 'ORGANIZED',
    topicId: topic.id,
    tagId: tag.id,
  });
  assert.equal(results.total, 1);
  assert.ok(results.items[0].matchReasons.includes('原始问法命中'));
  assert.equal(library.listQuestions({ q: '失败', taskType: 'EXPLAIN' }).total, 0);
  assert.equal(library.listQuestions({ topicId: tag.id }).total, 0);
  assert.equal(library.listQuestions({ q: "' OR 1=1 --" }).total, 0);
  assert.equal(library.listQuestions({ q: '完全无关词' }).total, 0);
  assert.throws(() => library.listQuestions({ page: -1 }));
});

test('精确命中优先、分页稳定且不重复，越界页回到最后一页', () => {
  const exact = library.createQuestion({ text: 'target' });
  for (let i = 0; i < 23; i++) library.createQuestion({ text: `target extra ${i}` });
  const first = library.listQuestions({ q: 'target' }),
    second = library.listQuestions({ q: 'target', page: 2 });
  assert.equal(first.total, 24);
  assert.equal(first.items[0].id, exact.id);
  assert.equal(first.items.length, 20);
  assert.equal(second.items.length, 4);
  assert.equal(new Set([...first.items, ...second.items].map((q) => q.id)).size, 24);
  assert.equal(library.listQuestions({ q: 'target', page: 99 }).page, 2);
});

test('导出包含归档与全部关联，可脱离 UI 阅读；外键禁止静默删除', () => {
  const q = library.createQuestion({ text: '导出测试', topicIds: [library.listTerms()[0].id] });
  library.addWording(q.id, { text: '导出原文', sourceLocator: '本地笔记' });
  library.setArchived(q.id, true);
  const data = JSON.parse(JSON.stringify(library.exportData()));
  assert.equal(data.formatVersion, 2);
  assert.equal(data.questions[0].id, q.id);
  assert.ok(data.questions[0].archivedAt);
  assert.equal(data.originalWordings[0].questionId, q.id);
  assert.equal(data.questionTerms[0].questionId, q.id);
  assert.equal(data.terms.length, 7);
  assert.throws(() => connection.sqlite.prepare('DELETE FROM questions WHERE id = ?').run(q.id));
});
