import { and, asc, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { Connection } from '../db/connection';
import { newId } from '../db/connection';
import { originalWordings, questions, questionTerms, terms } from '../db/schema';
import {
  sources,
  documents,
  documentVersions,
  importBatches,
  importItems,
  evidence,
  questionMentions,
  companies,
  jobs,
  interviews,
  interviewOccurrences,
} from '../db/schema';
import {
  createQuestionInput,
  updateQuestionInput,
  wordingInput,
  termInput,
  termUpdateInput,
  listInput,
  DomainError,
  normalized,
} from './contracts';

export class Library {
  constructor(private connection: Connection) {}
  private get db() {
    return this.connection.db;
  }
  private transaction<T>(fn: () => T): T {
    return this.connection.sqlite.transaction(fn).immediate();
  }

  listTerms() {
    return this.db.select().from(terms).orderBy(asc(terms.kind), asc(terms.nameKey)).all();
  }

  private checkTermNames(
    kind: 'TOPIC' | 'TAG',
    name: string,
    aliases: string[],
    exceptId?: string,
  ) {
    const keys = [name, ...aliases].map(normalized);
    if (new Set(keys).size !== keys.length)
      throw new DomainError('DUPLICATE_TERM', '名称和别名不能重复', 409);
    for (const term of this.listTerms().filter((t) => t.kind === kind && t.id !== exceptId)) {
      if ([term.name, ...term.aliases].some((v) => keys.includes(normalized(v)))) {
        throw new DomainError('DUPLICATE_TERM', `名称或别名与「${term.name}」重复`, 409);
      }
    }
  }

  createTerm(input: unknown) {
    const data = termInput.parse(input);
    return this.transaction(() => {
      this.checkTermNames(data.kind, data.name, data.aliases);
      if (data.parentId) {
        const parent = this.db.select().from(terms).where(eq(terms.id, data.parentId)).get();
        if (data.kind !== 'TOPIC' || !parent || parent.kind !== 'TOPIC' || parent.parentId) {
          throw new DomainError(
            'INVALID_PARENT',
            '领域只支持两层，请选择一级领域作为父级；标签不能有父级',
          );
        }
      }
      const now = new Date().toISOString();
      return this.db
        .insert(terms)
        .values({
          ...data,
          id: newId(),
          nameKey: normalized(data.name),
          creationSource: 'USER',
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
    });
  }

  updateTerm(id: string, input: unknown) {
    const data = termUpdateInput.parse(input);
    return this.transaction(() => {
      const old = this.db.select().from(terms).where(eq(terms.id, id)).get();
      if (!old) throw new DomainError('NOT_FOUND', '领域或标签不存在', 404);
      this.checkTermNames(old.kind, data.name, data.aliases, id);
      return this.db
        .update(terms)
        .set({ ...data, nameKey: normalized(data.name), updatedAt: new Date().toISOString() })
        .where(eq(terms.id, id))
        .returning()
        .get()!;
    });
  }

  private questionRow(id: string) {
    const row = this.db.select().from(questions).where(eq(questions.id, id)).get();
    if (!row) throw new DomainError('NOT_FOUND', '题目不存在', 404);
    return row;
  }

  getQuestion(id: string) {
    const row = this.questionRow(id);
    const linked = this.db
      .select({ term: terms })
      .from(questionTerms)
      .innerJoin(terms, eq(questionTerms.termId, terms.id))
      .where(eq(questionTerms.questionId, id))
      .all()
      .map((v) => v.term);
    const wordings = this.db
      .select()
      .from(originalWordings)
      .where(eq(originalWordings.questionId, id))
      .orderBy(asc(originalWordings.createdAt), asc(originalWordings.id))
      .all();
    return {
      ...row,
      topics: linked.filter((t) => t.kind === 'TOPIC'),
      tags: linked.filter((t) => t.kind === 'TAG'),
      wordings,
    };
  }

  private setTerms(id: string, topicIds: string[], tagIds: string[]) {
    const known = this.listTerms();
    for (const [kind, selected] of [
      ['TOPIC', topicIds],
      ['TAG', tagIds],
    ] as const) {
      if (selected.some((termId) => !known.some((t) => t.id === termId && t.kind === kind))) {
        throw new DomainError('INVALID_TERM', '所选领域或标签不存在，或类型不匹配');
      }
    }
    this.db.delete(questionTerms).where(eq(questionTerms.questionId, id)).run();
    const links = [...topicIds, ...tagIds].map((termId) => ({ questionId: id, termId }));
    if (links.length) this.db.insert(questionTerms).values(links).run();
  }

  createQuestion(input: unknown) {
    const { topicIds, tagIds, ...data } = createQuestionInput.parse(input);
    return this.transaction(() => {
      const id = newId(),
        now = new Date().toISOString();
      this.db
        .insert(questions)
        .values({
          ...data,
          id,
          creationMethod: 'USER_CREATED',
          contentOrigin: 'SELF_CREATED',
          difficultySource: data.difficulty === 'UNKNOWN' ? 'UNSPECIFIED' : 'USER',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      this.setTerms(id, topicIds, tagIds);
      return this.getQuestion(id);
    });
  }

  updateQuestion(id: string, input: unknown) {
    const { topicIds, tagIds, revision, ...data } = updateQuestionInput.parse(input);
    return this.transaction(() => {
      const old = this.getQuestion(id);
      if (old.revision !== revision)
        throw new DomainError(
          'EDIT_CONFLICT',
          '题目已在其他页面更新，请刷新后重新编辑；当前输入尚未保存',
          409,
        );
      this.db
        .update(questions)
        .set({
          ...data,
          ...(data.difficulty
            ? {
                difficultySource:
                  data.difficulty === 'UNKNOWN' ? ('UNSPECIFIED' as const) : ('USER' as const),
              }
            : {}),
          updatedAt: new Date().toISOString(),
          revision: revision + 1,
        })
        .where(eq(questions.id, id))
        .run();
      if (topicIds !== undefined || tagIds !== undefined)
        this.setTerms(
          id,
          topicIds ?? old.topics.map((t) => t.id),
          tagIds ?? old.tags.map((t) => t.id),
        );
      return this.getQuestion(id);
    });
  }

  setArchived(id: string, archived: boolean) {
    return this.transaction(() => {
      const old = this.questionRow(id);
      if (Boolean(old.archivedAt) !== archived) {
        const now = new Date().toISOString();
        this.db
          .update(questions)
          .set({ archivedAt: archived ? now : null, updatedAt: now, revision: old.revision + 1 })
          .where(eq(questions.id, id))
          .run();
      }
      return this.getQuestion(id);
    });
  }

  addWording(questionId: string, input: unknown) {
    const data = wordingInput.parse(input);
    return this.transaction(() => {
      const old = this.questionRow(questionId),
        now = new Date().toISOString();
      const wording = this.db
        .insert(originalWordings)
        .values({
          ...data,
          id: newId(),
          questionId,
          observedAt: data.observedAt ?? now,
          extractionMethod: 'MANUAL',
          createdAt: now,
        })
        .returning()
        .get();
      this.db
        .update(questions)
        .set({ updatedAt: now, revision: old.revision + 1 })
        .where(eq(questions.id, questionId))
        .run();
      return wording;
    });
  }

  listQuestions(input: unknown = {}) {
    const query = listInput.parse(input),
      conditions: SQL[] = [],
      pageSize = 20;
    if (query.archive === 'active') conditions.push(isNull(questions.archivedAt));
    if (query.archive === 'archived') conditions.push(isNotNull(questions.archivedAt));
    if (query.status) conditions.push(eq(questions.status, query.status));
    if (query.taskType) conditions.push(eq(questions.taskType, query.taskType));
    if (query.difficulty) conditions.push(eq(questions.difficulty, query.difficulty));
    for (const [kind, id] of [
      ['TOPIC', query.topicId],
      ['TAG', query.tagId],
    ] as const) {
      if (id)
        conditions.push(
          sql`EXISTS (SELECT 1 FROM question_terms qt JOIN terms t ON t.id = qt.term_id WHERE qt.question_id = ${questions.id} AND t.id = ${id} AND t.kind = ${kind})`,
        );
    }
    const needle = query.q.toLowerCase();
    // instr is literal containment: '%' and '_' never become wildcard queries.
    if (needle)
      conditions.push(sql`(
      instr(lower(${questions.text}), ${needle}) > 0
      OR EXISTS (SELECT 1 FROM original_wordings w WHERE w.question_id = ${questions.id} AND instr(lower(w.text), ${needle}) > 0)
      OR EXISTS (SELECT 1 FROM question_terms qt JOIN terms t ON t.id = qt.term_id WHERE qt.question_id = ${questions.id}
        AND (instr(lower(t.name), ${needle}) > 0 OR EXISTS (SELECT 1 FROM json_each(t.aliases) a WHERE instr(lower(a.value), ${needle}) > 0)))
    )`);
    const where = and(...conditions);
    const total = this.db
      .select({ count: sql<number>`count(*)` })
      .from(questions)
      .where(where)
      .get()!.count;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = this.db
      .select()
      .from(questions)
      .where(where)
      .orderBy(
        ...(needle ? [sql`CASE WHEN lower(${questions.text}) = ${needle} THEN 0 ELSE 1 END`] : []),
        desc(questions.updatedAt),
        asc(questions.id),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();
    const items = rows.map((row) => {
      const detail = this.getQuestion(row.id);
      const reasons: string[] = [];
      if (needle) {
        if (detail.text.toLowerCase().includes(needle))
          reasons.push(detail.text.toLowerCase() === needle ? '题目精确命中' : '标准题目命中');
        if (detail.wordings.some((w) => w.text.toLowerCase().includes(needle)))
          reasons.push('原始问法命中');
        if (
          [...detail.topics, ...detail.tags].some((t) =>
            [t.name, ...t.aliases].some((s) => s.toLowerCase().includes(needle)),
          )
        )
          reasons.push('领域 / 标签 / 别名命中');
      }
      if (query.status || query.taskType || query.difficulty || query.topicId || query.tagId)
        reasons.push('符合筛选条件');
      return { ...detail, matchReasons: reasons };
    });
    return { items, total, page, pageSize };
  }

  counts() {
    const rows = this.db
      .select({ status: questions.status, archivedAt: questions.archivedAt })
      .from(questions)
      .all();
    return {
      active: rows.filter((r) => !r.archivedAt).length,
      inbox: rows.filter((r) => !r.archivedAt && r.status === 'INBOX').length,
      organized: rows.filter((r) => !r.archivedAt && r.status === 'ORGANIZED').length,
      archived: rows.filter((r) => r.archivedAt).length,
    };
  }

  exportData() {
    return this.connection.sqlite.transaction(() => ({
      formatVersion: 2,
      application: 'Yoweb',
      exportedAt: new Date().toISOString(),
      questions: this.db.select().from(questions).all(),
      terms: this.listTerms(),
      questionTerms: this.db.select().from(questionTerms).all(),
      originalWordings: this.db.select().from(originalWordings).all(),
      sources: this.db.select().from(sources).all(),
      documents: this.db.select().from(documents).all(),
      documentVersions: this.db.select().from(documentVersions).all(),
      importBatches: this.db.select().from(importBatches).all(),
      importItems: this.db.select().from(importItems).all(),
      evidence: this.db.select().from(evidence).all(),
      questionMentions: this.db.select().from(questionMentions).all(),
      companies: this.db.select().from(companies).all(),
      jobs: this.db.select().from(jobs).all(),
      interviews: this.db.select().from(interviews).all(),
      interviewOccurrences: this.db.select().from(interviewOccurrences).all(),
    }))();
  }
}

export type QuestionDetail = ReturnType<Library['getQuestion']>;
export type Term = ReturnType<Library['listTerms']>[number];
