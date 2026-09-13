'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FormError, useSubmission, write } from './forms';
import { labels, origins, taskTypes } from '@/domain/contracts';
import {
  sourceTypes,
  localPolicies,
  llmPolicies,
  documentStatuses,
  ingestionLabels as il,
} from '@/domain/ingestion-contracts';
import type {
  DocumentDetail,
  ImportBatchDetail,
  QuestionEvidence,
  Source,
  Ingestion,
} from '@/domain/ingestion';
import type { QuestionDetail } from '@/domain/library';

export function SourceForm() {
  const router = useRouter(),
    { run, pending, error } = useSubmission();
  const [notice, setNotice] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setNotice('');
    await run(async () => {
      await write('/api/sources', Object.fromEntries(data));
      form.reset();
      setNotice('来源已登记，可以开始手动收录');
      router.refresh();
    });
  }
  return (
    <form onSubmit={submit} className="source-form">
      <div className="form-grid two">
        <label className="field">
          来源名称
          <input name="name" required maxLength={200} placeholder="例如：个人精选博客" />
        </label>
        <label className="field">
          平台类型
          <select name="type" defaultValue="OTHER">
            {sourceTypes.map((t) => (
              <option value={t} key={t}>
                {il[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        来源主机
        <input
          required
          name="host"
          maxLength={253}
          placeholder="例如：github.com，不含 https:// 和路径"
        />
      </label>
      <div className="form-grid two">
        <label className="field">
          规则检查
          <select name="rulesStatus" defaultValue="UNCHECKED">
            {['UNCHECKED', 'USER_CONFIRMED', 'RESTRICTED'].map((v) => (
              <option key={v} value={v}>
                {il[v]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          本地保存上限
          <select name="localPolicy" defaultValue="METADATA_ONLY">
            {localPolicies.map((v) => (
              <option key={v} value={v}>
                {il[v]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        模型外发权限
        <select name="llmPolicy" defaultValue="UNKNOWN">
          {llmPolicies.map((v) => (
            <option key={v} value={v}>
              {il[v]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        权限判断依据
        <textarea
          name="policyNote"
          maxLength={2000}
          rows={3}
          placeholder="保存原文或允许外发前，记录你检查的许可、条款或自有内容依据。"
        />
      </label>
      <p className="hint">
        保存到本机与发送给模型分别判断。本阶段只做人工收录，不访问站点或调用模型。
      </p>
      <FormError error={error} />
      <p className="success" role="status">
        {notice}
      </p>
      <button disabled={pending}>{pending ? '保存中…' : '登记来源'}</button>
    </form>
  );
}

type CandidateDraft = {
  key: number;
  text: string;
  taskType: string;
  originalText: string;
  locator: string;
};
export function ManualImportForm({
  sources,
  document,
}: {
  sources: Source[];
  document?: DocumentDetail;
}) {
  const router = useRouter(),
    { run, pending, error } = useSubmission();
  const [sourceId, setSourceId] = useState(document?.sourceId ?? sources[0]?.id ?? '');
  const [localPolicy, setLocalPolicy] = useState(
    document?.currentVersion.localPolicy ?? 'METADATA_ONLY',
  );
  const [excerpt, setExcerpt] = useState(document?.currentVersion.excerpt ?? ''),
    [fullText, setFullText] = useState(document?.currentVersion.fullText ?? '');
  const [candidates, setCandidates] = useState<CandidateDraft[]>([]),
    [nextKey, setNextKey] = useState(1);
  const selected = sources.find((s) => s.id === sourceId);
  function change(key: number, values: Partial<CandidateDraft>) {
    setCandidates((old) => old.map((c) => (c.key === key ? { ...c, ...values } : c)));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(async () => {
      const saved = await write<ImportBatchDetail & { duplicate: boolean }>('/api/imports/manual', {
        sourceId,
        url: data.get('url'),
        title: data.get('title'),
        contentOrigin: data.get('contentOrigin'),
        localPolicy,
        llmPolicy: data.get('llmPolicy'),
        excerpt: localPolicy === 'METADATA_ONLY' ? '' : excerpt,
        fullText: localPolicy === 'FULL' ? fullText : '',
        notes: data.get('notes'),
        candidates: candidates.map((c) => ({
          text: c.text,
          taskType: c.taskType,
          originalText: localPolicy === 'METADATA_ONLY' ? '' : c.originalText,
          locator: c.locator,
        })),
      });
      router.push(`/imports/${saved.id}${saved.duplicate ? '?duplicate=1' : ''}`);
      router.refresh();
    });
  }
  if (!sources.length)
    return (
      <div className="empty-state">
        <h2>先登记一个来源</h2>
        <p>记录平台、主机及允许保存的范围，再手动收录材料。</p>
        <Link className="button" href="/sources">
          登记来源
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} className="editor import-form">
      <section className="panel">
        <div className="section-heading">
          <span className="section-index">01</span>
          <h2>材料信息</h2>
        </div>
        <div className="form-grid two">
          <label className="field">
            选择来源
            <select
              value={sourceId}
              disabled={Boolean(document)}
              onChange={(e) => {
                setSourceId(e.target.value);
                setLocalPolicy('METADATA_ONLY');
              }}
            >
              {sources.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name} · {s.host}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            内容类型
            <select
              name="contentOrigin"
              defaultValue={document?.contentOrigin ?? 'OTHER'}
              aria-readonly={Boolean(document)}
            >
              {(document ? [document.contentOrigin] : origins).map((v) => (
                <option key={v} value={v}>
                  {labels[v]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">
          面经表示描述真实面试经历的材料；普通题目汇编选「其他」，岗位要求选「岗位要求」。
        </p>
        <label className="field">
          材料链接
          <input
            type="url"
            name="url"
            required
            maxLength={2000}
            defaultValue={document?.canonicalUrl}
            readOnly={Boolean(document)}
            placeholder="https://…"
          />
        </label>
        <label className="field">
          材料标题
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={document?.currentVersion.title}
          />
        </label>
        <div className="form-grid two">
          <label className="field">
            本次保存范围
            <select
              value={localPolicy}
              onChange={(e) => setLocalPolicy(e.target.value as typeof localPolicy)}
            >
              {localPolicies.map((v) => (
                <option
                  key={v}
                  value={v}
                  disabled={Boolean(
                    selected &&
                    localPolicies.indexOf(v) > localPolicies.indexOf(selected.localPolicy),
                  )}
                >
                  {il[v]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            本次模型外发权限
            <select name="llmPolicy" defaultValue={document?.currentVersion.llmPolicy ?? 'UNKNOWN'}>
              {llmPolicies.map((v) => (
                <option
                  key={v}
                  value={v}
                  disabled={v === 'ALLOW' && selected?.llmPolicy !== 'ALLOW'}
                >
                  {il[v]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {localPolicy !== 'METADATA_ONLY' && (
          <label className="field">
            合法摘录
            <textarea
              rows={6}
              maxLength={20000}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="粘贴允许本地保存的必要片段，候选原文必须来自这里或获准的全文。"
            />
          </label>
        )}
        {localPolicy === 'FULL' && (
          <label className="field">
            允许保存的全文
            <textarea
              rows={8}
              maxLength={20000}
              value={fullText}
              onChange={(e) => setFullText(e.target.value)}
            />
          </label>
        )}
        <label className="field">
          个人笔记
          <textarea
            name="notes"
            rows={3}
            maxLength={20000}
            defaultValue={document?.currentVersion.notes}
            placeholder="记录你的理解、材料价值和阅读上下文。"
          />
        </label>
      </section>
      <section className="panel">
        <div className="section-heading">
          <span className="section-index">02</span>
          <h2>手动整理候选题</h2>
          <span className="muted small">选填 · {candidates.length}/50</span>
        </div>
        <p className="hint">候选只进入收录 Inbox，经你接受后才加入正式题库。也可以只保存材料。</p>
        {candidates.map((candidate, index) => (
          <fieldset className="candidate-draft" key={candidate.key}>
            <legend>候选 {index + 1}</legend>
            <label className="field">
              候选题目
              <textarea
                required
                maxLength={20000}
                rows={3}
                value={candidate.text}
                onChange={(e) => change(candidate.key, { text: e.target.value })}
              />
            </label>
            <div className="form-grid two">
              <label className="field">
                作答任务
                <select
                  value={candidate.taskType}
                  onChange={(e) => change(candidate.key, { taskType: e.target.value })}
                >
                  {taskTypes.map((v) => (
                    <option key={v} value={v}>
                      {labels[v]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                证据定位
                <input
                  required
                  maxLength={2000}
                  value={candidate.locator}
                  onChange={(e) => change(candidate.key, { locator: e.target.value })}
                />
              </label>
            </div>
            {localPolicy !== 'METADATA_ONLY' ? (
              <label className="field">
                候选原始问法
                <textarea
                  rows={2}
                  maxLength={20000}
                  value={candidate.originalText}
                  onChange={(e) => change(candidate.key, { originalText: e.target.value })}
                  placeholder="可选：保持材料中的原文，不要填改写后的题目。"
                />
              </label>
            ) : (
              <p className="hint">仅链接模式只保存你的整理题目，不保存原始问法。</p>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => setCandidates((old) => old.filter((c) => c.key !== candidate.key))}
            >
              移除候选 {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="button secondary"
          disabled={candidates.length >= 50 || pending}
          onClick={() => {
            setCandidates((old) => [
              ...old,
              {
                key: nextKey,
                text: '',
                originalText: '',
                locator: `第 ${nextKey} 题`,
                taskType: 'EXPLAIN',
              },
            ]);
            setNextKey((v) => v + 1);
          }}
        >
          ＋ 添加候选题
        </button>
      </section>
      <FormError error={error} />
      <div className="form-actions">
        <Link href="/sources" className="button secondary">
          取消
        </Link>
        <button disabled={pending || selected?.rulesStatus === 'RESTRICTED'}>
          {pending ? '正在收录…' : '保存材料并进入审核'}
        </button>
      </div>
    </form>
  );
}

type ReviewDraft = {
  checked: boolean;
  text: string;
  taskType: string;
  mode: 'NEW' | 'EXISTING';
  targetQuestionId: string;
};
type ReviewResult = ReturnType<Ingestion['review']>[number];
function QuestionPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<QuestionDetail[]>([]),
    [selected, setSelected] = useState('');
  const { run, pending, error } = useSubmission();
  return (
    <div className="question-picker">
      <label className="field">
        查找已有题目
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={200}
          placeholder="输入关键词后查找"
        />
      </label>
      <button
        type="button"
        className="button secondary"
        disabled={pending || disabled}
        onClick={() =>
          run(async () => {
            const response = await fetch(`/api/questions?q=${encodeURIComponent(query)}`);
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error?.message || '查询失败');
            setResults(payload.data.items);
          })
        }
      >
        查找已有题
      </button>
      <label className="field">
        关联目标
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value);
            setSelected(results.find((q) => q.id === e.target.value)?.text ?? '');
          }}
        >
          <option value="">请选择题目</option>
          {value && !results.some((q) => q.id === value) && (
            <option value={value}>{selected}</option>
          )}
          {results.map((q) => (
            <option key={q.id} value={q.id}>
              {q.text.slice(0, 120)}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        只追加来源证据，保留已有题目的文本与分类。每次最多显示 20 项，可缩小关键词。
      </p>
      <FormError error={error} />
    </div>
  );
}
export function ReviewPanel({ batch }: { batch: ImportBatchDetail }) {
  const router = useRouter(),
    { run, pending, error } = useSubmission();
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>(() =>
    Object.fromEntries(
      batch.items.map((i) => [
        i.id,
        {
          checked: false,
          text: i.proposedText,
          taskType: i.taskType,
          mode: 'NEW',
          targetQuestionId: '',
        },
      ]),
    ),
  );
  const [results, setResults] = useState<ReviewResult[]>([]);
  const awaiting = batch.items.filter((i) => i.status === 'REVIEW_PENDING');
  const selected = awaiting.filter((i) => drafts[i.id]?.checked);
  function change(id: string, data: Partial<ReviewDraft>) {
    setDrafts((old) => ({ ...old, [id]: { ...old[id], ...data } }));
  }
  async function review(ids: string[], decision: 'ACCEPT' | 'IGNORE') {
    await run(async () => {
      const requests = ids.map((id) => {
        const item = batch.items.find((i) => i.id === id)!,
          draft = drafts[id];
        if (decision === 'ACCEPT' && draft.mode === 'EXISTING' && !draft.targetQuestionId)
          throw new Error('请先为关联模式的候选选择已有题目');
        return {
          id,
          revision: item.revision,
          decision,
          ...(decision === 'ACCEPT'
            ? draft.mode === 'EXISTING'
              ? { targetQuestionId: draft.targetQuestionId }
              : {
                  ...(draft.text !== item.proposedText ? { text: draft.text } : {}),
                  ...(draft.taskType !== item.taskType ? { taskType: draft.taskType } : {}),
                }
            : {}),
        };
      });
      const saved = await write<ReviewResult[]>('/api/inbox/review', { items: requests });
      setResults(saved);
      setDrafts((old) => {
        const next = { ...old };
        for (const r of saved)
          if (r.ok && r.id && next[r.id]) next[r.id] = { ...next[r.id], checked: false };
        return next;
      });
      router.refresh();
    });
  }
  return (
    <section className="review-panel">
      <div className="review-toolbar">
        <label>
          <input
            type="checkbox"
            disabled={pending || !awaiting.length}
            checked={Boolean(awaiting.length && selected.length === awaiting.length)}
            onChange={(e) => {
              const checked = e.target.checked;
              setDrafts((old) => {
                const next = { ...old };
                for (const i of awaiting) next[i.id] = { ...next[i.id], checked };
                return next;
              });
            }}
          />{' '}
          全选待审核
        </label>
        <span className="muted small">已选 {selected.length} 项</span>
        <button
          disabled={pending || !selected.length}
          onClick={() =>
            review(
              selected.map((i) => i.id),
              'ACCEPT',
            )
          }
        >
          接受所选
        </button>
        <button
          className="button secondary"
          disabled={pending || !selected.length}
          onClick={() =>
            review(
              selected.map((i) => i.id),
              'IGNORE',
            )
          }
        >
          忽略所选
        </button>
      </div>
      <FormError error={error} />
      {results.length > 0 && (
        <div className="review-results" role="status">
          {results.map((r, i) => (
            <p key={i} className={r.ok ? 'success' : 'form-error'}>
              候选{' '}
              {Math.max(
                0,
                batch.items.findIndex((item) => item.id === r.id),
              ) + 1}
              ：{r.ok ? il[r.item.status] : r.error.message}
              {r.ok && r.item.acceptedQuestionId && (
                <>
                  {' '}
                  · <Link href={`/questions/${r.item.acceptedQuestionId}`}>查看题目 ↗</Link>
                </>
              )}
            </p>
          ))}
        </div>
      )}
      {!batch.items.length && (
        <div className="empty-state">
          <h2>材料已保存</h2>
          <p>这次没有候选题。后续可以从材料详情继续收录。</p>
        </div>
      )}
      {batch.items.map((item, index) => {
        const draft = drafts[item.id],
          finished = item.status !== 'REVIEW_PENDING';
        return (
          <article className="panel review-item" key={item.id} data-item-id={item.id}>
            <div className="section-heading">
              <label className="review-check">
                <input
                  type="checkbox"
                  aria-label={`选择候选 ${index + 1}`}
                  checked={!finished && draft.checked}
                  disabled={finished || pending}
                  onChange={(e) => change(item.id, { checked: e.target.checked })}
                />
                候选 {index + 1}
              </label>
              <span className={`pill ${finished ? 'organized' : 'inbox'}`}>{il[item.status]}</span>
            </div>
            <div className="review-columns">
              <div className="original-preview">
                <h3>原文证据</h3>
                <p className="preserve-text">{item.originalText || '仅保存链接，无原文片段。'}</p>
                <p className="muted small">{item.locator}</p>
                <p className="hint">人工整理 · 接受前请核对题意与原文</p>
              </div>
              <div>
                {finished ? (
                  <>
                    <h3 className="preserve-text">{item.proposedText}</h3>
                    <p className="muted small">{labels[item.taskType]}</p>
                    {item.acceptedQuestionId && (
                      <Link
                        className="button secondary"
                        href={`/questions/${item.acceptedQuestionId}`}
                      >
                        查看已收录题目 ↗
                      </Link>
                    )}
                  </>
                ) : (
                  <>
                    <label className="field">
                      采用方式
                      <select
                        value={draft.mode}
                        disabled={pending}
                        onChange={(e) =>
                          change(item.id, { mode: e.target.value as 'NEW' | 'EXISTING' })
                        }
                      >
                        <option value="NEW">创建新题目</option>
                        <option value="EXISTING">关联已有题目</option>
                      </select>
                    </label>
                    {draft.mode === 'NEW' ? (
                      <>
                        <label className="field">
                          采用的标准题目
                          <textarea
                            rows={3}
                            maxLength={20000}
                            value={draft.text}
                            disabled={pending}
                            onChange={(e) => change(item.id, { text: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          作答任务
                          <select
                            value={draft.taskType}
                            disabled={pending}
                            onChange={(e) => change(item.id, { taskType: e.target.value })}
                          >
                            {taskTypes.map((v) => (
                              <option key={v} value={v}>
                                {labels[v]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : (
                      <QuestionPicker
                        value={draft.targetQuestionId}
                        onChange={(id) => change(item.id, { targetQuestionId: id })}
                        disabled={pending}
                      />
                    )}
                    <div className="actions">
                      <button disabled={pending} onClick={() => review([item.id], 'ACCEPT')}>
                        {draft.mode === 'EXISTING'
                          ? '确认关联'
                          : draft.text !== item.proposedText || draft.taskType !== item.taskType
                            ? '修改后接受'
                            : '接受此题'}
                      </button>
                      <button
                        className="button secondary"
                        disabled={pending}
                        onClick={() => review([item.id], 'IGNORE')}
                      >
                        忽略此题
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}

export function DocumentStatusForm({ document }: { document: DocumentDetail }) {
  const router = useRouter(),
    { run, pending, error } = useSubmission(),
    [notice, setNotice] = useState('');
  return (
    <form
      className="document-status"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        run(async () => {
          await write(`/api/documents/${document.id}`, { status: data.get('status') }, 'PATCH');
          setNotice('材料状态已更新，已有证据保持不变');
          router.refresh();
        });
      }}
    >
      <label className="field">
        材料状态
        <select name="status" defaultValue={document.status}>
          {documentStatuses.map((s) => (
            <option key={s} value={s}>
              {il[s]}
            </option>
          ))}
        </select>
      </label>
      <button disabled={pending} className="button secondary">
        更新状态
      </button>
      <p className="success" role="status">
        {notice}
      </p>
      <FormError error={error} />
    </form>
  );
}

export function ContextForm({ document }: { document: DocumentDetail }) {
  const router = useRouter(),
    { run, pending, error } = useSubmission(),
    [notice, setNotice] = useState('');
  const interview = document.contentOrigin === 'INTERVIEW';
  if (!interview && document.contentOrigin !== 'JD') return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setNotice('');
    await run(async () => {
      const body = Object.fromEntries(
        [...data].filter(
          ([key, value]) =>
            value !== '' || ['companyName', 'jobTitle', 'round', 'notes'].includes(key),
        ),
      );
      await write(interview ? '/api/interviews' : '/api/jobs', {
        ...body,
        documentId: document.id,
      });
      form.reset();
      setNotice(
        interview
          ? '面试经历已建立；请在题目详情中逐题确认报告出现'
          : '岗位上下文已保存，不会自动创建面试题',
      );
      router.refresh();
    });
  }
  return (
    <form className="context-form" onSubmit={submit}>
      {interview && (
        <label className="field">
          经历标识
          <input
            name="reportKey"
            required
            maxLength={200}
            placeholder="区分同一材料中的经历，例如：作者 A 的秋招面试"
          />
        </label>
      )}
      <div className="form-grid two">
        <label className="field">
          公司名称
          <input name="companyName" maxLength={200} placeholder="未知可留空" />
        </label>
        <label className="field">
          岗位名称
          <input name={interview ? 'jobTitle' : 'title'} required={!interview} maxLength={200} />
        </label>
      </div>
      <label className="field">
        岗位链接
        <input type="url" name={interview ? 'jobUrl' : 'url'} maxLength={2000} />
      </label>
      {interview && (
        <>
          <div className="form-grid two">
            <label className="field">
              面试起始日期
              <input type="date" name="dateFrom" />
            </label>
            <label className="field">
              面试结束日期
              <input type="date" name="dateTo" />
            </label>
          </div>
          <div className="form-grid two">
            <label className="field">
              轮次
              <input name="round" maxLength={100} placeholder="例如：技术一面" />
            </label>
            <label className="field">
              叙述可信度
              <select name="credibility" defaultValue="REPORTED">
                <option value="REPORTED">原文有明确叙述</option>
                <option value="UNCERTAIN">上下文待核实</option>
              </select>
            </label>
          </div>
          <label className="field">
            经历备注
            <textarea name="notes" maxLength={20000} rows={2} />
          </label>
        </>
      )}
      <FormError error={error} />
      <p role="status" className="success">
        {notice}
      </p>
      <button disabled={pending || document.status === 'PROHIBITED'}>
        {pending ? '保存中…' : interview ? '建立面试经历' : '保存岗位上下文'}
      </button>
    </form>
  );
}

export function OccurrenceForm({
  questionId,
  proof,
}: {
  questionId: string;
  proof: QuestionEvidence['proofs'][number];
}) {
  const router = useRouter(),
    { run, pending, error } = useSubmission(),
    [notice, setNotice] = useState('');
  if (proof.document.contentOrigin !== 'INTERVIEW') return null;
  if (!proof.interviews.length)
    return (
      <p className="hint">
        还没有可区分的面试经历。先到{' '}
        <Link href={`/documents/${proof.document.id}`}>材料详情建立经历 ↗</Link>
        ，再确认该题是否被报告问过。
      </p>
    );
  return (
    <details className="occurrence-form">
      <summary>手动确认面试报告出现</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            data = new FormData(form);
          run(async () => {
            await write(`/api/questions/${questionId}/occurrences`, {
              interviewId: data.get('interviewId'),
              evidenceId: proof.id,
              reportNote: data.get('reportNote'),
              confirmedReported: data.get('confirmedReported') === 'on',
            });
            form.reset();
            setNotice('报告出现已确认，同一题在同一经历中只计一次');
            router.refresh();
          });
        }}
      >
        <label className="field">
          选择面试经历
          <select name="interviewId" required>
            {proof.interviews.map((i) => (
              <option key={i.id} value={i.id}>
                {i.reportKey}
                {i.company ? ` · ${i.company.name}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          报告依据
          <textarea
            name="reportNote"
            required
            rows={2}
            maxLength={20000}
            placeholder="原文的哪部分明确报告问过这道题？"
          />
        </label>
        <label className="confirm-report">
          <input name="confirmedReported" type="checkbox" required />
          我确认这段真实面试经历报告问过该题，且不是从 JD、练习或模型扩展推断。
        </label>
        <FormError error={error} />
        <p role="status" className="success">
          {notice}
        </p>
        <button disabled={pending || proof.document.status === 'PROHIBITED'}>确认报告出现</button>
      </form>
    </details>
  );
}
