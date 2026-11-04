import { describe, expect, it } from 'vitest';
import type { MemberRow, TeamRow } from '../../../src/foundation/types';
import type {
  MasterRow,
  RoleplayRow,
  SeminarMemberRow,
  TalkRow,
  ViewerContext,
} from '../../../src/features/roleplay/shared';
import {
  buildTalkTeamOptions,
  computeTalkStatsMap,
  filterAndSortTalks,
  formatMemberDisplay,
  formatTalkTeamDisplay,
  generateTalkCode,
  getActiveMasterOptions,
  getTalkPrefix,
  getTalkStatsForId,
} from '../../../src/features/roleplay/talks/logic';
import {
  canEditSeminar,
  pickSeminarCandidateMembers,
  planSeminarMemberMutations,
  planSingleParticipantAdd,
} from '../../../src/features/roleplay/seminar/logic';

function makeRoleplay(overrides: Partial<RoleplayRow>): RoleplayRow {
  return {
    id: overrides.id ?? 'rp-default',
    date: overrides.date ?? '2026-11-04',
    runner_member_id: overrides.runner_member_id ?? 'member-leader-a',
    member_id: overrides.member_id ?? 'member-a',
    time_slot: overrides.time_slot ?? '10',
    kind: overrides.kind ?? 'apo',
    theme_id: overrides.theme_id ?? 'theme-1',
    used_talk_id: 'used_talk_id' in overrides ? (overrides.used_talk_id ?? null) : 'talk-1',
    minutes: 'minutes' in overrides ? (overrides.minutes ?? null) : 15,
    homework_result: overrides.homework_result ?? null,
    repeat_count: overrides.repeat_count ?? 1,
    pass_result: 'pass_result' in overrides ? (overrides.pass_result ?? null) : 'o',
    next_homework: overrides.next_homework ?? null,
    fixed_point: overrides.fixed_point ?? '架空の改善点',
    note: overrides.note ?? null,
    purpose: overrides.purpose ?? null,
    result_ap: overrides.result_ap ?? null,
    result_rate: overrides.result_rate ?? null,
    submitted_at:
      'submitted_at' in overrides
        ? (overrides.submitted_at ?? null)
        : '2026-11-04T02:00:00Z',
    hidden_at: 'hidden_at' in overrides ? (overrides.hidden_at ?? null) : null,
  };
}

function makeTalk(overrides: Partial<TalkRow>): TalkRow {
  return {
    id: overrides.id ?? 'talk-1',
    code: overrides.code ?? 'OUT-FIXTURE-001',
    scene_id: 'scene_id' in overrides ? (overrides.scene_id ?? null) : 'scene-1',
    industry_id: 'industry_id' in overrides ? (overrides.industry_id ?? null) : 'ind-1',
    list_type_id: 'list_type_id' in overrides ? (overrides.list_type_id ?? null) : 'list-1',
    their_words: overrides.their_words ?? '架空の相手の言葉',
    wording: overrides.wording ?? '架空の言い方',
    aim: overrides.aim ?? '架空のねらい',
    team_id: 'team_id' in overrides ? (overrides.team_id ?? null) : 'team-a',
    created_by: overrides.created_by ?? 'member-leader-a',
    status: overrides.status ?? 'standard',
    hidden_at: 'hidden_at' in overrides ? (overrides.hidden_at ?? null) : null,
  };
}

