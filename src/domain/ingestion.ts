import { createHash } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { ZodError } from 'zod';
import type { Connection } from '../db/connection';
import { newId } from '../db/connection';
import {
  sources,
  documents,
  documentVersions,
  importBatches,
  importItems,
  evidence,
  questionMentions,
  questions,
  originalWordings,
  companies,
  jobs,
  interviews,
  interviewOccurrences,
} from '../db/schema';
import { DomainError, normalized } from './contracts';
import { Library } from './library';
import {
  sourceInput,
  manualImportInput,
  localPolicies,
  reviewBatchInput,
  reviewItemInput,
  documentStatusInput,
  jobInput,
  interviewInput,
  occurrenceInput,
} from './ingestion-contracts';

const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now = () => new Date().toISOString();

export class Ingestion {
  constructor(private connection: Connection) {}
  private get db() {
    return this.connection.db;
  }
  private transaction<T>(fn: () => T): T {
    return this.connection.sqlite.transaction(fn).immediate();
  }

  listSources() {
    return this.db.select().from(sources).orderBy(asc(sources.name)).all();
  }
  getSource(id: string) {
    const source = this.db.select().from(sources).where(eq(sources.id, id)).get();
    if (!source) throw new DomainError('NOT_FOUND', '来源不存在', 404);
    return source;
  }
  createSource(input: unknown) {
    const data = sourceInput.parse(input);
    return this.transaction(() => {
      if (
        this.db
          .select()
          .from(sources)
          .where(and(eq(sources.host, data.host), eq(sources.type, data.type)))
          .get()
      ) {
        throw new DomainError('SOURCE_EXISTS', '这个平台与主机已登记，请选择已有来源', 409);
      }
      return this.db
        .insert(sources)
        .values({ ...data, id: newId(), createdAt: now() })
        .returning()
        .get();
    });
  }
  private documentRow(id: string) {
    const row = this.db.select().from(documents).where(eq(documents.id, id)).get();
    if (!row) throw new DomainError('NOT_FOUND', '材料不存在', 404);
    return row;
  }
  private versionRow(id: string) {
    const row = this.db.select().from(documentVersions).where(eq(documentVersions.id, id)).get();
    if (!row) throw new DomainError('NOT_FOUND', '材料版本不存在', 404);
    return row;
  }
  listDocuments(sourceId?: string) {
    return this.db
      .select()
      .from(documents)
      .where(sourceId ? eq(documents.sourceId, sourceId) : undefined)
      .orderBy(desc(documents.lastCheckedAt), asc(documents.id))
      .all()
      .map((document) => ({
        ...document,
        source: this.getSource(document.sourceId),
        currentVersion: document.currentVersionId
          ? this.versionRow(document.currentVersionId)
          : null,
      }));
  }
  getDocument(id: string) {
    const document = this.documentRow(id);
    const versions = this.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, id))
      .orderBy(desc(documentVersions.observedAt))
      .all();
    const batches = this.db
      .select({ batch: importBatches })
      .from(importBatches)
      .innerJoin(documentVersions, eq(importBatches.documentVersionId, documentVersions.id))
      .where(eq(documentVersions.documentId, id))
      .orderBy(desc(importBatches.createdAt))
      .all()
      .map((v) => v.batch);
    return {
      ...document,
      source: this.getSource(document.sourceId),
      versions,
      currentVersion: versions.find((v) => v.id === document.currentVersionId)!,
      batches,
      interviews: this.listInterviews(id),
      jobs: this.listJobs(id),
    };
  }
  setDocumentStatus(id: string, input: unknown) {
    const data = documentStatusInput.parse(input);
    return this.transaction(() => {
      this.documentRow(id);
      this.db
        .update(documents)
        .set({ status: data.status, lastCheckedAt: now() })
        .where(eq(documents.id, id))
        .run();
      return this.getDocument(id);
    });
  }
  private ensureUsable(document: typeof documents.$inferSelect) {
    if (
      document.status === 'PROHIBITED' ||
      this.getSource(document.sourceId).rulesStatus === 'RESTRICTED'
    ) {
      throw new DomainError('SOURCE_RESTRICTED', '该材料或来源已停止收录；已有合法证据仍保留', 409);
    }
  }

  importManual(input: unknown) {
    const data = manualImportInput.parse(input);
    return this.transaction(() => {
      const source = this.getSource(data.sourceId);
      if (source.rulesStatus === 'RESTRICTED')
        throw new DomainError('SOURCE_RESTRICTED', '该来源不允许收录');
      const host = new URL(data.url).hostname;
      if (host !== source.host && !host.endsWith(`.${source.host}`))
        throw new DomainError('SOURCE_HOST_MISMATCH', '材料链接不属于所选来源主机');
      if (localPolicies.indexOf(data.localPolicy) > localPolicies.indexOf(source.localPolicy))
        throw new DomainError('STORAGE_DENIED', '材料保存范围超过来源允许级别');
      if (data.llmPolicy === 'ALLOW' && source.llmPolicy !== 'ALLOW')
        throw new DomainError('EXTERNAL_SEND_DENIED', '来源尚未允许向模型外发');
      if (
        data.localPolicy === 'METADATA_ONLY' &&
        (data.excerpt || data.fullText || data.candidates.some((c) => c.originalText))
      ) {
        throw new DomainError(
          'STORAGE_DENIED',
          '仅链接模式不能保存摘录、全文或原始问法，请只录入个人整理与笔记',
        );
      }
      if (data.localPolicy === 'EXCERPT' && data.fullText)
        throw new DomainError('STORAGE_DENIED', '当前只允许摘录，不能保存全文');
      for (const candidate of data.candidates) {
        if (
          candidate.originalText &&
          (!candidate.originalText.trim() ||
            (!data.excerpt.includes(candidate.originalText) &&
              !data.fullText.includes(candidate.originalText)))
        ) {
          throw new DomainError(
            'UNSUPPORTED_WORDING',
            '候选原始问法必须是当前合法摘录或全文中的原文片段',
          );
        }
      }
      let document = this.db
        .select()
        .from(documents)
        .where(eq(documents.canonicalUrl, data.url))
        .get();
      const checkedAt = now();
      if (document) {
        this.ensureUsable(document);
        if (document.sourceId !== data.sourceId || document.contentOrigin !== data.contentOrigin) {
          throw new DomainError(
            'DOCUMENT_CONFLICT',
            '该链接已有材料记录，请使用原来源与内容类型，不能静默改变材料语义',
            409,
          );
        }
      } else {
        document = this.db
          .insert(documents)
          .values({
            id: newId(),
            sourceId: data.sourceId,
            canonicalUrl: data.url,
            contentOrigin: data.contentOrigin,
            firstObservedAt: checkedAt,
            lastCheckedAt: checkedAt,
          })
          .returning()
          .get();
      }
      const content = {
        title: data.title,
        excerpt: data.excerpt,
        fullText: data.fullText,
        notes: data.notes,
        localPolicy: data.localPolicy,
        llmPolicy: data.llmPolicy,
      };
      const contentHash = fingerprint(content);
      let version = this.db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.documentId, document.id),
            eq(documentVersions.fingerprint, contentHash),
          ),
        )
        .get();
      const unchanged = Boolean(version);
      if (!version)
        version = this.db
          .insert(documentVersions)
          .values({
            ...content,
            id: newId(),
            documentId: document.id,
            fingerprint: contentHash,
            observedAt: checkedAt,
          })
          .returning()
          .get();
      this.db
        .update(documents)
        .set({ currentVersionId: version.id, lastCheckedAt: checkedAt })
        .where(eq(documents.id, document.id))
        .run();
      // Sort and collapse identical submitted candidates so reorder/retry is idempotent.
      const candidates = [
        ...new Map(
          data.candidates.map((candidate) => [fingerprint(candidate), candidate]),
        ).entries(),
      ].sort(([a], [b]) => a.localeCompare(b));
      const batchHash = fingerprint([version.id, candidates.map(([hash]) => hash)]);
      let batch = this.db
        .select()
        .from(importBatches)
        .where(eq(importBatches.fingerprint, batchHash))
        .get();
      const duplicate = Boolean(batch);
      if (!batch) {
        batch = this.db
          .insert(importBatches)
          .values({
            id: newId(),
            documentVersionId: version.id,
            fingerprint: batchHash,
            createdAt: checkedAt,
          })
          .returning()
          .get();
        for (const [hash, candidate] of candidates)
          this.db
            .insert(importItems)
            .values({
              id: newId(),
              batchId: batch.id,
              proposedText: candidate.text,
              taskType: candidate.taskType,
              originalText: candidate.originalText,
              locator: candidate.locator,
              fingerprint: hash,
            })
            .run();
      }
      return { ...this.getBatch(batch.id), duplicate, unchanged };
    });
  }
  getBatch(id: string) {
    const batch = this.db.select().from(importBatches).where(eq(importBatches.id, id)).get();
    if (!batch) throw new DomainError('NOT_FOUND', '收录批次不存在', 404);
    const version = this.versionRow(batch.documentVersionId),
      document = this.documentRow(version.documentId);
    return {
      ...batch,
      version,
      document,
      source: this.getSource(document.sourceId),
      items: this.db
        .select()
        .from(importItems)
        .where(eq(importItems.batchId, id))
        .orderBy(asc(importItems.locator), asc(importItems.id))
        .all(),
    };
  }
  listBatches() {
    return this.db
      .select()
      .from(importBatches)
      .orderBy(desc(importBatches.createdAt), asc(importBatches.id))
      .all()
      .map((b) => {
        const batch = this.getBatch(b.id);
        return {
          ...batch,
          pending: batch.items.filter((i) => i.status === 'REVIEW_PENDING').length,
        };
      });
  }

  review(input: unknown) {
    const { items } = reviewBatchInput.parse(input);
    return items.map((item, index) => {
      const id =
        typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'string'
          ? item.id
          : null;
      try {
        return { index, id, ok: true as const, item: this.reviewOne(item) };
      } catch (error) {
        return {
          index,
          id,
          ok: false as const,
          error: {
            code:
              error instanceof DomainError
                ? error.code
                : error instanceof ZodError
                  ? 'VALIDATION_ERROR'
                  : 'ITEM_FAILED',
            message:
              error instanceof DomainError
                ? error.message
                : error instanceof ZodError
                  ? error.issues.map((i) => i.message).join('；')
                  : '该项写入失败并已回滚，可重试；其他项不受影响',
          },
        };
      }
    });
  }
  private reviewOne(input: unknown) {
    const data = reviewItemInput.parse(input);
    return this.transaction(() => {
      const item = this.db.select().from(importItems).where(eq(importItems.id, data.id)).get();
      if (!item) throw new DomainError('NOT_FOUND', '候选题不存在', 404);
      const decisionHash = fingerprint({
        decision: data.decision,
        text: data.text ?? null,
        taskType: data.taskType ?? null,
        targetQuestionId: data.targetQuestionId ?? null,
      });
      if (item.status !== 'REVIEW_PENDING') {
        if (item.decisionFingerprint === decisionHash) return item;
        throw new DomainError(
          'REVIEW_CONFLICT',
          '该候选已处理，不能用另一决定覆盖；请刷新查看结果',
          409,
        );
      }
      if (item.revision !== data.revision)
        throw new DomainError('REVIEW_CONFLICT', '候选版本已变更，请刷新后重试', 409);
      if (data.decision === 'IGNORE')
        return this.db
          .update(importItems)
          .set({
            status: 'IGNORED',
            revision: item.revision + 1,
            decisionFingerprint: decisionHash,
            reviewedAt: now(),
          })
          .where(eq(importItems.id, item.id))
          .returning()
          .get()!;
      const batch = this.getBatch(item.batchId);
      this.ensureUsable(batch.document);
      const library = new Library(this.connection);
      let questionId = data.targetQuestionId;
      if (questionId) {
        if (library.getQuestion(questionId).archivedAt)
          throw new DomainError('QUESTION_ARCHIVED', '请先恢复已归档题目，再关联新证据', 409);
      } else {
        const created = library.createQuestion({
          text: data.text ?? item.proposedText,
          taskType: data.taskType ?? item.taskType,
        });
        questionId = created.id;
        this.db
          .update(questions)
          .set({ creationMethod: 'MANUAL_IMPORT', contentOrigin: batch.document.contentOrigin })
          .where(eq(questions.id, questionId))
          .run();
      }
      const evidenceHash = fingerprint({ excerpt: item.originalText, locator: item.locator });
      let savedEvidence = this.db
        .select()
        .from(evidence)
        .where(
          and(
            eq(evidence.questionId, questionId),
            eq(evidence.documentVersionId, batch.version.id),
            eq(evidence.fingerprint, evidenceHash),
          ),
        )
        .get();
      if (!savedEvidence) {
        savedEvidence = this.db
          .insert(evidence)
          .values({
            id: newId(),
            questionId,
            documentVersionId: batch.version.id,
            fingerprint: evidenceHash,
            sourceUrl: batch.document.canonicalUrl,
            scope: item.originalText ? 'EXCERPT' : 'LINK',
            excerpt: item.originalText,
            personalNote: batch.version.notes,
            locator: item.locator,
            observedAt: batch.version.observedAt,
            localPolicy: batch.version.localPolicy,
            llmPolicy: batch.version.llmPolicy,
          })
          .returning()
          .get();
        if (item.originalText)
          this.db
            .insert(originalWordings)
            .values({
              id: newId(),
              questionId,
              evidenceId: savedEvidence.id,
              text: item.originalText,
              sourceType: batch.document.contentOrigin,
              sourceLocator: item.locator,
              extractionMethod: 'MANUAL',
              observedAt: batch.version.observedAt,
              createdAt: now(),
            })
            .run();
        const question = library.getQuestion(questionId);
        this.db
          .update(questions)
          .set({ updatedAt: now(), revision: question.revision + 1 })
          .where(eq(questions.id, questionId))
          .run();
      }
      this.db
        .insert(questionMentions)
        .values({
          id: newId(),
          questionId,
          documentId: batch.document.id,
          firstEvidenceId: savedEvidence.id,
          createdAt: now(),
        })
        .onConflictDoNothing()
        .run();
      return this.db
        .update(importItems)
        .set({
          status: data.text !== undefined || data.taskType !== undefined ? 'EDITED' : 'ACCEPTED',
          proposedText: data.text ?? item.proposedText,
          taskType: data.taskType ?? item.taskType,
          acceptedQuestionId: questionId,
          evidenceId: savedEvidence.id,
          revision: item.revision + 1,
          decisionFingerprint: decisionHash,
          reviewedAt: now(),
        })
        .where(eq(importItems.id, item.id))
        .returning()
        .get()!;
    });
  }

  private company(name: string) {
    if (!name) return null;
    const key = normalized(name);
    return (
      this.db.select().from(companies).where(eq(companies.nameKey, key)).get() ??
      this.db.insert(companies).values({ id: newId(), name, nameKey: key }).returning().get()
    );
  }
  createJob(input: unknown) {
    const data = jobInput.parse(input);
    return this.transaction(() => {
      if (data.documentId) {
        const document = this.documentRow(data.documentId);
        this.ensureUsable(document);
        if (document.contentOrigin !== 'JD')
          throw new DomainError('NOT_JD', '岗位材料关联仅适用于 JD');
      }
      const company = this.company(data.companyName),
        identityKey = fingerprint([
          company?.id ?? null,
          normalized(data.title),
          data.url ?? null,
          data.documentId ?? null,
        ]);
      return (
        this.db.select().from(jobs).where(eq(jobs.identityKey, identityKey)).get() ??
        this.db
          .insert(jobs)
          .values({
            id: newId(),
            title: data.title,
            companyId: company?.id ?? null,
            url: data.url ?? null,
            documentId: data.documentId ?? null,
            identityKey,
            observedAt: now(),
          })
          .returning()
          .get()
      );
    });
  }
  private jobSummary(id: string | null) {
    return id ? (this.db.select().from(jobs).where(eq(jobs.id, id)).get() ?? null) : null;
  }
  private companySummary(id: string | null) {
    return id ? (this.db.select().from(companies).where(eq(companies.id, id)).get() ?? null) : null;
  }
  listJobs(documentId: string) {
    return this.db
      .select()
      .from(jobs)
      .where(eq(jobs.documentId, documentId))
      .all()
      .map((job) => ({ ...job, company: this.companySummary(job.companyId) }));
  }
  listInterviews(documentId: string) {
    return this.db
      .select()
      .from(interviews)
      .where(eq(interviews.documentId, documentId))
      .orderBy(asc(interviews.createdAt))
      .all()
      .map((interview) => ({
        ...interview,
        company: this.companySummary(interview.companyId),
        job: this.jobSummary(interview.jobId),
      }));
  }
  createInterview(input: unknown) {
    const data = interviewInput.parse(input);
    return this.transaction(() => {
      const document = this.documentRow(data.documentId);
      this.ensureUsable(document);
      if (document.contentOrigin !== 'INTERVIEW')
        throw new DomainError(
          'NOT_INTERVIEW',
          '只有描述真实面试经历的材料才能建立 Interview；汇编、JD 和练习题均不可',
        );
      const company = this.company(data.companyName),
        job = data.jobTitle
          ? this.createJob({
              companyName: data.companyName,
              title: data.jobTitle,
              ...(data.jobUrl ? { url: data.jobUrl } : {}),
            })
          : null;
      const values = {
        documentId: document.id,
        reportKey: data.reportKey,
        reportKeyNormalized: normalized(data.reportKey),
        companyId: company?.id ?? null,
        jobId: job?.id ?? null,
        dateFrom: data.dateFrom ?? null,
        dateTo: data.dateTo ?? null,
        round: data.round,
        credibility: data.credibility,
        notes: data.notes,
      };
      const existing = this.db
        .select()
        .from(interviews)
        .where(
          and(
            eq(interviews.documentId, document.id),
            eq(interviews.reportKeyNormalized, values.reportKeyNormalized),
          ),
        )
        .get();
      if (existing) {
        if (
          Object.entries(values).some(
            ([key, value]) => existing[key as keyof typeof existing] !== value,
          )
        )
          throw new DomainError(
            'INTERVIEW_CONFLICT',
            '该经历标识已经存在且内容不同，请选择已有经历或为独立经历填写不同标识',
            409,
          );
        return existing;
      }
      return this.db
        .insert(interviews)
        .values({ ...values, id: newId(), createdAt: now() })
        .returning()
        .get();
    });
  }
  addOccurrence(questionId: string, input: unknown) {
    const data = occurrenceInput.parse(input);
    return this.transaction(() => {
      new Library(this.connection).getQuestion(questionId);
      const interview = this.db
        .select()
        .from(interviews)
        .where(eq(interviews.id, data.interviewId))
        .get();
      const proof = this.db.select().from(evidence).where(eq(evidence.id, data.evidenceId)).get();
      if (!interview || !proof) throw new DomainError('NOT_FOUND', '面试经历或证据不存在', 404);
      const version = this.versionRow(proof.documentVersionId),
        document = this.documentRow(version.documentId);
      this.ensureUsable(document);
      if (
        proof.questionId !== questionId ||
        interview.documentId !== document.id ||
        document.contentOrigin !== 'INTERVIEW'
      )
        throw new DomainError('EVIDENCE_MISMATCH', '证据必须属于当前题目与这段面试经历的来源材料');
      const existing = this.db
        .select()
        .from(interviewOccurrences)
        .where(
          and(
            eq(interviewOccurrences.questionId, questionId),
            eq(interviewOccurrences.interviewId, interview.id),
          ),
        )
        .get();
      if (existing) return existing;
      return this.db
        .insert(interviewOccurrences)
        .values({
          id: newId(),
          questionId,
          interviewId: interview.id,
          evidenceId: proof.id,
          reportNote: data.reportNote,
          createdAt: now(),
        })
        .returning()
        .get();
    });
  }
  questionEvidence(questionId: string) {
    new Library(this.connection).getQuestion(questionId);
    const proofs = this.db
      .select()
      .from(evidence)
      .where(eq(evidence.questionId, questionId))
      .orderBy(desc(evidence.observedAt))
      .all()
      .map((proof) => {
        const version = this.versionRow(proof.documentVersionId),
          document = this.documentRow(version.documentId);
        return {
          ...proof,
          version,
          document,
          source: this.getSource(document.sourceId),
          interviews: this.listInterviews(document.id),
        };
      });
    const mentions = this.db
      .select()
      .from(questionMentions)
      .where(eq(questionMentions.questionId, questionId))
      .all();
    const occurrences = this.db
      .select()
      .from(interviewOccurrences)
      .where(eq(interviewOccurrences.questionId, questionId))
      .all()
      .map((occurrence) => {
        const interview = this.db
          .select()
          .from(interviews)
          .where(eq(interviews.id, occurrence.interviewId))
          .get()!;
        return {
          ...occurrence,
          interview: {
            ...interview,
            company: this.companySummary(interview.companyId),
            job: this.jobSummary(interview.jobId),
          },
        };
      });
    return {
      proofs,
      occurrences,
      mentionCount: mentions.length,
      occurrenceCount: occurrences.length,
    };
  }
}
export type Source = ReturnType<Ingestion['getSource']>;
export type ImportBatchDetail = ReturnType<Ingestion['getBatch']>;
export type DocumentDetail = ReturnType<Ingestion['getDocument']>;
export type QuestionEvidence = ReturnType<Ingestion['questionEvidence']>;
