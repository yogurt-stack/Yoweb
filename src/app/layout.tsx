import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Navigation } from '@/components/navigation';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Yoweb · 我的面试题库', template: '%s · Yoweb' },
  description: '把值得思考的问题，留在自己的题库里。',
};
export const dynamic = 'force-dynamic';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <a href="#main" className="skip-link">
          跳转到内容
        </a>
        <aside className="sidebar">
          <Link className="brand" href="/">
            <span className="brand-mark">y.</span>
            <span>
              Yoweb<span className="brand-caption">个人面试题库</span>
            </span>
          </Link>
          <div className="nav-caption">我的知识空间</div>
          <Suspense>
            <Navigation />
          </Suspense>
          <div className="sidebar-note">
            <span className="status-dot" /> 本地存储
            <div>
              每一个好问题，
              <br />
              都是下一次进步的起点。
            </div>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span>
              我的工作台 <span className="slash">/</span> 题库
            </span>
            <span className="local-badge">
              <span className="status-dot" /> 仅在本机
            </span>
          </header>
          <main id="main">{children}</main>
          <footer>
            YOWEB <span>慢慢积累，认真思考。</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
