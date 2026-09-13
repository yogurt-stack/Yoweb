import Link from 'next/link';
export function MissingContent() {
  return (
    <section className="empty-state">
      <h1>没有找到这条收录记录</h1>
      <p>链接可能已失效或不正确，请从来源材料重新打开。</p>
      <Link className="button" href="/sources">
        返回来源材料
      </Link>
    </section>
  );
}
