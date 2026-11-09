import { describe, expect, it } from 'vitest'
import type {
  MemberAffiliationRow,
  MemberRow,
  TeamRow,
} from '../../src/foundation/types'
import type { ViewerContext } from '../../src/foundation/viewer'
import {
  buildKarteMemberHash,
  formatKarteDbError,
  parseKarteSettings,
  parseMemberIdFromHash,
} from '../../src/features/karte'
import {
  aggregateByTimeSlot,
  aggregateKpiForPeriod,
  buildKarteTimeline,
  buildKarteTrendData,
  calculateCallHoursAndUnmetSlots,
  calculateTeamRankings,
  evaluateKarteKpiTargets,
  fetchAllRowsByRange,
  filterApprovedKpiEntries,
  formatKarteAsOfDateLabel,
  formatKarteRate,
  formatRatioAndDiff,
  getTwoMonthsAgoFirstDate,
  pickSelectableKarteMembers,
  resolveKarteAsOfDate,
  resolveScopedMemberIdsForKarteKpi,
} from '../../src/features/karte/shared'
import type {
  KpiEntryRow,
  KpiTargetRow,
  KpiTimeSlot,
} from '../../src/features/kpi/shared/types'

const teams: TeamRow[] = [
  { id: 'team-a', name: '架空チームA' },
  { id: 'team-b', name: '架空チームB' },
]

const members: MemberRow[] = [
  {
    id: 'ceo-1',
    auth_user_id: null,
    name: '架空代表',
    email: 'ceo@example.test',
    role: 'ceo',
    goes_to_sales: true,
    hired_on: '2020-04-01',
    retired_on: null,
  },
  {
    id: 'mgr-1',
    auth_user_id: null,
    name: '架空MGR',
    email: 'mgr@example.test',
    role: 'mgr',
    goes_to_sales: true,
    hired_on: '2021-04-01',
    retired_on: null,
  },
  {
    id: 'leader-a',
    auth_user_id: null,
    name: '架空リーダーA',
    email: 'leader-a@example.test',
    role: 'leader',
    goes_to_sales: true,
    hired_on: '2022-04-01',
    retired_on: null,
  },
  {
    id: 'leader-b',
    auth_user_id: null,
    name: '架空リーダーB',
    email: 'leader-b@example.test',
    role: 'leader',
    goes_to_sales: true,
    hired_on: '2022-04-01',
    retired_on: null,
  },
  {
    id: 'member-1',
    auth_user_id: null,
    name: '架空メンバー1',
    email: 'member-1@example.test',
    role: 'member',
    goes_to_sales: true,
    hired_on: '2024-04-01',
    retired_on: null,
  },
  {
    id: 'member-2',
    auth_user_id: null,
    name: '架空メンバー2',
    email: 'member-2@example.test',
    role: 'member',
    goes_to_sales: false,
    hired_on: '2024-04-01',
    retired_on: null,
  },
  {
    id: 'retired-1',
    auth_user_id: null,
    name: '架空退職メンバー',
    email: 'retired-1@example.test',
    role: 'member',
    goes_to_sales: true,
    hired_on: '2023-04-01',
    retired_on: '2026-10-31',
  },
]

const affiliations: MemberAffiliationRow[] = [
  {
    id: 'aff-la',
    member_id: 'leader-a',
    team_id: 'team-a',
    base: '東京',
    start_date: '2022-04-01',
    end_date: null,
  },
  {
    id: 'aff-lb',
    member_id: 'leader-b',
    team_id: 'team-b',
    base: '大阪',
    start_date: '2022-04-01',
    end_date: null,
  },
  {
    id: 'aff-m1',
    member_id: 'member-1',
    team_id: 'team-a',
    base: '東京',
    start_date: '2024-04-01',
    end_date: null,
  },
  {
    id: 'aff-m2',
    member_id: 'member-2',
    team_id: 'team-b',
    base: '大阪',
    start_date: '2024-04-01',
    end_date: null,
  },
  // 退職メンバー：昔はチームB、最後の所属（開始日がいちばん新しい）はチームA
  {
    id: 'aff-ret-old',
    member_id: 'retired-1',
    team_id: 'team-b',
    base: '大阪',
    start_date: '2023-04-01',
    end_date: '2024-03-31',
  },
  {
    id: 'aff-ret-last',
    member_id: 'retired-1',
    team_id: 'team-a',
    base: '東京',
    start_date: '2024-04-01',
    end_date: '2026-10-31',
  },
]

