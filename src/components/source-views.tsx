import Link from 'next/link';
import { labels } from '@/domain/contracts';
import { ingestionLabels as il } from '@/domain/ingestion-contracts';
import type { Ingestion, Source, QuestionEvidence } from '@/domain/ingestion';
import { OccurrenceForm } from './ingestion-forms';

export function SourcePolicy({ source }: { source: Source }) {
  return (
    <dl className="policy-grid">
      <div>
        <dt>平台 / 主机</dt>
        <dd>
          {il[source.type]} · {source.host}
        </dd>
      </div>
      <div>
        <dt>获取方式</dt>
        <dd>手动录入</dd>
      </div>
      <div>
        <dt>规则检查</dt>
        <dd>{il[source.rulesStatus]}</dd>
      </div>
      <div>
        <dt>本地保存上限</dt>
        <dd>{il[source.localPolicy]}</dd>
      </div>
      <div>
        <dt>模型外发</dt>
        <dd>{il[source.llmPolicy]}</dd>
      </div>
      <div>
        <dt>权限依据</dt>
        <dd>{source.policyNote || '尚未记录，仅保存链接与个人笔记。'}</dd>
      </div>
    </dl>
  );
}
export function DocumentList({ documents }: { documents: ReturnType<Ingestion['listDocuments']> }) {
  return documents.length ? (
    <div className="document-list">
      {documents.map((d) => (
        <article key={d.id} className="document-card">
          <div className="question-meta">
            <span className="topic-chip">{labels[d.contentOrigin]}</span>
            <span>{d.source.name}</span>
            <span className={`pill ${d.status === 'VALID' ? 'organized' : 'inbox'}`}>
              {il[d.status]}
            </span>
          </div>
          <h3>
            <Link href={`/documents/${d.id}`}>{d.currentVersion?.title ?? '未命名材料'} ↗</Link>
          </h3>
          <p className="locator">{d.canonicalUrl}</p>
          <span className="muted small">
            最近检查 {d.lastCheckedAt.slice(0, 10)} ·{' '}
            {d.currentVersion ? il[d.currentVersion.localPolicy] : ''}
          </span>
        </article>
      ))}
    </div>
  ) : (
    <div className="empty-state">
      <h2>还没有来源材料</h2>
      <p>从一条链接或一段允许保存的摘录开始。</p>
      <Link className="button" href="/imports/new">
        手动收录材料
      </Link>
    </div>
  );
}
export function EvidenceSection({
  questionId,
  context,
}: {
  questionId: string;
  context: QuestionEvidence;
}) {
  return (
    <section className="panel evidence-section">
      <div className="section-heading">
        <h2>来源证据与上下文</h2>
        <Link className="small" href="/imports/new">
          后补来源 ↗
        </Link>
      </div>
      <div className="evidence-counts">
        <div>
          <strong data-testid="mention-count">{context.mentionCount}</strong>
          <span>资料收录次数</span>
          <small>按独立材料计数，版本不重复计入</small>
        </div>
        <div>
          <strong data-testid="occurrence-count">{context.occurrenceCount}</strong>
          <span>面试报告次数</span>
          <small>仅统计手动确认的可区分经历</small>
        </div>
      </div>
      {!context.proofs.length && (
        <p className="muted">
          暂未关联来源证据。手动收录材料后，在审核时选择「关联已有题目」即可后补。
        </p>
      )}
      {context.proofs.map((proof) => (
        <article key={proof.id} className="evidence-card">
          <div className="question-meta">
            <span className="topic-chip">
              {proof.scope === 'EXCERPT' ? '原文摘录证据' : '链接证据'}
            </span>
            <span>{labels[proof.document.contentOrigin]}</span>
            <span>{il[proof.document.status]}</span>
          </div>
          <h3>
            <Link href={`/documents/${proof.document.id}#version-${proof.documentVersionId}`}>
              {proof.version.title} ↗
            </Link>
          </h3>
          <a className="external-source" href={proof.sourceUrl} target="_blank" rel="noreferrer">
            {proof.sourceUrl}
          </a>
          {proof.excerpt && <blockquote className="preserve-text">{proof.excerpt}</blockquote>}
          {proof.personalNote && (
            <p className="preserve-text small">个人笔记：{proof.personalNote}</p>
          )}
          <p className="hint">
            定位：{proof.locator} · 观察于 {proof.observedAt.slice(0, 10)}
            <br />
            保存范围：{il[proof.localPolicy]} · 模型外发：{il[proof.llmPolicy]}
          </p>
          <OccurrenceForm questionId={questionId} proof={proof} />
        </article>
      ))}
      {context.occurrences.length > 0 && (
        <section className="occurrence-list">
          <h3>已确认的面试报告</h3>
          {context.occurrences.map((o) => (
            <article key={o.id}>
              <strong>{o.interview.reportKey}</strong>
              <p className="small">
                {o.interview.company?.name ?? '公司未填写'} ·{' '}
                {o.interview.job?.title ?? '岗位未填写'} · {o.interview.round || '轮次未填写'}
              </p>
              <p className="muted small">
                {o.interview.dateFrom
                  ? `${o.interview.dateFrom}${o.interview.dateTo ? ` ～ ${o.interview.dateTo}` : ''}`
                  : '面试日期未填写'}{' '}
                · {il[o.interview.credibility]}
              </p>
              <p className="preserve-text small">{o.reportNote}</p>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
