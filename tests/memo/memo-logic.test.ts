import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MemberAffiliationRow,
  MemberRow,
  TeamRow,
} from '../../src/foundation/types';
import type { ViewerContext } from '../../src/foundation/viewer';
import {
  buildReadableMemberMap,
  createSequentialTaskQueue,
  filterAndSortSubmittedMemos,
  filterSelectableTargetsBySelected,
  formatMemoCheckLabel,
  formatMemoTargetNames,
  formatMemoWriterName,
  formatUpdatedAfterSubmitLabel,
  hideMemoRow,
  insertDraftMemoRow,
  pickActiveMemoMasters,
  pickMyDraftMemos,
  pickPendingCheckMemos,
  pickSupervisableTargetOptions,
  planMemoTargetChanges,
  syncMemoTargets,
  truncateMemoSnippet,
  updateMemoRow,
  validateMemoForSubmit,
  type MemoMasterRow,
  type SubordinateMemoRow,
  type SubordinateMemoTargetRow,
} from '../../src/features/memo';

function makeMemo(overrides: Partial<SubordinateMemoRow> = {}): SubordinateMemoRow {
  return {
    id: 'memo-1',
    date: '2026-11-04',
    created_by: 'leader-a',
    theme_id: 'theme-apo',
    kind_id: 'kind-guidance',
    noticed: '架空の気づき',
    guidance: '架空の指導',
    next_check_on: '2026-11-11',
    action_check: null,
    result_check: null,
    checked_on: null,
    training_id: null,
    is_legacy: false,
    legacy_source: null,
    submitted_at: '2026-11-04T09:00:00Z',
    hidden_at: null,
    created_at: '2026-11-04T08:50:00Z',
    updated_at: '2026-11-04T09:00:00Z',
    ...overrides,
  };
}

const TEAMS: TeamRow[] = [
  { id: 'team-a', name: '架空チームA' },
  { id: 'team-b', name: '架空チームB' },
];

const MEMBERS: MemberRow[] = [
  {
    id: 'leader-a',
    auth_user_id: 'u-la',
    email: 'la@example.test',
    name: '架空リーダーA',
    role: 'leader',
    goes_to_sales: true,
    hired_on: '2024-04-01',
    retired_on: null,
  },
  {
    id: 'member-a1',
    auth_user_id: 'u-ma1',
    email: 'ma1@example.test',
    name: '架空メンバーA1',
    role: 'member',
    goes_to_sales: false,
    hired_on: '2025-04-01',
    retired_on: null,
  },
  {
    id: 'member-a2',
    auth_user_id: 'u-ma2',
    email: 'ma2@example.test',
    name: '架空メンバーA2',
    role: 'member',
    goes_to_sales: true,
    hired_on: '2025-04-01',
    retired_on: null,
  },
  {
    id: 'member-b1',
    auth_user_id: 'u-mb1',
    email: 'mb1@example.test',
    name: '架空メンバーB1',
    role: 'member',
    goes_to_sales: false,
    hired_on: '2025-04-01',
    retired_on: null,
  },
  {
    id: 'retired-a',
    auth_user_id: 'u-ret',
    email: 'ret@example.test',
    name: '架空退職メンバー',
    role: 'member',
    goes_to_sales: false,
    hired_on: '2024-04-01',
    retired_on: '2026-10-31',
  },
  {
    id: 'teamless-mgr',
    auth_user_id: 'u-mgr',
    email: 'mgr@example.test',
    name: '架空MGR',
    role: 'mgr',
    goes_to_sales: true,
    hired_on: '2023-04-01',
    retired_on: null,
  },
];

const AFFILIATIONS: MemberAffiliationRow[] = [
  {
    id: 'af-la',
    member_id: 'leader-a',
    team_id: 'team-a',
    base: '架空拠点',
    start_date: '2024-04-01',
    end_date: null,
  },
  {
    id: 'af-ma1',
    member_id: 'member-a1',
    team_id: 'team-a',
    base: '架空拠点',
    start_date: '2025-04-01',
    end_date: null,
  },
  {
    id: 'af-ma2',
    member_id: 'member-a2',
    team_id: 'team-a',
    base: '架空拠点',
    start_date: '2025-04-01',
    end_date: null,
  },
  {
    id: 'af-mb1',
    member_id: 'member-b1',
    team_id: 'team-b',
    base: '架空拠点',
    start_date: '2025-04-01',
    end_date: null,
  },
  {
    id: 'af-ret',
    member_id: 'retired-a',
    team_id: 'team-a',
    base: '架空拠点',
    start_date: '2024-04-01',
    end_date: null,
  },
];

