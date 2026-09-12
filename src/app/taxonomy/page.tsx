import { library } from '@/domain/server';
import { TermForm } from '@/components/forms';
import { labels } from '@/domain/contracts';

export const metadata = { title: '领域与标签' };
export default function Taxonomy() {
  const terms = library().listTerms();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR KNOWLEDGE MAP</div>
          <h1>
            领域与标签<span className="heading-dot">.</span>
          </h1>
          <p>用浅层领域组织知识，用标签连接细节。</p>
        </div>
      </div>
      <div className="taxonomy-layout">
        <div>
          {(['TOPIC', 'TAG'] as const).map((kind) => (
            <section className="panel" key={kind}>
              <h2>
                {labels[kind]}{' '}
                <span className="count-badge">{terms.filter((t) => t.kind === kind).length}</span>
              </h2>
              <p className="hint">
                {kind === 'TOPIC'
                  ? '最多两层，一道题可以属于多个领域。'
                  : '补充考查点、技术或方法，别名也可以用于关键词搜索。'}
              </p>
              {terms
                .filter((t) => t.kind === kind)
                .map((term) => (
                  <details className="term-row" key={term.id}>
                    <summary>
                      <span>
                        {term.parentId && (
                          <small className="muted">
                            {terms.find((t) => t.id === term.parentId)?.name} /{' '}
                          </small>
                        )}
                        {term.name}
                        <span className="term-aliases">{term.aliases.join(' · ')}</span>
                      </span>
                      <span className="muted small">编辑</span>
                    </summary>
                    <TermForm term={term} terms={terms} />
                  </details>
                ))}
              {!terms.some((t) => t.kind === kind) && (
                <p className="muted">还没有标签，添加一个试试。</p>
              )}
            </section>
          ))}
        </div>
        <section className="panel new-term">
          <h2>扩展词表</h2>
          <p className="hint">由你确认的名称和别名，才会加入正式词表。</p>
          <TermForm terms={terms} />
        </section>
      </div>
    </>
  );
}
