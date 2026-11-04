import { describe, expect, it } from 'vitest';
import type {
  MemberAffiliationRow,
  MemberRole,
  MemberRow,
  MgrAssignmentRow,
  PermissionRow,
} from '../../../src/foundation/types';
import {
  buildViewerContext,
  canAddTalkFromList,
  canCreateSeminar,
  canEditTalk,
  canMoveTalkToStandard,
  canMoveTalkToTrial,
  canSuperviseMember,
  fetchViewerContext,
  fetchWritableMembers,
  pickWritableMembers,
  selectableTalkTeams,
  type ViewerContext,
} from '../../../src/features/roleplay/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

const TODAY = '2026-11-04';

function makeMember(
  id: string,
  role: MemberRole,
  name: string = `架空_${id}`,
  retiredOn: string | null = null,
): MemberRow {
  return {
    id,
    auth_user_id: `auth_${id}`,
    email: `${id}@example.test`,
    name,
    role,
    goes_to_sales: false,
    hired_on: '2025-04-01',
    retired_on: retiredOn,
  };
}

function makeAff(
  id: string,
  memberId: string,
  teamId: string,
  startDate: string,
  endDate: string | null = null,
): MemberAffiliationRow {
  return {
    id,
    member_id: memberId,
    team_id: teamId,
    base: '架空拠点',
    start_date: startDate,
    end_date: endDate,
  };
}

function makeMgrAssn(
  id: string,
  mgrMemberId: string,
  teamId: string,
  startDate: string,
  endDate: string | null = null,
): MgrAssignmentRow {
  return {
    id,
    mgr_member_id: mgrMemberId,
    team_id: teamId,
    start_date: startDate,
    end_date: endDate,
    assigned_by: 'm-ceo',
  };
}

function makePerm(
  id: string,
  memberId: string,
  kind: 'admin' | 'talk_owner',
  revokedAt: string | null = null,
): PermissionRow {
  return {
    id,
    member_id: memberId,
    kind,
    granted_by: 'm-ceo',
    granted_at: '2025-04-01T00:00:00Z',
    revoked_by: revokedAt ? 'm-ceo' : null,
    revoked_at: revokedAt,
  };
}

