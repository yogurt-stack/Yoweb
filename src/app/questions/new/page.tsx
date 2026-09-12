import Link from 'next/link';
import { QuestionForm } from '@/components/forms';
import { library } from '@/domain/server';

export const metadata = { title: '添加题目' };
export default function NewQuestion() {
  return (
    <>
      <Link className="back-link" href="/">
        ← 返回题库
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CAPTURE A QUESTION</div>
          <h1>
            记下一个好问题<span className="heading-dot">.</span>
          </h1>
          <p>从问题出发，来源和上下文可以以后补充。</p>
        </div>
      </div>
      <QuestionForm terms={library().listTerms()} />
    </>
  );
}
