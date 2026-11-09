import { describe, expect, it } from 'vitest';
import {
  LAST_ADMIN_ERROR_MESSAGE,
  SELF_ADMIN_REVOKE_CONFIRM_MESSAGE,
  buildGrantPermissionPlan,
  buildMembersTemplateCsvBytes,
  buildMembersTemplateCsvText,
  buildRetirementPlan,
  buildRevokePermissionPlan,
  buildTransferPlan,
  canEditMemberRole,
  decodeMembersCsvBytes,
  formatAdminDbError,
  getSelectableRoles,
  validateMembersCsv,
  type MemberAffiliationRow,
  type MemberRow,
  type MgrAssignmentRow,
  type PermissionRow,
} from '../../src/features/admin/shared';

describe('名簿の CSV の読み取り（UTF-8 BOM と Shift_JIS）とひな形の生成', () => {
  it('先頭に BOM があれば UTF-8 として読み取る', () => {
    const text = '名前,メール,役割,営業に出る,入社日,チーム,拠点,所属の開始日\n架空メンバー1,m1@example.test,メンバー,出る,2026-04-01,架空チームA,架空拠点,2026-04-01';
    const utf8Bytes = new TextEncoder().encode(text);
    const withBom = new Uint8Array(utf8Bytes.length + 3);
    withBom.set([0xef, 0xbb, 0xbf], 0);
    withBom.set(utf8Bytes, 3);

    const decoded = decodeMembersCsvBytes(withBom);
    expect(decoded).toBe(text);
  });

  it('先頭に BOM がなければ Shift_JIS として読み取る', () => {
    // Shift_JIS bytes for "名前,メール"
    // 名(0x96,0xbc) 前(0x91,0x4f) ,(0x2c) メ(0x83,0x81) ー(0x81,0x5b) ル(0x83,0x8b)
    const sjisBytes = new Uint8Array([0x96, 0xbc, 0x91, 0x4f, 0x2c, 0x83, 0x81, 0x81, 0x5b, 0x83, 0x8b]);
    const decoded = decodeMembersCsvBytes(sjisBytes);
    expect(decoded).toBe('名前,メール');
  });

  it('ひな形を生成する関数が BOM つき UTF-8 で、見出し1行と架空の例2行（架空メンバー・example.test）を返す', () => {
    const text = buildMembersTemplateCsvText();
    expect(text.startsWith('\uFEFF')).toBe(true);

    const buf = buildMembersTemplateCsvBytes();
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);

    const decoded = decodeMembersCsvBytes(buf);
    const res = validateMembersCsv(decoded, {
      existingEmails: [],
      existingTeamNames: ['架空チームA'],
    });
    expect(res.headerErrors).toEqual([]);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].raw.name).toContain('架空メンバー');
    expect(res.rows[0].raw.email).toContain('@example.test');
    expect(res.rows[1].raw.name).toContain('架空メンバー');
    expect(res.rows[1].raw.email).toContain('@example.test');
    expect(res.canImport).toBe(true);
    expect(res.validCount).toBe(2);
  });
});