describe('buildViewerContext（見る人の情報の組み立て）', () => {
  it('名簿にないとき・退職日が今日より前のときは null を返し、今日が退職日なら有効とする', () => {
    expect(
      buildViewerContext(
        { member: null, affiliations: [], mgrAssignments: [], permissions: [] },
        TODAY,
      ),
    ).toBeNull();

    const retiredYesterday = makeMember('m-ret', 'leader', '架空退職', '2026-11-03');
    expect(
      buildViewerContext(
        { member: retiredYesterday, affiliations: [], mgrAssignments: [], permissions: [] },
        TODAY,
      ),
    ).toBeNull();

    const retiringToday = makeMember('m-today', 'member', '架空本日退職', TODAY);
    const ctxToday = buildViewerContext(
      { member: retiringToday, affiliations: [], mgrAssignments: [], permissions: [] },
      TODAY,
    );
    expect(ctxToday).not.toBeNull();
    expect(ctxToday?.memberId).toBe('m-today');
  });

  it('所属が2つ重なるときは、今日有効なもののうち開始日がいちばん新しいチーム1つを選ぶ', () => {
    const leader = makeMember('m-leader', 'leader');
    const affiliations: MemberAffiliationRow[] = [
      makeAff('a1', 'm-leader', 'team-old', '2025-04-01', null),
      makeAff('a2', 'm-leader', 'team-new', '2026-06-01', null),
      makeAff('a3', 'm-leader', 'team-future', '2026-12-01', null),
      makeAff('a4', 'm-leader', 'team-closed', '2026-09-01', '2026-10-31'),
    ];
    const ctx = buildViewerContext(
      { member: leader, affiliations, mgrAssignments: [], permissions: [] },
      TODAY,
    );
    expect(ctx).toEqual({
      memberId: 'm-leader',
      role: 'leader',
      teamId: 'team-new',
      mgrTeamIds: [],
      isTalkOwner: false,
      isCeo: false,
    });
  });

  it('MGRの担当チーム・トーク責任者の権限・代表フラグを正しく判定し、他人の行や過去の行を混ぜない', () => {
    const mgr = makeMember('m-mgr', 'mgr');
    const mgrAssignments: MgrAssignmentRow[] = [
      makeMgrAssn('ma1', 'm-mgr', 'team-a', '2025-04-01', null),
      makeMgrAssn('ma2', 'm-mgr', 'team-b', '2026-01-01', '2026-12-31'),
      makeMgrAssn('ma3', 'm-mgr', 'team-expired', '2025-04-01', '2026-10-01'),
      makeMgrAssn('ma4', 'other-mgr', 'team-c', '2025-04-01', null),
    ];
    const permissions: PermissionRow[] = [
      makePerm('p1', 'm-mgr', 'talk_owner', '2026-05-01T00:00:00Z'), // 取り消し済み
      makePerm('p2', 'other-member', 'talk_owner', null), // 他人の権限
      makePerm('p3', 'm-mgr', 'admin', null), // admin 権限
    ];
    const ctx = buildViewerContext(
      { member: mgr, affiliations: [], mgrAssignments, permissions },
      TODAY,
    );
    expect(ctx).toEqual({
      memberId: 'm-mgr',
      role: 'mgr',
      teamId: null,
      mgrTeamIds: ['team-a', 'team-b'],
      isTalkOwner: false,
      isCeo: false,
    });

    const talkOwnerMember = makeMember('m-to', 'member');
    const ctxTo = buildViewerContext(
      {
        member: talkOwnerMember,
        affiliations: [makeAff('a-to', 'm-to', 'team-b', '2025-04-01', null)],
        mgrAssignments: [],
        permissions: [makePerm('p-to', 'm-to', 'talk_owner', null)],
      },
      TODAY,
    );
    expect(ctxTo?.isTalkOwner).toBe(true);
    expect(ctxTo?.isCeo).toBe(false);

    const ceo = makeMember('m-ceo', 'ceo');
    const ctxCeo = buildViewerContext(
      { member: ceo, affiliations: [], mgrAssignments: [], permissions: [] },
      TODAY,
    );
    expect(ctxCeo?.isCeo).toBe(true);
  });
});

