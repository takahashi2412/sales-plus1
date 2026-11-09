import { describe, expect, it } from 'vitest';
import type {
  MemberThemeRow,
  RoleplayRow,
  RoleplaySettingsMap,
  RoleplayThemeRow,
  TalkRow,
  ViewerContext,
} from '../../../src/features/roleplay/shared';
import {
  addDaysToDateString,
  buildGraduatePatch,
  buildReadableMemberMap,
  buildThemeNoticesSummary,
  canCreateDraftRoleplay,
  canModifyRoleplay,
  formatRoleplayPassResultDisplay,
  formatRoleplayThemeDisplay,
  formatRoleplayTimeSlotDisplay,
  diffDaysBetweenDates,
  evaluateCheckRoleplayNotice,
  evaluateGraduationCandidate,
  evaluateLongPracticingAlert,
  filterRoleplays,
  findPreviousHomework,
  generateTalkCode,
  hasPracticingThemeOfSameKind,
  hideRoleplayRow,
  insertMemberThemeRow,
  insertPendingTalkFromRoleplay,
  insertRoleplayRow,
  isRoleplayOverAlertMinutes,
  resolveNewTalkTeamId,
  resolveThemeSelectionForMember,
  sortRoleplaysByDateAndTimeSlot,
  sortTalksForSelect,
  updateMemberThemeRow,
  updateRoleplayRow,
  validateRoleplayForSubmit,
} from '../../../src/features/roleplay/record';
import type { SupabaseClient } from '@supabase/supabase-js';

function makeMemberTheme(overrides: Partial<MemberThemeRow> = {}): MemberThemeRow {
  return {
    id: 'mt-1',
    member_id: 'member-a',
    theme_id: 'theme-apo-1',
    kind: 'apo',
    started_on: '2026-10-01',
    pass_line: '架空の合格ライン',
    status: 'practicing',
    graduated_on: null,
    check_on: null,
    created_by: 'leader-a',
    hidden_at: null,
    ...overrides,
  };
}

function makeRoleplay(overrides: Partial<RoleplayRow> = {}): RoleplayRow {
  return {
    id: 'rp-1',
    date: '2026-10-05',
    runner_member_id: 'leader-a',
    member_id: 'member-a',
    time_slot: '10',
    kind: 'apo',
    theme_id: 'theme-apo-1',
    used_talk_id: null,
    minutes: 15,
    homework_result: 'o',
    repeat_count: 2,
    pass_result: 'o',
    next_homework: '架空の宿題',
    fixed_point: '架空の直した点',
    note: null,
    purpose: null,
    result_ap: null,
    result_rate: null,
    submitted_at: '2026-10-05T02:00:00Z',
    hidden_at: null,
    ...overrides,
  };
}

