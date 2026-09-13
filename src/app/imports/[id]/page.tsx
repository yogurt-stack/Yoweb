import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ingestion } from '@/domain/server';
import { DomainError, labels } from '@/domain/contracts';
import { ingestionLabels as il } from '@/domain/ingestion-contracts';
import { ReviewPanel } from '@/components/ingestion-forms';

export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ duplicate?: string }>;
}) {
  const { id } = await params,
    { duplicate } = await searchParams;
  let batch;
  try {
    batch = ingestion().getBatch(id);
  } catch (error) {
    if (error instanceof DomainError && error.status === 404) notFound();
    throw error;
  }
  return (
    <>
      <Link href="/inbox" className="back-link">
        ← 返回收录 Inbox
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">REVIEW BEFORE SAVING</div>
          <h1>
            收录审核<span className="heading-dot">.</span>
          </h1>
          <p>标准题可以修改，原文和证据保持独立。</p>
        </div>
        <Link className="button secondary" href={`/documents/${batch.document.id}`}>
          查看材料详情 ↗
        </Link>
      </div>
      {duplicate && (
        <div className="archive-notice">
          已识别重复收录，返回已有批次；不会重复创建材料版本或重置审核结果。
        </div>
      )}
      <section className="panel batch-source">
        <div className="question-meta">
          <span>{batch.source.name}</span>
          <span>{labels[batch.document.contentOrigin]}</span>
          <span>{il[batch.version.localPolicy]}</span>
          <span>外发：{il[batch.version.llmPolicy]}</span>
        </div>
        <h2>{batch.version.title}</h2>
        <a
          className="external-source"
          href={batch.document.canonicalUrl}
          target="_blank"
          rel="noreferrer"
        >
          {batch.document.canonicalUrl}
        </a>
        <details className="material-preview">
          <summary>查看本次材料与个人笔记</summary>
          {batch.version.excerpt && (
            <blockquote className="preserve-text">{batch.version.excerpt}</blockquote>
          )}
          {batch.version.fullText && <p className="preserve-text">{batch.version.fullText}</p>}
          <p className="preserve-text small">个人笔记：{batch.version.notes || '未填写'}</p>
        </details>
      </section>
      <ReviewPanel key={batch.id} batch={batch} />
    </>
  );
}
