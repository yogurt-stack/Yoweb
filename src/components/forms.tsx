'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { labels, taskTypes, difficulties, statuses, origins } from '@/domain/contracts';
import type { QuestionDetail, Term } from '@/domain/library';

export async function write<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || '保存失败，请重试');
  return result.data;
}

export function useSubmission() {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const locked = useRef(false);
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : '操作失败，请重试');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return { pending, error, run };
}
export function FormError({ error }: { error: string }) {
  return error ? (
    <p className="form-error" role="alert">
      {error}
    </p>
  ) : null;
}

export function QuestionForm({ question, terms }: { question?: QuestionDetail; terms: Term[] }) {
  const router = useRouter(),
    { pending, error, run } = useSubmission();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(async () => {
      const body = {
        text: data.get('text'),
        taskType: data.get('taskType'),
        status: data.get('status'),
        difficulty: data.get('difficulty'),
        notes: data.get('notes'),
        answer: data.get('answer'),
        hints: data.get('hints'),
        topicIds: data.getAll('topicIds'),
        tagIds: data.getAll('tagIds'),
        ...(question ? { revision: question.revision } : {}),
      };
      const saved = await write<QuestionDetail>(
        question ? `/api/questions/${question.id}` : '/api/questions',
        body,
        question ? 'PATCH' : 'POST',
      );
      router.push(`/questions/${saved.id}`);
      router.refresh();
    });
  }
  return (
    <form className="editor" onSubmit={submit}>
      <section className="panel">
        <div className="section-heading">
          <span className="section-index">01</span>
          <h2>问题本身</h2>
          <span className="muted small">先记下来，再慢慢整理</span>
        </div>
        <label className="field">
          标准题目 <span className="required">*</span>
          <textarea
            autoFocus
            name="text"
            required
            maxLength={20000}
            rows={5}
            defaultValue={question?.text}
            placeholder="例如：如何设计 Coding Agent 的工具重试机制？"
          />
        </label>
        <div className="form-grid">
          <label className="field">
            作答任务
            <select name="taskType" defaultValue={question?.taskType ?? 'EXPLAIN'}>
              {taskTypes.map((v) => (
                <option key={v} value={v}>
                  {labels[v]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            参考难度
            <select name="difficulty" defaultValue={question?.difficulty ?? 'UNKNOWN'}>
              {difficulties.map((v) => (
                <option key={v} value={v}>
                  {labels[v]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            整理状态
            <select name="status" defaultValue={question?.status ?? 'INBOX'}>
              {statuses.map((v) => (
                <option key={v} value={v}>
                  {labels[v]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <span className="section-index">02</span>
          <h2>归入知识地图</h2>
          <Link className="small" href="/taxonomy" target="_blank">
            管理领域与标签 ↗
          </Link>
        </div>
        {(['TOPIC', 'TAG'] as const).map((kind) => (
          <fieldset key={kind} className="term-picker">
            <legend>
              {kind === 'TOPIC' ? '知识领域' : '补充标签'}{' '}
              <span className="muted small">可多选</span>
            </legend>
            <div className="check-chips">
              {terms
                .filter((t) => t.kind === kind)
                .map((t) => (
                  <label key={t.id}>
                    <input
                      type="checkbox"
                      name={kind === 'TOPIC' ? 'topicIds' : 'tagIds'}
                      value={t.id}
                      defaultChecked={(kind === 'TOPIC' ? question?.topics : question?.tags)?.some(
                        (v) => v.id === t.id,
                      )}
                    />
                    <span>
                      {t.parentId ? '↳ ' : ''}
                      {t.name}
                    </span>
                  </label>
                ))}
              {!terms.some((t) => t.kind === kind) && (
                <span className="muted small">还没有标签，可在管理入口手动添加。</span>
              )}
            </div>
          </fieldset>
        ))}
        <p className="hint">新窗口添加标签后，请保存当前题目，再进入编辑页选择新标签。</p>
      </section>
      <section className="panel">
        <div className="section-heading">
          <span className="section-index">03</span>
          <h2>留下思考</h2>
          <span className="muted small">选填</span>
        </div>
        <label className="field">
          个人备注
          <textarea
            name="notes"
            rows={3}
            maxLength={20000}
            defaultValue={question?.notes}
            placeholder="为什么收录这道题？有哪些还没想通的地方？"
          />
        </label>
        <label className="field">
          参考答案 / 评价要点
          <textarea
            name="answer"
            rows={4}
            maxLength={20000}
            defaultValue={question?.answer}
            placeholder="记录你的答案、关键步骤或评价标准。"
          />
        </label>
        <label className="field">
          训练提示
          <textarea
            name="hints"
            rows={2}
            maxLength={20000}
            defaultValue={question?.hints}
            placeholder="为下一次思考留一点线索。"
          />
        </label>
      </section>
      <FormError error={error} />
      <div className="form-actions">
        <span className="muted small">
          {question && question.creationMethod !== 'USER_CREATED'
            ? '编辑不会覆盖原始问法与来源证据。'
            : '自建题目，无需填写来源。'}
        </span>
        <Link className="button secondary" href={question ? `/questions/${question.id}` : '/'}>
          取消
        </Link>
        <button disabled={pending} type="submit">
          {pending ? '正在保存…' : question ? '保存修改' : '保存题目'}
        </button>
      </div>
    </form>
  );
}

export function ArchiveButton({ question }: { question: QuestionDetail }) {
  const { run, pending, error } = useSubmission(),
    router = useRouter();
  return (
    <div>
      <button
        className="button secondary"
        disabled={pending}
        onClick={() =>
          run(async () => {
            await write(
              `/api/questions/${question.id}/${question.archivedAt ? 'restore' : 'archive'}`,
              {},
            );
            router.refresh();
          })
        }
      >
        {pending ? '处理中…' : question.archivedAt ? '恢复题目' : '归档题目'}
      </button>
      <FormError error={error} />
    </div>
  );
}

export function WordingForm({ questionId }: { questionId: string }) {
  const router = useRouter(),
    { run, pending, error } = useSubmission();
  const [notice, setNotice] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setNotice('');
    await run(async () => {
      await write(`/api/questions/${questionId}/wordings`, Object.fromEntries(data));
      form.reset();
      setNotice('原始问法已保存');
      router.refresh();
    });
  }
  return (
    <details className="wording-form">
      <summary>＋ 关联原始问法</summary>
      <p className="hint">仅关联考查目标、作答任务和关键约束一致的原文。保存后独立保留。</p>
      <form onSubmit={submit}>
        <label className="field">
          原始问法
          <textarea required name="text" maxLength={20000} rows={3} />
        </label>
        <div className="form-grid two">
          <label className="field">
            原文类型
            <select name="sourceType" defaultValue="OTHER">
              {origins.map((o) => (
                <option key={o} value={o}>
                  {labels[o]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            原文定位
            <input
              required
              name="sourceLocator"
              maxLength={2000}
              placeholder="URL、章节或个人笔记位置"
            />
          </label>
        </div>
        <FormError error={error} />
        <p role="status" className="success">
          {notice}
        </p>
        <button disabled={pending}>{pending ? '保存中…' : '确认关联并保存'}</button>
      </form>
    </details>
  );
}

export function TermForm({ terms, term }: { terms: Term[]; term?: Term }) {
  const router = useRouter(),
    { run, pending, error } = useSubmission();
  const [kind, setKind] = useState(term?.kind ?? 'TOPIC'),
    [notice, setNotice] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setNotice('');
    await run(async () => {
      const body = {
        name: data.get('name'),
        aliases: String(data.get('aliases'))
          .split(/[\n,，]/)
          .map((v) => v.trim())
          .filter(Boolean),
        ...(!term
          ? { kind, parentId: kind === 'TOPIC' ? data.get('parentId') || null : null }
          : {}),
      };
      await write(term ? `/api/terms/${term.id}` : '/api/terms', body, term ? 'PATCH' : 'POST');
      if (!term) form.reset();
      setNotice(term ? '修改已保存' : '已加入正式词表');
      router.refresh();
    });
  }
  return (
    <form onSubmit={submit} className="term-form">
      {!term && (
        <div className="form-grid two">
          <label className="field">
            类型
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'TOPIC' | 'TAG')}
            >
              <option value="TOPIC">领域</option>
              <option value="TAG">标签</option>
            </select>
          </label>
          {kind === 'TOPIC' && (
            <label className="field">
              父级领域
              <select name="parentId">
                <option value="">无（一级领域）</option>
                {terms
                  .filter((t) => t.kind === 'TOPIC' && !t.parentId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
      )}
      <label className="field">
        名称
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={term?.name}
          placeholder="例如：Tool Calling"
        />
      </label>
      <label className="field">
        别名
        <input
          name="aliases"
          defaultValue={term?.aliases.join('，')}
          placeholder="用逗号分隔，例如：工具调用，函数调用"
        />
      </label>
      <FormError error={error} />
      <p role="status" className="success">
        {notice}
      </p>
      <button disabled={pending}>{pending ? '保存中…' : term ? '保存词表修改' : '确认添加'}</button>
    </form>
  );
}
