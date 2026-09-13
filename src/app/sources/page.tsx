import Link from 'next/link';
import { ingestion } from '@/domain/server';
import { SourceForm } from '@/components/ingestion-forms';
import { DocumentList } from '@/components/source-views';
import { ingestionLabels as il } from '@/domain/ingestion-contracts';

export const metadata = { title: '来源材料' };
export default function SourcesPage() {
  const service = ingestion(),
    sources = service.listSources(),
    documents = service.listDocuments();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SOURCES & EVIDENCE</div>
          <h1>
            让问题有据可循<span className="heading-dot">.</span>
          </h1>
          <p>保留出处和必要上下文，把材料与题库连接起来。</p>
        </div>
        <Link href="/imports/new" className="button">
          ＋ 手动收录材料
        </Link>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>
            已登记来源 <span className="count-badge">{sources.length}</span>
          </h2>
        </div>
        {sources.length ? (
          <div className="source-grid">
            {sources.map((s) => (
              <Link href={`/sources/${s.id}`} key={s.id} className="source-card">
                <span className="topic-chip">{il[s.type]}</span>
                <h3>{s.name} ↗</h3>
                <p className="muted small">{s.host}</p>
                <span className="small">{il[s.localPolicy]}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">先记录一个来源及其保存范围，再开始收录。</p>
        )}
        <details className="source-registration" open={!sources.length}>
          <summary>＋ 登记来源与权限</summary>
          <SourceForm />
        </details>
      </section>
      <div className="result-heading">
        <h2>
          来源材料 <span>{documents.length}</span>
        </h2>
        <span className="muted small">最近检查优先</span>
      </div>
      <DocumentList documents={documents} />
    </>
  );
}