describe('取り込む前の確かめ（validateMembersCsv）', () => {
  const header = '名前,メール,役割,営業に出る,入社日,チーム,拠点,所属の開始日';

  it('メンバー・リーダー・MGRの正しい行（YYYY-MM-DD と YYYY/MM/DD の両方）が通る', () => {
    const csv = [
      header,
      '架空メンバー1,m1@example.test,メンバー,出る,2026-04-01,架空チームA,東京,2026-04-01',
      '架空リーダー1,l1@example.test,リーダー,出ない,2026/04/01,架空チームA,大阪,2026/04/15',
      '架空MGR1,mgr1@example.test,MGR,出ない,2026-04-01,,,',
    ].join('\n');

    const result = validateMembersCsv(csv, {
      existingEmails: [],
      existingTeamNames: ['架空チームA'],
    });

    expect(result.canImport).toBe(true);
    expect(result.invalidCount).toBe(0);
    expect(result.importRows).toHaveLength(3);
    expect(result.importRows[0]).toMatchObject({
      role: 'member',
      goesToSales: true,
      hiredOn: '2026-04-01',
      affiliationStartDate: '2026-04-01',
    });
    expect(result.importRows[1]).toMatchObject({
      role: 'leader',
      goesToSales: false,
      hiredOn: '2026-04-01',
      affiliationStartDate: '2026-04-15',
    });
    expect(result.importRows[2]).toMatchObject({
      role: 'mgr',
      teamName: null,
      base: null,
      affiliationStartDate: null,
    });
  });

  it('必須の欄が空・メールの形・ファイル内重複・既存名簿との重複（大文字小文字を区別しない）をすべて検出する', () => {
    const csv = [
      header,
      ',,,,',
      '架空メンバーA,bad-email,メンバー,出る,2026-04-01,架空チームA,東京,2026-04-01',
      '架空メンバーB,Dup@Example.test,メンバー,出る,2026-04-01,架空チームA,東京,2026-04-01',
      '架空メンバーC,dup@example.test,メンバー,出る,2026-04-01,架空チームA,東京,2026-04-01',
      '架空メンバーD,EXISTING@EXAMPLE.TEST,メンバー,出る,2026-04-01,架空チームA,東京,2026-04-01',
    ].join('\n');

    const result = validateMembersCsv(csv, {
      existingEmails: ['existing@example.test'],
      existingTeamNames: ['架空チームA'],
    });

    expect(result.canImport).toBe(false);
    // 1行目（データ）は必須5項目すべてが空
    expect(result.rows[0].errors).toEqual(
      expect.arrayContaining([
        '名前が空です',
        'メールが空です',
        '役割が空です',
        '営業に出るが空です',
        '入社日が空です',
      ]),
    );
    expect(result.rows[1].errors).toContain('メールの形が正しくありません');
    expect(result.rows[2].errors).toContain('同じファイルの中でメールが重なっています');
    expect(result.rows[3].errors).toContain('同じファイルの中でメールが重なっています');
    expect(result.rows[4].errors).toContain('名簿にもう同じメールがいます');
  });

  it('役割・営業に出るの言葉違い、役割が「代表」、日付不正、所属開始日＜入社日、役割ごとのチーム・拠点・開始日の過不足を検出する', () => {
    const csv = [
      header,
      '架空代表,ceo@example.test,代表,出る,2026-04-01,,,',
      '架空役割違い,r1@example.test,課長,たぶん,2026-02-30,架空チームA,東京,2026-13-01',
      '架空日付逆転,r2@example.test,メンバー,出る,2026-05-01,架空チームA,東京,2026-04-30',
      '架空所属空,r3@example.test,リーダー,出る,2026-04-01,,,',
      '架空MGR所属あり,r4@example.test,MGR,出ない,2026-04-01,架空チームA,東京,2026-04-01',
    ].join('\n');

    const result = validateMembersCsv(csv, {
      existingEmails: [],
      existingTeamNames: ['架空チームA'],
    });

    expect(result.rows[0].errors).toContain('役割「代表」は一括取り込みでは入れられません');
    expect(result.rows[1].errors).toEqual(
      expect.arrayContaining([
        '役割は「メンバー」「リーダー」「MGR」のいずれかにしてください',
        '営業に出るは「出る」「出ない」のいずれかにしてください',
        '入社日の日付が読めません（YYYY-MM-DD または YYYY/MM/DD）',
        '所属の開始日の日付が読めません（YYYY-MM-DD または YYYY/MM/DD）',
      ]),
    );
    expect(result.rows[2].errors).toContain('所属の開始日が入社日より前になっています');
    expect(result.rows[3].errors).toEqual(
      expect.arrayContaining([
        'メンバー・リーダーはチームが必須です',
        'メンバー・リーダーは拠点が必須です',
        'メンバー・リーダーは所属の開始日が必須です',
      ]),
    );
    expect(result.rows[4].errors).toContain(
      'MGRはチーム・拠点・所属の開始日を空にしてください（担当は取り込みのあとに画面で設定します）',
    );
  });

  it('名簿にないチームはエラーになり、「新しいチームとして作る」に選ぶと取り込めるようになる', () => {
    const csv = [
      header,
      '架空メンバー1,m1@example.test,メンバー,出る,2026-04-01,架空新チームX,東京,2026-04-01',
    ].join('\n');

    const beforeApprove = validateMembersCsv(csv, {
      existingEmails: [],
      existingTeamNames: ['架空チームA'],
    });
    expect(beforeApprove.canImport).toBe(false);
    expect(beforeApprove.unknownTeamNames).toEqual(['架空新チームX']);
    expect(beforeApprove.rows[0].errors[0]).toContain('チーム「架空新チームX」が名簿にありません');

    const afterApprove = validateMembersCsv(csv, {
      existingEmails: [],
      existingTeamNames: ['架空チームA'],
      approvedNewTeamNames: ['架空新チームX'],
    });
    expect(afterApprove.canImport).toBe(true);
    expect(afterApprove.newTeamsToCreate).toEqual(['架空新チームX']);
    expect(afterApprove.importRows).toHaveLength(1);
  });
});