describe('確認待ちの選び出し（pickPendingCheckMemos）', () => {
  it('自分が書いて送ったメモのうち、次の確認日が今日以前で行動が空・見えなくしていないものだけを選ぶ', () => {
    const memos: SubordinateMemoRow[] = [
      // 1. 対象：今日以前（10/27 <= 11/05）で action_check が空
      makeMemo({
        id: 'm-due-past',
        created_by: 'leader-a',
        next_check_on: '2026-10-27',
        action_check: null,
      }),
      // 2. 対象：ちょうど今日（11/05 <= 11/05）で action_check が空
      makeMemo({
        id: 'm-due-today',
        created_by: 'leader-a',
        next_check_on: '2026-11-05',
        action_check: null,
      }),
      // 3. 除外：次の確認日が明日以降
      makeMemo({
        id: 'm-future',
        created_by: 'leader-a',
        next_check_on: '2026-11-06',
        action_check: null,
      }),
      // 4. 除外：行動（action_check）がすでに入っている
      makeMemo({
        id: 'm-checked',
        created_by: 'leader-a',
        next_check_on: '2026-10-20',
        action_check: 'o',
      }),
      // 5. 除外：書きかけ（submitted_at が空）
      makeMemo({
        id: 'm-draft',
        created_by: 'leader-a',
        next_check_on: '2026-10-20',
        action_check: null,
        submitted_at: null,
      }),
      // 6. 除外：見えなくしたもの（hidden_at あり）
      makeMemo({
        id: 'm-hidden',
        created_by: 'leader-a',
        next_check_on: '2026-10-20',
        action_check: null,
        hidden_at: '2026-11-01T00:00:00Z',
      }),
      // 7. 除外：ほかの上席が書いたもの
      makeMemo({
        id: 'm-other-writer',
        created_by: 'mgr-1',
        next_check_on: '2026-10-20',
        action_check: null,
      }),
      // 8. 除外：次の確認日が空
      makeMemo({
        id: 'm-no-next-check',
        created_by: 'leader-a',
        next_check_on: null,
        action_check: null,
      }),
    ];

    const pending = pickPendingCheckMemos(memos, 'leader-a', '2026-11-05');
    expect(pending.map((m) => m.id)).toEqual(['m-due-past', 'm-due-today']);
  });
});

describe('対象者の選べる人と同じチームでの絞り込み（pickSupervisableTargetOptions / filterSelectableTargetsBySelected）', () => {
  it('リーダーは同じチームの在籍メンバーだけを選べ、自分と退職日を過ぎた人は除かれる', () => {
    const leaderViewer: ViewerContext = {
      memberId: 'leader-a',
      role: 'leader',
      teamId: 'team-a',
      mgrTeamIds: [],
      isTalkOwner: false,
      isAdmin: false,
      isCeo: false,
    };

    const options = pickSupervisableTargetOptions(
      leaderViewer,
      MEMBERS,
      AFFILIATIONS,
      TEAMS,
      '2026-11-05',
    );
    expect(options.map((o) => o.id)).toEqual(['member-a1', 'member-a2']);
  });

  it('MGR は担当チームの人、代表は全員（自分と退職者を除く）を選べる', () => {
    const mgrViewer: ViewerContext = {
      memberId: 'teamless-mgr',
      role: 'mgr',
      teamId: null,
      mgrTeamIds: ['team-a'],
      isTalkOwner: false,
      isAdmin: false,
      isCeo: false,
    };

    const mgrOptions = pickSupervisableTargetOptions(
      mgrViewer,
      MEMBERS,
      AFFILIATIONS,
      TEAMS,
      '2026-11-05',
    );
    expect(mgrOptions.map((o) => o.id)).toEqual(['member-a1', 'member-a2', 'leader-a']);

    const ceoViewer: ViewerContext = {
      memberId: 'ceo-1',
      role: 'ceo',
      teamId: null,
      mgrTeamIds: [],
      isTalkOwner: false,
      isAdmin: false,
      isCeo: true,
    };

    const ceoOptions = pickSupervisableTargetOptions(
      ceoViewer,
      MEMBERS,
      AFFILIATIONS,
      TEAMS,
      '2026-11-05',
    );
    expect(ceoOptions.map((o) => o.id)).toEqual([
      'teamless-mgr',
      'member-a1',
      'member-a2',
      'leader-a',
      'member-b1',
    ]);
  });

  it('1人目を選んだら2人目からは同じチームの人だけになり、チームがない人を選んだときはほかの人を足せない。リーダー＋メンバー同時選択を検知する', () => {
    const ceoViewer: ViewerContext = {
      memberId: 'ceo-1',
      role: 'ceo',
      teamId: null,
      mgrTeamIds: [],
      isTalkOwner: false,
      isAdmin: false,
      isCeo: true,
    };
    const allOptions = pickSupervisableTargetOptions(
      ceoViewer,
      MEMBERS,
      AFFILIATIONS,
      TEAMS,
      '2026-11-05',
    );

    // 誰も選んでいないときは全員選べる
    const step0 = filterSelectableTargetsBySelected(allOptions, []);
    expect(step0.selectableOptions).toHaveLength(5);
    expect(step0.lockedTeamId).toBeNull();
    expect(step0.hasLeaderAndMemberCombined).toBe(false);

    // チームAの member-a1 を1人目に選ぶと、チームAの3人だけが候補に残る
    const step1 = filterSelectableTargetsBySelected(allOptions, ['member-a1']);
    expect(step1.lockedTeamId).toBe('team-a');
    expect(step1.isTeamlessSelected).toBe(false);
    expect(step1.selectableOptions.map((o) => o.id)).toEqual([
      'member-a1',
      'member-a2',
      'leader-a',
    ]);
    expect(step1.hasLeaderAndMemberCombined).toBe(false);

    // さらに同じチームの leader-a を選ぶと、リーダー＋メンバー同時選択の注意フラグが真になる
    const step2 = filterSelectableTargetsBySelected(allOptions, ['member-a1', 'leader-a']);
    expect(step2.hasLeaderAndMemberCombined).toBe(true);

    // チームがない MGR（teamless-mgr）を1人目に選ぶと、ほかの人は足せない（その1人だけ）
    const stepTeamless = filterSelectableTargetsBySelected(allOptions, ['teamless-mgr']);
    expect(stepTeamless.isTeamlessSelected).toBe(true);
    expect(stepTeamless.selectableOptions.map((o) => o.id)).toEqual(['teamless-mgr']);
  });
});

