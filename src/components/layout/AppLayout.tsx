import type { ReactNode } from 'react';
import type { DirectoryEntry } from '../../foundation/types';
import { Button, Tag } from '../ui';

export type RouteKey = 'directory' | 'roleplay' | 'themes' | 'talks' | 'seminar';

export interface NavItem {
  key: RouteKey;
  label: string;
  hash: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'directory', label: '名簿の確認', hash: '#/directory' },
  { key: 'roleplay', label: 'ロープレ', hash: '#/roleplay' },
  { key: 'themes', label: 'テーマ表', hash: '#/themes' },
  { key: 'talks', label: 'トーク一覧', hash: '#/talks' },
  { key: 'seminar', label: '研修の記録', hash: '#/seminar' },
];

export function parseHashRoute(hash: string): RouteKey {
  const cleaned = hash.replace(/^#\/?/, '').split('?')[0].trim().toLowerCase();
  switch (cleaned) {
    case 'roleplay':
      return 'roleplay';
    case 'themes':
      return 'themes';
    case 'talks':
      return 'talks';
    case 'seminar':
      return 'seminar';
    case 'directory':
    default:
      return 'directory';
  }
}

export interface AppLayoutProps {
  activeRoute: RouteKey;
  selfEntry: DirectoryEntry | null;
  onSignOut: () => void;
  children: ReactNode;
}

export function AppLayout({ activeRoute, selfEntry, onSignOut, children }: AppLayoutProps) {
  const currentNav = NAV_ITEMS.find((item) => item.key === activeRoute) ?? NAV_ITEMS[0];

  return (
    <div className="app-shell">
      <header className="top-band">
        <div className="top-band-inner">
          <div className="top-brand">
            <span className="top-brand-sub">SALES +1 ／ 1DAY +1</span>
            <span className="top-brand-title">{currentNav.label}</span>
          </div>
          <div className="top-user-area">
            {selfEntry && (
              <div className="top-user-meta">
                <span className="top-user-name">{selfEntry.name}</span>
                <Tag tone="navy">{selfEntry.roleLabel}</Tag>
              </div>
            )}
            <Button variant="secondary" onClick={onSignOut}>
              ログアウト
            </Button>
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="side-nav" aria-label="左メニュー">
          <div className="side-nav-title">メニュー</div>
          <nav className="side-nav-list">
            {NAV_ITEMS.map((item) => {
              const isActive = item.key === activeRoute;
              return (
                <a
                  key={item.key}
                  href={item.hash}
                  className={`side-nav-link ${isActive ? 'side-nav-link--active' : ''}`.trim()}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        </aside>

        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
