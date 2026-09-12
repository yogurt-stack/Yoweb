import Link from 'next/link';
import { notFound } from 'next/navigation';
import { library } from '@/domain/server';
import { DomainError } from '@/domain/contracts';
import { QuestionForm } from '@/components/forms';

export const metadata = { title: '编辑题目' };
export default async function EditQuestion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params,
    service = library();
  let question;
  try {
    question = service.getQuestion(id);
  } catch (error) {
    if (error instanceof DomainError && error.status === 404) notFound();
    throw error;
  }
  return (
    <>
      <Link className="back-link" href={`/questions/${id}`}>
        ← 返回题目详情
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">REFINE YOUR QUESTION</div>
          <h1>
            整理这道题<span className="heading-dot">.</span>
          </h1>
          <p>让问题更清晰，也为下一次思考留下线索。</p>
        </div>
      </div>
      <QuestionForm
        key={`${id}-${question.revision}`}
        terms={service.listTerms()}
        question={question}
      />
    </>
  );
}