describe('送る前の確かめ（validateMemoForSubmit）と対象者の追加・戻す・外す計画（planMemoTargetChanges）', () => {
  it('テーマ・種類・対象者と、気づいた内容か指導した内容のどちらかが必須', () => {
    const emptyRes = validateMemoForSubmit({
      date: '2026-11-05',
      targetMemberIds: [],
      themeId: null,
      kindId: null,
      noticed: '   ',
      guidance: '',
    });
    expect(emptyRes.ok).toBe(false);
    expect(emptyRes.missingLabels).toEqual([
      '対象者',
      'テーマ',
      '種類',
      '気づいた内容または指導した内容',
    ]);

    // 気づいた内容だけでも通る
    const noticedOnly = validateMemoForSubmit({
      date: '2026-11-05',
      targetMemberIds: ['member-a1'],
      themeId: 'theme-apo',
      kindId: 'kind-guidance',
      noticed: '架空の気づきあり',
      guidance: '   ',
    });
    expect(noticedOnly).toEqual({ ok: true, missingLabels: [] });

    // 指導した内容だけでも通る
    const guidanceOnly = validateMemoForSubmit({
      date: '2026-11-05',
      targetMemberIds: ['member-a1'],
      themeId: 'theme-apo',
      kindId: 'kind-guidance',
      noticed: '',
      guidance: '架空の指導あり',
    });
    expect(guidanceOnly).toEqual({ ok: true, missingLabels: [] });
  });

  it('外した人を戻すときは行を足し直さず removed_at を空に戻し、送ったメモの最後の1人は外せない', () => {
    const existing: SubordinateMemoTargetRow[] = [
      { memo_id: 'memo-1', member_id: 'member-a1', removed_at: null },
      { memo_id: 'memo-1', member_id: 'member-a2', removed_at: '2026-11-04T10:00:00Z' },
    ];

    // member-a1 を外し、以前外した member-a2 を戻し、新しく leader-a を足す
    const plan = planMemoTargetChanges(existing, ['member-a2', 'leader-a'], true);
    expect(plan).toEqual({
      toInsert: ['leader-a'],
      toRestore: ['member-a2'],
      toRemove: ['member-a1'],
    });

    // 送ったメモで対象者を0人にしようとするとエラーになる
    expect(() => planMemoTargetChanges(existing, [], true)).toThrow(
      '送ったメモの対象者を全員外すことはできません。',
    );

    // 書きかけのメモなら対象者0人でも許容される
    expect(planMemoTargetChanges(existing, [], false)).toEqual({
      toInsert: [],
      toRestore: [],
      toRemove: ['member-a1'],
    });
  });
});

