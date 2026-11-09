import {
  getTodayJstDateString,
  isActivePeriod,
} from '../../../foundation/directory'
import type {
  MemberAffiliationRow,
  MemberRow,
  TeamRow,
} from '../../../foundation/types'
import {
  resolveCurrentTeamId,
  type ViewerContext,
} from '../../../foundation/viewer'
import { calculateShouldBe } from '../../kpi/shared/alerts'
import {
  getMonthFirstDate,
  isBusinessDay,
  listBusinessDaysInMonth,
} from '../../kpi/shared/businessDays'
import {
  calculateKpiTargets,
  formatDecimal1,
  resolveTargetValuesAtDate,
} from '../../kpi/shared/targets'
import {
  CSV_TIME_SLOT_HEADERS,
  KPI_TIME_SLOTS,
  type ImportLogRow,
  type KpiEntryRow,
  type KpiSlotMetrics,
  type KpiTargetRow,
  type KpiTimeSlot,
} from '../../kpi/shared/types'
import { formatMemoCheckLabel } from '../../memo/memo-logic'
import {
  JUDGE_MARK_LABELS,
  ROLEPLAY_KIND_LABELS,
} from '../../roleplay/shared/types'
import type {
  BuildKarteTimelineInput,
  KarteDailyCallHoursSummary,
  KarteGuidanceDateMark,
  KarteKpiAggregation,
  KarteKpiMetricKey,
  KarteMetricEvaluation,
  KartePeriod,
  KartePeriodCallHoursSummary,
  KarteRateEvaluation,
  KarteRateMetricKey,
  KarteTargetEvaluationResult,
  KarteTeamRankingResult,
  KarteTimelineFilter,
  KarteTimelineItem,
  KarteTimeSlotRow,
  KarteTrendData,
  KarteTrendDayPoint,
  KarteUnmetSlotCounts,
  SelectableKarteMember,
} from './types'

export const KARTE_CALL_HOUR_SLOTS: readonly KpiTimeSlot[] = [
  '9',
  '10',
  '11',
  '12',
  '14',
  '15',
  '16',
  '17',
]

export const DEFAULT_KARTE_CALL_HOUR_THRESHOLD = 17

export const KARTE_KPI_METRICS: ReadonlyArray<{
  key: KarteKpiMetricKey
  label: string
}> = [
  { key: 'total', label: '総' },
  { key: 'connected', label: '実' },
  { key: 'recall', label: '再' },
  { key: 'owner', label: 'オ' },
  { key: 'prospect', label: '見' },
  { key: 'apo', label: 'ア' },
]

export const KARTE_RATE_METRICS: ReadonlyArray<{
  key: KarteRateMetricKey
  label: string
}> = [
  { key: 'rate_connected', label: '実率' },
  { key: 'rate_recall', label: '再率' },
  { key: 'rate_owner', label: 'オ率' },
  { key: 'rate_prospect', label: '見率' },
  { key: 'rate_apo_owner', label: 'ア/オ' },
]

/**
 * メンバーが退職しているかどうかを判定する（退職日が今日より前）
 */
export function isMemberRetired(
  member: MemberRow,
  todayJst: string = getTodayJstDateString(),
): boolean {
  return member.retired_on !== null && member.retired_on < todayJst
}

/**
 * 所属の履歴のうち開始日がいちばん新しい行を返す（退職した人の「最後のチーム・拠点」判定用）
 */
export function resolveLastAffiliation(
  memberId: string,
  affiliations: MemberAffiliationRow[],
): MemberAffiliationRow | null {
  const memberAffs = affiliations
    .filter((a) => a.member_id === memberId)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
  return memberAffs[0] ?? null
}

/**
 * 所属の履歴のうち開始日がいちばん新しい行のチームを返す（退職した人の「最後のチーム」判定用）
 */
export function resolveLastTeamId(
  memberId: string,
  affiliations: MemberAffiliationRow[],
): string | null {
  return resolveLastAffiliation(memberId, affiliations)?.team_id ?? null
}

/**
 * 現役の人は今のチーム、退職した人は所属履歴で開始日がいちばん新しい「最後のチーム」を返す
 */
export function resolveMemberSupervisionTeamId(
  member: MemberRow,
  affiliations: MemberAffiliationRow[],
  todayJst: string = getTodayJstDateString(),
): string | null {
  if (isMemberRetired(member, todayJst)) {
    return resolveLastTeamId(member.id, affiliations)
  }
  return resolveCurrentTeamId(member.id, affiliations, todayJst)
}

/**
 * メンバーの拠点（現役の人は今の所属の拠点、退職した人は最後の所属の拠点）を返す
 */
export function resolveMemberBase(
  member: MemberRow,
  affiliations: MemberAffiliationRow[],
  todayJst: string = getTodayJstDateString(),
): string {
  if (isMemberRetired(member, todayJst)) {
    return resolveLastAffiliation(member.id, affiliations)?.base || '未設定'
  }
  const active = affiliations
    .filter(
      (a) =>
        a.member_id === member.id &&
        isActivePeriod(a.start_date, a.end_date, todayJst),
    )
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
  return active[0]?.base || '未設定'
}

/**
 * 見る人が対象のメンバーをカルテで選べるかを判定する（自分自身は選べない）
 */
