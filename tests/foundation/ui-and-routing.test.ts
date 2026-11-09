import { describe, expect, it } from 'vitest';
import { formatDateDisplay } from '../../src/components/ui';
import {
  canAccessRoute,
  filterNavItems,
  NAV_ITEMS,
  parseHashRoute,
} from '../../src/components/layout/AppLayout';
import {
  DEFAULT_ROLEPLAY_SETTINGS,
  parseRoleplaySettings,
} from '../../src/features/roleplay/shared';

describe('画面の切り替え（ハッシュルーティング）', () => {
  it('左メニューの13画面が正しく定義されている', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      'ホーム',
      'メンバーカルテ',
      '名簿の確認',
      'ロープレ',
      'テーマ表',
      'トーク一覧',
      '研修の記録',
      'KPIの目標',
      '未達の一覧',
      'CSV取り込み',
      '部下メモ',
      '名簿の管理',
      '権限の管理',
    ]);
  });

  it('アドレスの # から画面のキーに切り替わる（? 以降のクエリは無視する）', () => {
    expect(parseHashRoute('')).toBe('directory');
    expect(parseHashRoute('#/home')).toBe('home');
    expect(parseHashRoute('#/karte')).toBe('karte');
    expect(parseHashRoute('#/karte?member=member-a')).toBe('karte');
    expect(parseHashRoute('#/directory')).toBe('directory');
    expect(parseHashRoute('#/roleplay')).toBe('roleplay');
    expect(parseHashRoute('#/themes')).toBe('themes');
    expect(parseHashRoute('#/talks')).toBe('talks');
    expect(parseHashRoute('#/seminar')).toBe('seminar');
    expect(parseHashRoute('#/admin-members')).toBe('admin-members');
    expect(parseHashRoute('#/admin-permissions')).toBe('admin-permissions');
    expect(parseHashRoute('#/unknown')).toBe('directory');
  });

  it('新しく足した4つの入口（ホーム・メンバーカルテ・名簿の管理・権限の管理）の出し分けが役割と管理者権限どおりになる', () => {
    // メンバー（管理者権限なし）：4つとも出ない
    expect(canAccessRoute('home', 'member', false)).toBe(false);
    expect(canAccessRoute('karte', 'member', false)).toBe(false);
    expect(canAccessRoute('admin-members', 'member', false)).toBe(false);
    expect(canAccessRoute('admin-permissions', 'member', false)).toBe(false);

    // メンバー（管理者権限あり）：名簿の管理・権限の管理だけ出る（ホーム・カルテは出ない）
    expect(canAccessRoute('home', 'member', true)).toBe(false);
    expect(canAccessRoute('karte', 'member', true)).toBe(false);
    expect(canAccessRoute('admin-members', 'member', true)).toBe(true);
    expect(canAccessRoute('admin-permissions', 'member', true)).toBe(true);

    // リーダー・MGR（管理者権限なし）：ホーム・カルテは出る、管理の2つは出ない
    for (const role of ['leader', 'mgr'] as const) {
      expect(canAccessRoute('home', role, false)).toBe(true);
      expect(canAccessRoute('karte', role, false)).toBe(true);
      expect(canAccessRoute('admin-members', role, false)).toBe(false);
      expect(canAccessRoute('admin-permissions', role, false)).toBe(false);
    }

    // リーダー（管理者権限あり＝leader-admin）：4つとも出る
    expect(canAccessRoute('home', 'leader', true)).toBe(true);
    expect(canAccessRoute('karte', 'leader', true)).toBe(true);
    expect(canAccessRoute('admin-members', 'leader', true)).toBe(true);
    expect(canAccessRoute('admin-permissions', 'leader', true)).toBe(true);

    // 代表（管理者権限なし）：ホーム・カルテ・権限の管理が出る、名簿の管理は出ない
    expect(canAccessRoute('home', 'ceo', false)).toBe(true);
    expect(canAccessRoute('karte', 'ceo', false)).toBe(true);
    expect(canAccessRoute('admin-members', 'ceo', false)).toBe(false);
    expect(canAccessRoute('admin-permissions', 'ceo', false)).toBe(true);

    // filterNavItems の確認
    const memberNav = filterNavItems('member', false).map((i) => i.key);
    expect(memberNav).not.toContain('home');
    expect(memberNav).not.toContain('karte');
    expect(memberNav).not.toContain('admin-members');
    expect(memberNav).not.toContain('admin-permissions');

    const ceoNav = filterNavItems('ceo', false).map((i) => i.key);
    expect(ceoNav).toContain('home');
    expect(ceoNav).toContain('karte');
    expect(ceoNav).not.toContain('admin-members');
    expect(ceoNav).toContain('admin-permissions');
  });
});

describe('共通の部品とロープレ共通設定', () => {
  it('日付の表示が日本語形式に整えられる', () => {
    expect(formatDateDisplay(null)).toBe('－');
    expect(formatDateDisplay('2026-11-04')).toBe('2026/11/04');
    expect(formatDateDisplay('2026-11-04', true)).toBe('2026/11/04（水）');
  });

  it('設定値の行から4つのキーが数値として読み取れる', () => {
    const parsed = parseRoleplaySettings([
      {
        key: 'roleplay_alert_minutes',
        value: 25,
        reason: 'テスト',
        updated_by: null,
        updated_at: '2026-11-04T00:00:00Z',
      },
      {
        key: 'roleplay_graduate_count',
        value: 3,
        reason: 'テスト',
        updated_by: null,
        updated_at: '2026-11-04T00:00:00Z',
      },
    ]);
    expect(parsed).toEqual({
      ...DEFAULT_ROLEPLAY_SETTINGS,
      roleplay_alert_minutes: 25,
      roleplay_graduate_count: 3,
    });
  });
});
