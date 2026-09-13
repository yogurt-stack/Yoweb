import { z } from 'zod';
import { origins, taskTypes } from './contracts';

export const sourceTypes = [
  'NIUKE',
  'GITHUB',
  'LEETCODE',
  'COMPANY',
  'BLOG',
  'OTHER',
  'SELF',
] as const;
export const localPolicies = ['METADATA_ONLY', 'EXCERPT', 'FULL'] as const;
export const llmPolicies = ['UNKNOWN', 'DENY', 'ALLOW'] as const;
export const documentStatuses = ['VALID', 'UNAVAILABLE', 'NEEDS_CHECK', 'PROHIBITED'] as const;
export const reviewStatuses = ['REVIEW_PENDING', 'ACCEPTED', 'EDITED', 'IGNORED'] as const;
export const ingestionLabels: Record<string, string> = {
  NIUKE: '牛客',
  GITHUB: 'GitHub',
  LEETCODE: 'LeetCode',
  COMPANY: '招聘官网',
  BLOG: '博客 / 社区',
  OTHER: '其他',
  SELF: '自有材料',
  METADATA_ONLY: '仅链接、元数据和个人笔记',
  EXCERPT: '允许保存必要摘录',
  FULL: '允许保存全文',
  UNKNOWN: '尚未确认',
  DENY: '不允许外发',
  ALLOW: '允许必要内容外发',
  UNCHECKED: '尚未检查',
  USER_CONFIRMED: '已人工检查',
  RESTRICTED: '禁止收录',
  VALID: '有效',
  UNAVAILABLE: '页面失效',
  NEEDS_CHECK: '待检查',
  PROHIBITED: '停止收录',
  REVIEW_PENDING: '待审核',
  ACCEPTED: '已接受',
  EDITED: '修改后接受',
  IGNORED: '已忽略',
  LINK: '链接证据',
  REPORTED: '原文有明确叙述',
  UNCERTAIN: '上下文待核实',
};
const short = z.string().trim().min(1).max(200);
const optionalContent = z.string().max(20000).default('');
const rawContent = z.string().max(20000);
export const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .transform((value, ctx) => {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error();
      url.hash = '';
      for (const key of [...url.searchParams.keys()])
        if (/^utm_/i.test(key) || ['fbclid', 'gclid'].includes(key)) url.searchParams.delete(key);
      url.searchParams.sort();
      return url.href;
    } catch {
      ctx.addIssue({ code: 'custom', message: '请填写不含账号信息的 HTTP / HTTPS 链接' });
      return z.NEVER;
    }
  });
export const sourceInput = z
  .object({
    name: short,
    type: z.enum(sourceTypes),
    host: z
      .string()
      .trim()
      .toLowerCase()
      .max(253)
      .regex(
        /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
        '请输入主机名，例如 github.com，不含路径',
      ),
    rulesStatus: z.enum(['UNCHECKED', 'USER_CONFIRMED', 'RESTRICTED']).default('UNCHECKED'),
    policyNote: z.string().trim().max(2000).default(''),
    localPolicy: z.enum(localPolicies).default('METADATA_ONLY'),
    llmPolicy: z.enum(llmPolicies).default('UNKNOWN'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.localPolicy !== 'METADATA_ONLY' || value.llmPolicy === 'ALLOW') &&
      (value.rulesStatus !== 'USER_CONFIRMED' || !value.policyNote)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: '保存原文或允许外发前，请记录人工检查状态和权限依据',
      });
    }
  });
export const candidateInput = z
  .object({
    text: z.string().trim().min(1, '请填写候选题目').max(20000),
    taskType: z.enum(taskTypes).default('EXPLAIN'),
    originalText: optionalContent,
    locator: z.string().trim().min(1, '请填写证据定位').max(2000),
  })
  .strict();
export const manualImportInput = z
  .object({
    sourceId: z.uuid(),
    url: httpUrl,
    title: short,
    contentOrigin: z.enum(origins).default('OTHER'),
    localPolicy: z.enum(localPolicies).default('METADATA_ONLY'),
    llmPolicy: z.enum(llmPolicies).default('UNKNOWN'),
    excerpt: optionalContent,
    fullText: optionalContent,
    notes: optionalContent,
    candidates: z.array(candidateInput).max(50).default([]),
  })
  .strict();
export const reviewItemInput = z
  .object({
    id: z.uuid(),
    revision: z.number().int().positive(),
    decision: z.enum(['ACCEPT', 'IGNORE']),
    text: z.string().trim().min(1).max(20000).optional(),
    taskType: z.enum(taskTypes).optional(),
    targetQuestionId: z.uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.decision === 'IGNORE' || value.targetQuestionId) &&
      (value.text !== undefined || value.taskType !== undefined)
    ) {
      ctx.addIssue({ code: 'custom', message: '忽略或关联已有题时不能同时修改标准题目' });
    }
    if (value.decision === 'IGNORE' && value.targetQuestionId)
      ctx.addIssue({ code: 'custom', message: '忽略不能同时关联题目' });
  });
// Validate the envelope separately: one invalid item must not discard other valid items.
export const reviewBatchInput = z.object({ items: z.array(z.unknown()).min(1).max(50) }).strict();
export const documentStatusInput = z.object({ status: z.enum(documentStatuses) }).strict();
export const jobInput = z
  .object({
    title: short,
    companyName: z.string().trim().max(200).default(''),
    url: httpUrl.optional(),
    documentId: z.uuid().optional(),
  })
  .strict();
export const interviewInput = z
  .object({
    documentId: z.uuid(),
    reportKey: short,
    companyName: z.string().trim().max(200).default(''),
    jobTitle: z.string().trim().max(200).default(''),
    jobUrl: httpUrl.optional(),
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
    round: z.string().trim().max(100).default(''),
    credibility: z.enum(['REPORTED', 'UNCERTAIN']).default('REPORTED'),
    notes: optionalContent,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.dateTo && (!value.dateFrom || value.dateTo < value.dateFrom))
      ctx.addIssue({ code: 'custom', message: '结束日期需要起始日期，且不得早于起始日期' });
    if (value.jobUrl && !value.jobTitle)
      ctx.addIssue({ code: 'custom', message: '岗位链接需要同时填写岗位名称' });
  });
export const occurrenceInput = z
  .object({
    interviewId: z.uuid(),
    evidenceId: z.uuid(),
    reportNote: rawContent.refine((v) => v.trim().length > 0, '请说明原文如何报告问过此题'),
    confirmedReported: z.literal(true, { error: '需要明确确认这段经历确实报告问过该题' }),
  })
  .strict();