describe('卒業の候補の判定（evaluateGraduationCandidate）', () => {
  it('開始日以後の送った記録（日付・時間帯順）で合格ラインの○が設定回数（初期値2）続いたら候補になる', () => {
    const mt = makeMemberTheme({ started_on: '2026-10-01', status: 'practicing' });
    const roleplays: RoleplayRow[] = [
      // 開始日より前の○は数えない
      makeRoleplay({ id: 'rp-before', date: '2026-09-30', time_slot: '10', pass_result: 'o' }),
      // 開始日以後の1回目：○
      makeRoleplay({ id: 'rp-1', date: '2026-10-02', time_slot: '10', pass_result: 'o' }),
    ];

    expect(evaluateGraduationCandidate(mt, roleplays, 2)).toEqual({
      isCandidate: false,
      consecutivePassCount: 1,
      totalSubmittedSinceStart: 1,
    });

    // 2回目：○ → 2回連続で卒業候補
    roleplays.push(
      makeRoleplay({ id: 'rp-2', date: '2026-10-03', time_slot: '14', pass_result: 'o' }),
    );
    expect(evaluateGraduationCandidate(mt, roleplays, 2)).toEqual({
      isCandidate: true,
      consecutivePassCount: 2,
      totalSubmittedSinceStart: 2,
    });

    // 設定値が3回のときはまだ候補にならない
    expect(evaluateGraduationCandidate(mt, roleplays, 3).isCandidate).toBe(false);
  });

  it('途中に△や×が入ると連続回数がリセットされ、その後ふたたび○が続けば候補になる', () => {
    const mt = makeMemberTheme({ started_on: '2026-10-01' });
    const roleplays: RoleplayRow[] = [
      makeRoleplay({ id: 'rp-1', date: '2026-10-01', time_slot: '9', pass_result: 'o' }),
      makeRoleplay({ id: 'rp-2', date: '2026-10-02', time_slot: '10', pass_result: 'd' }),
      makeRoleplay({ id: 'rp-3', date: '2026-10-03', time_slot: '10', pass_result: 'o' }),
    ];
    expect(evaluateGraduationCandidate(mt, roleplays, 2)).toEqual({
      isCandidate: false,
      consecutivePassCount: 1,
      totalSubmittedSinceStart: 3,
    });

    roleplays.push(
      makeRoleplay({ id: 'rp-4', date: '2026-10-04', time_slot: '10', pass_result: 'o' }),
    );
    expect(evaluateGraduationCandidate(mt, roleplays, 2)).toEqual({
      isCandidate: true,
      consecutivePassCount: 2,
      totalSubmittedSinceStart: 4,
    });
  });

  it('同じ日の時間帯は数値として並べる（9時台が10時台より前）ため、9時台が×・10時台が○・翌日が○なら2回連続になる', () => {
    const mt = makeMemberTheme({ started_on: '2026-10-01' });
    const roleplays: RoleplayRow[] = [
      // 配列の順番が逆でも、9時台 → 10時台の順に並ぶことを確かめる
      makeRoleplay({ id: 'rp-10', date: '2026-10-05', time_slot: '10', pass_result: 'o' }),
      makeRoleplay({ id: 'rp-9', date: '2026-10-05', time_slot: '9', pass_result: 'x' }),
      makeRoleplay({ id: 'rp-next', date: '2026-10-06', time_slot: '9', pass_result: 'o' }),
    ];

    const res = evaluateGraduationCandidate(mt, roleplays, 2);
    expect(res.consecutivePassCount).toBe(2);
    expect(res.isCandidate).toBe(true);
  });

  it('書きかけ（submitted_at が空）や見えなくした記録（hidden_at あり）は数えない', () => {
    const mt = makeMemberTheme({ started_on: '2026-10-01' });
    const roleplays: RoleplayRow[] = [
      makeRoleplay({ id: 'rp-1', date: '2026-10-02', time_slot: '10', pass_result: 'o' }),
      makeRoleplay({
        id: 'rp-draft',
        date: '2026-10-03',
        time_slot: '10',
        pass_result: 'o',
        submitted_at: null,
      }),
      makeRoleplay({
        id: 'rp-hidden',
        date: '2026-10-04',
        time_slot: '10',
        pass_result: 'o',
        hidden_at: '2026-10-04T05:00:00Z',
      }),
    ];

    expect(evaluateGraduationCandidate(mt, roleplays, 2)).toEqual({
      isCandidate: false,
      consecutivePassCount: 1,
      totalSubmittedSinceStart: 1,
    });
  });
});