describe('pickWritableMembers（ロープレを書ける課員の選択）', () => {
  const members: MemberRow[] = [
    makeMember('leader-a', 'leader', '架空リーダーA'),
    makeMember('member-a1', 'member', '架空メンバーA1'),
    makeMember('member-a2', 'member', '架空メンバーA2'),
    makeMember('member-overlap', 'member', '架空重複所属（最新はA）'),
    makeMember('retired-a', 'member', '架空退職A', '2026-10-31'),
    makeMember('leader-b', 'leader', '架空リーダーB（管理者権限あり）'),
    makeMember('member-b1', 'member', '架空メンバーB1'),
    makeMember('mgr-1', 'mgr', '架空MGR1'),
    makeMember('ceo-1', 'ceo', '架空代表'),
  ];

  const affiliations: MemberAffiliationRow[] = [
    makeAff('af1', 'leader-a', 'team-a', '2025-04-01'),
    makeAff('af2', 'member-a1', 'team-a', '2025-04-01'),
    makeAff('af3', 'member-a2', 'team-a', '2025-04-01'),
    // 所属が2つ重なる人：古い所属は team-b、新しい所属は team-a → 今のチームは team-a
    makeAff('af4-old', 'member-overlap', 'team-b', '2025-04-01'),
    makeAff('af4-new', 'member-overlap', 'team-a', '2026-08-01'),
    makeAff('af5', 'retired-a', 'team-a', '2025-04-01'),
    makeAff('af6', 'leader-b', 'team-b', '2025-04-01'),
    makeAff('af7', 'member-b1', 'team-b', '2025-04-01'),
  ];

  it('リーダー・メンバーは今同じチームの人だけ（自分自身と退職した人を除く、所属が重なる人は最新のチームで判定）', () => {
    const viewerLeaderA: ViewerContext = {
      memberId: 'leader-a',
      role: 'leader',
      teamId: 'team-a',
      mgrTeamIds: [],
      isTalkOwner: false,
      isCeo: false,
    };
    const listForLeaderA = pickWritableMembers(viewerLeaderA, members, affiliations, TODAY);
    expect(listForLeaderA.map((m) => m.id)).toEqual([
      'member-a1',
      'member-a2',
      'member-overlap',
    ]);
    expect(listForLeaderA.every((m) => m.teamId === 'team-a')).toBe(true);

    const viewerMemberA1: ViewerContext = {
      memberId: 'member-a1',
      role: 'member',
      teamId: 'team-a',
      mgrTeamIds: [],
      isTalkOwner: false,
      isCeo: false,
    };
    const listForMemberA1 = pickWritableMembers(viewerMemberA1, members, affiliations, TODAY);
    expect(listForMemberA1.map((m) => m.id)).toEqual([
      'leader-a',
      'member-a2',
      'member-overlap',
    ]);
  });

  it('管理者の権限があるリーダーが全員の行を読めても、書ける課員は自分の今のチームだけに絞られる', () => {
    const viewerAdminLeaderB: ViewerContext = {
      memberId: 'leader-b',
      role: 'leader',
      teamId: 'team-b',
      mgrTeamIds: ['team-a'], // 仮に配列が入っていても役割が leader なら使われない
      isTalkOwner: true,
      isCeo: false,
    };
    // member-overlap は古い所属が team-b だが最新の所属が team-a なので team-b には入らない
    const listForLeaderB = pickWritableMembers(viewerAdminLeaderB, members, affiliations, TODAY);
    expect(listForLeaderB.map((m) => m.id)).toEqual(['member-b1']);
  });

  it('MGRは今担当しているチームに所属している人だけ（自分と退職者を除く）', () => {
    const viewerMgr: ViewerContext = {
      memberId: 'mgr-1',
      role: 'mgr',
      teamId: null,
      mgrTeamIds: ['team-a'],
      isTalkOwner: false,
      isCeo: false,
    };
    const listForMgr = pickWritableMembers(viewerMgr, members, affiliations, TODAY);
    expect(listForMgr.map((m) => m.id)).toEqual([
      'leader-a',
      'member-a1',
      'member-a2',
      'member-overlap',
    ]);
  });

  it('代表は自分自身と退職した人を除く全員を書ける', () => {
    const viewerCeo: ViewerContext = {
      memberId: 'ceo-1',
      role: 'ceo',
      teamId: null,
      mgrTeamIds: [],
      isTalkOwner: false,
      isCeo: true,
    };
    const listForCeo = pickWritableMembers(viewerCeo, members, affiliations, TODAY);
    expect(listForCeo.map((m) => m.id)).toEqual([
      'leader-a',
      'member-a1',
      'member-a2',
      'member-overlap',
      'leader-b',
      'member-b1',
      'mgr-1',
    ]);
  });
});

