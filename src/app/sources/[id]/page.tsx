import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ingestion } from '@/domain/server';
import { DomainError } from '@/domain/contracts';
import { SourcePolicy, DocumentList } from '@/components/source-views';

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params,
    service = ingestion();
  let source;
  try {
    source = service.getSource(id);
  } catch (error) {
    if (error instanceof DomainError && error.status === 404) notFound();
    throw error;
  }
  return (
    <>
      <Link href="/sources" className="back-link">
        ← 返回来源材料
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SOURCE PROFILE</div>
          <h1>{source.name}</h1>
          <p>{source.host}</p>
        </div>
        <Link href="/imports/new" className="button">
          手动收录材料
        </Link>
      </div>
      <section className="panel">
        <h2>来源与内容策略</h2>
        <SourcePolicy source={source} />
      </section>
      <DocumentList documents={service.listDocuments(id)} />
    </>
  );
}
