import { z } from 'zod';

export const taskTypes = ['EXPLAIN', 'DESIGN', 'IMPLEMENT', 'DEBUG', 'COMPARE', 'OTHER'] as const;
export const statuses = ['INBOX', 'ORGANIZED'] as const;
export const difficulties = ['UNKNOWN', 'EASY', 'MEDIUM', 'HARD'] as const;
export const origins = [
  'SELF_CREATED',
  'INTERVIEW',
  'JD',
  'PRACTICE',
  'MODEL_GENERATED',
  'OTHER',
] as const;
export const creationMethods = [
  'USER_CREATED',
  'MANUAL_IMPORT',
  'WORKFLOW_IMPORT',
  'MODEL_GENERATED',
] as const;
export const labels: Record<string, string> = {
  EXPLAIN: '解释',
  DESIGN: '设计',
  IMPLEMENT: '实现',
  DEBUG: '调试',
  COMPARE: '比较',
  OTHER: '其他',
  INBOX: '待整理',
  ORGANIZED: '已整理',
  UNKNOWN: '未评定',
  EASY: '基础',
  MEDIUM: '中等',
  HARD: '进阶',
  SELF_CREATED: '自建',
  INTERVIEW: '面经',
  JD: '岗位要求',
  PRACTICE: '练习题',
  MODEL_GENERATED: '模型生成',
  TOPIC: '领域',
  TAG: '标签',
};

const text = z.string().trim().min(1, '请输入题目内容').max(20000, '内容不能超过 20000 字');
const optionalText = z.string().max(20000, '内容不能超过 20000 字');
const ids = z
  .array(z.uuid())
  .max(100)
  .refine((v) => new Set(v).size === v.length, '不能重复选择');
const editable = z.object({
  text,
  taskType: z.enum(taskTypes),
  status: z.enum(statuses),
  difficulty: z.enum(difficulties),
  notes: optionalText,
  answer: optionalText,
  hints: optionalText,
  topicIds: ids,
  tagIds: ids,
});
export const createQuestionInput = editable
  .extend({
    taskType: editable.shape.taskType.default('EXPLAIN'),
    status: editable.shape.status.default('INBOX'),
    difficulty: editable.shape.difficulty.default('UNKNOWN'),
    notes: optionalText.default(''),
    answer: optionalText.default(''),
    hints: optionalText.default(''),
    topicIds: ids.default([]),
    tagIds: ids.default([]),
  })
  .strict();
export const updateQuestionInput = editable
  .partial()
  .extend({ revision: z.number().int().positive() })
  .strict();
export const wordingInput = z
  .object({
    // Validate without transforming: original whitespace belongs to the source.
    text: z
      .string()
      .max(20000)
      .refine((v) => v.trim().length > 0, '请输入原始问法'),
    sourceType: z.enum(origins).default('OTHER'),
    sourceLocator: z.string().trim().min(1, '请填写原文定位').max(2000),
    observedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
const termName = z.string().trim().min(1, '请输入名称').max(80, '名称不能超过 80 字');
export const termInput = z
  .object({
    kind: z.enum(['TOPIC', 'TAG']),
    name: termName,
    aliases: z.array(termName).max(20).default([]),
    parentId: z.uuid().nullable().default(null),
  })
  .strict();
export const termUpdateInput = z
  .object({ name: termName, aliases: z.array(termName).max(20) })
  .strict();
export const listInput = z
  .object({
    q: z.string().trim().max(200).default(''),
    status: z.enum(statuses).optional(),
    taskType: z.enum(taskTypes).optional(),
    difficulty: z.enum(difficulties).optional(),
    topicId: z.uuid().optional(),
    tagId: z.uuid().optional(),
    archive: z.enum(['active', 'archived', 'all']).default('active'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export type QuestionCreate = z.input<typeof createQuestionInput>;

export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function normalized(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}