describe('異動の計画（buildTransferPlan）', () => {
  const existingAffs: MemberAffiliationRow[] = [
    {
      id: 'aff-1',
      member_id: 'mem-1',
      team_id: 'team-a',
      base: '東京',
      start_date: '2026-04-01',
      end_date: null,
    },
  ];

  it('新しい所属の開始日を入れると、今の所属の終わりの日を「開始日の前の日」にし、新しい所属の行を足す', () => {
    const res = buildTransferPlan(
      {
        memberId: 'mem-1',
        newTeamId: 'team-b',
        newBase: '大阪',
        newStartDate: '2026-07-01',
      },
      existingAffs,
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.plan.closeAffiliations).toEqual([
        { affiliationId: 'aff-1', endDate: '2026-06-30' },
      ]);
      expect(res.plan.insertAffiliation).toEqual({
        member_id: 'mem-1',
        team_id: 'team-b',
        base: '大阪',
        start_date: '2026-07-01',
        end_date: null,
      });
    }
  });

  it('開始日が今の所属の開始日以前ならエラーにする', () => {
    const sameDay = buildTransferPlan(
      {
        memberId: 'mem-1',
        newTeamId: 'team-b',
        newBase: '大阪',
        newStartDate: '2026-04-01',
      },
      existingAffs,
    );
    expect(sameDay.ok).toBe(false);

    const earlierDay = buildTransferPlan(
      {
        memberId: 'mem-1',
        newTeamId: 'team-b',
        newBase: '大阪',
        newStartDate: '2026-03-31',
      },
      existingAffs,
    );
    expect(earlierDay.ok).toBe(false);
  });
});

describe('退職の計画（buildRetirementPlan）', () => {
  const member: MemberRow = {
    id: 'mem-mgr',
    auth_user_id: null,
    email: 'mgr@example.test',
    name: '架空MGR',
    role: 'mgr',
    goes_to_sales: false,
    hired_on: '2025-04-01',
    retired_on: null,
  };

  const affiliations: MemberAffiliationRow[] = [
    {
      id: 'aff-open',
      member_id: 'mem-mgr',
      team_id: 'team-a',
      base: '東京',
      start_date: '2025-04-01',
      end_date: null,
    },
  ];

  const mgrAssignments: MgrAssignmentRow[] = [
    {
      id: 'mgr-open',
      mgr_member_id: 'mem-mgr',
      team_id: 'team-a',
      start_date: '2025-04-01',
      end_date: null,
      assigned_by: 'mem-ceo',
    },
  ];

  const permissions: PermissionRow[] = [
    {
      id: 'perm-admin',
      member_id: 'mem-mgr',
      kind: 'admin',
      granted_by: 'mem-ceo',
      granted_at: '2025-04-01T00:00:00Z',
      revoked_by: null,
      revoked_at: null,
    },
    {
      id: 'perm-talk',
      member_id: 'mem-mgr',
      kind: 'talk_owner',
      granted_by: 'mem-ceo',
      granted_at: '2025-04-01T00:00:00Z',
      revoked_by: null,
      revoked_at: null,
    },
  ];

  it('①権限を外す → ②今の所属とMGR担当の終わりの日を退職日にする → ③名簿の退職日を入れる、の順の計画を返す', () => {
    const res = buildRetirementPlan({
      member,
      retiredOn: '2026-09-30',
      revokedByMemberId: 'mem-admin',
      revokedAtIso: '2026-09-30T09:00:00.000Z',
      affiliations,
      mgrAssignments,
      permissions,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.plan.steps.map((s) => s.step)).toEqual([1, 2, 3]);
      expect(res.plan.steps[0]).toEqual({
        step: 1,
        kind: 'revoke_permissions',
        permissionIds: ['perm-admin', 'perm-talk'],
        revokedBy: 'mem-admin',
        revokedAt: '2026-09-30T09:00:00.000Z',
      });
      expect(res.plan.steps[1]).toEqual({
        step: 2,
        kind: 'close_affiliations_and_mgr_assignments',
        affiliationIds: ['aff-open'],
        mgrAssignmentIds: ['mgr-open'],
        endDate: '2026-09-30',
      });
      expect(res.plan.steps[2]).toEqual({
        step: 3,
        kind: 'set_member_retired_on',
        memberId: 'mem-mgr',
        retiredOn: '2026-09-30',
      });
    }
  });
});

