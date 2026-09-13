import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ingestion } from '@/domain/server';
import { DomainError } from '@/domain/contracts';
import { ManualImportForm } from '@/components/ingestion-forms';

export const metadata = { title: '手动收录材料' };
export default async function NewImportPage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string }>;
}) {
  const { documentId } = await searchParams,
    service = ingestion();
  let document;
  if (documentId) {
    try {
      document = service.getDocument(documentId);
    } catch (error) {
      if (error instanceof DomainError && error.status === 404) notFound();
      throw error;
    }
  }
  return (
    <>
      <Link href="/sources" className="back-link">
        ← 返回来源材料
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MANUAL CAPTURE</div>
          <h1>
            {document ? '继续整理这份材料' : '收录一份有价值的材料'}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {document
              ? '保留历史版本，新候选仍需审核；既有题目不会被覆盖。'
              : '先保存出处，再由你决定哪些问题值得加入题库。'}
          </p>
        </div>
      </div>
      <ManualImportForm
        key={documentId ?? 'new'}
        sources={service.listSources()}
        document={document}
      />
    </>
  );
}
