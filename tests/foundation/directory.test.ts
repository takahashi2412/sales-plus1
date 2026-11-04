import { describe, it, expect } from 'vitest';
import {
  buildDirectoryEntries,
  getTodayJstDateString,
  isActivePeriod,
} from '../../src/foundation/directory';
import type {
  MemberAffiliationRow,
  MemberRow,
  MgrAssignmentRow,
  TeamRow,
} from '../../src/foundation/types';

describe('土台の名簿表示ロジック（directory）', () => {
  const teams: TeamRow[] = [
    { id: 'team-a', name: '架空チームA' },
    { id: 'team-b', name: '架空チームB' },
  ];

  const members: MemberRow[] = [
    {
      id: 'mem-1',
      auth_user_id: 'auth-1',
      email: 'member-a@example.test',
      name: 'メンバーA',
      role: 'member',
      goes_to_sales: true,
      hired_on: '2025-04-01',
      retired_on: null,
    },
    {
      id: 'mgr-1',
      auth_user_id: 'auth-2',
      email: 'mgr-a@example.test',
      name: 'MGR_A',
      role: 'mgr',
      goes_to_sales: false,
      hired_on: '2024-04-01',
      retired_on: null,
    },
    {
      id: 'ceo-1',
      auth_user_id: 'auth-3',
      email: 'ceo@example.test',
      name: 'テスト代表',
      role: 'ceo',
      goes_to_sales: false,
      hired_on: '2024-04-01',
      retired_on: null,
    },
  ];

  const affiliations: MemberAffiliationRow[] = [
    {
      id: 'aff-old',
      member_id: 'mem-1',
      team_id: 'team-b',
      base: '旧拠点',
      start_date: '2025-04-01',
      end_date: '2026-03-31',
    },
    {
      id: 'aff-now',
      member_id: 'mem-1',
      team_id: 'team-a',
      base: '架空拠点A',
      start_date: '2026-04-01',
      end_date: null,
    },
  ];

  const mgrAssignments: MgrAssignmentRow[] = [
    {
      id: 'asg-old',
      mgr_member_id: 'mgr-1',
      team_id: 'team-b',
      start_date: '2025-04-01',
      end_date: '2026-03-31',
      assigned_by: 'ceo-1',
    },
    {
      id: 'asg-now',
      mgr_member_id: 'mgr-1',
      team_id: 'team-a',
      start_date: '2026-04-01',
      end_date: null,
      assigned_by: 'ceo-1',
    },
  ];

  it('日本時間の日付文字列（YYYY-MM-DD）を返す', () => {
    const d = new Date('2026-11-03T16:00:00Z'); // JST 2026-11-04 01:00
    expect(getTodayJstDateString(d)).toBe('2026-11-04');
  });

  it('開始日と終了日から今の所属・担当かどうかを判定する', () => {
    expect(isActivePeriod('2026-04-01', null, '2026-11-04')).toBe(true);
    expect(isActivePeriod('2025-04-01', '2026-03-31', '2026-11-04')).toBe(false);
    expect(isActivePeriod('2027-01-01', null, '2026-11-04')).toBe(false);
  });

  it('今の所属・担当からチーム名と役割の表示を作る', () => {
    const entries = buildDirectoryEntries(
      members,
      teams,
      affiliations,
      mgrAssignments,
      '2026-11-04',
    );
    const mem = entries.find((e) => e.id === 'mem-1')!;
    expect(mem.roleLabel).toBe('メンバー');
    expect(mem.currentTeamText).toBe('架空チームA');
    expect(mem.currentBaseText).toBe('架空拠点A');

    const mgr = entries.find((e) => e.id === 'mgr-1')!;
    expect(mgr.roleLabel).toBe('MGR');
    expect(mgr.currentTeamText).toBe('担当：架空チームA');

    const ceo = entries.find((e) => e.id === 'ceo-1')!;
    expect(ceo.roleLabel).toBe('代表');
    expect(ceo.currentTeamText).toBe('全体（所属チームなし）');
  });
});
