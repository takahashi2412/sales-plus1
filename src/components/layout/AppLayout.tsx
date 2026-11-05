import type { ReactNode } from 'react';
import type { DirectoryEntry, MemberRole } from '../../foundation/types';
import { Button, Tag } from '../ui';

export type RouteKey =
  | 'directory'
  | 'roleplay'
  | 'themes'
  | 'talks'
  | 'seminar'
  | 'kpi-targets'
  | 'kpi-alerts'
  | 'kpi-import'
  | 'memo';

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
  { key: 'kpi-targets', label: 'KPIの目標', hash: '#/kpi-targets' },
  { key: 'kpi-alerts', label: '未達の一覧', hash: '#/kpi-alerts' },
  { key: 'kpi-import', label: 'CSV取り込み', hash: '#/kpi-import' },
  { key: 'memo', label: '部下メモ', hash: '#/memo' },
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
    case 'kpi-targets':
      return 'kpi-targets';
    case 'kpi-alerts':
      return 'kpi-alerts';
    case 'kpi-import':
      return 'kpi-import';
    case 'memo':
      return 'memo';
    case 'directory':
    default:
      return 'directory';
  }
}

export function canAccessRoute(
  route: RouteKey,
  role: MemberRole | null | undefined,
  isAdmin = false,
): boolean {
  if (!role) return false;
  switch (route) {
    case 'kpi-alerts':
    case 'memo':
      return role === 'leader' || role === 'mgr' || role === 'ceo';
    case 'kpi-import':
      return isAdmin;
    case 'directory':
    case 'roleplay':
    case 'themes':
    case 'talks':
    case 'seminar':
    case 'kpi-targets':
    default:
      return true;
  }
}

export function filterNavItems(
  role: MemberRole | null | undefined,
  isAdmin = false,
): NavItem[] {
  if (!role) return NAV_ITEMS;
  return NAV_ITEMS.filter((item) => canAccessRoute(item.key, role, isAdmin));
}

export interface AppLayoutProps {
  activeRoute: RouteKey;
  selfEntry: DirectoryEntry | null;
  isAdmin?: boolean;
  onSignOut: () => void;
  children: ReactNode;
}

export function AppLayout({
  activeRoute,
  selfEntry,
  isAdmin = false,
  onSignOut,
  children,
}: AppLayoutProps) {
  const currentNav = NAV_ITEMS.find((item) => item.key === activeRoute) ?? NAV_ITEMS[0];
  const visibleNavItems = filterNavItems(selfEntry?.role, isAdmin);

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
                {isAdmin && <Tag tone="plain">管理者</Tag>}
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
            {visibleNavItems.map((item) => {
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