export function canSelectMemberForKarte(
  viewer: ViewerContext,
  member: MemberRow,
  affiliations: MemberAffiliationRow[],
  todayJst: string = getTodayJstDateString(),
): boolean {
  if (member.id === viewer.memberId) {
    return false
  }
  if (viewer.role === 'ceo') {
    return true
  }
  const supervisionTeamId = resolveMemberSupervisionTeamId(
    member,
    affiliations,
    todayJst,
  )
  if (!supervisionTeamId) {
    return false
  }
  if (viewer.role === 'leader') {
    return viewer.teamId !== null && supervisionTeamId === viewer.teamId
  }
  if (viewer.role === 'mgr') {
    return viewer.mgrTeamIds.includes(supervisionTeamId)
  }
  return false
}

/**
 * カルテで選べる人の一覧を計算する（チームごと・名前順）
 */
export function pickSelectableKarteMembers(
  viewer: ViewerContext,
  members: MemberRow[],
  affiliations: MemberAffiliationRow[],
  teams: TeamRow[],
  todayJst: string = getTodayJstDateString(),
): SelectableKarteMember[] {
  const teamMap = new Map<string, string>(teams.map((t) => [t.id, t.name]))

  const activeLeadersByTeam = new Map<string, string[]>()
  for (const m of members) {
    if (m.role !== 'leader' || isMemberRetired(m, todayJst)) continue
    const tId = resolveCurrentTeamId(m.id, affiliations, todayJst)
    if (!tId) continue
    const list = activeLeadersByTeam.get(tId) ?? []
    list.push(m.name)
    activeLeadersByTeam.set(tId, list)
  }
  for (const [tId, list] of activeLeadersByTeam.entries()) {
    activeLeadersByTeam.set(
      tId,
      [...list].sort((a, b) => a.localeCompare(b, 'ja')),
    )
  }

  const selectable: SelectableKarteMember[] = []
  for (const member of members) {
    if (!canSelectMemberForKarte(viewer, member, affiliations, todayJst)) {
      continue
    }
    const isRetired = isMemberRetired(member, todayJst)
    const teamId = resolveMemberSupervisionTeamId(
      member,
      affiliations,
      todayJst,
    )
    const teamName = teamId ? (teamMap.get(teamId) ?? '所属なし') : '所属なし'
    const base = resolveMemberBase(member, affiliations, todayJst)
    const leaderNames = teamId ? (activeLeadersByTeam.get(teamId) ?? []) : []

    selectable.push({
      member,
      isRetired,
      teamId,
      teamName,
      base,
      leaderNames,
    })
  }

  selectable.sort((a, b) => {
    if (a.teamId === null && b.teamId !== null) return 1
    if (a.teamId !== null && b.teamId === null) return -1
    const teamCmp = a.teamName.localeCompare(b.teamName, 'ja')
    if (teamCmp !== 0) return teamCmp
    return a.member.name.localeCompare(b.member.name, 'ja')
  })

  return selectable
}

/**
 * カルテを最初に開いたとき（または対象メンバーを切り替えたとき）の「対象の月」（YYYY-MM）を返す。
 * - 退職した人を選んだときは、退職日の月（retired_on の YYYY-MM）
 * - 現役の人を選んだとき（または未選択のとき）は、今月（todayJst の YYYY-MM）
 */
export function resolveInitialKarteYearMonth(
  member: Pick<MemberRow, 'retired_on'> | null | undefined,
  todayJst: string = getTodayJstDateString(),
): string {
  const currentYm = todayJst.slice(0, 7)
  if (!member) {
    return currentYm
  }
  if (
    member.retired_on !== null &&
    member.retired_on < todayJst &&
    /^\d{4}-\d{2}/.test(member.retired_on)
  ) {
    return member.retired_on.slice(0, 7)
  }
  return currentYm
}

/**
 * 基準の日：その人のその月の、承認済みの日々のKPIがある最後の日を返す
 */
export function resolveKarteAsOfDate(
  approvedEntries: KpiEntryRow[],
  memberId: string,
  yearMonth: string,
): string | null {
  const ym = yearMonth.slice(0, 7)
  let latest: string | null = null
  for (const entry of approvedEntries) {
    if (entry.member_id !== memberId) continue
    if (!entry.date.startsWith(ym)) continue
    if (latest === null || entry.date > latest) {
      latest = entry.date
    }
  }
  return latest
}

/**
 * 基準の日の見出し文言を作る（例：「11月6日までの数字」／ないときは「今月の数字はまだありません」）
 */
export function formatKarteAsOfDateLabel(asOfDate: string | null): string {
  if (!asOfDate) {
    return '今月の数字はまだありません'
  }
  const parts = asOfDate.split('-')
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (!Number.isFinite(month) || !Number.isFinite(day)) {
    return `${asOfDate}までの数字`
  }
  return `${month}月${day}日までの数字`
}

/**
 * 指定した日付（YYYY-MM-DD）を含む週の月曜日の日付（YYYY-MM-DD）を返す
 */
export function getMondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  const dayOfWeek = utc.getUTCDay()
  const diffFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  utc.setUTCDate(utc.getUTCDate() - diffFromMonday)
  const ry = utc.getUTCFullYear()
  const rm = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const rd = String(utc.getUTCDate()).padStart(2, '0')
  return `${ry}-${rm}-${rd}`
}

/**
 * 基準の日と期間区分（今日・今週・今月）から集計期間 [startDate, endDate] を返す
 */
export function resolveKartePeriodRange(
  asOfDate: string,
  period: KartePeriod,
): { startDate: string; endDate: string } {
  if (period === 'today') {
    return { startDate: asOfDate, endDate: asOfDate }
  }
  if (period === 'week') {
    return { startDate: getMondayOfWeek(asOfDate), endDate: asOfDate }
  }
  return { startDate: getMonthFirstDate(asOfDate), endDate: asOfDate }
}