describe('卒業にするときの日の計算と、確認のロープレの判定', () => {
  it('buildGraduatePatch：graduated_on に今日、check_on に今日＋設定日数（初期値14日）を入れる', () => {
    expect(buildGraduatePatch('2026-11-04', 14)).toEqual({
      status: 'graduated',
      graduated_on: '2026-11-04',
      check_on: '2026-11-18',
    });

    // 月またぎ・設定変更（21日）
    expect(buildGraduatePatch('2026-11-20', 21)).toEqual({
      status: 'graduated',
      graduated_on: '2026-11-20',
      check_on: '2026-12-11',
    });
  });

  it('evaluateCheckRoleplayNotice：check_on の日になったら知らせ、check_on 以後に送った記録があれば知らせを消す', () => {
    const mt = makeMemberTheme({
      status: 'graduated',
      graduated_on: '2026-10-01',
      check_on: '2026-10-15',
    });

    // check_on の前日（10/14）はまだ知らせない
    expect(evaluateCheckRoleplayNotice(mt, [], '2026-10-14')).toEqual({
      needsCheckNotice: false,
      latestCheckResult: null,
      latestCheckDate: null,
    });

    // check_on の当日（10/15）は知らせる
    expect(evaluateCheckRoleplayNotice(mt, [], '2026-10-15')).toEqual({
      needsCheckNotice: true,
      latestCheckResult: null,
      latestCheckDate: null,
    });

    // check_on より前（10/10）の記録では知らせは消えない
    const oldRp = makeRoleplay({ id: 'rp-old', date: '2026-10-10', pass_result: 'o' });
    expect(evaluateCheckRoleplayNotice(mt, [oldRp], '2026-10-16').needsCheckNotice).toBe(true);

    // check_on 以後の書きかけ（submitted_at: null）でも知らせは消えない
    const draftCheckRp = makeRoleplay({
      id: 'rp-draft',
      date: '2026-10-15',
      pass_result: 'o',
      submitted_at: null,
    });
    expect(evaluateCheckRoleplayNotice(mt, [draftCheckRp], '2026-10-16').needsCheckNotice).toBe(
      true,
    );

    // check_on 以後に送った記録があれば知らせが消え、結果（○や×）が返る
    const submittedCheckRp = makeRoleplay({
      id: 'rp-check',
      date: '2026-10-15',
      pass_result: 'x',
    });
    expect(evaluateCheckRoleplayNotice(mt, [submittedCheckRp], '2026-10-16')).toEqual({
      needsCheckNotice: false,
      latestCheckResult: 'x',
      latestCheckDate: '2026-10-15',
    });
  });
});

