import Link from 'next/link';
import { ingestion } from '@/domain/server';
import { labels } from '@/domain/contracts';

export const metadata = { title: '收录 Inbox' };
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams,
    batches = ingestion().listBatches(),
    showAll = view === 'all';
  const visible = batches.filter((b) => showAll || b.pending > 0),
    pending = batches.reduce((sum, b) => sum + b.pending, 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">IMPORT INBOX</div>
          <h1>
            把收集变成积累<span className="heading-dot">.</span>
          </h1>
          <p>这里的候选还不是正式题目。阅读证据，确认后再加入。</p>
        </div>
        <Link className="button" href="/imports/new">
          ＋ 手动收录材料
        </Link>
      </div>
      <div className="inbox-summary">
        <strong>{pending}</strong>
        <span>道候选等待审核</span>
        <Link href={showAll ? '/inbox' : '/inbox?view=all'}>
          {showAll ? '只看待审核' : '查看全部收录记录'} ↗
        </Link>
      </div>
      {visible.length ? (
        <div className="document-list">
          {visible.map((batch) => (
            <article className="document-card" key={batch.id}>
              <div className="question-meta">
                <span className="topic-chip">{labels[batch.document.contentOrigin]}</span>
                <span>{batch.source.name}</span>
                <span>{batch.createdAt.slice(0, 10)}</span>
              </div>
              <h3>
                <Link href={`/imports/${batch.id}`}>{batch.version.title} ↗</Link>
              </h3>
              <div className="batch-counts">
                <span>{batch.items.length} 项候选</span>
                <span className="pill inbox">{batch.pending} 项待审核</span>
                <span>{batch.items.length - batch.pending} 项已处理</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>{showAll ? '还没有收录记录' : '待审核已清空'}</h2>
          <p>可以继续收集材料，或查看已经处理的记录。</p>
          <Link className="button secondary" href={showAll ? '/imports/new' : '/inbox?view=all'}>
            {showAll ? '收录材料' : '查看收录记录'}
          </Link>
        </div>
      )}
    </>
  );
}