describe('権限の計画・エラーの見分け・役割の選び方', () => {
  const existingPermissions: PermissionRow[] = [
    {
      id: 'perm-1',
      member_id: 'mem-1',
      kind: 'admin',
      granted_by: 'mem-ceo',
      granted_at: '2026-04-01T00:00:00Z',
      revoked_by: null,
      revoked_at: null,
    },
  ];

  it('同じ人・同じ種類の有効な権限がもうあれば足さない。なければ足す', () => {
    const dup = buildGrantPermissionPlan({
      memberId: 'mem-1',
      kind: 'admin',
      grantedBy: 'mem-ceo',
      existingPermissions,
    });
    expect(dup.ok).toBe(true);
    if (dup.ok) {
      expect(dup.alreadyGranted).toBe(true);
    }

    const fresh = buildGrantPermissionPlan({
      memberId: 'mem-1',
      kind: 'talk_owner',
      grantedBy: 'mem-ceo',
      existingPermissions,
    });
    expect(fresh.ok).toBe(true);
    if (fresh.ok && !fresh.alreadyGranted) {
      expect(fresh.insert).toEqual({
        member_id: 'mem-1',
        kind: 'talk_owner',
        granted_by: 'mem-ceo',
      });
    }
  });

  it('権限を外すとき、自分の管理者の権限なら確かめの1文を出し、ほかの人なら出さない', () => {
    const selfRevoke = buildRevokePermissionPlan({
      permissionId: 'perm-1',
      revokedBy: 'mem-1',
      revokedAtIso: '2026-10-01T00:00:00Z',
      existingPermissions,
    });
    expect(selfRevoke.ok).toBe(true);
    if (selfRevoke.ok) {
      expect(selfRevoke.isSelfAdminRevoke).toBe(true);
      expect(selfRevoke.confirmationMessage).toBe(SELF_ADMIN_REVOKE_CONFIRM_MESSAGE);
    }

    const otherRevoke = buildRevokePermissionPlan({
      permissionId: 'perm-1',
      revokedBy: 'mem-ceo',
      revokedAtIso: '2026-10-01T00:00:00Z',
      existingPermissions,
    });
    expect(otherRevoke.ok).toBe(true);
    if (otherRevoke.ok) {
      expect(otherRevoke.isSelfAdminRevoke).toBe(false);
      expect(otherRevoke.confirmationMessage).toBeNull();
    }
  });

  it('データベースのエラーの見分け：last admin とそのほかの両方を確かめる', () => {
    expect(formatAdminDbError(new Error('cannot revoke last admin'))).toBe(
      LAST_ADMIN_ERROR_MESSAGE,
    );
    expect(formatAdminDbError({ message: 'cannot retire last admin' })).toBe(
      LAST_ADMIN_ERROR_MESSAGE,
    );
    expect(formatAdminDbError(new Error('permission denied for table members'))).toBe(
      'この操作はできません（理由：permission denied for table members）',
    );
  });

  it('役割の選び方：代表かつ管理者でなければ「代表」を選べず、代表の行の役割も変えられない', () => {
    const nonCeoAdmin = { isAdmin: true, isCeo: false };
    expect(getSelectableRoles(nonCeoAdmin).map((r) => r.value)).toEqual([
      'member',
      'leader',
      'mgr',
    ]);
    expect(canEditMemberRole(nonCeoAdmin, 'ceo')).toBe(false);
    expect(canEditMemberRole(nonCeoAdmin, 'leader')).toBe(true);

    const ceoAdmin = { isAdmin: true, isCeo: true };
    expect(getSelectableRoles(ceoAdmin).map((r) => r.value)).toEqual([
      'member',
      'leader',
      'mgr',
      'ceo',
    ]);
    expect(canEditMemberRole(ceoAdmin, 'ceo')).toBe(true);
  });
});