describe('注意の2つの判定（時間超過と長期練習中）とまとめ（buildThemeNoticesSummary）', () => {
  it('isRoleplayOverAlertMinutes：設定分数（初期値30分）を超えたら確認（30分は偽、31分は真）', () => {
    expect(isRoleplayOverAlertMinutes(null, 30)).toBe(false);
    expect(isRoleplayOverAlertMinutes(15, 30)).toBe(false);
    expect(isRoleplayOverAlertMinutes(30, 30)).toBe(false);
    expect(isRoleplayOverAlertMinutes(31, 30)).toBe(true);
    expect(isRoleplayOverAlertMinutes(25, 20)).toBe(true);
  });

  it('evaluateLongPracticingAlert：設定日数（初期値14日）以上同じテーマが練習中なら注意（13日は偽、14日は真）', () => {
    const mt = makeMemberTheme({ started_on: '2026-10-01', status: 'practicing' });

    expect(evaluateLongPracticingAlert(mt, '2026-10-14', 14)).toEqual({
      isLongPracticing: false,
      practicingDays: 13,
    });
    expect(evaluateLongPracticingAlert(mt, '2026-10-15', 14)).toEqual({
      isLongPracticing: true,
      practicingDays: 14,
    });

    // 卒業済みのテーマは長期練習中の注意に出さない
    const graduatedMt = makeMemberTheme({
      started_on: '2026-10-01',
      status: 'graduated',
      graduated_on: '2026-10-10',
      check_on: '2026-10-24',
    });
    expect(evaluateLongPracticingAlert(graduatedMt, '2026-10-30', 14).isLongPracticing).toBe(
      false,
    );
  });

  it('buildThemeNoticesSummary：卒業候補・確認のロープレ・長期練習中・時間超過を件数つきでまとめる', () => {
    const settings: RoleplaySettingsMap = {
      roleplay_alert_minutes: 30,
      roleplay_alert_days: 14,
      roleplay_graduate_count: 2,
      roleplay_check_days: 14,
    };

    const mtCandidateAndLong = makeMemberTheme({
      id: 'mt-cand',
      member_id: 'member-a',
      theme_id: 'theme-1',
      started_on: '2026-10-01',
      status: 'practicing',
    });
    const mtCheckDue = makeMemberTheme({
      id: 'mt-check',
      member_id: 'member-b',
      theme_id: 'theme-2',
      started_on: '2026-09-01',
      status: 'graduated',
      graduated_on: '2026-10-01',
      check_on: '2026-10-15',
    });

    const roleplays: RoleplayRow[] = [
      makeRoleplay({
        id: 'rp-1',
        member_id: 'member-a',
        theme_id: 'theme-1',
        date: '2026-10-05',
        time_slot: '9',
        pass_result: 'o',
        minutes: 20,
      }),
      makeRoleplay({
        id: 'rp-2',
        member_id: 'member-a',
        theme_id: 'theme-1',
        date: '2026-10-06',
        time_slot: '10',
        pass_result: 'o',
        minutes: 35, // 30分超
      }),
    ];

    const summary = buildThemeNoticesSummary(
      [mtCandidateAndLong, mtCheckDue],
      roleplays,
      settings,
      '2026-10-20',
    );

    expect(summary.graduationCandidates).toHaveLength(1);
    expect(summary.graduationCandidates[0].memberTheme.id).toBe('mt-cand');
    expect(summary.graduationCandidates[0].consecutivePassCount).toBe(2);

    expect(summary.checkRoleplayNotices).toHaveLength(1);
    expect(summary.checkRoleplayNotices[0].memberTheme.id).toBe('mt-check');

    expect(summary.longPracticingAlerts).toHaveLength(1);
    expect(summary.longPracticingAlerts[0].practicingDays).toBe(19);

    expect(summary.overMinutesRoleplays).toHaveLength(1);
    expect(summary.overMinutesRoleplays[0].id).toBe('rp-2');
  });
});