describe('一覧の並び順・絞り込み・表示補助（filterAndSortSubmittedMemos / formatUpdatedAfterSubmitLabel / formatMemoWriterName）', () => {
  it('マスタは is_active が真のものだけを sort_order 順に並べる', () => {
    const masters: MemoMasterRow[] = [
      { id: 't2', kind: 'memo_theme', name: 'リスト', sort_order: 2, is_active: true },
      { id: 't1', kind: 'memo_theme', name: 'アポ', sort_order: 1, is_active: true },
      { id: 't3', kind: 'memo_theme', name: '旧テーマ', sort_order: 3, is_active: false },
      { id: 'k1', kind: 'memo_kind', name: '指摘・指導', sort_order: 1, is_active: true },
    ];
    expect(pickActiveMemoMasters(masters, 'memo_theme').map((m) => m.name)).toEqual([
      'アポ',
      'リスト',
    ]);
  });

  it('送ったメモを新しい日が上に並べ、対象者・テーマ・種類・期間で絞り込める。自分の書きかけは別にまとめる', () => {
    const memos: SubordinateMemoRow[] = [
      makeMemo({
        id: 'm-old',
        date: '2026-10-20',
        theme_id: 'theme-apo',
        kind_id: 'kind-guidance',
      }),
      makeMemo({
        id: 'm-new',
        date: '2026-11-04',
        theme_id: 'theme-list',
        kind_id: 'kind-praise',
      }),
      makeMemo({
        id: 'm-draft',
        date: '2026-11-05',
        submitted_at: null,
        created_by: 'leader-a',
      }),
    ];
    const targets: SubordinateMemoTargetRow[] = [
      { memo_id: 'm-old', member_id: 'member-a1', removed_at: null },
      { memo_id: 'm-new', member_id: 'member-a2', removed_at: null },
      // 外した対象者（removed_at あり）では絞り込みに引っかからない
      { memo_id: 'm-new', member_id: 'member-a1', removed_at: '2026-11-04T12:00:00Z' },
    ];

    expect(pickMyDraftMemos(memos, 'leader-a').map((m) => m.id)).toEqual(['m-draft']);

    const allSubmitted = filterAndSortSubmittedMemos(memos, targets);
    expect(allSubmitted.map((m) => m.id)).toEqual(['m-new', 'm-old']);

    const byTargetA1 = filterAndSortSubmittedMemos(memos, targets, {
      targetMemberId: 'member-a1',
    });
    expect(byTargetA1.map((m) => m.id)).toEqual(['m-old']);

    const byTheme = filterAndSortSubmittedMemos(memos, targets, {
      themeId: 'theme-list',
    });
    expect(byTheme.map((m) => m.id)).toEqual(['m-new']);
  });

  it('送ったあとに直したメモは「〇月〇日に直した」と出し、書いた人の名簿が読めないときは「ほかの上席」と出す', () => {
    // 送った直後（同時刻）は出さない
    expect(
      formatUpdatedAfterSubmitLabel('2026-11-04T09:00:00Z', '2026-11-04T09:00:00Z'),
    ).toBeNull();

    // 送ったあとに直したとき
    expect(
      formatUpdatedAfterSubmitLabel('2026-11-04T09:00:00Z', '2026-11-05T06:00:00Z'),
    ).toBe('11月5日に直した');

    const map = buildReadableMemberMap(
      MEMBERS.filter((m) => m.id === 'leader-a' || m.id === 'member-a1'),
      AFFILIATIONS,
      TEAMS,
      '2026-11-05',
    );
    expect(formatMemoWriterName('leader-a', 'leader-a', map)).toBe('架空リーダーA');
    expect(formatMemoWriterName('unreadable-mgr', 'leader-a', map)).toBe('ほかの上席');

    expect(
      formatMemoTargetNames(
        'm-1',
        [{ memo_id: 'm-1', member_id: 'member-a1', removed_at: null }],
        map,
      ),
    ).toBe('架空メンバーA1');

    expect(formatMemoCheckLabel('o')).toBe('○');
    expect(formatMemoCheckLabel('d')).toBe('△');
    expect(formatMemoCheckLabel('x')).toBe('×');
    expect(formatMemoCheckLabel(null)).toBe('－');
    expect(truncateMemoSnippet('あいうえお', 3)).toBe('あいう…');
  });

  it('データベースが操作を断ったときは「この操作はできません」を投げる', async () => {
    const deniedClient = {
      from: () => ({
        select: () => ({
          eq: async () => ({
            data: [] as SubordinateMemoTargetRow[],
            error: null,
          }),
        }),
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
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(
      insertDraftMemoRow(
        {
          date: '2026-11-05',
          created_by: 'leader-a',
          theme_id: null,
          kind_id: null,
          noticed: '',
          guidance: '',
          next_check_on: null,
        },
        deniedClient,
      ),
    ).rejects.toThrow('この操作はできません');

    await expect(updateMemoRow('memo-1', { noticed: '修正' }, deniedClient)).rejects.toThrow(
      'この操作はできません',
    );

    await expect(hideMemoRow('memo-1', deniedClient)).rejects.toThrow('この操作はできません');

    await expect(
      syncMemoTargets('memo-1', ['member-a1'], false, deniedClient),
    ).rejects.toThrow('この操作はできません');
  });

  it('createSequentialTaskQueue と syncMemoTargets：保存が重なっても1本ずつ順番に行い、対象者は毎回データベースから読み直して二重追加を防ぐ', async () => {
    const enqueue = createSequentialTaskQueue();
    const events: string[] = [];

    let draftId: string | null = null;
    const dbTargets: SubordinateMemoTargetRow[] = [];
    const insertedMembersLog: string[] = [];

    const mockClient = {
      from: (table: string) => {
        if (table !== 'subordinate_memo_targets') {
          throw new Error(`unexpected table: ${table}`);
        }
        return {
          select: () => ({
            eq: async (_col: string, memoId: string) => ({
              data: dbTargets.filter((r) => r.memo_id === memoId).map((r) => ({ ...r })),
              error: null,
            }),
          }),
          insert: (row: { memo_id: string; member_id: string }) => ({
            select: () => ({
              maybeSingle: async () => {
                // もし同じ memo_id と member_id がすでにあれば主キー重複エラーになる（本番のDBと同じ動き）
                if (
                  dbTargets.some(
                    (r) => r.memo_id === row.memo_id && r.member_id === row.member_id,
                  )
                ) {
                  return { data: null, error: new Error('duplicate key value') };
                }
                dbTargets.push({
                  memo_id: row.memo_id,
                  member_id: row.member_id,
                  removed_at: null,
                });
                insertedMembersLog.push(row.member_id);
                return { data: { memo_id: row.memo_id }, error: null };
              },
            }),
          }),
          update: (patch: { removed_at: string | null }) => ({
            eq: (_c1: string, memoId: string) => ({
              eq: (_c2: string, memberId: string) => ({
                select: () => ({
                  maybeSingle: async () => {
                    const found = dbTargets.find(
                      (r) => r.memo_id === memoId && r.member_id === memberId,
                    );
                    if (!found) return { data: null, error: null };
                    found.removed_at = patch.removed_at;
                    return { data: { memo_id: memoId }, error: null };
                  },
                }),
              }),
            }),
          }),
        };
      },
    } as unknown as SupabaseClient;

    // 1回目の保存（まだ draftId が空の状態で始まり、少し時間がかかる）
    const save1 = enqueue(async () => {
      events.push('save1:start');
      await new Promise((r) => setTimeout(r, 20));
      if (!draftId) {
        draftId = 'draft-created-1';
        events.push('save1:created-draft');
      }
      await syncMemoTargets(draftId, ['member-a1'], false, mockClient);
      events.push('save1:end');
    });

    // 1回目の保存が終わらないうちに2回目の保存（同じ member-a1 に加えて member-a2 を選択）がキューに入る
    const save2 = enqueue(async () => {
      events.push('save2:start');
      if (!draftId) {
        draftId = 'draft-created-2';
        events.push('save2:created-draft');
      }
      // 画面の古い targetRows ではなく DB から読み直すため、member-a1 は再 insert されず member-a2 だけが insert される
      await syncMemoTargets(draftId, ['member-a1', 'member-a2'], false, mockClient);
      events.push('save2:end');
    });

    await Promise.all([save1, save2]);

    // 1本ずつ順番に実行され、メモが2つ作られないこと
    expect(events).toEqual([
      'save1:start',
      'save1:created-draft',
      'save1:end',
      'save2:start',
      'save2:end',
    ]);
    expect(draftId).toBe('draft-created-1');
    // member-a1 が二重に insert されず、1回ずつだけ insert されていること
    expect(insertedMembersLog).toEqual(['member-a1', 'member-a2']);
  });
});
