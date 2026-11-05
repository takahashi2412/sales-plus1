import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MemberAffiliationRow } from '../../src/foundation/types'
import {
  buildBusinessDaysContext,
  calculateKpiTargets,
  countBusinessDaysElapsed,
  decodeShiftJis,
  evaluateMemberAlertsForImport,
  formatDecimal1,
  formatKpiErrorMessage,
  getPreviousBusinessDayInMonth,
  parseKpiCsvBuffer,
  persistGeneratedAlertsAndMarkImportLog,
  resolveTargetValuesAtDate,
  validateCsvImport,
  type AlertsPersistenceClient,
  type AlertsPersistenceError,
  type CtiMemberMapRow,
  type CtiTeamMapRow,
  type GeneratedAlertDraft,
  type ImportLogRow,
  type KpiTargetRow,
} from '../../src/features/kpi/shared'

const FIXTURES_DIR = resolve(__dirname, '../../fixtures/kpi/sample-csv/tests')

function loadShiftJisFixture(fileName: string): Uint8Array {
  const buf = readFileSync(resolve(FIXTURES_DIR, fileName))
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

const baseMemberMaps: CtiMemberMapRow[] = [
  {
    id: 'map-leader-a',
    cti_name: 'CTI_リーダーA',
    member_id: 'member-leader-a',
    valid_from: '2025-04-01',
    valid_to: null,
    created_by: 'member-leader-b',
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'map-member-a',
    cti_name: 'CTI_メンバーA',
    member_id: 'member-a',
    valid_from: '2025-04-01',
    valid_to: null,
    created_by: 'member-leader-b',
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'map-member-b',
    cti_name: 'CTI_メンバーB',
    member_id: 'member-b',
    valid_from: '2025-06-01',
    valid_to: null,
    created_by: 'member-leader-b',
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'map-ignored',
    cti_name: 'CTI_取り込まない架空名',
    member_id: null,
    valid_from: '2025-04-01',
    valid_to: null,
    created_by: 'member-leader-b',
    created_at: '2026-10-01T00:00:00Z',
  },
]

const baseTeamMaps: CtiTeamMapRow[] = [
  {
    id: 'tmap-a',
    csv_team_name: '架空チームA(WEB)',
    team_id: 'team-a',
    valid_from: '2025-04-01',
    valid_to: null,
    created_by: 'member-leader-b',
    created_at: '2026-10-01T00:00:00Z',
  },
]

const baseAffiliations: MemberAffiliationRow[] = [
  {
    id: 'aff-1',
    member_id: 'member-leader-a',
    team_id: 'team-a',
    start_date: '2025-04-01',
    end_date: null,
  },
  {
    id: 'aff-2',
    member_id: 'member-a',
    team_id: 'team-a',
    start_date: '2025-04-01',
    end_date: null,
  },
  {
    id: 'aff-3',
    member_id: 'member-b',
    team_id: 'team-a',
    start_date: '2025-06-01',
    end_date: null,
  },
]

describe('KPI 共通ロジック：Shift_JIS CSV 読み込みと 5 つのチェック', () => {
  it('Shift_JIS の CSV ファイルを文字化けなく読み込み、5つのチェックをすべて通過する', () => {
    const fileName = '架空チームA(WEB)時間別20261106_20261106.csv'
    const bytes = loadShiftJisFixture(fileName)
    const text = decodeShiftJis(bytes)
    expect(text).toContain('期間：2026年11月06日～2026年11月06日')
    expect(text).toContain('CTI_リーダーA')

    const parsed = parseKpiCsvBuffer(bytes, fileName)
    expect(parsed.csvTeamName).toBe('架空チームA(WEB)')
    expect(parsed.targetDate).toBe('2026-11-06')
    expect(parsed.personRows).toHaveLength(4)
    expect(parsed.totalRowDaily).toEqual({
      total: 480,
      connected: 192,
      recall: 48,
      owner: 64,
      prospect: 19,
      apo: 6,
    })

    const check = validateCsvImport({
      parsed,
      memberMaps: baseMemberMaps,
      teamMaps: baseTeamMaps,
      affiliations: baseAffiliations,
      existingLogsOnDate: [],
      approvedMemberIdsOnDate: [],
    })

    expect(check.check1SingleDay).toBe(true)
    expect(check.check2HeaderMatch).toBe(true)
    expect(check.check3AllNamesMapped).toBe(true)
    expect(check.unmappedNames).toEqual([])
    expect(check.overlappingMapNames).toEqual([])
    expect(check.check4TotalsMatch).toBe(true)
    expect(check.check5ExistingImport).toBeNull()
    expect(check.teamMismatchWarnings).toEqual([])
    expect(check.canImport).toBe(true)
    expect(check.canApproveAfterImport).toBe(true)

    // 取り込まない名前（member_id = null）は ignored と判定され、合計チェックには含まれている
    const ignoredRow = check.memberResolutions.find((r) => r.ctiName === 'CTI_取り込まない架空名')
    expect(ignoredRow?.status).toBe('ignored')
  })

  it('チェック①：2日以上の期間またはファイル名と期間の日付不一致を検出する', () => {
    const fileName = '架空チームA(WEB)時間別20261105_20261106.csv'
    const parsed = parseKpiCsvBuffer(loadShiftJisFixture(fileName), fileName)

    const check = validateCsvImport({
      parsed,
      memberMaps: baseMemberMaps,
      teamMaps: baseTeamMaps,
      affiliations: baseAffiliations,
      existingLogsOnDate: [],
    })

    expect(check.check1SingleDay).toBe(false)
    expect(check.canImport).toBe(false)
    expect(check.check1Error).toContain('1日だけではありません')
  })

  it('チェック②：2〜3行目の時間帯・項目名の並びが違う CSV を検出する', () => {
    const fileName = '異常ヘッダ_架空チームA(WEB)時間別20261106_20261106.csv'
    const parsed = parseKpiCsvBuffer(loadShiftJisFixture(fileName), fileName)

    const check = validateCsvImport({
      parsed,
      memberMaps: baseMemberMaps,
      teamMaps: baseTeamMaps,
      affiliations: baseAffiliations,
      existingLogsOnDate: [],
    })

    expect(check.check2HeaderMatch).toBe(false)
    expect(check.canImport).toBe(false)
    expect(check.check2Errors.length).toBeGreaterThan(0)
  })

  it('チェック③：未対応のCTI名・有効期間重複・月途中の異動による所属不一致の警告を判定する', () => {
    const fileName = '架空チームA(WEB)時間別20261106_20261106.csv'
    const parsed = parseKpiCsvBuffer(loadShiftJisFixture(fileName), fileName)

    // CTI_メンバーB を未登録にし、CTI_メンバーA に重複する対応表を与え、リーダーA を別チーム所属にする
    const customMaps: CtiMemberMapRow[] = [
      baseMemberMaps[0],
      baseMemberMaps[1],
      {
        id: 'map-member-a-dup',
        cti_name: 'CTI_メンバーA',
        member_id: 'member-a',
        valid_from: '2026-11-01',
        valid_to: null,
        created_by: 'member-leader-b',
        created_at: '2026-11-01T00:00:00Z',
      },
      baseMemberMaps[3],
    ]

    const transferredAffiliations: MemberAffiliationRow[] = [
      {
        id: 'aff-1-old',
        member_id: 'member-leader-a',
        team_id: 'team-a',
        start_date: '2025-04-01',
        end_date: '2026-11-03',
      },
      {
        id: 'aff-1-new',
        member_id: 'member-leader-a',
        team_id: 'team-b',
        start_date: '2026-11-04',
        end_date: null,
      },
      baseAffiliations[1],
    ]

    const check = validateCsvImport({
      parsed,
      memberMaps: customMaps,
      teamMaps: baseTeamMaps,
      affiliations: transferredAffiliations,
      existingLogsOnDate: [],
    })

    expect(check.unmappedNames).toEqual(['CTI_メンバーB'])
    expect(check.overlappingMapNames).toEqual(['CTI_メンバーA'])
    expect(check.teamMismatchWarnings).toHaveLength(1)
    expect(check.teamMismatchWarnings[0].memberId).toBe('member-leader-a')
    expect(check.teamMismatchWarnings[0].memberCurrentTeamId).toBe('team-b')
    expect(check.canImport).toBe(false)
  })

  it('チェック④・⑤：合計行の不一致および同日・同CSVチーム名の既存取り込み、同日の他チーム承認済み重複を検出する', () => {
    const fileName = '架空チームA(WEB)時間別20261106_20261106_合計不一致.csv'
    const parsed = parseKpiCsvBuffer(loadShiftJisFixture(fileName), fileName)

    const existingLog: ImportLogRow = {
      id: 'log-existing',
      target_date: '2026-11-06',
      csv_team_name: '架空チームA(WEB)',
      team_id: 'team-a',
      file_name: fileName,
      row_count: 3,
      error_count: 0,
      totals_match: true,
      notes: null,
      status: 'approved',
      imported_by: 'member-leader-b',
      imported_at: '2026-11-06T09:00:00Z',
      approved_by: 'member-leader-b',
      approved_at: '2026-11-06T09:05:00Z',
      approval_kind: 'manual',
      replaced_at: null,
      alerts_created_at: '2026-11-06T09:05:01Z',
      alert_count: 2,
    }

    const check = validateCsvImport({
      parsed,
      memberMaps: baseMemberMaps,
      teamMaps: baseTeamMaps,
      affiliations: baseAffiliations,
      existingLogsOnDate: [existingLog],
      approvedMemberIdsOnDate: ['member-a'],
    })

    expect(check.check4TotalsMatch).toBe(false)
    expect(check.check5ExistingImport?.id).toBe('log-existing')
    expect(check.duplicateApprovedMemberIds).toEqual(['member-a'])
    expect(check.canImport).toBe(false)
    expect(check.canApproveAfterImport).toBe(false)
  })
})

describe('KPI 共通ロジック：目標の逆算（営業に出る人／出ない人）', () => {
  it('営業に出る人（goes_to_sales = true）の逆算：320P ÷ 40P = 8件、÷ 80% = 10件、÷ 25% = 40件、÷ 80% = 50件', () => {
    const calc = calculateKpiTargets(true, {
      target_profit: 320,
      unit_price: 40,
      completion_rate: 80,
      rate_order: 25,
      apo_target: null,
      working_days: 20,
      call_hours: 5,
      term: 20, // 日次総 = 100、月次総 = 2000
      rate_connected: 40,
      rate_recall: 30,
      rate_owner: 25, // 月次オ = 500
      rate_prospect: 5,
      rate_apo_owner: 10, // 行動月次アポ = 2000 * 25% * 10% = 50
      rate_adoption: 80,
    })

    expect(calc.deals).toBeCloseTo(8, 6)
    expect(calc.ordersKgi).toBeCloseTo(10, 6)
    expect(calc.adoptions).toBeCloseTo(40, 6)
    expect(calc.monthlyApo).toBeCloseTo(50, 6)
    expect(calc.dailyTotal).toBe(100)
    expect(calc.monthlyTotal).toBe(2000)
    expect(calc.actionMonthlyApo).toBeCloseTo(50, 6)
    expect(calc.apoMismatch).toBe(false)
    expect(formatDecimal1(calc.monthlyApo)).toBe('50')

    // 行動から出るアポ数がア（月次）と合わないとき
    const mismatchCalc = calculateKpiTargets(true, {
      target_profit: 320,
      unit_price: 40,
      completion_rate: 80,
      rate_order: 25,
      apo_target: null,
      working_days: 20,
      call_hours: 5,
      term: 20,
      rate_connected: 40,
      rate_recall: 30,
      rate_owner: 20, // 2000 * 20% * 10% = 40 ≠ 50
      rate_prospect: 5,
      rate_apo_owner: 10,
      rate_adoption: 80,
    })
    expect(mismatchCalc.apoMismatch).toBe(true)
    expect(mismatchCalc.apoDiff).toBeCloseTo(-10, 6)
  })

  it('営業に出ない人（goes_to_sales = false）の目標アポ数と採用数を計算する', () => {
    const calc = calculateKpiTargets(false, {
      target_profit: null,
      unit_price: null,
      completion_rate: null,
      rate_order: null,
      apo_target: 30,
      working_days: 20,
      call_hours: 5,
      term: 20,
      rate_connected: 40,
      rate_recall: 30,
      rate_owner: 15,
      rate_prospect: 4,
      rate_apo_owner: 10, // 2000 * 15% * 10% = 30
      rate_adoption: 80,
    })

    expect(calc.deals).toBeNull()
    expect(calc.ordersKgi).toBeNull()
    expect(calc.monthlyApo).toBe(30)
    expect(calc.adoptions).toBeCloseTo(24, 6)
    expect(calc.actionMonthlyApo).toBeCloseTo(30, 6)
    expect(calc.apoMismatch).toBe(false)
  })
})

describe('KPI 共通ロジック：営業日数・日ごと未達・月ペース未達・履歴の目標値参照', () => {
  it('土日と kpi_holidays を除いた営業日数、月またぎ、および kpi_holidays 未設定時の案内フラグを返す', () => {
    // 2026年11月：全30日、土日9日 → 平日21日。うち 11/3 と 11/23 を休日にすると 19営業日
    const ctx = buildBusinessDaysContext('2026-11-04', ['2026-10-12', '2026-11-03', '2026-11-23'])
    expect(ctx.holidaysConfigured).toBe(true)
    expect(ctx.totalBusinessDays).toBe(19)
    // 11/1(日), 11/2(月:1), 11/3(祝), 11/4(水:2)
    expect(countBusinessDaysElapsed('2026-11-04', ctx.businessDaysInMonth)).toBe(2)
    expect(getPreviousBusinessDayInMonth('2026-11-04', ctx.businessDaysInMonth)).toBe('2026-11-02')
    // 月またぎ：11月の最初の営業日（11/2）の前の営業日は月内にないため null
    expect(getPreviousBusinessDayInMonth('2026-11-02', ctx.businessDaysInMonth)).toBeNull()

    // 2026年10月：全31日、土日9日 → 平日22日。うち 10/12 を休日にすると 21営業日
    const octCtx = buildBusinessDaysContext('2026-10-30', ['2026-10-12', '2026-11-03', '2026-11-23'])
    expect(octCtx.totalBusinessDays).toBe(21)

    const unconfigured = buildBusinessDaysContext('2026-11-04', null)
    expect(unconfigured.holidaysConfigured).toBe(false)
    expect(unconfigured.totalBusinessDays).toBe(21)
  })

  it('日ごとの未達判定：休み（総が0の日）は出さず、オが0の日はア/オを判定しない', () => {
    const monthlyTarget: KpiTargetRow = {
      id: 'target-1',
      member_id: 'member-a',
      month: '2026-11-01',
      goes_to_sales: false,
      target_profit: null,
      unit_price: null,
      completion_rate: null,
      rate_order: null,
      apo_target: 18,
      working_days: 18,
      call_hours: 5,
      term: 20, // 日次総=100, 実=40, オ=15, ア/オ=10%
      rate_connected: 40,
      rate_recall: 30,
      rate_owner: 15,
      rate_prospect: 4,
      rate_apo_owner: 10,
      rate_adoption: 80,
      history: [],
      revised_at: null,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    }
    const holidays = ['2026-11-03', '2026-11-23']

    // 総が 0 の日（休み）：日ごとの未達は出ない（月のペースのみ出る）
    const dayOffAlerts = evaluateMemberAlertsForImport({
      importLogId: 'log-1',
      memberId: 'member-a',
      targetDate: '2026-11-02',
      holidays,
      monthlyTarget,
      approvedMonthEntries: [
        { date: '2026-11-02', total: 0, connected: 0, recall: 0, owner: 0, prospect: 0, apo: 0 },
      ],
    })
    expect(dayOffAlerts.filter((a) => a.compare === 'daily')).toEqual([])

    // オが 0 の日（総 80, 実 30, オ 0）：total, connected, owner は日ごと未達、apo_owner は判定しない
    const zeroOwnerAlerts = evaluateMemberAlertsForImport({
      importLogId: 'log-2',
      memberId: 'member-a',
      targetDate: '2026-11-02',
      holidays,
      monthlyTarget,
      approvedMonthEntries: [
        { date: '2026-11-02', total: 80, connected: 30, recall: 10, owner: 0, prospect: 0, apo: 0 },
      ],
    })
    const dailyItems = zeroOwnerAlerts.filter((a) => a.compare === 'daily').map((a) => a.item)
    expect(dailyItems).toEqual(['total', 'connected', 'owner'])
  })

  it('月のペースの未達判定：新しく遅れた日だけ needs_response = true になり、翌営業日も続いていれば false になる', () => {
    const monthlyTarget: KpiTargetRow = {
      id: 'target-pace',
      member_id: 'member-a',
      month: '2026-11-01',
      goes_to_sales: false,
      target_profit: null,
      unit_price: null,
      completion_rate: null,
      rate_order: null,
      apo_target: 18, // 18営業日なら1営業日あたり1件
      working_days: 18,
      call_hours: 5,
      term: 20, // 日次総=100、月次総=1800（1営業日あたり100）
      rate_connected: 40,
      rate_recall: 30,
      rate_owner: 15,
      rate_prospect: 4,
      rate_apo_owner: 10,
      rate_adoption: 80,
      history: [],
      revised_at: null,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    }
    const holidays = ['2026-11-03', '2026-11-23']

    // 11/2（第1営業日）：順調（total 100, connected 40, owner 15, apo 2）
    // 11/4（第2営業日）：失速（total 60 → 累計 160 < 200 で新しく遅れ）
    const day2Alerts = evaluateMemberAlertsForImport({
      importLogId: 'log-d2',
      memberId: 'member-a',
      targetDate: '2026-11-04',
      holidays,
      monthlyTarget,
      approvedMonthEntries: [
        { date: '2026-11-02', total: 100, connected: 40, recall: 30, owner: 15, prospect: 4, apo: 2 },
        { date: '2026-11-04', total: 60, connected: 40, recall: 20, owner: 15, prospect: 4, apo: 1 },
      ],
    })

    const day2PaceTotal = day2Alerts.find((a) => a.compare === 'pace' && a.item === 'total')
    expect(day2PaceTotal).toBeDefined()
    expect(day2PaceTotal?.needs_response).toBe(true)

    // 11/5（第3営業日）：当日100件架電しても累計 260 < 300 で遅れが継続 → needs_response = false
    const day3Alerts = evaluateMemberAlertsForImport({
      importLogId: 'log-d3',
      memberId: 'member-a',
      targetDate: '2026-11-05',
      holidays,
      monthlyTarget,
      approvedMonthEntries: [
        { date: '2026-11-02', total: 100, connected: 40, recall: 30, owner: 15, prospect: 4, apo: 2 },
        { date: '2026-11-04', total: 60, connected: 40, recall: 20, owner: 15, prospect: 4, apo: 1 },
        { date: '2026-11-05', total: 100, connected: 40, recall: 30, owner: 15, prospect: 4, apo: 1 },
      ],
    })

    const day3PaceTotal = day3Alerts.find((a) => a.compare === 'pace' && a.item === 'total')
    expect(day3PaceTotal).toBeDefined()
    expect(day3PaceTotal?.needs_response).toBe(false)
  })

  it('月途中に目標が修正された場合、history から対象日の終わり時点の目標値を取り出して判定する', () => {
    const targetRow: KpiTargetRow = {
      id: 'target-hist',
      member_id: 'member-a',
      month: '2026-11-01',
      goes_to_sales: false,
      target_profit: null,
      unit_price: null,
      completion_rate: null,
      rate_order: null,
      apo_target: 20,
      working_days: 19,
      call_hours: 4, // 11/5 に 5時間 → 4時間へ引き下げ
      term: 20,
      rate_connected: 40,
      rate_recall: 30,
      rate_owner: 15,
      rate_prospect: 4,
      rate_apo_owner: 10,
      rate_adoption: 80,
      revised_at: '2026-11-05T02:00:00Z',
      history: [
        {
          changed_at: '2026-11-05T02:00:00Z',
          values: {
            target_profit: null,
            unit_price: null,
            completion_rate: null,
            rate_order: null,
            apo_target: 20,
            working_days: 19,
            call_hours: 5,
            term: 20,
            rate_connected: 40,
            rate_recall: 30,
            rate_owner: 15,
            rate_prospect: 4,
            rate_apo_owner: 10,
            rate_adoption: 80,
          },
        },
      ],
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-05T02:00:00Z',
    }

    const valuesOnNov4 = resolveTargetValuesAtDate(targetRow, '2026-11-04')
    expect(valuesOnNov4.call_hours).toBe(5)

    const valuesOnNov5 = resolveTargetValuesAtDate(targetRow, '2026-11-05')
    expect(valuesOnNov5.call_hours).toBe(4)
  })

  it('その月の目標が未入力（kpi_targets なし）のとき target_missing を1件出し、月内の初回日のみ needs_response = true にする', () => {
    const firstDayAlerts = evaluateMemberAlertsForImport({
      importLogId: 'log-m1',
      memberId: 'member-no-target',
      targetDate: '2026-11-02',
      holidays: [],
      monthlyTarget: null,
      approvedMonthEntries: [
        { date: '2026-11-02', total: 100, connected: 40, recall: 30, owner: 15, prospect: 4, apo: 2 },
      ],
    })

    expect(firstDayAlerts).toEqual([
      {
        import_log_id: 'log-m1',
        member_id: 'member-no-target',
        date: '2026-11-02',
        compare: 'daily',
        item: 'target_missing',
        target: null,
        actual: null,
        needs_response: true,
      },
    ])

    const secondDayAlerts = evaluateMemberAlertsForImport({
      importLogId: 'log-m2',
      memberId: 'member-no-target',
      targetDate: '2026-11-04',
      holidays: [],
      monthlyTarget: null,
      approvedMonthEntries: [
        { date: '2026-11-02', total: 100, connected: 40, recall: 30, owner: 15, prospect: 4, apo: 2 },
        { date: '2026-11-04', total: 100, connected: 40, recall: 30, owner: 15, prospect: 4, apo: 2 },
      ],
    })

    expect(secondDayAlerts).toHaveLength(1)
    expect(secondDayAlerts[0].item).toBe('target_missing')
    expect(secondDayAlerts[0].needs_response).toBe(false)
  })

  it('未達の書き込み（persistGeneratedAlertsAndMarkImportLog）：偽クライアントで成功・23505（一意違反）・他エラーの3通りを検証する', async () => {
    const sampleDrafts: GeneratedAlertDraft[] = [
      {
        import_log_id: 'log-100',
        member_id: 'member-a',
        date: '2026-11-06',
        compare: 'daily',
        item: 'total',
        target: 100,
        actual: 80,
        needs_response: true,
      },
    ]

    function createFakeClient(insertError: AlertsPersistenceError | null) {
      const insertedBatches: GeneratedAlertDraft[][] = []
      const updatedLogs: Array<{
        id: string
        values: { alerts_created_at: string; alert_count: number }
      }> = []

      const client: AlertsPersistenceClient = {
        from(table: 'alerts' | 'import_logs') {
          if (table === 'alerts') {
            return {
              async insert(values: GeneratedAlertDraft[]) {
                insertedBatches.push(values)
                return { error: insertError }
              },
            }
          }
          return {
            update(values: { alerts_created_at: string; alert_count: number }) {
              return {
                async eq(_col: 'id', id: string) {
                  updatedLogs.push({ id, values })
                  return { error: null }
                },
              }
            },
          }
        },
      } as AlertsPersistenceClient

      return { client, insertedBatches, updatedLogs }
    }

    // 1. 成功：alerts に .insert(drafts) で1回まとめて入り、import_logs の alerts_created_at と alert_count が更新される
    const case1 = createFakeClient(null)
    const res1 = await persistGeneratedAlertsAndMarkImportLog(
      case1.client,
      'log-100',
      sampleDrafts,
      '2026-11-06T10:00:00Z',
    )
    expect(res1).toEqual({ alertCount: 1, alreadyExisted: false })
    expect(case1.insertedBatches).toEqual([sampleDrafts])
    expect(case1.updatedLogs).toEqual([
      {
        id: 'log-100',
        values: { alerts_created_at: '2026-11-06T10:00:00Z', alert_count: 1 },
      },
    ])

    // 2. 23505（一意違反）：前に入れ終えていたものとして扱い、import_logs の更新まで進む
    const case2 = createFakeClient({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    })
    const res2 = await persistGeneratedAlertsAndMarkImportLog(
      case2.client,
      'log-100',
      sampleDrafts,
      '2026-11-06T10:05:00Z',
    )
    expect(res2).toEqual({ alertCount: 1, alreadyExisted: true })
    expect(case2.insertedBatches).toHaveLength(1)
    expect(case2.updatedLogs).toEqual([
      {
        id: 'log-100',
        values: { alerts_created_at: '2026-11-06T10:05:00Z', alert_count: 1 },
      },
    ])

    // 3. ほかのエラー（例：42501 など）：止めてエラーを投げ、import_logs は更新しない
    const otherError: AlertsPersistenceError = {
      code: '42501',
      message: 'new row violates row-level security policy for table "alerts"',
    }
    const case3 = createFakeClient(otherError)
    await expect(
      persistGeneratedAlertsAndMarkImportLog(
        case3.client,
        'log-100',
        sampleDrafts,
        '2026-11-06T10:10:00Z',
      ),
    ).rejects.toEqual(otherError)
    expect(case3.updatedLogs).toEqual([])
    expect(formatKpiErrorMessage('未達の出し直しに失敗しました', otherError)).toBe(
      '未達の出し直しに失敗しました（理由：new row violates row-level security policy for table "alerts"）',
    )
  })
})
