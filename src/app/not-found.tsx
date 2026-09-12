import Link from 'next/link';
export default function NotFound() {
  return (
    <section className="empty-state">
      <h1>没有找到这道题</h1>
      <p>链接可能不正确，请从题库重新打开。</p>
      <Link className="button" href="/">
        返回题库
      </Link>
    </section>
  );
}
