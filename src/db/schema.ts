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