/**
 * 2つの日付 [startDate, endDate] の間のすべての日付（YYYY-MM-DD）を返す
 */
export function listDatesBetween(startDate: string, endDate: string): string[] {
  if (startDate > endDate) return []
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const cur = new Date(Date.UTC(sy, sm - 1, sd))
  const end = new Date(Date.UTC(ey, em - 1, ed))
  const dates: string[] = []
  while (cur.getTime() <= end.getTime()) {
    const y = cur.getUTCFullYear()
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0')
    const d = String(cur.getUTCDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

/**
 * 期間 [startDate, endDate] に含まれる営業日の数を数える
 */
export function countBusinessDaysInRange(
  startDate: string,
  endDate: string,
  holidays: string[],
  workdays: string[],
): number {
  const dates = listDatesBetween(startDate, endDate)
  return dates.filter((d) => isBusinessDay(d, holidays, workdays)).length
}

/**
 * 期間ごとの KPI 実績合計と率を計算する
 */
export function aggregateKpiForPeriod(
  approvedEntries: KpiEntryRow[],
  memberId: string,
  asOfDate: string,
  period: KartePeriod,
): KarteKpiAggregation {
  const { startDate, endDate } = resolveKartePeriodRange(asOfDate, period)
  let total = 0
  let connected = 0
  let recall = 0
  let owner = 0
  let prospect = 0
  let apo = 0

  for (const entry of approvedEntries) {
    if (entry.member_id !== memberId) continue
    if (entry.date < startDate || entry.date > endDate) continue
    total += entry.total
    connected += entry.connected
    recall += entry.recall
    owner += entry.owner
    prospect += entry.prospect
    apo += entry.apo
  }

  return {
    period,
    startDate,
    endDate,
    total,
    connected,
    recall,
    owner,
    prospect,
    apo,
    rateConnected: total > 0 ? (connected / total) * 100 : null,
    rateRecall: total > 0 ? (recall / total) * 100 : null,
    rateOwner: total > 0 ? (owner / total) * 100 : null,
    rateProspect: total > 0 ? (prospect / total) * 100 : null,
    rateApoOwner: owner > 0 ? (apo / owner) * 100 : null,
  }
}

/**
 * 率の表示文字列（分母が0で null のときは「－」）
 */
export function formatKarteRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) {
    return '－'
  }
  return `${formatDecimal1(rate)}%`
}

/**
 * あるべき比と▲▼の表示文字列を作る（未達は赤にせず黒字＋▼＋「未達」）
 */
export function formatRatioAndDiff(
  ratioPercent: number | null,
  diff: number | null,
  unit = '',
): string {
  if (ratioPercent === null || diff === null || !Number.isFinite(ratioPercent)) {
    return '－'
  }
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '▲'
  const statusSuffix = diff < 0 ? '（未達）' : ''
  const diffAbs = formatDecimal1(Math.abs(diff))
  return `${formatDecimal1(ratioPercent)}%（${arrow}${diffAbs}${unit}）${statusSuffix}`
}

/**
 * 率の目標との差（▲▼）の表示文字列を作る
 */
export function formatRateDiff(diffPoints: number | null): string {
  if (diffPoints === null || !Number.isFinite(diffPoints)) {
    return '－'
  }
  const arrow = diffPoints > 0 ? '▲' : diffPoints < 0 ? '▼' : '▲'
  const statusSuffix = diffPoints < 0 ? '（未達）' : ''
  return `${arrow}${formatDecimal1(Math.abs(diffPoints))}pt${statusSuffix}`
}

/**
 * KPI の目標・あるべき・あるべき比を計算する
 */
export function evaluateKarteKpiTargets(
  aggregation: KarteKpiAggregation,
  targetRow: KpiTargetRow | null,
  asOfDate: string,
  holidays: string[],
  workdays: string[],
): KarteTargetEvaluationResult {
  const actualByMetric: Record<KarteKpiMetricKey, number> = {
    total: aggregation.total,
    connected: aggregation.connected,
    recall: aggregation.recall,
    owner: aggregation.owner,
    prospect: aggregation.prospect,
    apo: aggregation.apo,
  }

  const actualByRate: Record<KarteRateMetricKey, number | null> = {
    rate_connected: aggregation.rateConnected,
    rate_recall: aggregation.rateRecall,
    rate_owner: aggregation.rateOwner,
    rate_prospect: aggregation.rateProspect,
    rate_apo_owner: aggregation.rateApoOwner,
  }

  const businessDaysInPeriod = countBusinessDaysInRange(
    aggregation.startDate,
    aggregation.endDate,
    holidays,
    workdays,
  )

  if (!targetRow) {
    const emptyMetrics = {} as Record<KarteKpiMetricKey, KarteMetricEvaluation>
    for (const m of KARTE_KPI_METRICS) {
      emptyMetrics[m.key] = {
        key: m.key,
        label: m.label,
        actual: actualByMetric[m.key],
        periodTarget: null,
        monthlyTarget: null,
        shouldBe: null,
        ratioPercent: null,
        diff: null,
      }
    }
    const emptyRates = {} as Record<KarteRateMetricKey, KarteRateEvaluation>
    for (const r of KARTE_RATE_METRICS) {
      emptyRates[r.key] = {
        key: r.key,
        label: r.label,
        actualRate: actualByRate[r.key],
        targetRate: null,
        diffPoints: null,
      }
    }
    return {
      hasTarget: false,
      period: aggregation.period,
      businessDaysInPeriod,
      metrics: emptyMetrics,
      rates: emptyRates,
    }
  }

  const effective = resolveTargetValuesAtDate(targetRow, asOfDate)
  const calc = calculateKpiTargets(targetRow.goes_to_sales, effective)

  const dailyTargets: Record<KarteKpiMetricKey, number> = {
    total: calc.dailyTotal,
    connected: calc.dailyConnected,
    recall: calc.dailyRecall,
    owner: calc.dailyOwner,
    prospect: calc.dailyProspect,
    apo: effective.working_days > 0 ? calc.monthlyApo / effective.working_days : 0,
  }

  const monthlyTargets: Record<KarteKpiMetricKey, number> = {
    total: calc.monthlyTotal,
    connected: calc.monthlyConnected,
    recall: calc.monthlyRecall,
    owner: calc.monthlyOwner,
    prospect: calc.monthlyProspect,
    apo: calc.monthlyApo,
  }

  const businessDaysInMonth = listBusinessDaysInMonth(
    asOfDate.slice(0, 7),
    holidays,
    workdays,
  )

  const metrics = {} as Record<KarteKpiMetricKey, KarteMetricEvaluation>
  for (const m of KARTE_KPI_METRICS) {
    const actual = actualByMetric[m.key]
    const daily = dailyTargets[m.key]
    const monthly = monthlyTargets[m.key]

    let periodTarget: number
    let shouldBe: number
    if (aggregation.period === 'today') {
      periodTarget = daily
      shouldBe = daily
    } else if (aggregation.period === 'week') {
      periodTarget = daily * businessDaysInPeriod
      shouldBe = periodTarget
    } else {
      periodTarget = monthly
      shouldBe = calculateShouldBe(monthly, asOfDate, businessDaysInMonth)
    }

    const basis = aggregation.period === 'month' ? shouldBe : periodTarget
    const ratioPercent = basis > 0 ? (actual / basis) * 100 : null
    const diff = actual - basis

    metrics[m.key] = {
      key: m.key,
      label: m.label,
      actual,
      periodTarget,
      monthlyTarget: monthly,
      shouldBe,
      ratioPercent,
      diff,
    }
  }

  const targetRates: Record<KarteRateMetricKey, number> = {
    rate_connected: effective.rate_connected,
    rate_recall: effective.rate_recall,
    rate_owner: effective.rate_owner,
    rate_prospect: effective.rate_prospect,
    rate_apo_owner: effective.rate_apo_owner,
  }

  const rates = {} as Record<KarteRateMetricKey, KarteRateEvaluation>
  for (const r of KARTE_RATE_METRICS) {
    const actualRate = actualByRate[r.key]
    const targetRate = targetRates[r.key]
    const diffPoints = actualRate !== null ? actualRate - targetRate : null
    rates[r.key] = {
      key: r.key,
      label: r.label,
      actualRate,
      targetRate,
      diffPoints,
    }
  }

  return {
    hasTarget: true,
    period: aggregation.period,
    businessDaysInPeriod,
    metrics,
    rates,
  }
}

function emptySlotCounts(): KpiSlotMetrics {
  return {
    total: 0,
    connected: 0,
    recall: 0,
    owner: 0,
    prospect: 0,
    apo: 0,
  }
}

/**
 * コール時間と項目ごとの未達の時間数を計算する（9〜12時台・14〜17時台の8区分、営業日のみ）
 */
export function calculateCallHoursAndUnmetSlots(
  approvedEntries: KpiEntryRow[],
  memberId: string,
  startDate: string,
  endDate: string,
  targetRow: KpiTargetRow | null,
  holidays: string[],
  workdays: string[],
  threshold: number = DEFAULT_KARTE_CALL_HOUR_THRESHOLD,
): KartePeriodCallHoursSummary {
  const slotsByDate = new Map<string, Record<KpiTimeSlot, KpiSlotMetrics>>()

  for (const entry of approvedEntries) {
    if (entry.member_id !== memberId) continue
    if (entry.date < startDate || entry.date > endDate) continue

    let dayMap = slotsByDate.get(entry.date)
    if (!dayMap) {
      dayMap = {} as Record<KpiTimeSlot, KpiSlotMetrics>
      for (const slotKey of KPI_TIME_SLOTS) {
        dayMap[slotKey] = emptySlotCounts()
      }
      slotsByDate.set(entry.date, dayMap)
    }

    const slotKey = entry.time_slot
    if (slotKey && dayMap[slotKey]) {
      dayMap[slotKey].total += entry.total ?? 0
      dayMap[slotKey].connected += entry.connected ?? 0
      dayMap[slotKey].recall += entry.recall ?? 0
      dayMap[slotKey].owner += entry.owner ?? 0
      dayMap[slotKey].prospect += entry.prospect ?? 0
      dayMap[slotKey].apo += entry.apo ?? 0
    }
  }

  const sortedDates = [...slotsByDate.keys()].sort((a, b) => a.localeCompare(b))
  let totalCallHours = 0
  const totalUnmetSlots: KarteUnmetSlotCounts = {
    total: 0,
    connected: 0,
    recall: 0,
    owner: 0,
    prospect: 0,
    apo: 0,
  }
  const dailyBreakdown: KarteDailyCallHoursSummary[] = []

  for (const date of sortedDates) {
    const bizDay = isBusinessDay(date, holidays, workdays)
    if (!bizDay) {
      dailyBreakdown.push({
        date,
        isBusinessDay: false,
        callHours: 0,
        unmetSlots: targetRow
          ? { total: 0, connected: 0, recall: 0, owner: 0, prospect: 0, apo: 0 }
          : null,
      })
      continue
    }

    const dayMap = slotsByDate.get(date)!
    let dayCallHours = 0
    const dayUnmet: KarteUnmetSlotCounts = {
      total: 0,
      connected: 0,
      recall: 0,
      owner: 0,
      prospect: 0,
      apo: 0,
    }

    let hourlyTargets: {
      total: number
      connected: number
      recall: number
      owner: number
      prospect: number
      apo: number
    } | null = null

    if (targetRow) {
      const effective = resolveTargetValuesAtDate(targetRow, date)
      const calc = calculateKpiTargets(targetRow.goes_to_sales, effective)
      const term = effective.term
      hourlyTargets = {
        total: term,
        connected: term * (effective.rate_connected / 100),
        recall: term * (effective.rate_recall / 100),
        owner: term * (effective.rate_owner / 100),
        prospect: term * (effective.rate_prospect / 100),
        apo:
          calc.monthlyTotal > 0
            ? term * (calc.monthlyApo / calc.monthlyTotal)
            : 0,
      }
    }

    for (const slotKey of KARTE_CALL_HOUR_SLOTS) {
      const slot = dayMap[slotKey] ?? emptySlotCounts()
      if (slot.total > threshold) {
        dayCallHours += 1
      }
      if (hourlyTargets) {
        if (slot.total < hourlyTargets.total) dayUnmet.total += 1
        if (slot.connected < hourlyTargets.connected) dayUnmet.connected += 1
        if (slot.recall < hourlyTargets.recall) dayUnmet.recall += 1
        if (slot.owner < hourlyTargets.owner) dayUnmet.owner += 1
        if (slot.prospect < hourlyTargets.prospect) dayUnmet.prospect += 1
        if (slot.apo < hourlyTargets.apo) dayUnmet.apo += 1
      }
    }

    totalCallHours += dayCallHours
    if (targetRow) {
      totalUnmetSlots.total += dayUnmet.total
      totalUnmetSlots.connected += dayUnmet.connected
      totalUnmetSlots.recall += dayUnmet.recall
      totalUnmetSlots.owner += dayUnmet.owner
      totalUnmetSlots.prospect += dayUnmet.prospect
      totalUnmetSlots.apo += dayUnmet.apo
    }

    dailyBreakdown.push({
      date,
      isBusinessDay: true,
      callHours: dayCallHours,
      unmetSlots: targetRow ? dayUnmet : null,
    })
  }

  return {
    threshold,
    hasTarget: targetRow !== null,
    totalCallHours,
    totalUnmetSlots: targetRow ? totalUnmetSlots : null,
    dailyBreakdown,
  }
}

/**
 * 時間帯（14区分）ごとの総・実率・アと「弱い時間帯」を計算する
 */
export function aggregateByTimeSlot(
  approvedEntries: KpiEntryRow[],
  memberId: string,
  startDate: string,
  endDate: string,
  targetRow: KpiTargetRow | null,
  asOfDate: string,
): KarteTimeSlotRow[] {
  const targetRateConnected = targetRow
    ? resolveTargetValuesAtDate(targetRow, asOfDate).rate_connected
    : null

  const sums = new Map<KpiTimeSlot, KpiSlotMetrics>()
  for (const key of KPI_TIME_SLOTS) {
    sums.set(key, emptySlotCounts())
  }

  for (const entry of approvedEntries) {
    if (entry.member_id !== memberId) continue
    if (entry.date < startDate || entry.date > endDate) continue
    const acc = sums.get(entry.time_slot)
    if (!acc) continue
    acc.total += entry.total ?? 0
    acc.connected += entry.connected ?? 0
    acc.recall += entry.recall ?? 0
    acc.owner += entry.owner ?? 0
    acc.prospect += entry.prospect ?? 0
    acc.apo += entry.apo ?? 0
  }

  return KPI_TIME_SLOTS.map((slotKey) => {
    const acc = sums.get(slotKey)!
    const rateConnected =
      acc.total > 0 ? (acc.connected / acc.total) * 100 : null
    const isWeak =
      targetRateConnected !== null &&
      acc.total > 0 &&
      rateConnected !== null &&
      rateConnected < targetRateConnected

    return {
      slotKey,
      slotLabel: CSV_TIME_SLOT_HEADERS[slotKey],
      total: acc.total,
      connected: acc.connected,
      recall: acc.recall,
      owner: acc.owner,
      prospect: acc.prospect,
      apo: acc.apo,
      rateConnected,
      targetRateConnected,
      isWeak,
    }
  })
}

/**
 * チームの中の比べ（今月のアポ数の順位・アポの達成率の順位）を計算する
 * 退職した人を選んだときは null を返す
 */
export function calculateTeamRankings(params: {
  selectedMember: MemberRow
  members: MemberRow[]
  affiliations: MemberAffiliationRow[]
  teams: TeamRow[]
  approvedEntries: KpiEntryRow[]
  targets: KpiTargetRow[]
  yearMonth: string
  asOfDate: string | null
  todayJst: string
  holidays: string[]
  workdays: string[]
}): KarteTeamRankingResult | null {
  const {
    selectedMember,
    members,
    affiliations,
    teams,
    approvedEntries,
    targets,
    yearMonth,
    asOfDate,
    todayJst,
    holidays,
    workdays,
  } = params

  if (isMemberRetired(selectedMember, todayJst)) {
    return null
  }

  const teamId = resolveCurrentTeamId(selectedMember.id, affiliations, todayJst)
  if (!teamId) {
    return null
  }

  const teamName = teams.find((t) => t.id === teamId)?.name ?? '所属なし'
  const ym = yearMonth.slice(0, 7)
  const monthFirstDate = `${ym}-01`
  const businessDaysInMonth = listBusinessDaysInMonth(ym, holidays, workdays)

  const activeTeamMembers = members.filter(
    (m) =>
      !isMemberRetired(m, todayJst) &&
      resolveCurrentTeamId(m.id, affiliations, todayJst) === teamId,
  )

  if (activeTeamMembers.length === 0) {
    return null
  }

  let teamLatestDate: string | null = asOfDate
  if (!teamLatestDate) {
    for (const entry of approvedEntries) {
      if (!entry.date.startsWith(ym)) continue
      if (teamLatestDate === null || entry.date > teamLatestDate) {
        teamLatestDate = entry.date
      }
    }
  }

  interface MemberScore {
    memberId: string
    apo: number
    achievementRate: number | null
  }

  const scores: MemberScore[] = activeTeamMembers.map((m) => {
    const memberEntries = approvedEntries.filter(
      (e) =>
        e.member_id === m.id &&
        e.date.startsWith(ym) &&
        (asOfDate === null || e.date <= asOfDate),
    )
    const apo = memberEntries.reduce((sum, e) => sum + e.apo, 0)
    const memberLatestDate =
      memberEntries.reduce<string | null>(
        (max, e) => (max === null || e.date > max ? e.date : max),
        null,
      ) ?? teamLatestDate

    const targetRow =
      targets.find(
        (t) =>
          t.member_id === m.id &&
          t.month.slice(0, 7) === ym &&
          t.month === monthFirstDate,
      ) ??
      targets.find((t) => t.member_id === m.id && t.month.slice(0, 7) === ym) ??
      null

    let achievementRate: number | null = null
    if (targetRow && memberLatestDate) {
      const effective = resolveTargetValuesAtDate(targetRow, memberLatestDate)
      const calc = calculateKpiTargets(targetRow.goes_to_sales, effective)
      const shouldBeApo = calculateShouldBe(
        calc.monthlyApo,
        memberLatestDate,
        businessDaysInMonth,
      )
      if (shouldBeApo > 0) {
        achievementRate = (apo / shouldBeApo) * 100
      }
    }

    return {
      memberId: m.id,
      apo,
      achievementRate,
    }
  })

  const selfScore = scores.find((s) => s.memberId === selectedMember.id)
  if (!selfScore) {
    return null
  }

  const apoRank = 1 + scores.filter((s) => s.apo > selfScore.apo).length

  const ratedScores = scores.filter((s) => s.achievementRate !== null)
  let apoAchievementRank: number | null = null
  if (selfScore.achievementRate !== null) {
    apoAchievementRank =
      1 +
      ratedScores.filter(
        (s) =>
          (s.achievementRate as number) > (selfScore.achievementRate as number),
      ).length
  }

  return {
    teamId,
    teamName,
    activeMemberCount: activeTeamMembers.length,
    monthlyApo: selfScore.apo,
    apoRank,
    apoAchievementRate: selfScore.achievementRate,
    apoAchievementRank,
    achievementRankedMemberCount: ratedScores.length,
  }
}

/**
 * 指定した年月（YYYY-MM）の前の月（YYYY-MM）を返す
 */
export function getPreviousYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.slice(0, 7).split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  const py = d.getUTCFullYear()
  const pm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${py}-${pm}`
}

/**
 * 推移（2か月分の日ごとのアと総、および指導した日）を作る
 */
export function buildKarteTrendData(params: {
  memberId: string
  approvedEntries: KpiEntryRow[]
  roleplays: Array<{
    member_id: string
    date: string
    submitted_at: string | null
    hidden_at: string | null
  }>
  memos: Array<{
    id: string
    date: string
    submitted_at: string | null
    hidden_at: string | null
  }>
  memoTargets: Array<{
    memo_id: string
    member_id: string
    removed_at: string | null
  }>
  currentYearMonth: string
}): KarteTrendData {
  const {
    memberId,
    approvedEntries,
    roleplays,
    memos,
    memoTargets,
    currentYearMonth,
  } = params

  const curYm = currentYearMonth.slice(0, 7)
  const prevYm = getPreviousYearMonth(curYm)

  const pointMap = new Map<string, { total: number; apo: number }>()
  for (const entry of approvedEntries) {
    if (entry.member_id !== memberId) continue
    const ym = entry.date.slice(0, 7)
    if (ym !== prevYm && ym !== curYm) continue
    const existing = pointMap.get(entry.date) ?? { total: 0, apo: 0 }
    existing.total += entry.total
    existing.apo += entry.apo
    pointMap.set(entry.date, existing)
  }

  const points: KarteTrendDayPoint[] = [...pointMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, vals]) => ({
      date,
      total: vals.total,
      apo: vals.apo,
    }))

  const activeTargetMemoIds = new Set(
    memoTargets
      .filter((t) => t.member_id === memberId && t.removed_at === null)
      .map((t) => t.memo_id),
  )

  const guidanceMap = new Map<
    string,
    { roleplayCount: number; memoCount: number }
  >()

  for (const rp of roleplays) {
    if (rp.member_id !== memberId) continue
    if (rp.submitted_at === null || rp.hidden_at !== null) continue
    const ym = rp.date.slice(0, 7)
    if (ym !== prevYm && ym !== curYm) continue
    const cur = guidanceMap.get(rp.date) ?? { roleplayCount: 0, memoCount: 0 }
    cur.roleplayCount += 1
    guidanceMap.set(rp.date, cur)
  }

  for (const memo of memos) {
    if (memo.submitted_at === null || memo.hidden_at !== null) continue
    if (!activeTargetMemoIds.has(memo.id)) continue
    const ym = memo.date.slice(0, 7)
    if (ym !== prevYm && ym !== curYm) continue
    const cur = guidanceMap.get(memo.date) ?? { roleplayCount: 0, memoCount: 0 }
    cur.memoCount += 1
    guidanceMap.set(memo.date, cur)
  }

  const guidanceDates: KarteGuidanceDateMark[] = [...guidanceMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, counts]) => ({
      date,
      hasRoleplay: counts.roleplayCount > 0,
      hasMemo: counts.memoCount > 0,
      roleplayCount: counts.roleplayCount,
      memoCount: counts.memoCount,
    }))

  return {
    points,
    guidanceDates,
  }
}

/**
 * タイムライン（ロープレ・研修・部下メモを新しい順に混ぜて並べる。過去の記録 is_legacy と legacy_source に対応）
 */
export function buildKarteTimeline(
  input: BuildKarteTimelineInput,
  filter: KarteTimelineFilter = 'all',
): KarteTimelineItem[] {
  const {
    memberId,
    isRetired,
    roleplays,
    roleplayThemes,
    seminars,
    seminarMembers,
    memos,
    memoTargets,
    memoMasters,
    members,
  } = input

  const themeNameMap = new Map<string, string>(
    roleplayThemes.map((t) => [t.id, t.name]),
  )
  const masterNameMap = new Map<string, string>(
    memoMasters.map((m) => [m.id, m.name]),
  )
  const memberNameMap = new Map<string, string>(
    members.map((m) => [m.id, m.name]),
  )

  const items: KarteTimelineItem[] = []

  // 1. ロープレの記録
  if (filter === 'all' || filter === 'roleplay') {
    for (const rp of roleplays) {
      if (rp.member_id !== memberId) continue
      if (rp.submitted_at === null || rp.hidden_at !== null) continue

      const isLegacy = Boolean(rp.is_legacy)
      const legacySource =
        rp.legacy_source && typeof rp.legacy_source === 'object'
          ? (rp.legacy_source as Record<string, unknown>)
          : null

      const themeName = rp.theme_id
        ? (themeNameMap.get(rp.theme_id) ?? 'テーマ未設定')
        : typeof legacySource?.theme === 'string' && legacySource.theme.trim()
          ? legacySource.theme
          : 'テーマ未設定'

      const kindLabel = ROLEPLAY_KIND_LABELS[rp.kind] ?? rp.kind
      const runnerName = rp.runner_member_id
        ? (memberNameMap.get(rp.runner_member_id) ?? 'ほかの上席')
        : '実施者未設定'

      const details: string[] = []
      if (rp.fixed_point?.trim()) {
        details.push(`今日直した点：${rp.fixed_point.trim()}`)
      }
      if (rp.next_homework?.trim()) {
        details.push(`次回までの宿題：${rp.next_homework.trim()}`)
      }
      if (rp.pass_result) {
        details.push(
          `合格ライン判定：${JUDGE_MARK_LABELS[rp.pass_result] ?? rp.pass_result}`,
        )
      }
      if (rp.note?.trim()) {
        details.push(`メモ：${rp.note.trim()}`)
      }

      const tags: string[] = [`${kindLabel}ロープレ`]
      if (rp.minutes !== null && rp.minutes !== undefined) {
        tags.push(`${rp.minutes}分`)
      }
      if (rp.time_slot) {
        tags.push(`${rp.time_slot}時台`)
      }

      items.push({
        id: `roleplay-${rp.id}`,
        kind: 'roleplay',
        kindLabel: 'ロープレ',
        date: rp.date,
        createdAt: rp.created_at ?? rp.submitted_at ?? '',
        title: `ロープレ：${themeName}`,
        subtitle: `実施者：${runnerName}`,
        details,
        tags,
        isLegacy,
        legacySource,
      })
    }
  }

  // 2. 研修の記録（退職した人は対象外）
  if (!isRetired && (filter === 'all' || filter === 'seminar')) {
    const activeSeminarIds = new Set(
      seminarMembers
        .filter((p) => p.member_id === memberId && p.removed_at === null)
        .map((p) => p.seminar_id),
    )

    for (const sem of seminars) {
      if (sem.hidden_at !== null) continue
      if (!activeSeminarIds.has(sem.id)) continue

      const isLegacy = Boolean(sem.is_legacy)
      const legacySource =
        sem.legacy_source && typeof sem.legacy_source === 'object'
          ? (sem.legacy_source as Record<string, unknown>)
          : null

      const lecturerName = sem.lecturer?.trim() || '講師未設定'

      const details: string[] = []
      if (sem.content?.trim()) {
        details.push(`内容：${sem.content.trim()}`)
      }

      const tags: string[] = ['研修']
      if (sem.minutes) {
        tags.push(`${sem.minutes}分`)
      }

      items.push({
        id: `seminar-${sem.id}`,
        kind: 'seminar',
        kindLabel: '研修',
        date: sem.date,
        createdAt: sem.created_at ?? '',
        title: `研修：${sem.theme?.trim() || '（テーマ未設定）'}`,
        subtitle: `講師：${lecturerName}`,
        details,
        tags,
        isLegacy,
        legacySource,
      })
    }
  }

  // 3. 部下メモ（上席だけ）
  if (filter === 'all' || filter === 'memo') {
    const activeTargetMemoIds = new Set(
      memoTargets
        .filter((t) => t.member_id === memberId && t.removed_at === null)
        .map((t) => t.memo_id),
    )

    for (const memo of memos) {
      if (memo.submitted_at === null || memo.hidden_at !== null) continue
      if (!activeTargetMemoIds.has(memo.id)) continue

      const isLegacy = Boolean(memo.is_legacy)
      const legacySource =
        memo.legacy_source && typeof memo.legacy_source === 'object'
          ? (memo.legacy_source as Record<string, unknown>)
          : null

      const authorName = memberNameMap.get(memo.created_by) ?? '上席'
      const themeName = memo.theme_id
        ? (masterNameMap.get(memo.theme_id) ?? '')
        : ''
      const kindName = memo.kind_id
        ? (masterNameMap.get(memo.kind_id) ?? '')
        : ''

      const tags: string[] = []
      if (themeName) tags.push(themeName)
      if (kindName) tags.push(kindName)

      const details: string[] = []
      if (memo.noticed?.trim()) {
        details.push(`気づいたこと：${memo.noticed.trim()}`)
      }
      if (memo.guidance?.trim()) {
        details.push(`指導したこと：${memo.guidance.trim()}`)
      }
      if (memo.next_check_on) {
        details.push(`次の確認日：${memo.next_check_on}`)
      }
      if (memo.action_check) {
        details.push(
          `行動の確認：${formatMemoCheckLabel(memo.action_check)}（成果：${formatMemoCheckLabel(memo.result_check)}）`,
        )
      }

      items.push({
        id: `memo-${memo.id}`,
        kind: 'memo',
        kindLabel: '部下メモ',
        date: memo.date,
        createdAt: memo.created_at ?? memo.submitted_at ?? '',
        title: `部下メモ（記録者：${authorName}）`,
        subtitle:
          tags.length > 0 ? `分類：${tags.join('・')}` : '分類未設定',
        details,
        tags,
        isLegacy,
        legacySource,
      })
    }
  }

  items.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date)
    if (byDate !== 0) return byDate
    return b.createdAt.localeCompare(a.createdAt)
  })

  return items
}

/**
 * 読めた kpi_entries から、「読めた import_logs のうち status が approved でない記録」に入っている日々のKPIだけを外す。
 * - 管理者でない人は import_logs が0件なので、何も外さない（DBのRLSで既に承認済みのみに絞られている）
 * - 管理者は自分の承認前（pending）や置きかえ（replaced）の import_logs も読めるため、approved 以外の分だけを外す
 */
export function filterApprovedKpiEntries(
  entries: KpiEntryRow[],
  readableImportLogs: ReadonlyArray<Pick<ImportLogRow, 'id' | 'status'>>,
): KpiEntryRow[] {
  const unapprovedIds = new Set<string>()
  for (const log of readableImportLogs) {
    if (log.status !== 'approved') {
      unapprovedIds.add(log.id)
    }
  }
  if (unapprovedIds.size === 0) {
    return entries
  }
  return entries.filter((e) => !unapprovedIds.has(e.import_log_id))
}

/**
 * 指定した日付（YYYY-MM-DD または YYYY-MM）から「2か月前の月の1日」（YYYY-MM-01）を返す
 */
export function getTwoMonthsAgoFirstDate(dateOrYearMonth: string): string {
  const [y, m] = dateOrYearMonth.slice(0, 7).split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 3, 1))
  const py = d.getUTCFullYear()
  const pm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${py}-${pm}-01`
}

