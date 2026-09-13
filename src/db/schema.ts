import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  primaryKey,
  check,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { taskTypes, statuses, difficulties, origins, creationMethods } from '../domain/contracts';
import {
  sourceTypes,
  localPolicies,
  llmPolicies,
  documentStatuses,
  reviewStatuses,
} from '../domain/ingestion-contracts';

export const questions = sqliteTable(
  'questions',
  {
    id: text('id').primaryKey(),
    text: text('text').notNull(),
    taskType: text('task_type', { enum: taskTypes }).notNull(),
    status: text('status', { enum: statuses }).notNull(),
    creationMethod: text('creation_method', { enum: creationMethods }).notNull(),
    contentOrigin: text('content_origin', { enum: origins }).notNull(),
    difficulty: text('difficulty', { enum: difficulties }).notNull(),
    difficultySource: text('difficulty_source', { enum: ['UNSPECIFIED', 'USER'] }).notNull(),
    notes: text('notes').notNull().default(''),
    answer: text('answer').notNull().default(''),
    hints: text('hints').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
    revision: integer('revision').notNull().default(1),
  },
  (t) => [
    index('questions_listing_idx').on(t.archivedAt, t.status, t.updatedAt),
    check('question_text_valid', sql`length(trim(${t.text})) BETWEEN 1 AND 20000`),
    check('question_status_valid', sql`${t.status} IN ('INBOX', 'ORGANIZED')`),
    check(
      'question_task_valid',
      sql`${t.taskType} IN ('EXPLAIN','DESIGN','IMPLEMENT','DEBUG','COMPARE','OTHER')`,
    ),
    check('question_difficulty_valid', sql`${t.difficulty} IN ('UNKNOWN','EASY','MEDIUM','HARD')`),
    check(
      'question_creation_valid',
      sql`${t.creationMethod} IN ('USER_CREATED','MANUAL_IMPORT','WORKFLOW_IMPORT','MODEL_GENERATED')`,
    ),
    check(
      'question_origin_valid',
      sql`${t.contentOrigin} IN ('SELF_CREATED','INTERVIEW','JD','PRACTICE','MODEL_GENERATED','OTHER')`,
    ),
    check('question_difficulty_source_valid', sql`${t.difficultySource} IN ('UNSPECIFIED','USER')`),
    check('question_revision_valid', sql`${t.revision} > 0`),
  ],
);

export const terms = sqliteTable(
  'terms',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['TOPIC', 'TAG'] }).notNull(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    aliases: text('aliases', { mode: 'json' }).$type<string[]>().notNull().default([]),
    parentId: text('parent_id').references((): AnySQLiteColumn => terms.id, {
      onDelete: 'restrict',
    }),
    createdBy: text('created_by').notNull().default('LOCAL_USER'),
    creationSource: text('creation_source', { enum: ['USER', 'SEED'] }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('term_kind_name_unique').on(t.kind, t.nameKey),
    check('term_kind_valid', sql`${t.kind} IN ('TOPIC', 'TAG')`),
    check('term_name_valid', sql`length(trim(${t.name})) BETWEEN 1 AND 80`),
    check('tag_has_no_parent', sql`${t.kind} = 'TOPIC' OR ${t.parentId} IS NULL`),
    check('term_not_own_parent', sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
  ],
);

export const questionTerms = sqliteTable(
  'question_terms',
  {
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    termId: text('term_id')
      .notNull()
      .references(() => terms.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ columns: [t.questionId, t.termId] }),
    index('question_terms_term_idx').on(t.termId),
  ],
);

