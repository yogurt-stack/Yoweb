'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="empty-state">
      <h1>暂时无法打开题库</h1>
      <p>请确认已运行数据库迁移，并检查本地服务日志。</p>
      <button onClick={reset}>重试</button>
    </section>
  );
}