describe('ロープレ入力・一覧・トーク追加の補助計算', () => {
  const themes: RoleplayThemeRow[] = [
    {
      id: 't-apo-1',
      no: 101,
      stage: 1,
      name: '架空アポ1',
      kind: 'apo',
      pass_example: '例1',
      is_active: true,
    },
    {
      id: 't-apo-inactive',
      no: 102,
      stage: 2,
      name: '架空アポ非表示',
      kind: 'apo',
      pass_example: '例2',
      is_active: false,
    },
    {
      id: 't-sales-1',
      no: 201,
      stage: 6,
      name: '架空営業1',
      kind: 'sales',
      pass_example: '例6',
      is_active: true,
    },
  ];

  it('resolveThemeSelectionForMember：練習中のテーマがあればその内容とテーマを自動で選び、なければアポの有効なテーマから選ぶ', () => {
    const memberThemes: MemberThemeRow[] = [
      makeMemberTheme({
        id: 'mt-sales',
        member_id: 'member-sales-only',
        theme_id: 't-sales-1',
        kind: 'sales',
        status: 'practicing',
      }),
    ];

    // 営業だけ練習中の課員を選ぶと、内容＝営業・練習中のテーマが自動で選ばれる
    const resSales = resolveThemeSelectionForMember(
      'member-sales-only',
      memberThemes,
      themes,
    );
    expect(resSales.kind).toBe('sales');
    expect(resSales.themeId).toBe('t-sales-1');
    expect(resSales.practicingMemberTheme?.id).toBe('mt-sales');

    // 練習中のテーマがない（またはメンバー実行者で読めない）課員は、内容＝アポ・is_active なテーマ一覧から選ぶ
    const resNone = resolveThemeSelectionForMember('member-no-theme', memberThemes, themes);
    expect(resNone.kind).toBe('apo');
    expect(resNone.themeId).toBe('t-apo-1');
    expect(resNone.practicingMemberTheme).toBeNull();
    expect(resNone.selectableThemes.map((t) => t.id)).toEqual(['t-apo-1']);
  });

  it('findPreviousHomework：読める送った記録のうち、日付・時間帯がいちばん新しい記録の次回の宿題を返す', () => {
    const roleplays: RoleplayRow[] = [
      makeRoleplay({
        id: 'rp-9',
        member_id: 'member-a',
        date: '2026-10-10',
        time_slot: '9',
        next_homework: '架空宿題（9時台）',
      }),
      makeRoleplay({
        id: 'rp-10',
        member_id: 'member-a',
        date: '2026-10-10',
        time_slot: '10',
        next_homework: '架空宿題（10時台・最新）',
      }),
      makeRoleplay({
        id: 'rp-draft',
        member_id: 'member-a',
        date: '2026-10-11',
        time_slot: '15',
        next_homework: '書きかけの宿題',
        submitted_at: null,
      }),
    ];

    expect(findPreviousHomework('member-a', roleplays)).toBe('架空宿題（10時台・最新）');
    expect(findPreviousHomework('member-unknown', roleplays)).toBe('');
  });

  it('canCreateDraftRoleplay と validateRoleplayForSubmit：下書きは4項目、送信は今日直した点・時間・合格ラインが必須', () => {
    expect(
      canCreateDraftRoleplay({
        date: '2026-11-04',
        runnerMemberId: 'leader-a',
        memberId: 'member-a',
        timeSlot: '10',
        kind: 'apo',
        themeId: 't-apo-1',
      }),
    ).toBe(true);

    const draftCheck = validateRoleplayForSubmit({
      memberId: 'member-a',
      timeSlot: '10',
      kind: 'apo',
      themeId: 't-apo-1',
      fixedPoint: '',
      minutes: null,
      passResult: null,
    });
    expect(draftCheck.ok).toBe(false);
    expect(draftCheck.missingLabels).toEqual([
      '時間（分）',
      '合格ラインの○△×',
      '今日直した点',
    ]);

    const submitOk = validateRoleplayForSubmit({
      memberId: 'member-a',
      timeSlot: '10',
      kind: 'apo',
      themeId: 't-apo-1',
      fixedPoint: '架空の直した点',
      minutes: 15,
      passResult: 'o',
    });
    expect(submitOk).toEqual({ ok: true, missingLabels: [] });
  });

  it('generateTalkCode・resolveNewTalkTeamId・sortTalksForSelect：新しい言い方のコードとチームと並び順', () => {
    const code = generateTalkCode('OUT', '2026-11-04', () => '3f9a1234-5678-4000-8000-000000000000');
    expect(code).toBe('OUT-20261104-3F9A');

    const leaderViewer: ViewerContext = {
      memberId: 'leader-a',
      role: 'leader',
      teamId: 'team-a',
      mgrTeamIds: [],
      isTalkOwner: false,
      isCeo: false,
    };
    const mgrViewer: ViewerContext = {
      memberId: 'mgr-1',
      role: 'mgr',
      teamId: null,
      mgrTeamIds: ['team-a'],
      isTalkOwner: false,
      isCeo: false,
    };
    const ceoViewer: ViewerContext = {
      memberId: 'ceo-1',
      role: 'ceo',
      teamId: null,
      mgrTeamIds: [],
      isTalkOwner: false,
      isCeo: true,
    };

    expect(resolveNewTalkTeamId(leaderViewer, 'team-b')).toBe('team-a');
    expect(resolveNewTalkTeamId(mgrViewer, 'team-a')).toBe('team-a');
    expect(resolveNewTalkTeamId(ceoViewer, null)).toBeNull();

    const talks: TalkRow[] = [
      {
        id: 'tk-1',
        code: 'OUT-FIXTURE-002',
        scene_id: 'sc-2',
        industry_id: null,
        list_type_id: null,
        their_words: '架空2',
        wording: '言い方2',
        aim: '',
        team_id: 'team-a',
        created_by: 'leader-a',
        status: 'trial',
        hidden_at: null,
      },
      {
        id: 'tk-2',
        code: 'OUT-FIXTURE-001',
        scene_id: 'sc-1',
        industry_id: null,
        list_type_id: null,
        their_words: '架空1',
        wording: '言い方1',
        aim: '',
        team_id: 'team-a',
        created_by: 'leader-a',
        status: 'standard',
        hidden_at: null,
      },
    ];
    const sceneOrder = new Map([
      ['sc-1', 1],
      ['sc-2', 2],
    ]);
    expect(sortTalksForSelect(talks, sceneOrder).map((t) => t.code)).toEqual([
      'OUT-FIXTURE-001',
      'OUT-FIXTURE-002',
    ]);
  });

  it('hasPracticingThemeOfSameKind・filterRoleplays・sortRoleplaysByDateAndTimeSlot：重複チェックと一覧の絞り込み・並び順', () => {
    const mts: MemberThemeRow[] = [
      makeMemberTheme({ id: 'mt-1', member_id: 'member-a', kind: 'apo', status: 'practicing' }),
      makeMemberTheme({ id: 'mt-2', member_id: 'member-a', kind: 'sales', status: 'graduated' }),
    ];
    expect(hasPracticingThemeOfSameKind(mts, 'member-a', 'apo')).toBe(true);
    expect(hasPracticingThemeOfSameKind(mts, 'member-a', 'sales')).toBe(false);

    const rps: RoleplayRow[] = [
      makeRoleplay({ id: 'r-10', date: '2026-10-10', time_slot: '10', member_id: 'member-a' }),
      makeRoleplay({ id: 'r-9', date: '2026-10-10', time_slot: '9', member_id: 'member-a' }),
      makeRoleplay({ id: 'r-prev', date: '2026-10-09', time_slot: '14', member_id: 'member-b' }),
    ];
    const sorted = sortRoleplaysByDateAndTimeSlot(rps, 'asc');
    expect(sorted.map((r) => r.id)).toEqual(['r-prev', 'r-9', 'r-10']);

    const filtered = filterRoleplays(sorted, {
      memberId: 'member-a',
      dateFrom: '2026-10-10',
      dateTo: '2026-10-10',
    });
    expect(filtered.map((r) => r.id)).toEqual(['r-9', 'r-10']);
  });

  it('addDaysToDateString と diffDaysBetweenDates：日付計算の境界値', () => {
    expect(addDaysToDateString('2026-12-25', 14)).toBe('2027-01-08');
    expect(diffDaysBetweenDates('2026-10-01', '2026-10-15')).toBe(14);
  });

  it('buildReadableMemberMap：読めるメンバーとチーム名を対応づけ、チーム名が読めない場合は「ほかのチーム」とする', () => {
    const map = buildReadableMemberMap(
      [
        {
          id: 'm-1',
          auth_user_id: 'a-1',
          email: 'm1@example.test',
          name: '架空メンバー1',
          role: 'member',
          goes_to_sales: false,
          hired_on: '2025-04-01',
          retired_on: null,
        },
        {
          id: 'm-2',
          auth_user_id: 'a-2',
          email: 'm2@example.test',
          name: '架空メンバー2',
          role: 'member',
          goes_to_sales: false,
          hired_on: '2025-04-01',
          retired_on: null,
        },
      ],
      [
        {
          id: 'af-1',
          member_id: 'm-1',
          team_id: 'team-a',
          base: '架空拠点',
          start_date: '2025-04-01',
          end_date: null,
        },
        {
          id: 'af-2',
          member_id: 'm-2',
          team_id: 'team-unreadable',
          base: '架空拠点',
          start_date: '2025-04-01',
          end_date: null,
        },
      ],
      [{ id: 'team-a', name: '架空チームA' }],
      '2026-11-04',
    );

    expect(map.get('m-1')?.teamName).toBe('架空チームA');
    expect(map.get('m-2')?.teamName).toBe('ほかのチーム');
  });

  it('データベースが操作を断ったとき（RLSで0件またはエラー）は「この操作はできません」を投げる', async () => {
    const deniedClient = {
      from: () => ({
        insert: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: new Error('rls denied') }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(
      insertRoleplayRow(
        {
          date: '2026-11-04',
          runner_member_id: 'leader-a',
          member_id: 'member-a',
          time_slot: '10',
          kind: 'apo',
          theme_id: 't-1',
          used_talk_id: null,
          minutes: null,
          homework_result: null,
          repeat_count: 1,
          pass_result: null,
          next_homework: null,
          fixed_point: '',
          note: null,
          submitted_at: null,
        },
        deniedClient,
      ),
    ).rejects.toThrow('この操作はできません');

    await expect(
      updateRoleplayRow('rp-1', { fixed_point: '修正' }, deniedClient),
    ).rejects.toThrow('この操作はできません');

    await expect(hideRoleplayRow('rp-1', deniedClient)).rejects.toThrow('この操作はできません');

    await expect(
      insertPendingTalkFromRoleplay(
        {
          code: 'OUT-20261104-1234',
          their_words: '架空',
          wording: '架空',
          team_id: 'team-a',
          created_by: 'leader-a',
        },
        deniedClient,
      ),
    ).rejects.toThrow('この操作はできません');

    await expect(
      insertMemberThemeRow(
        {
          member_id: 'member-a',
          theme_id: 't-1',
          kind: 'apo',
          started_on: '2026-11-04',
          pass_line: '架空',
          created_by: 'leader-a',
        },
        deniedClient,
      ),
    ).rejects.toThrow('この操作はできません');

    await expect(
      updateMemberThemeRow('mt-1', { status: 'graduated' }, deniedClient),
    ).rejects.toThrow('この操作はできません');
  });
});


describe('過去の記録（is_legacy = true）の編集不可判定と空欄表示（ロープレ）', () => {
  it('is_legacy = true のロープレは編集不可と判定され、空の time_slot・theme_id・pass_result が「－」や「（過去の記録：なし）」になる', () => {
    const legacyRow = makeRoleplay({
      id: 'rp-legacy',
      time_slot: null,
      theme_id: null,
      pass_result: null,
      is_legacy: true,
    });
    const currentRow = makeRoleplay({
      id: 'rp-current',
      time_slot: '10',
      theme_id: 't-apo-1',
      pass_result: null,
      is_legacy: false,
    });

    expect(canModifyRoleplay(legacyRow)).toBe(false);
    expect(canModifyRoleplay(currentRow)).toBe(true);

    expect(formatRoleplayTimeSlotDisplay(legacyRow.time_slot)).toBe('－');
    expect(formatRoleplayTimeSlotDisplay(currentRow.time_slot)).toBe('10時台');

    const themeMap = new Map<string, RoleplayThemeRow>([
      [
        't-apo-1',
        {
          id: 't-apo-1',
          no: 1,
          stage: 1,
          name: '架空アポ1',
          kind: 'apo',
          pass_example: '例',
          is_active: true,
        },
      ],
    ]);
    expect(formatRoleplayThemeDisplay(legacyRow, themeMap)).toBe('（過去の記録：なし）');
    expect(formatRoleplayThemeDisplay(currentRow, themeMap)).toBe('架空アポ1');

    expect(formatRoleplayPassResultDisplay(legacyRow)).toBe('（過去の記録：なし）');
    expect(formatRoleplayPassResultDisplay(currentRow)).toBe('－');

    // time_slot が null でも sortRoleplaysByDateAndTimeSlot が崩れないこと
    const sorted = sortRoleplaysByDateAndTimeSlot([legacyRow, currentRow], 'asc');
    expect(sorted.map((r) => r.id)).toEqual(['rp-current', 'rp-legacy']);
  });
});