export const originalWordings = sqliteTable(
  'original_wordings',
  {
    id: text('id').primaryKey(),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    text: text('text').notNull(),
    evidenceId: text('evidence_id').references((): AnySQLiteColumn => evidence.id, {
      onDelete: 'restrict',
    }),
    sourceType: text('source_type', { enum: origins }).notNull(),
    sourceLocator: text('source_locator').notNull(),
    extractionMethod: text('extraction_method', { enum: ['MANUAL'] }).notNull(),
    confidence: real('confidence'),
    observedAt: text('observed_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('wordings_question_idx').on(t.questionId),
    check('wording_text_valid', sql`length(trim(${t.text})) BETWEEN 1 AND 20000`),
    check('wording_locator_valid', sql`length(trim(${t.sourceLocator})) BETWEEN 1 AND 2000`),
    check(
      'wording_origin_valid',
      sql`${t.sourceType} IN ('SELF_CREATED','INTERVIEW','JD','PRACTICE','MODEL_GENERATED','OTHER')`,
    ),
  ],
);

export const sources = sqliteTable(
  'sources',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type', { enum: sourceTypes }).notNull(),
    host: text('host').notNull(),
    acquisitionMethod: text('acquisition_method').notNull().default('MANUAL'),
    rulesStatus: text('rules_status', {
      enum: ['UNCHECKED', 'USER_CONFIRMED', 'RESTRICTED'],
    }).notNull(),
    policyNote: text('policy_note').notNull(),
    localPolicy: text('local_policy', { enum: localPolicies }).notNull(),
    llmPolicy: text('llm_policy', { enum: llmPolicies }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('source_host_type_unique').on(t.host, t.type),
    check('source_local_policy_valid', sql`${t.localPolicy} IN ('METADATA_ONLY','EXCERPT','FULL')`),
    check('source_llm_policy_valid', sql`${t.llmPolicy} IN ('UNKNOWN','DENY','ALLOW')`),
  ],
);

export const documents = sqliteTable(
  'raw_documents',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    canonicalUrl: text('canonical_url').notNull(),
    contentOrigin: text('content_origin', { enum: origins }).notNull(),
    currentVersionId: text('current_version_id').references(
      (): AnySQLiteColumn => documentVersions.id,
      { onDelete: 'restrict' },
    ),
    status: text('status', { enum: documentStatuses }).notNull().default('VALID'),
    firstObservedAt: text('first_observed_at').notNull(),
    lastCheckedAt: text('last_checked_at').notNull(),
  },
  (t) => [
    uniqueIndex('document_url_unique').on(t.canonicalUrl),
    index('document_source_idx').on(t.sourceId),
    check(
      'document_origin_valid',
      sql`${t.contentOrigin} IN ('SELF_CREATED','INTERVIEW','JD','PRACTICE','MODEL_GENERATED','OTHER')`,
    ),
    check(
      'document_status_valid',
      sql`${t.status} IN ('VALID','UNAVAILABLE','NEEDS_CHECK','PROHIBITED')`,
    ),
  ],
);

export const documentVersions = sqliteTable(
  'raw_document_versions',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'restrict' }),
    fingerprint: text('fingerprint').notNull(),
    title: text('title').notNull(),
    excerpt: text('excerpt').notNull(),
    fullText: text('full_text').notNull(),
    notes: text('notes').notNull(),
    localPolicy: text('local_policy', { enum: localPolicies }).notNull(),
    llmPolicy: text('llm_policy', { enum: llmPolicies }).notNull(),
    observedAt: text('observed_at').notNull(),
  },
  (t) => [
    uniqueIndex('document_fingerprint_unique').on(t.documentId, t.fingerprint),
    check(
      'version_storage_scope_valid',
      sql`(${t.localPolicy} = 'METADATA_ONLY' AND ${t.excerpt} = '' AND ${t.fullText} = '') OR (${t.localPolicy} = 'EXCERPT' AND ${t.fullText} = '') OR ${t.localPolicy} = 'FULL'`,
    ),
  ],
);

export const importBatches = sqliteTable(
  'import_batches',
  {
    id: text('id').primaryKey(),
    documentVersionId: text('document_version_id')
      .notNull()
      .references(() => documentVersions.id, { onDelete: 'restrict' }),
    fingerprint: text('fingerprint').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('batch_fingerprint_unique').on(t.fingerprint)],
);