describe('ボタンを出すかの計算だけの関数', () => {
  const leaderA: ViewerContext = {
    memberId: 'leader-a',
    role: 'leader',
    teamId: 'team-a',
    mgrTeamIds: ['team-b'], // 役割が leader なので mgrTeamIds は見ない
    isTalkOwner: false,
    isCeo: false,
  };
  const memberA: ViewerContext = {
    memberId: 'member-a',
    role: 'member',
    teamId: 'team-a',
    mgrTeamIds: [],
    isTalkOwner: false,
    isCeo: false,
  };
  const talkOwnerMemberB: ViewerContext = {
    memberId: 'to-b',
    role: 'member',
    teamId: 'team-b',
    mgrTeamIds: [],
    isTalkOwner: true,
    isCeo: false,
  };
  const mgrA: ViewerContext = {
    memberId: 'mgr-a',
    role: 'mgr',
    teamId: 'team-b', // 役割が mgr なので teamId ではなく mgrTeamIds を見る
    mgrTeamIds: ['team-a'],
    isTalkOwner: false,
    isCeo: false,
  };
  const ceo: ViewerContext = {
    memberId: 'ceo',
    role: 'ceo',
    teamId: null,
    mgrTeamIds: [],
    isTalkOwner: false,
    isCeo: true,
  };

  it('canSuperviseMember：自分自身はどの役割でも偽。他人に対しては役割どおり判定する', () => {
    expect(canSuperviseMember(leaderA, { id: 'leader-a', teamId: 'team-a' })).toBe(false);
    expect(canSuperviseMember(mgrA, { id: 'mgr-a', teamId: 'team-a' })).toBe(false);
    expect(canSuperviseMember(ceo, { id: 'ceo', teamId: null })).toBe(false);

    // リーダー：同じチームなら真、別チーム（mgrTeamIds に入っていても）なら偽
    expect(canSuperviseMember(leaderA, { id: 'member-a', teamId: 'team-a' })).toBe(true);
    expect(canSuperviseMember(leaderA, { id: 'member-b', teamId: 'team-b' })).toBe(false);

    // MGR：担当チームなら真、担当外（teamId に入っていても）なら偽
    expect(canSuperviseMember(mgrA, { id: 'member-a', teamId: 'team-a' })).toBe(true);
    expect(canSuperviseMember(mgrA, { id: 'member-b', teamId: 'team-b' })).toBe(false);

    // 代表：自分以外の全員に真（チームなしでも真）
    expect(canSuperviseMember(ceo, { id: 'member-a', teamId: 'team-a' })).toBe(true);
    expect(canSuperviseMember(ceo, { id: 'mgr-a', teamId: null })).toBe(true);

    // メンバー（トーク責任者を含む）：常に偽
    expect(canSuperviseMember(memberA, { id: 'other-a', teamId: 'team-a' })).toBe(false);
    expect(canSuperviseMember(talkOwnerMemberB, { id: 'other-b', teamId: 'team-b' })).toBe(false);
  });

  it('canMoveTalkToTrial：チームつきはそのチームのリーダー・担当MGRだけ真（代表・トーク責任者は偽）。チームなしは代表だけ真', () => {
    // チームAのトーク
    expect(canMoveTalkToTrial(leaderA, 'team-a')).toBe(true);
    expect(canMoveTalkToTrial(mgrA, 'team-a')).toBe(true);
    expect(canMoveTalkToTrial(ceo, 'team-a')).toBe(false);
    expect(canMoveTalkToTrial(talkOwnerMemberB, 'team-a')).toBe(false);
    expect(canMoveTalkToTrial(talkOwnerMemberB, 'team-b')).toBe(false);
    expect(canMoveTalkToTrial(memberA, 'team-a')).toBe(false);

    // チームBのトーク（leaderA の mgrTeamIds や mgrA の teamId では真にならない）
    expect(canMoveTalkToTrial(leaderA, 'team-b')).toBe(false);
    expect(canMoveTalkToTrial(mgrA, 'team-b')).toBe(false);

    // チームなしのトーク
    expect(canMoveTalkToTrial(ceo, null)).toBe(true);
    expect(canMoveTalkToTrial(leaderA, null)).toBe(false);
    expect(canMoveTalkToTrial(mgrA, null)).toBe(false);
    expect(canMoveTalkToTrial(talkOwnerMemberB, null)).toBe(false);
  });

  it('canMoveTalkToStandard：トーク責任者だけ真', () => {
    expect(canMoveTalkToStandard(talkOwnerMemberB)).toBe(true);
    expect(canMoveTalkToStandard(leaderA)).toBe(false);
    expect(canMoveTalkToStandard(mgrA)).toBe(false);
    expect(canMoveTalkToStandard(ceo)).toBe(false);
    expect(canMoveTalkToStandard(memberA)).toBe(false);
  });

  it('selectableTalkTeams と canAddTalkFromList：役割ごとに選べるチームを返し、トーク責任者でもメンバーなら今のチームだけ', () => {
    const teams = [
      { id: 'team-a', name: '架空A' },
      { id: 'team-b', name: '架空B' },
    ];

    expect(selectableTalkTeams(memberA, teams)).toEqual({
      allowNoTeam: false,
      teamIds: ['team-a'],
    });
    expect(canAddTalkFromList(memberA, teams)).toBe(false);

    expect(selectableTalkTeams(leaderA, teams)).toEqual({
      allowNoTeam: false,
      teamIds: ['team-a'],
    });
    expect(canAddTalkFromList(leaderA, teams)).toBe(true);

    // トーク責任者でも役割がメンバーなら今のチームだけ選べるが、一覧から足すボタンは出せる
    expect(selectableTalkTeams(talkOwnerMemberB, teams)).toEqual({
      allowNoTeam: false,
      teamIds: ['team-b'],
    });
    expect(canAddTalkFromList(talkOwnerMemberB, teams)).toBe(true);

    // 所属がないトーク責任者（メンバー）は選べるチームがないので一覧から足せない
    const teamlessTalkOwner: ViewerContext = {
      ...talkOwnerMemberB,
      teamId: null,
    };
    expect(selectableTalkTeams(teamlessTalkOwner, teams)).toEqual({
      allowNoTeam: false,
      teamIds: [],
    });
    expect(canAddTalkFromList(teamlessTalkOwner, teams)).toBe(false);

    // MGRは担当チームのみ（担当が空なら足せない）
    expect(selectableTalkTeams(mgrA, teams)).toEqual({
      allowNoTeam: false,
      teamIds: ['team-a'],
    });
    expect(canAddTalkFromList(mgrA, teams)).toBe(true);

    const unassignedMgr: ViewerContext = {
      ...mgrA,
      mgrTeamIds: [],
    };
    expect(canAddTalkFromList(unassignedMgr, teams)).toBe(false);

    // 代表はチームなし可＋全チーム
    expect(selectableTalkTeams(ceo, teams)).toEqual({
      allowNoTeam: true,
      teamIds: ['team-a', 'team-b'],
    });
    expect(canAddTalkFromList(ceo, teams)).toBe(true);
    expect(canAddTalkFromList(ceo, [])).toBe(true);
  });

  it('canEditTalk：作った人は確認待ちの間だけ。チームの上席・トーク責任者・代表はいつでも', () => {
    const pendingTalkA = { createdBy: 'member-a', status: 'pending', teamId: 'team-a' };
    const trialTalkA = { createdBy: 'member-a', status: 'trial', teamId: 'team-a' };
    const teamlessPending = { createdBy: 'ceo', status: 'pending', teamId: null };

    // 作った本人（memberA）は確認待ちの間だけ真、試行中になったら偽
    expect(canEditTalk(memberA, pendingTalkA)).toBe(true);
    expect(canEditTalk(memberA, trialTalkA)).toBe(false);

    // 同じチームの別メンバーは確認待ちでも偽
    const otherMemberA: ViewerContext = { ...memberA, memberId: 'member-a2' };
    expect(canEditTalk(otherMemberA, pendingTalkA)).toBe(false);

    // チームAの上席（leaderA・mgrA）は試行中でも真
    expect(canEditTalk(leaderA, pendingTalkA)).toBe(true);
    expect(canEditTalk(leaderA, trialTalkA)).toBe(true);
    expect(canEditTalk(mgrA, trialTalkA)).toBe(true);

    // チームなしトークは、leaderA・mgrA は上席ではないので偽
    expect(canEditTalk(leaderA, teamlessPending)).toBe(false);
    expect(canEditTalk(mgrA, teamlessPending)).toBe(false);

    // トーク責任者・代表はいつでも真
    expect(canEditTalk(talkOwnerMemberB, trialTalkA)).toBe(true);
    expect(canEditTalk(talkOwnerMemberB, teamlessPending)).toBe(true);
    expect(canEditTalk(ceo, trialTalkA)).toBe(true);
  });

  it('canCreateSeminar：リーダー・MGRだけ真（メンバー・代表は偽）', () => {
    expect(canCreateSeminar(leaderA)).toBe(true);
    expect(canCreateSeminar(mgrA)).toBe(true);
    expect(canCreateSeminar(memberA)).toBe(false);
    expect(canCreateSeminar(talkOwnerMemberB)).toBe(false);
    expect(canCreateSeminar(ceo)).toBe(false);
  });
});