describe('トーク一覧：練習回数と合格率の計算', () => {
  it('送信済みかつ非表示でない記録だけを数え、合格ライン○の割合を出す', () => {
    const roleplays: RoleplayRow[] = [
      // talk-1: 送信済み3件（o, d, x）→ 練習3回、合格率 1/3 = 33%
      makeRoleplay({ id: 'rp-1', used_talk_id: 'talk-1', pass_result: 'o' }),
      makeRoleplay({ id: 'rp-2', used_talk_id: 'talk-1', pass_result: 'd' }),
      makeRoleplay({ id: 'rp-3', used_talk_id: 'talk-1', pass_result: 'x' }),
      // 書きかけ（submitted_at = null）→ 数えない
      makeRoleplay({
        id: 'rp-draft',
        used_talk_id: 'talk-1',
        pass_result: 'o',
        submitted_at: null,
      }),
      // 見えなくした記録（hidden_at あり）→ 数えない
      makeRoleplay({
        id: 'rp-hidden',
        used_talk_id: 'talk-1',
        pass_result: 'o',
        hidden_at: '2026-11-04T03:00:00Z',
      }),
      // talk-2: 送信済みだが pass_result が空のケース → 練習1回、合格ラインが入っている数0なので「－」
      makeRoleplay({ id: 'rp-4', used_talk_id: 'talk-2', pass_result: null }),
    ];

    const map = computeTalkStatsMap(roleplays);

    const stats1 = getTalkStatsForId(map, 'talk-1');
    expect(stats1.practiceCount).toBe(3);
    expect(stats1.passEvaluatedCount).toBe(3);
    expect(stats1.passOkCount).toBe(1);
    expect(stats1.passRateNumber).toBe(33);
    expect(stats1.passRateText).toBe('33%');

    const stats2 = getTalkStatsForId(map, 'talk-2');
    expect(stats2.practiceCount).toBe(1);
    expect(stats2.passEvaluatedCount).toBe(0);
    expect(stats2.passRateNumber).toBeNull();
    expect(stats2.passRateText).toBe('－');

    const statsUnused = getTalkStatsForId(map, 'talk-unused');
    expect(statsUnused.practiceCount).toBe(0);
    expect(statsUnused.passRateText).toBe('－');
  });
});

describe('トーク一覧：コードの付け方・絞り込み・並べ順・選択肢', () => {
  it('OUT- または SC- ＋日付8桁＋UUID頭4文字大文字でコードを作る', () => {
    expect(generateTalkCode('OUT', '2026-11-04', '3f9a1234-5678-4000-8000-000000000000')).toBe(
      'OUT-20261104-3F9A',
    );
    expect(generateTalkCode('SC', '2026-11-04', 'ab12cd34-5678-4000-8000-000000000000')).toBe(
      'SC-20261104-AB12',
    );
    expect(getTalkPrefix('OUT-FIXTURE-001')).toBe('OUT');
    expect(getTalkPrefix('SC-FIXTURE-001')).toBe('SC');
  });

  it('masters の選ぶ欄には is_active が真のものだけを sort_order 順に出す', () => {
    const masters: MasterRow[] = [
      { id: 's-2', kind: 'scene', name: '架空場面2', sort_order: 2, is_active: true },
      { id: 's-1', kind: 'scene', name: '架空場面1', sort_order: 1, is_active: true },
      { id: 's-inactive', kind: 'scene', name: '架空場面（旧）', sort_order: 0, is_active: false },
    ];

    const activeOnly = getActiveMasterOptions(masters, 'scene');
    expect(activeOnly.map((o) => o.value)).toEqual(['s-1', 's-2']);

    // 編集中のトークが停止中マスタを使っている場合は維持できるよう選択肢に含める
    const withCurrent = getActiveMasterOptions(masters, 'scene', 's-inactive');
    expect(withCurrent.map((o) => o.value)).toEqual(['s-inactive', 's-1', 's-2']);
  });

  it('場面・業種・リスト・種類・状態で絞り込み、場面→状態→コードの文字順で並べる', () => {
    const masters: MasterRow[] = [
      { id: 'scene-early', kind: 'scene', name: '架空場面A', sort_order: 1, is_active: true },
      { id: 'scene-late', kind: 'scene', name: '架空場面B', sort_order: 2, is_active: true },
    ];

    const talks: TalkRow[] = [
      makeTalk({
        id: 't-late-std',
        code: 'OUT-FIXTURE-001',
        scene_id: 'scene-late',
        status: 'standard',
      }),
      makeTalk({
        id: 't-early-std',
        code: 'SC-FIXTURE-001',
        scene_id: 'scene-early',
        status: 'standard',
      }),
      makeTalk({
        id: 't-early-pending-b',
        code: 'OUT-20261104-BBBB',
        scene_id: 'scene-early',
        status: 'pending',
      }),
      makeTalk({
        id: 't-early-pending-a',
        code: 'OUT-20261104-AAAA',
        scene_id: 'scene-early',
        status: 'pending',
      }),
      makeTalk({
        id: 't-hidden',
        code: 'OUT-20261104-0000',
        scene_id: 'scene-early',
        status: 'pending',
        hidden_at: '2026-11-04T05:00:00Z',
      }),
    ];

    const allVisible = filterAndSortTalks(
      talks,
      { sceneId: '', industryId: '', listTypeId: '', prefix: '', status: '' },
      masters,
    );
    expect(allVisible.map((t) => t.id)).toEqual([
      't-early-pending-a',
      't-early-pending-b',
      't-early-std',
      't-late-std',
    ]);

    const onlySc = filterAndSortTalks(
      talks,
      { sceneId: '', industryId: '', listTypeId: '', prefix: 'SC', status: '' },
      masters,
    );
    expect(onlySc.map((t) => t.id)).toEqual(['t-early-std']);
  });

  it('チーム選択肢と読めない相手・チームの表示名を組み立てる', () => {
    const teams: TeamRow[] = [
      { id: 'team-a', name: '架空チームA' },
      { id: 'team-b', name: '架空チームB' },
    ];

    // チームB所属のトーク責任者（役割は member）がチームAのトークを編集するとき、今のチームAも維持できる
    const talkOwnerViewer: ViewerContext = {
      memberId: 'member-c',
      role: 'member',
      teamId: 'team-b',
      mgrTeamIds: [],
      isTalkOwner: true,
      isCeo: false,
    };

    const editOptions = buildTalkTeamOptions(talkOwnerViewer, teams, 'team-a', true);
    expect(editOptions.map((o) => o.value)).toEqual(['team-a', 'team-b']);

    const teamMap = new Map<string, string>([['team-b', '架空チームB']]);
    expect(formatTalkTeamDisplay(null, teamMap)).toBe('全体（チームなし）');
    expect(formatTalkTeamDisplay('team-b', teamMap)).toBe('架空チームB');
    expect(formatTalkTeamDisplay('team-a', teamMap)).toBe('ほかのチーム');

    const memberMap = new Map<string, string>([['member-c', '架空メンバーC']]);
    expect(formatMemberDisplay('member-c', memberMap)).toBe('架空メンバーC');
    expect(formatMemberDisplay('unknown-id', memberMap)).toBe('名簿で見られない人');
  });
});

