import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ingestion } from '@/domain/server';
import { DomainError, labels } from '@/domain/contracts';
import { ingestionLabels as il } from '@/domain/ingestion-contracts';
import { ContextForm, DocumentStatusForm } from '@/components/ingestion-forms';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let document;
  try {
    document = ingestion().getDocument(id);
  } catch (error) {
    if (error instanceof DomainError && error.status === 404) notFound();
    throw error;
  }
  return (
    <>
      <Link className="back-link" href="/sources">
        ← 返回来源材料
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DOCUMENT & VERSIONS</div>
          <h1 className="material-title">{document.currentVersion.title}</h1>
          <p>
            {labels[document.contentOrigin]} ·{' '}
            <Link href={`/sources/${document.sourceId}`}>{document.source.name} ↗</Link>
          </p>
        </div>
        <Link className="button" href={`/imports/new?documentId=${id}`}>
          继续收录 / 更新材料
        </Link>
      </div>
      <section className="panel">
        <a
          className="external-source"
          href={document.canonicalUrl}
          target="_blank"
          rel="noreferrer"
        >
          {document.canonicalUrl}
        </a>
        <p className="hint">
          首次观察 {document.firstObservedAt.slice(0, 10)} · 最近检查{' '}
          {document.lastCheckedAt.slice(0, 10)}
        </p>
        <DocumentStatusForm key={document.status} document={document} />
        <p className="hint">标记页面失效会保留已有合法证据和个人笔记。</p>
      </section>
      <div className="detail-columns">
        <section className="panel">
          <h2>
            材料版本 <span className="count-badge">{document.versions.length}</span>
          </h2>
          <p className="hint">题目证据始终指向收录时的版本，材料更新不会覆盖题库。</p>
          {document.versions.map((version) => (
            <details
              className="version-card"
              id={`version-${version.id}`}
              key={version.id}
              open={version.id === document.currentVersionId}
            >
              <summary>
                {version.title}{' '}
                <span className="muted small">
                  {version.observedAt.slice(0, 16).replace('T', ' ')} UTC{' '}
                  {version.id === document.currentVersionId ? '· 当前版本' : '· 历史版本'}
                </span>
              </summary>
              <p className="hint">
                {il[version.localPolicy]} · 模型外发：{il[version.llmPolicy]}
              </p>
              {version.excerpt && (
                <blockquote className="preserve-text">{version.excerpt}</blockquote>
              )}
              {version.fullText && <p className="preserve-text">{version.fullText}</p>}
              <h3>个人笔记</h3>
              <p className="preserve-text small">{version.notes || '未填写'}</p>
            </details>
          ))}
          <h3>收录记录</h3>
          <div className="batch-links">
            {document.batches.map((b, i) => (
              <Link href={`/imports/${b.id}`} key={b.id}>
                批次 {document.batches.length - i} · {b.createdAt.slice(0, 10)} ↗
              </Link>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>{document.contentOrigin === 'JD' ? '岗位上下文' : '面试上下文'}</h2>
          {document.contentOrigin === 'INTERVIEW' ? (
            <>
              <p className="hint">
                一段经历可包含多轮面试。先区分经历，再在题目详情确认实际被报告的问题。
              </p>
              {document.interviews.map((i) => (
                <article className="interview-card" key={i.id}>
                  <h3>{i.reportKey}</h3>
                  <p className="small">
                    {i.company?.name || '公司未填写'} · {i.job?.title || '岗位未填写'} ·{' '}
                    {i.round || '轮次未填写'}
                  </p>
                  <p className="muted small">
                    {i.dateFrom ?? '日期未填写'}
                    {i.dateTo ? ` ～ ${i.dateTo}` : ''} · {il[i.credibility]}
                  </p>
                  {i.notes && <p className="preserve-text small">{i.notes}</p>}
                </article>
              ))}
            </>
          ) : document.contentOrigin === 'JD' ? (
            <>
              <p className="hint">岗位职责和要求属于准备上下文，不代表面试问过。</p>
              {document.jobs.map((j) => (
                <article className="interview-card" key={j.id}>
                  <h3>{j.title}</h3>
                  <p>{j.company?.name || '公司未填写'}</p>
                  {j.url && (
                    <a className="external-source" href={j.url} target="_blank" rel="noreferrer">
                      岗位原链接 ↗
                    </a>
                  )}
                </article>
              ))}
            </>
          ) : (
            <p className="muted">这份材料不被标记为真实面试经历，不建立面试报告次数。</p>
          )}
          <ContextForm document={document} />
        </section>
      </div>
    </>
  );
}