export const importItems = sqliteTable(
  'import_items',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id')
      .notNull()
      .references(() => importBatches.id, { onDelete: 'restrict' }),
    proposedText: text('proposed_text').notNull(),
    taskType: text('task_type', { enum: taskTypes }).notNull(),
    originalText: text('original_text').notNull(),
    locator: text('locator').notNull(),
    fingerprint: text('fingerprint').notNull(),
    status: text('status', { enum: reviewStatuses }).notNull().default('REVIEW_PENDING'),
    revision: integer('revision').notNull().default(1),
    acceptedQuestionId: text('accepted_question_id').references(() => questions.id, {
      onDelete: 'restrict',
    }),
    evidenceId: text('evidence_id').references((): AnySQLiteColumn => evidence.id, {
      onDelete: 'restrict',
    }),
    decisionFingerprint: text('decision_fingerprint'),
    reviewedAt: text('reviewed_at'),
  },
  (t) => [
    uniqueIndex('item_batch_fingerprint_unique').on(t.batchId, t.fingerprint),
    index('item_status_idx').on(t.status),
    check(
      'item_status_valid',
      sql`${t.status} IN ('REVIEW_PENDING','ACCEPTED','EDITED','IGNORED')`,
    ),
  ],
);

export const evidence = sqliteTable(
  'evidence',
  {
    id: text('id').primaryKey(),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    documentVersionId: text('document_version_id')
      .notNull()
      .references(() => documentVersions.id, { onDelete: 'restrict' }),
    fingerprint: text('fingerprint').notNull(),
    sourceUrl: text('source_url').notNull(),
    scope: text('scope', { enum: ['LINK', 'EXCERPT'] }).notNull(),
    excerpt: text('excerpt').notNull(),
    personalNote: text('personal_note').notNull(),
    locator: text('locator').notNull(),
    observedAt: text('observed_at').notNull(),
    localPolicy: text('local_policy', { enum: localPolicies }).notNull(),
    llmPolicy: text('llm_policy', { enum: llmPolicies }).notNull(),
  },
  (t) => [
    uniqueIndex('evidence_fingerprint_unique').on(t.questionId, t.documentVersionId, t.fingerprint),
    check(
      'evidence_scope_valid',
      sql`(${t.scope} = 'LINK' AND ${t.excerpt} = '') OR (${t.scope} = 'EXCERPT' AND length(trim(${t.excerpt})) > 0 AND ${t.localPolicy} <> 'METADATA_ONLY')`,
    ),
  ],
);

export const questionMentions = sqliteTable(
  'question_mentions',
  {
    id: text('id').primaryKey(),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'restrict' }),
    firstEvidenceId: text('first_evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('mention_question_document_unique').on(t.questionId, t.documentId)],
);

export const companies = sqliteTable(
  'companies',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
  },
  (t) => [uniqueIndex('company_name_unique').on(t.nameKey)],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id').references(() => companies.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    url: text('url'),
    documentId: text('document_id').references(() => documents.id, { onDelete: 'restrict' }),
    identityKey: text('identity_key').notNull(),
    observedAt: text('observed_at').notNull(),
  },
  (t) => [uniqueIndex('job_identity_unique').on(t.identityKey)],
);

export const interviews = sqliteTable(
  'interviews',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'restrict' }),
    reportKey: text('report_key').notNull(),
    reportKeyNormalized: text('report_key_normalized').notNull(),
    companyId: text('company_id').references(() => companies.id, { onDelete: 'restrict' }),
    jobId: text('job_id').references(() => jobs.id, { onDelete: 'restrict' }),
    dateFrom: text('date_from'),
    dateTo: text('date_to'),
    round: text('round').notNull(),
    credibility: text('credibility', { enum: ['REPORTED', 'UNCERTAIN'] }).notNull(),
    notes: text('notes').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('interview_document_report_unique').on(t.documentId, t.reportKeyNormalized),
    check(
      'interview_date_range_valid',
      sql`${t.dateTo} IS NULL OR (${t.dateFrom} IS NOT NULL AND ${t.dateTo} >= ${t.dateFrom})`,
    ),
  ],
);

export const interviewOccurrences = sqliteTable(
  'interview_occurrences',
  {
    id: text('id').primaryKey(),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    interviewId: text('interview_id')
      .notNull()
      .references(() => interviews.id, { onDelete: 'restrict' }),
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'restrict' }),
    reportNote: text('report_note').notNull(),
    confirmedBy: text('confirmed_by').notNull().default('LOCAL_USER'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('occurrence_question_interview_unique').on(t.questionId, t.interviewId)],
);