/**
 * カルテで KPI・目標を読む対象メンバーの ID 一覧を返す：
 * 選んだ人と、その人の今のチームの人（現役メンバー・順位に使う）だけ
 */
export function resolveScopedMemberIdsForKarteKpi(
  selectedMember: MemberRow,
  members: MemberRow[],
  affiliations: MemberAffiliationRow[],
  todayJst: string = getTodayJstDateString(),
): string[] {
  const ids = new Set<string>([selectedMember.id])
  if (!isMemberRetired(selectedMember, todayJst)) {
    const teamId = resolveCurrentTeamId(
      selectedMember.id,
      affiliations,
      todayJst,
    )
    if (teamId) {
      for (const m of members) {
        if (isMemberRetired(m, todayJst)) continue
        if (resolveCurrentTeamId(m.id, affiliations, todayJst) === teamId) {
          ids.add(m.id)
        }
      }
    }
  }
  return [...ids]
}

export const KARTE_PAGE_SIZE = 1000

export interface RangeQueryResult<T> {
  data: T[] | null
  error: unknown
}

export type RangeQuerySource<T> =
  | {
      range: (
        from: number,
        to: number,
      ) => PromiseLike<RangeQueryResult<T>> | RangeQueryResult<T>
    }
  | ((
      from: number,
      to: number,
    ) => PromiseLike<RangeQueryResult<T>> | RangeQueryResult<T>)

/**
 * Supabase の1回あたり最大1,000行の上限を回避し、.range() で1,000行ずつ分けて
 * 返ってきた行が1,000行より少なくなるまで読み続ける共通関数
 */
export async function fetchAllRowsByRange<T>(
  source: RangeQuerySource<T>,
  pageSize: number = KARTE_PAGE_SIZE,
): Promise<T[]> {
  const allRows: T[] = []
  let from = 0
  while (true) {
    const to = from + pageSize - 1
    const res =
      typeof source === 'function'
        ? await source(from, to)
        : await source.range(from, to)
    if (res.error) {
      throw res.error
    }
    const batch = res.data ?? []
    allRows.push(...batch)
    if (batch.length < pageSize) {
      break
    }
    from += pageSize
  }
  return allRows
}

