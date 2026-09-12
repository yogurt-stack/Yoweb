import Link from 'next/link';
import { notFound } from 'next/navigation';
import { library } from '@/domain/server';
import { labels, DomainError } from '@/domain/contracts';
import { ArchiveButton, WordingForm } from '@/components/forms';

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let question;
  try {
    question = library().getQuestion(id);
  } catch (error) {
    if (error instanceof DomainError && error.status === 404) notFound();
    throw error;
  }
  return (
    <>
      <Link className="back-link" href="/">
        ← 返回题库
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">QUESTION DETAIL</div>
          <h1>
            问题与思考<span className="heading-dot">.</span>
          </h1>
        </div>
        <div className="actions">
          <ArchiveButton question={question} />
          <Link className="button" href={`/questions/${id}/edit`}>
            编辑题目 ↗
          </Link>
        </div>
      </div>
      {question.archivedAt && (
        <div className="archive-notice">
          这道题已归档。题目、原始问法和整理状态均已保留，可随时恢复。
        </div>
      )}
      <article className="panel detail-question">
        <div className="question-meta">
          <span className={`pill ${question.status === 'ORGANIZED' ? 'organized' : 'inbox'}`}>
            {labels[question.status]}
          </span>
          <span>{labels[question.taskType]}</span>
          <span>·</span>
          <span>参考难度：{labels[question.difficulty]}</span>
          <span>· 自建题目</span>
        </div>
        <h2 className="question-text">{question.text}</h2>
        <div className="tags">
          {question.topics.map((t) => (
            <Link href={`/?topicId=${t.id}`} className="topic-chip" key={t.id}>
              {t.name}
            </Link>
          ))}
          {question.tags.map((t) => (
            <Link href={`/?tagId=${t.id}`} className="tag-chip" key={t.id}>
              #{t.name}
            </Link>
          ))}
        </div>
        <p className="muted small timestamps">
          创建于 {question.createdAt.slice(0, 10)} · 更新于{' '}
          {question.updatedAt.slice(0, 16).replace('T', ' ')} UTC
        </p>
      </article>
      <div className="detail-columns">
        <section className="panel">
          <h2>思考笔记</h2>
          {[
            ['个人备注', question.notes],
            ['参考答案 / 评价要点', question.answer],
            ['训练提示', question.hints],
          ].map(([label, value]) => (
            <div className="note-block" key={label}>
              <h3>{label}</h3>
              <p className={value ? 'preserve-text' : 'muted'}>
                {value || '还没有记录。可以在编辑时补充。'}
              </p>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>
            原始问法 <span className="count-badge">{question.wordings.length}</span>
          </h2>
          <p className="hint">保留原文，编辑标准题目不会改变这里的记录。</p>
          {!question.wordings.length && (
            <p className="muted wording-empty">暂未关联原始问法，自建题目可以独立存在。</p>
          )}
          {question.wordings.map((w) => (
            <article className="wording" key={w.id}>
              <p className="preserve-text">{w.text}</p>
              <div className="muted small">{labels[w.sourceType]} · 人工确认关联</div>
              <p className="locator">原文定位：{w.sourceLocator}</p>
              <time className="muted small">观察于 {w.observedAt.slice(0, 10)}</time>
            </article>
          ))}
          <WordingForm questionId={id} />
        </section>
      </div>
    </>
  );
}
