import Link from 'next/link';
import { ZodError } from 'zod';
import { library } from '@/domain/server';
import { labels, taskTypes, statuses, difficulties } from '@/domain/contracts';

type Params = Record<string, string | string[] | undefined>;
export default async function Home({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const query = Object.fromEntries(
    Object.entries(params).filter(([, v]) => typeof v === 'string' && v !== ''),
  ) as Record<string, string>;
  const service = library(),
    counts = service.counts(),
    terms = service.listTerms();
  let result;
  try {
    result = service.listQuestions(query);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    return (
      <section className="empty-state">
        <h1>筛选条件不正确</h1>
        <p>链接中的筛选值无效，请重新选择。</p>
        <Link className="button" href="/">
          返回题库
        </Link>
      </section>
    );
  }
  const archived = query.archive === 'archived';
  const title = archived ? '已归档' : query.status === 'INBOX' ? '待整理的题目' : '我的题库';
  function pageHref(page: number) {
    const next = new URLSearchParams(query);
    next.set('page', String(page));
    return `/?${next}`;
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">QUESTION LIBRARY</div>
          <h1>
            {title}
            <span className="heading-dot">.</span>
          </h1>
          <p>收集值得思考的问题，把准备变成日常。</p>
        </div>
        <div className="actions">
          <a className="button secondary" href="/api/export" download>
            ↓ 导出题库
          </a>
          <Link className="button" href="/questions/new">
            ＋ 添加题目
          </Link>
        </div>
      </div>
      <div className="stats">
        <Link href="/" className="stat">
          <span>题库总量</span>
          <strong>
            {counts.active.toString().padStart(2, '0')}
            <small>道题目</small>
          </strong>
        </Link>
        <Link href="/?status=INBOX" className="stat">
          <span>
            <i className="dot amber" /> 待整理
          </span>
          <strong>
            {counts.inbox.toString().padStart(2, '0')}
            <small>等待梳理</small>
          </strong>
        </Link>
        <Link href="/?status=ORGANIZED" className="stat">
          <span>
            <i className="dot green" /> 已整理
          </span>
          <strong>
            {counts.organized.toString().padStart(2, '0')}
            <small>准备好思考</small>
          </strong>
        </Link>
      </div>
      <section className="library-section">
        <form key={JSON.stringify(query)} action="/" className="search-panel">
          {query.archive && <input type="hidden" name="archive" value={query.archive} />}
          <div className="search-row">
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="搜索题目"
                name="q"
                defaultValue={query.q}
                placeholder="搜索题目、原始问法或标签…"
                maxLength={200}
              />
            </label>
            <button type="submit">搜索</button>
          </div>
          <div className="filter-row">
            <label>
              <span className="sr-only">整理状态</span>
              <select name="status" aria-label="整理状态筛选" defaultValue={query.status ?? ''}>
                <option value="">全部状态</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {labels[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">作答任务</span>
              <select name="taskType" aria-label="作答任务筛选" defaultValue={query.taskType ?? ''}>
                <option value="">全部任务</option>
                {taskTypes.map((s) => (
                  <option key={s} value={s}>
                    {labels[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">难度</span>
              <select name="difficulty" aria-label="难度筛选" defaultValue={query.difficulty ?? ''}>
                <option value="">全部难度</option>
                {difficulties.map((s) => (
                  <option key={s} value={s}>
                    {labels[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">领域</span>
              <select name="topicId" aria-label="领域筛选" defaultValue={query.topicId ?? ''}>
                <option value="">全部领域</option>
                {terms
                  .filter((t) => t.kind === 'TOPIC')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span className="sr-only">标签</span>
              <select name="tagId" aria-label="标签筛选" defaultValue={query.tagId ?? ''}>
                <option value="">全部标签</option>
                {terms
                  .filter((t) => t.kind === 'TAG')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
            <button className="text-button" type="submit">
              应用筛选
            </button>
            <Link className="muted small" href={archived ? '/?archive=archived' : '/'}>
              清除条件
            </Link>
          </div>
        </form>
        <div className="result-heading">
          <h2>
            {query.q ? `“${query.q}”的搜索结果` : archived ? '归档题目' : '题目列表'}{' '}
            <span>{result.total}</span>
          </h2>
          <span className="muted small">{query.q ? '精确命中优先' : '最近更新优先'}</span>
        </div>
        {result.items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-symbol" aria-hidden="true">
              ✧
            </div>
            <h2>{Object.keys(query).length ? '还没有符合条件的题目' : '从一个好问题开始'}</h2>
            <p>
              {Object.keys(query).length
                ? '试试其他关键词，或清除筛选条件。'
                : '不需要面经或来源，先记下你想弄懂的问题。'}
            </p>
            <Link className="button" href={Object.keys(query).length ? '/' : '/questions/new'}>
              {Object.keys(query).length ? '查看全部题目' : '添加第一道题'}
            </Link>
          </div>
        ) : (
          <div className="question-list">
            {result.items.map((question, index) => (
              <article className="question-card" key={question.id}>
                <span className="question-number">
                  {String((result.page - 1) * result.pageSize + index + 1).padStart(2, '0')}
                </span>
                <div className="question-main">
                  <div className="question-meta">
                    <span
                      className={`pill ${question.status === 'ORGANIZED' ? 'organized' : 'inbox'}`}
                    >
                      {labels[question.status]}
                    </span>
                    <span>{labels[question.taskType]}</span>
                    <span>·</span>
                    <span>{labels[question.difficulty]}</span>
                    {question.archivedAt && <span>· 已归档</span>}
                  </div>
                  <h3>
                    <Link href={`/questions/${question.id}`}>{question.text}</Link>
                  </h3>
                  <div className="tags">
                    {question.topics.map((t) => (
                      <span className="topic-chip" key={t.id}>
                        {t.name}
                      </span>
                    ))}
                    {question.tags.map((t) => (
                      <span className="tag-chip" key={t.id}>
                        #{t.name}
                      </span>
                    ))}
                  </div>
                  {question.matchReasons.length > 0 && (
                    <p className="match-reason">{question.matchReasons.join(' · ')}</p>
                  )}
                </div>
                <div className="card-tail">
                  <span>{question.updatedAt.slice(0, 10)}</span>
                  <Link
                    href={`/questions/${question.id}`}
                    aria-label={`查看题目：${question.text}`}
                    className="card-arrow"
                  >
                    ↗
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
        {result.total > result.pageSize && (
          <nav className="pagination" aria-label="分页">
            {result.page > 1 && (
              <Link className="button secondary" href={pageHref(result.page - 1)}>
                上一页
              </Link>
            )}
            <span>
              第 {result.page} / {Math.ceil(result.total / result.pageSize)} 页
            </span>
            {result.page * result.pageSize < result.total && (
              <Link className="button secondary" href={pageHref(result.page + 1)}>
                下一页
              </Link>
            )}
          </nav>
        )}
      </section>
    </>
  );
}
