'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export function Navigation() {
  const pathname = usePathname(),
    search = useSearchParams();
  const links = [
    {
      href: '/',
      icon: '▦',
      text: '全部题目',
      active:
        pathname === '/' &&
        search.get('status') !== 'INBOX' &&
        search.get('archive') !== 'archived',
    },
    {
      href: '/?status=INBOX',
      icon: '◷',
      text: '待整理',
      active:
        pathname === '/' &&
        search.get('status') === 'INBOX' &&
        search.get('archive') !== 'archived',
    },
    {
      href: '/?archive=archived',
      icon: '▤',
      text: '已归档',
      active: pathname === '/' && search.get('archive') === 'archived',
    },
    { href: '/taxonomy', icon: '⌘', text: '领域与标签', active: pathname === '/taxonomy' },
    {
      href: '/sources',
      icon: '▧',
      text: '来源材料',
      active:
        pathname.startsWith('/sources') ||
        pathname.startsWith('/documents') ||
        pathname === '/imports/new',
    },
    {
      href: '/inbox',
      icon: '⇣',
      text: '收录 Inbox',
      active:
        pathname === '/inbox' || (pathname.startsWith('/imports/') && pathname !== '/imports/new'),
    },
  ];
  return (
    <nav aria-label="主导航">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`nav-item ${link.active ? 'active' : ''}`}
          aria-current={link.active ? 'page' : undefined}
        >
          <span aria-hidden="true">{link.icon}</span>
          {link.text}
        </Link>
      ))}
    </nav>
  );
}
