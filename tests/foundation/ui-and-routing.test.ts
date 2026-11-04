import { describe, expect, it } from 'vitest';
import { formatDateDisplay } from '../../src/components/ui';
import { NAV_ITEMS, parseHashRoute } from '../../src/components/layout/AppLayout';
import {
  DEFAULT_ROLEPLAY_SETTINGS,
  parseRoleplaySettings,
} from '../../src/features/roleplay/shared';

describe('画面の切り替え（ハッシュルーティング）', () => {
  it('左メニューの5画面が正しく定義されている', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      '名簿の確認',
      'ロープレ',
      'テーマ表',
      'トーク一覧',
      '研修の記録',
    ]);
  });

  it('アドレスの # から画面のキーに切り替わる', () => {
    expect(parseHashRoute('')).toBe('directory');
    expect(parseHashRoute('#/directory')).toBe('directory');
    expect(parseHashRoute('#/roleplay')).toBe('roleplay');
    expect(parseHashRoute('#/themes')).toBe('themes');
    expect(parseHashRoute('#/talks')).toBe('talks');
    expect(parseHashRoute('#/seminar')).toBe('seminar');
    expect(parseHashRoute('#/unknown')).toBe('directory');
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
