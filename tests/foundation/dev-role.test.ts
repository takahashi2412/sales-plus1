import { describe, expect, it } from 'vitest';
import {
  DEV_ROLE_KEYS,
  DEV_ROLE_USAGE,
  resolveDevRolePlan,
} from '../../fixtures/foundation/dev-role-plan.mjs';

describe('テスト代表の役割の切り替え計画（dev-role-plan）', () => {
  it('切り替え可能な7つの引数が定義されている', () => {
    expect(DEV_ROLE_KEYS).toEqual([
      'ceo',
      'leader',
      'member',
      'mgr',
      'talk-owner',
      'admin',
      'leader-admin',
    ]);
    expect(DEV_ROLE_USAGE).toContain('npm run fixtures:dev-role');
    expect(DEV_ROLE_USAGE).toContain('leader-admin');
  });

  it('ceo：役割は ceo、所属・MGR担当・権限はすべてなし', () => {
    expect(resolveDevRolePlan('ceo')).toEqual({
      key: 'ceo',
      label: '代表',
      role: 'ceo',
      affiliation: null,
      mgrAssignment: null,
      permission: null,
    });
  });

  it('leader：役割は leader、所属は架空チームA（拠点：架空拠点A、開始：2025-04-01）、担当・権限なし', () => {
    expect(resolveDevRolePlan('leader')).toEqual({
      key: 'leader',
      label: '架空チームAのリーダー',
      role: 'leader',
      affiliation: {
        teamName: '架空チームA',
        base: '架空拠点A',
        start_date: '2025-04-01',
        end_date: null,
      },
      mgrAssignment: null,
      permission: null,
    });
  });

  it('member：役割は member、所属は架空チームA（拠点：架空拠点A、開始：2025-04-01）、担当・権限なし', () => {
    expect(resolveDevRolePlan('member')).toEqual({
      key: 'member',
      label: '架空チームAのメンバー',
      role: 'member',
      affiliation: {
        teamName: '架空チームA',
        base: '架空拠点A',
        start_date: '2025-04-01',
        end_date: null,
      },
      mgrAssignment: null,
      permission: null,
    });
  });

  it('mgr：役割は mgr、所属なし、MGR担当は架空チームA（開始：2025-04-01、assigned_by は空）、権限なし', () => {
    expect(resolveDevRolePlan('mgr')).toEqual({
      key: 'mgr',
      label: '架空チームAの担当MGR',
      role: 'mgr',
      affiliation: null,
      mgrAssignment: {
        teamName: '架空チームA',
        start_date: '2025-04-01',
        end_date: null,
        assigned_by: null,
      },
      permission: null,
    });
  });

  it('talk-owner：役割は member、所属は架空チームB（拠点：架空拠点B、開始：2025-04-01）、権限は talk_owner', () => {
    expect(resolveDevRolePlan('talk-owner')).toEqual({
      key: 'talk-owner',
      label: '架空チームBのメンバー（トーク責任者）',
      role: 'member',
      affiliation: {
        teamName: '架空チームB',
        base: '架空拠点B',
        start_date: '2025-04-01',
        end_date: null,
      },
      mgrAssignment: null,
      permission: {
        kind: 'talk_owner',
        granted_by: null,
        revoked_by: null,
        revoked_at: null,
      },
    });
  });

  it('admin：役割は member、所属は架空チームB（拠点：架空拠点B、開始：2025-04-01）、権限は admin', () => {
    expect(resolveDevRolePlan('admin')).toEqual({
      key: 'admin',
      label: '架空チームBのメンバー（管理者）',
      role: 'member',
      affiliation: {
        teamName: '架空チームB',
        base: '架空拠点B',
        start_date: '2025-04-01',
        end_date: null,
      },
      mgrAssignment: null,
      permission: {
        kind: 'admin',
        granted_by: null,
        revoked_by: null,
        revoked_at: null,
      },
    });
  });

  it('leader-admin：役割は leader、所属は架空チームA（拠点：架空拠点A、開始：2025-04-01）、権限は admin', () => {
    expect(resolveDevRolePlan('leader-admin')).toEqual({
      key: 'leader-admin',
      label: '架空チームAのリーダー（管理者）',
      role: 'leader',
      affiliation: {
        teamName: '架空チームA',
        base: '架空拠点A',
        start_date: '2025-04-01',
        end_date: null,
      },
      mgrAssignment: null,
      permission: {
        kind: 'admin',
        granted_by: null,
        revoked_by: null,
        revoked_at: null,
      },
    });
  });

  it('引数なし・知らない引数のときは null を返す', () => {
    expect(resolveDevRolePlan(undefined)).toBeNull();
    expect(resolveDevRolePlan('')).toBeNull();
    expect(resolveDevRolePlan('unknown')).toBeNull();
    expect(resolveDevRolePlan('__proto__')).toBeNull();
    expect(resolveDevRolePlan('toString')).toBeNull();
  });
});