describe('fetchViewerContext / fetchWritableMembers（モッククライアントでの読み取りと絞り込み）', () => {
  it('fetchViewerContext：auth_user_id と自分の member_id で明示して絞り、見つからなければ null、エラーは throw する', async () => {
    const eqCalls: Array<{ table: string; col: string; val: string }> = [];

    const mockClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'auth_leader_a' } }, error: null }),
      },
      from: (table: string) => ({
        select: () => ({
          eq: (col: string, val: string) => {
            eqCalls.push({ table, col, val });
            if (table === 'members') {
              return {
                limit: async () => ({
                  data: [makeMember('leader-a', 'leader', '架空リーダーA')],
                  error: null,
                }),
              };
            }
            if (table === 'member_affiliations') {
              return Promise.resolve({
                data: [makeAff('af1', 'leader-a', 'team-a', '2025-04-01', null)],
                error: null,
              });
            }
            if (table === 'mgr_assignments') {
              return Promise.resolve({ data: [], error: null });
            }
            if (table === 'permissions') {
              return Promise.resolve({
                data: [makePerm('p1', 'leader-a', 'talk_owner', null)],
                error: null,
              });
            }
            return Promise.resolve({ data: [], error: null });
          },
        }),
      }),
    } as unknown as SupabaseClient;

    const ctx = await fetchViewerContext(mockClient);
    expect(ctx).toEqual({
      memberId: 'leader-a',
      role: 'leader',
      teamId: 'team-a',
      mgrTeamIds: [],
      isTalkOwner: true,
      isCeo: false,
    });
    expect(eqCalls).toEqual([
      { table: 'members', col: 'auth_user_id', val: 'auth_leader_a' },
      { table: 'member_affiliations', col: 'member_id', val: 'leader-a' },
      { table: 'mgr_assignments', col: 'mgr_member_id', val: 'leader-a' },
      { table: 'permissions', col: 'member_id', val: 'leader-a' },
    ]);

    // 名簿にない人 → null
    const notFoundClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'auth_unknown' } }, error: null }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    expect(await fetchViewerContext(notFoundClient)).toBeNull();

    // 読み取りエラー → throw
    const errorClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'auth_err' } }, error: null }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: async () => ({ data: null, error: new Error('db error') }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    await expect(fetchViewerContext(errorClient)).rejects.toThrow('db error');
  });

  it('fetchWritableMembers：読めた全員から役割で絞り、自分を除いて返す', async () => {
    const viewer: ViewerContext = {
      memberId: 'leader-b',
      role: 'leader',
      teamId: 'team-b',
      mgrTeamIds: [],
      isTalkOwner: false,
      isCeo: false,
    };

    const mockClient = {
      from: (table: string) => ({
        select: () => {
          if (table === 'members') {
            return {
              order: async () => ({
                data: [
                  makeMember('leader-b', 'leader', '架空リーダーB'),
                  makeMember('member-a1', 'member', '架空メンバーA1'),
                  makeMember('member-b1', 'member', '架空メンバーB1'),
                ],
                error: null,
              }),
            };
          }
          return Promise.resolve({
            data: [
              makeAff('af1', 'leader-b', 'team-b', '2025-04-01', null),
              makeAff('af2', 'member-a1', 'team-a', '2025-04-01', null),
              makeAff('af3', 'member-b1', 'team-b', '2025-04-01', null),
            ],
            error: null,
          });
        },
      }),
    } as unknown as SupabaseClient;

    const writable = await fetchWritableMembers(viewer, mockClient);
    expect(writable).toEqual([{ id: 'member-b1', name: '架空メンバーB1', teamId: 'team-b' }]);
  });
});