describe('研修の記録：参加者候補と追加・外す・戻す判定', () => {
  it('退職日を過ぎていない人だけを参加者候補にする', () => {
    const members: MemberRow[] = [
      {
        id: 'm-active',
        auth_user_id: null,
        email: 'a@example.test',
        name: '架空メンバーA',
        role: 'member',
        goes_to_sales: true,
        hired_on: '2026-04-01',
        retired_on: null,
      },
      {
        id: 'm-retire-today',
        auth_user_id: null,
        email: 'b@example.test',
        name: '架空メンバーB',
        role: 'member',
        goes_to_sales: true,
        hired_on: '2026-04-01',
        retired_on: '2026-11-04',
      },
      {
        id: 'm-retired',
        auth_user_id: null,
        email: 'c@example.test',
        name: '架空退職者C',
        role: 'member',
        goes_to_sales: true,
        hired_on: '2026-04-01',
        retired_on: '2026-11-03',
      },
    ];

    const candidates = pickSeminarCandidateMembers(members, '2026-11-04');
    expect(candidates.map((m) => m.id)).toEqual(['m-active', 'm-retire-today']);
  });

  it('外した人を戻すときは insert ではなく removed_at を空にする restore にする', () => {
    const existingRows: SeminarMemberRow[] = [
      { seminar_id: 'sem-1', member_id: 'm-keep', removed_at: null },
      { seminar_id: 'sem-1', member_id: 'm-remove', removed_at: null },
      {
        seminar_id: 'sem-1',
        member_id: 'm-removed-before',
        removed_at: '2026-11-01T00:00:00Z',
      },
    ];

    const plan = planSeminarMemberMutations(existingRows, [
      'm-keep',
      'm-removed-before',
      'm-brand-new',
    ]);

    expect(plan.toInsert).toEqual(['m-brand-new']);
    expect(plan.toRestore).toEqual(['m-removed-before']);
    expect(plan.toRemove).toEqual(['m-remove']);

    expect(planSingleParticipantAdd(existingRows, 'm-brand-new')).toBe('insert');
    expect(planSingleParticipantAdd(existingRows, 'm-removed-before')).toBe('restore');
    expect(planSingleParticipantAdd(existingRows, 'm-keep')).toBe('noop');
  });

  it('研修を直せるのは作った人だけ', () => {
    const leaderA: ViewerContext = {
      memberId: 'leader-a',
      role: 'leader',
      teamId: 'team-a',
      mgrTeamIds: [],
      isTalkOwner: false,
      isCeo: false,
    };
    expect(canEditSeminar(leaderA, 'leader-a')).toBe(true);
    expect(canEditSeminar(leaderA, 'leader-b')).toBe(false);
  });
});