function makeEntry(
  overrides: Partial<KpiEntryRow> & {
    id: string
    member_id: string
    date: string
    time_slot?: KpiTimeSlot
  },
): KpiEntryRow {
  return {
    import_log_id: 'imp-1',
    time_slot: '9',
    total: 0,
    connected: 0,
    recall: 0,
    owner: 0,
    prospect: 0,
    apo: 0,
    ...overrides,
  }
}

function makeTarget(overrides: Partial<KpiTargetRow> = {}): KpiTargetRow {
  return {
    id: 'target-1',
    member_id: 'member-1',
    month: '2026-11-01',
    goes_to_sales: false,
    target_profit: null,
    unit_price: null,
    completion_rate: null,
    rate_order: null,
    apo_target: 40,
    rate_adoption: 80,
    working_days: 20,
    call_hours: 5,
    term: 20,
    rate_connected: 40,
    rate_recall: 20,
    rate_owner: 10,
    rate_prospect: 5,
    rate_apo_owner: 20,
    history: [],
    revised_at: null,
    created_at: '2026-10-25T00:00:00Z',
    updated_at: '2026-10-25T00:00:00Z',
    ...overrides,
  }
}

describe('karte shared calculations', () => {
  describe('選べる人 (pickSelectableKarteMembers)', () => {
    it('リーダーA（管理者兼務でも）は自分のチームAの現役メンバーと最後のチームがAの退職メンバーだけを選べ、自分は選べない', () => {
      const viewerLeaderA: ViewerContext = {
        memberId: 'leader-a',
        role: 'leader',
        isAdmin: true,
        isTalkOwner: false,
        isCeo: false,
        teamId: 'team-a',
        mgrTeamIds: [],
      }
      const list = pickSelectableKarteMembers(
        viewerLeaderA,
        members,
        affiliations,
        teams,
        '2026-11-09',
      )
      expect(list.map((x) => x.member.id)).toEqual(['member-1', 'retired-1'])
      expect(list.find((x) => x.member.id === 'retired-1')?.isRetired).toBe(true)
      expect(list.find((x) => x.member.id === 'retired-1')?.base).toBe('東京')
      expect(list.find((x) => x.member.id === 'member-1')?.leaderNames).toEqual([
        '架空リーダーA',
      ])
    })

    it('リーダーBは自分のチームBのメンバーだけを選べ、最後のチームがAの退職メンバーは選べない', () => {
      const viewerLeaderB: ViewerContext = {
        memberId: 'leader-b',
        role: 'leader',
        isAdmin: false,
        isTalkOwner: false,
        isCeo: false,
        teamId: 'team-b',
        mgrTeamIds: [],
      }
      const list = pickSelectableKarteMembers(
        viewerLeaderB,
        members,
        affiliations,
        teams,
        '2026-11-09',
      )
      expect(list.map((x) => x.member.id)).toEqual(['member-2'])
    })

    it('MGRは担当チームのメンバー（リーダー・退職者含む）を選べる', () => {
      const viewerMgr: ViewerContext = {
        memberId: 'mgr-1',
        role: 'mgr',
        isAdmin: false,
        isTalkOwner: false,
        isCeo: false,
        teamId: null,
        mgrTeamIds: ['team-a'],
      }
      const list = pickSelectableKarteMembers(
        viewerMgr,
        members,
        affiliations,
        teams,
        '2026-11-09',
      )
      expect(list.map((x) => x.member.id)).toEqual([
        'member-1',
        'leader-a',
        'retired-1',
      ])
    })

    it('代表は自分以外の全員を選べる', () => {
      const viewerCeo: ViewerContext = {
        memberId: 'ceo-1',
        role: 'ceo',
        isAdmin: true,
        isTalkOwner: false,
        isCeo: true,
        teamId: null,
        mgrTeamIds: [],
      }
      const list = pickSelectableKarteMembers(
        viewerCeo,
        members,
        affiliations,
        teams,
        '2026-11-09',
      )
      expect(list.some((x) => x.member.id === 'ceo-1')).toBe(false)
      expect(list.length).toBe(members.length - 1)
    })
  })

  describe('基準の日と期間のKPI集計・目標とあるべき', () => {
    const entries: KpiEntryRow[] = [
      makeEntry({
        id: 'e-1',
        member_id: 'member-1',
        date: '2026-11-02', // 月曜
        time_slot: '9',
        total: 100,
        connected: 40,
        recall: 20,
        owner: 10,
        prospect: 5,
        apo: 2,
      }),
      makeEntry({
        id: 'e-2',
        member_id: 'member-1',
        date: '2026-11-06', // 金曜
        time_slot: '9',
        total: 80,
        connected: 32,
        recall: 16,
        owner: 8,
        prospect: 4,
        apo: 1,
      }),
    ]

    it('承認済みKPIの最新日を基準の日とし、データがない月は「今月の数字はまだありません」を返す', () => {
      const asOf = resolveKarteAsOfDate(entries, 'member-1', '2026-11')
      expect(asOf).toBe('2026-11-06')
      expect(formatKarteAsOfDateLabel(asOf)).toBe('11月6日までの数字')

      const emptyAsOf = resolveKarteAsOfDate(entries, 'member-2', '2026-11')
      expect(emptyAsOf).toBeNull()
      expect(formatKarteAsOfDateLabel(emptyAsOf)).toBe(
        '今月の数字はまだありません',
      )
    })

    it('今日・今週・今月の実績と率を集計し、分母0のときは「－」になる', () => {
      const todayAgg = aggregateKpiForPeriod(
        entries,
        'member-1',
        '2026-11-06',
        'today',
      )
      expect(todayAgg.total).toBe(80)
      expect(todayAgg.apo).toBe(1)
      expect(todayAgg.rateConnected).toBeCloseTo(40)
      expect(todayAgg.rateApoOwner).toBeCloseTo(12.5)

      const monthAgg = aggregateKpiForPeriod(
        entries,
        'member-1',
        '2026-11-06',
        'month',
      )
      expect(monthAgg.total).toBe(180)
      expect(monthAgg.apo).toBe(3)

      const zeroAgg = aggregateKpiForPeriod(
        [],
        'member-1',
        '2026-11-06',
        'today',
      )
      expect(zeroAgg.rateConnected).toBeNull()
      expect(formatKarteRate(zeroAgg.rateConnected)).toBe('－')
    })

    it('目標・あるべき・あるべき比と▲▼を計算し、目標未入力のときは hasTarget=false になる', () => {
      const target = makeTarget()
      const holidays = ['2026-11-03', '2026-11-23']
      const workdays: string[] = []

      const todayAgg = aggregateKpiForPeriod(
        entries,
        'member-1',
        '2026-11-06',
        'today',
      )
      const todayEval = evaluateKarteKpiTargets(
        todayAgg,
        target,
        '2026-11-06',
        holidays,
        workdays,
      )
      expect(todayEval.hasTarget).toBe(true)
      expect(todayEval.metrics.total.periodTarget).toBe(100)
      expect(todayEval.metrics.total.ratioPercent).toBeCloseTo(80)
      expect(todayEval.metrics.total.diff).toBeCloseTo(-20)
      expect(
        formatRatioAndDiff(
          todayEval.metrics.total.ratioPercent,
          todayEval.metrics.total.diff,
          '件',
        ),
      ).toContain('▼20件')

      const weekAgg = aggregateKpiForPeriod(
        entries,
        'member-1',
        '2026-11-06',
        'week',
      )
      const weekEval = evaluateKarteKpiTargets(
        weekAgg,
        target,
        '2026-11-06',
        holidays,
        workdays,
      )
      expect(weekEval.businessDaysInPeriod).toBe(4)
      expect(weekEval.metrics.total.periodTarget).toBe(400)
      expect(weekEval.metrics.apo.periodTarget).toBe(8)

      const monthAgg = aggregateKpiForPeriod(
        entries,
        'member-1',
        '2026-11-06',
        'month',
      )
      const monthEval = evaluateKarteKpiTargets(
        monthAgg,
        target,
        '2026-11-06',
        holidays,
        workdays,
      )
      expect(monthEval.metrics.apo.shouldBe).toBeCloseTo((40 * 4) / 19, 3)
      expect(monthEval.rates.rate_apo_owner.targetRate).toBe(20)
      expect(monthEval.rates.rate_apo_owner.diffPoints).toBeCloseTo(
        (3 / 18) * 100 - 20,
        2,
      )

      const missingEval = evaluateKarteKpiTargets(
        monthAgg,
        null,
        '2026-11-06',
        holidays,
        workdays,
      )
      expect(missingEval.hasTarget).toBe(false)
      expect(missingEval.metrics.total.periodTarget).toBeNull()
    })
  })

  describe('コール時間と項目ごとの未達の時間数・時間帯別', () => {
    const target = makeTarget({
      term: 20,
      rate_connected: 40, // 1時間あたり実 = 8
      rate_recall: 20, // 1時間あたり再 = 4
      rate_owner: 10, // 1時間あたりオ = 2
      rate_prospect: 5, // 1時間あたり見 = 1
      apo_target: 40, // 月次総 = 20*5*20 = 2000 -> 1時間あたりア = 20 * (40/2000) = 0.4
    })

    const entries: KpiEntryRow[] = [
      // 9時台：総=22(>17 でコール時間カウント、かつ>=20で総は達成)、実=10(>=8達成)、ア=1(>=0.4達成)
      makeEntry({
        id: 'e-9',
        member_id: 'member-1',
        date: '2026-11-06',
        time_slot: '9',
        total: 22,
        connected: 10,
        recall: 5,
        owner: 3,
        prospect: 2,
        apo: 1,
      }),
      // 10時台：総=18(>17 でコール時間カウント、だが<20で総は未達)、実=4(<8で実も未達)、ア=0(<0.4でアも未達)
      makeEntry({
        id: 'e-10',
        member_id: 'member-1',
        date: '2026-11-06',
        time_slot: '10',
        total: 18,
        connected: 4,
        recall: 2,
        owner: 1,
        prospect: 0,
        apo: 0,
      }),
      // 13時台（昼休み）：総=25 でも8つの時間帯から除かれる
      makeEntry({
        id: 'e-13',
        member_id: 'member-1',
        date: '2026-11-06',
        time_slot: '13',
        total: 25,
        connected: 12,
        recall: 6,
        owner: 4,
        prospect: 2,
        apo: 1,
      }),
      // 18時台（時間外）：総=25 でも8つの時間帯から除かれる
      makeEntry({
        id: 'e-18',
        member_id: 'member-1',
        date: '2026-11-06',
        time_slot: '18',
        total: 25,
        connected: 12,
        recall: 6,
        owner: 4,
        prospect: 2,
        apo: 1,
      }),
      // 日曜（非営業日）：数えない
      makeEntry({
        id: 'e-sun',
        member_id: 'member-1',
        date: '2026-11-08',
        time_slot: '9',
        total: 25,
        connected: 10,
        recall: 5,
        owner: 3,
        prospect: 2,
        apo: 1,
      }),
    ]

    it('9〜12時台・14〜17時台の8区分だけを営業日に数え、13時台や非営業日は数えない', () => {
      const res = calculateCallHoursAndUnmetSlots(
        entries,
        'member-1',
        '2026-11-01',
        '2026-11-08',
        target,
        ['2026-11-03'],
        [],
        17,
      )
      expect(res.totalCallHours).toBe(2)
      expect(res.totalUnmetSlots).toEqual({
        total: 7,
        connected: 7,
        recall: 7,
        owner: 7,
        prospect: 7,
        apo: 7,
      })
    })

    it('時間帯別で実率の目標を下回る時間帯を「弱い時間帯」とし、総が0の時間帯は除く', () => {
      const rows = aggregateByTimeSlot(
        entries,
        'member-1',
        '2026-11-06',
        '2026-11-06',
        target,
        '2026-11-06',
      )
      const slot9 = rows.find((r) => r.slotKey === '9')!
      const slot10 = rows.find((r) => r.slotKey === '10')!
      const slot11 = rows.find((r) => r.slotKey === '11')!

      expect(slot9.isWeak).toBe(false)
      expect(slot10.isWeak).toBe(true)
      expect(slot11.total).toBe(0)
      expect(slot11.isWeak).toBe(false)
    })
  })

  describe('チームの中の比べ (calculateTeamRankings)', () => {
    const entries: KpiEntryRow[] = [
      makeEntry({
        id: 'e-m1',
        member_id: 'member-1',
        date: '2026-11-06',
        total: 100,
        connected: 40,
        recall: 20,
        owner: 10,
        prospect: 5,
        apo: 5,
      }),
      makeEntry({
        id: 'e-la',
        member_id: 'leader-a',
        date: '2026-11-06',
        total: 100,
        connected: 40,
        recall: 20,
        owner: 10,
        prospect: 5,
        apo: 8,
      }),
    ]

    it('同じチームの現役メンバーでアポ数順位を出し、目標がない人は達成率順位から外し、退職者は順位を出さない', () => {
      const m1 = members.find((m) => m.id === 'member-1')!
      const ret1 = members.find((m) => m.id === 'retired-1')!
      const targets = [makeTarget({ member_id: 'member-1' })]

      const rankM1 = calculateTeamRankings({
        selectedMember: m1,
        members,
        affiliations,
        teams,
        approvedEntries: entries,
        targets,
        yearMonth: '2026-11',
        asOfDate: '2026-11-06',
        todayJst: '2026-11-09',
        holidays: ['2026-11-03', '2026-11-23'],
        workdays: [],
      })

      expect(rankM1).not.toBeNull()
      expect(rankM1!.activeMemberCount).toBe(2)
      expect(rankM1!.apoRank).toBe(2)
      expect(rankM1!.achievementRankedMemberCount).toBe(1)
      expect(rankM1!.apoAchievementRank).toBe(1)

      const rankRet = calculateTeamRankings({
        selectedMember: ret1,
        members,
        affiliations,
        teams,
        approvedEntries: entries,
        targets,
        yearMonth: '2026-11',
        asOfDate: '2026-11-06',
        todayJst: '2026-11-09',
        holidays: ['2026-11-03', '2026-11-23'],
        workdays: [],
      })
      expect(rankRet).toBeNull()
    })
  })

  describe('推移とタイムライン (buildKarteTrendData / buildKarteTimeline)', () => {
    it('2か月分の推移と指導日（ロープレ・部下メモ）を集計し、タイムラインで過去の記録（is_legacy）や空テーマでも崩れない', () => {
      const trend = buildKarteTrendData({
        memberId: 'member-1',
        approvedEntries: [
          makeEntry({
            id: 'e-oct',
            member_id: 'member-1',
            date: '2026-10-20',
            total: 90,
            connected: 30,
            recall: 10,
            owner: 8,
            prospect: 4,
            apo: 2,
          }),
          makeEntry({
            id: 'e-nov',
            member_id: 'member-1',
            date: '2026-11-06',
            total: 80,
            connected: 32,
            recall: 12,
            owner: 7,
            prospect: 3,
            apo: 1,
          }),
        ],
        roleplays: [
          {
            member_id: 'member-1',
            date: '2026-11-04',
            submitted_at: '2026-11-04T09:00:00Z',
            hidden_at: null,
          },
        ],
        memos: [
          {
            id: 'memo-1',
            date: '2026-11-05',
            submitted_at: '2026-11-05T09:00:00Z',
            hidden_at: null,
          },
        ],
        memoTargets: [
          {
            memo_id: 'memo-1',
            member_id: 'member-1',
            removed_at: null,
          },
        ],
        currentYearMonth: '2026-11',
      })

      expect(trend.points.map((p) => p.date)).toEqual([
        '2026-10-20',
        '2026-11-06',
      ])
      expect(trend.guidanceDates.map((g) => g.date)).toEqual([
        '2026-11-04',
        '2026-11-05',
      ])

      const timeline = buildKarteTimeline({
        memberId: 'member-1',
        isRetired: false,
        roleplays: [
          {
            id: 'rp-legacy',
            member_id: 'member-1',
            runner_member_id: 'leader-a',
            date: '2026-10-15',
            time_slot: '10',
            kind: 'apo',
            theme_id: null,
            used_talk_id: null,
            minutes: null,
            homework_result: null,
            repeat_count: 1,
            pass_result: 'o',
            next_homework: null,
            fixed_point: '声のトーンが良い',
            note: null,
            purpose: null,
            result_ap: null,
            result_rate: null,
            submitted_at: '2026-10-15T09:00:00Z',
            hidden_at: null,
            is_legacy: true,
            legacy_source: { sheet: '旧ロープレ記録', row: 12 },
          },
        ],
        roleplayThemes: [],
        seminars: [
          {
            id: 'sem-1',
            date: '2026-11-01',
            theme: '架空導入研修',
            lecturer: '架空リーダーA',
            minutes: 30,
            content: '基礎確認',
            created_by: 'leader-a',
            hidden_at: null,
          },
        ],
        seminarMembers: [
          {
            seminar_id: 'sem-1',
            member_id: 'member-1',
            removed_at: null,
          },
        ],
        memos: [
          {
            id: 'memo-1',
            created_by: 'leader-a',
            date: '2026-11-05',
            theme_id: null,
            kind_id: null,
            noticed: '16時台の実率が低下',
            guidance: '導入の15秒を確認',
            next_check_on: '2026-11-06',
            action_check: null,
            result_check: null,
            checked_on: null,
            training_id: null,
            is_legacy: false,
            legacy_source: null,
            submitted_at: '2026-11-05T09:00:00Z',
            hidden_at: null,
            created_at: '2026-11-05T09:00:00Z',
            updated_at: '2026-11-05T09:00:00Z',
          },
        ],
        memoTargets: [
          {
            memo_id: 'memo-1',
            member_id: 'member-1',
            removed_at: null,
          },
        ],
        memoMasters: [],
        members,
      })

      expect(timeline.map((t) => t.kind)).toEqual([
        'memo',
        'seminar',
        'roleplay',
      ])
      expect(timeline[2].isLegacy).toBe(true)
      expect(timeline[2].legacySource).toEqual({
        sheet: '旧ロープレ記録',
        row: 12,
      })
      expect(timeline[2].title).toContain('テーマ未設定')
    })

    it('アドレス（#/karte?member=...）の読み書き・設定値の欠落検知・DBエラー文言が正しく動く', () => {
      expect(parseMemberIdFromHash('#/karte?member=member-1')).toBe('member-1')
      expect(parseMemberIdFromHash('#/karte')).toBeNull()
      expect(buildKarteMemberHash('member-1')).toBe('#/karte?member=member-1')

      const emptySettings = parseKarteSettings([])
      expect(emptySettings.callHourThreshold).toBe(17)
      expect(emptySettings.holidays).toEqual([])
      expect(emptySettings.workdays).toEqual([])
      expect(emptySettings.missingKeys).toEqual([
        'kpi_holidays',
        'kpi_workdays',
        'karte_call_hour_threshold',
      ])

      expect(formatKarteDbError({ message: 'permission denied' })).toContain(
        'この操作はできません',
      )
    })

    it('filterApprovedKpiEntries：管理者でない場合（import_logsが0件）は何も外さず、管理者の場合は承認前（pending等）の分だけを外す', () => {
      const sampleEntries: KpiEntryRow[] = [
        makeEntry({
          id: 'e-approved',
          import_log_id: 'imp-approved',
          member_id: 'member-1',
          date: '2026-11-06',
          total: 50,
        }),
        makeEntry({
          id: 'e-pending',
          import_log_id: 'imp-pending',
          member_id: 'member-1',
          date: '2026-11-07',
          total: 60,
        }),
      ]

      // 管理者でない場合：import_logs は RLS で 0件になる → DBが既に承認済みだけ返しているため何も外さない
      const forNonAdmin = filterApprovedKpiEntries([sampleEntries[0]], [])
      expect(forNonAdmin.map((e) => e.id)).toEqual(['e-approved'])

      // 管理者の場合：読めた import_logs のうち status が approved でない記録（pending / replaced）の分だけ外す
      const forAdmin = filterApprovedKpiEntries(sampleEntries, [
        { id: 'imp-approved', status: 'approved' },
        { id: 'imp-pending', status: 'pending' },
      ])
      expect(forAdmin.map((e) => e.id)).toEqual(['e-approved'])
    })

    it('読む範囲の絞り込み（選んだ人と今のチームの人・2か月前の月の1日から）と、2,500行を3回に分けて全部読める .range() 共通関数', async () => {
      const m1 = members.find((m) => m.id === 'member-1')!
      const ret1 = members.find((m) => m.id === 'retired-1')!

      // 現役の member-1 を選んだときは、同じチームAの現役（member-1, leader-a）だけ（退職者やチームBは含まない）
      const scopedActive = resolveScopedMemberIdsForKarteKpi(
        m1,
        members,
        affiliations,
        '2026-11-09',
      )
      expect(scopedActive.sort()).toEqual(['leader-a', 'member-1'])

      // 退職者を選んだときは本人だけ
      const scopedRetired = resolveScopedMemberIdsForKarteKpi(
        ret1,
        members,
        affiliations,
        '2026-11-09',
      )
      expect(scopedRetired).toEqual(['retired-1'])

      // 2か月前の月の1日
      expect(getTwoMonthsAgoFirstDate('2026-11-09')).toBe('2026-09-01')
      expect(getTwoMonthsAgoFirstDate('2026-01-15')).toBe('2025-11-01')

      // 偽のクライアントで 2,500行を 1,000行ずつ3回に分けて全部読めること
      const totalRows = Array.from({ length: 2500 }, (_, i) => ({
        id: `row-${i + 1}`,
        index: i,
      }))
      const rangeCalls: Array<[number, number]> = []
      const fakeQuery = {
        range: async (from: number, to: number) => {
          rangeCalls.push([from, to])
          return {
            data: totalRows.slice(from, to + 1),
            error: null,
          }
        },
      }

      const loaded = await fetchAllRowsByRange(fakeQuery)
      expect(rangeCalls).toEqual([
        [0, 999],
        [1000, 1999],
        [2000, 2999],
      ])
      expect(loaded.length).toBe(2500)
      expect(loaded[0].id).toBe('row-1')
      expect(loaded[2499].id).toBe('row-2500')
    })
  })
})
