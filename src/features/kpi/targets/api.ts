import { getTodayJstDateString } from '../../../foundation/directory'
import { supabase } from '../../../foundation/supabaseClient'
import type {
  MemberAffiliationRow,
  MemberRow,
  TeamRow,
} from '../../../foundation/types'
import {
  canSuperviseMember,
  fetchViewerContext,
  resolveCurrentTeamId,
  type ViewerContext,
} from '../../../foundation/viewer'
import {
  buildBusinessDaysContext,
  getMonthFirstDate,
  type KpiTargetRow,
  type KpiTargetValues,
} from '../shared'

export interface ReadableMemberInfo {
  member: MemberRow
  teamId: string | null
  teamName: string
  isSelf: boolean
}

export interface KpiTargetsScreenData {
  viewer: ViewerContext | null
  selfMember: MemberRow | null
  readableMembers: ReadableMemberInfo[]
  targets: KpiTargetRow[]
  currentMonth: string // 'YYYY-MM-01'
  nextMonth: string // 'YYYY-MM-01'
  holidaysSetting: string[] | null
  holidaysConfigured: boolean
  workdaysSetting: string[] | null
  workdaysConfigured: boolean
}

export function getNextMonthFirstDate(monthFirst: string): string {
  const m = monthFirst.match(/^(\d{4})-(\d{2})-01$/)
  if (!m) return monthFirst
  let year = Number(m[1])
  let month = Number(m[2]) + 1
  if (month > 12) {
    year += 1
    month = 1
  }
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function formatMonthLabel(monthFirst: string): string {
  const m = monthFirst.match(/^(\d{4})-(\d{2})/)
  if (!m) return monthFirst
  return `${m[1]}年${Number(m[2])}月`
}

export async function fetchKpiTargetsScreenData(): Promise<KpiTargetsScreenData> {
  const today = getTodayJstDateString()
  const currentMonth = getMonthFirstDate(today)
  const nextMonth = getNextMonthFirstDate(currentMonth)

  const viewer = await fetchViewerContext(supabase)
  if (!viewer) {
    return {
      viewer: null,
      selfMember: null,
      readableMembers: [],
      targets: [],
      currentMonth,
      nextMonth,
      holidaysSetting: null,
      holidaysConfigured: false,
      workdaysSetting: null,
      workdaysConfigured: false,
    }
  }

  const [membersRes, teamsRes, affRes, targetsRes, settingsRes] = await Promise.all([
    supabase.from('members').select('*').order('name', { ascending: true }),
    supabase.from('teams').select('*').order('name', { ascending: true }),
    supabase.from('member_affiliations').select('*'),
    supabase
      .from('kpi_targets')
      .select('*')
      .in('month', [currentMonth, nextMonth])
      .order('month', { ascending: false }),
    supabase
      .from('settings')
      .select('key, value')
      .in('key', ['kpi_holidays', 'kpi_workdays']),
  ])

  if (membersRes.error) throw membersRes.error
  if (teamsRes.error) throw teamsRes.error
  if (affRes.error) throw affRes.error
  if (targetsRes.error) throw targetsRes.error
  if (settingsRes.error) throw settingsRes.error

  const members = (membersRes.data ?? []) as MemberRow[]
  const teams = (teamsRes.data ?? []) as TeamRow[]
  const affiliations = (affRes.data ?? []) as MemberAffiliationRow[]
  const targets = (targetsRes.data ?? []) as KpiTargetRow[]

  const settingRows = (settingsRes.data ?? []) as Array<{ key: string; value: unknown }>
  const holidaysRow = settingRows.find((r) => r.key === 'kpi_holidays')
  const workdaysRow = settingRows.find((r) => r.key === 'kpi_workdays')

  const holidaysSetting =
    holidaysRow && Array.isArray(holidaysRow.value)
      ? holidaysRow.value.filter((v): v is string => typeof v === 'string')
      : null
  const workdaysSetting =
    workdaysRow && Array.isArray(workdaysRow.value)
      ? workdaysRow.value.filter((v): v is string => typeof v === 'string')
      : null

  const teamNameById = new Map<string, string>(teams.map((t) => [t.id, t.name]))
  const selfMember = members.find((m) => m.id === viewer.memberId) ?? null

  const readableMembers: ReadableMemberInfo[] = []
  for (const m of members) {
    if (m.retired_on !== null && m.retired_on < today) continue
    const teamId = resolveCurrentTeamId(m.id, affiliations, today)
    const isSelf = m.id === viewer.memberId
    const canRead =
      isSelf ||
      viewer.isAdmin ||
      viewer.isCeo ||
      canSuperviseMember(viewer, { id: m.id, teamId })

    if (canRead) {
      readableMembers.push({
        member: m,
        teamId,
        teamName: teamId ? (teamNameById.get(teamId) ?? '－') : '所属なし',
        isSelf,
      })
    }
  }

  return {
    viewer,
    selfMember,
    readableMembers,
    targets,
    currentMonth,
    nextMonth,
    holidaysSetting,
    holidaysConfigured: holidaysSetting !== null,
    workdaysSetting,
    workdaysConfigured: workdaysSetting !== null,
  }
}

export async function saveSelfKpiTarget(input: {
  existingTargetId: string | null
  memberId: string
  month: string
  goesToSales: boolean
  values: KpiTargetValues
}): Promise<KpiTargetRow> {
  const payload = {
    target_profit: input.goesToSales ? input.values.target_profit : null,
    unit_price: input.goesToSales ? input.values.unit_price : null,
    completion_rate: input.goesToSales ? input.values.completion_rate : null,
    rate_order: input.goesToSales ? input.values.rate_order : null,
    apo_target: input.goesToSales ? null : input.values.apo_target,
    working_days: input.values.working_days,
    call_hours: input.values.call_hours,
    term: input.values.term,
    rate_connected: input.values.rate_connected,
    rate_recall: input.values.rate_recall,
    rate_owner: input.values.rate_owner,
    rate_prospect: input.values.rate_prospect,
    rate_apo_owner: input.values.rate_apo_owner,
    rate_adoption: input.values.rate_adoption,
  }

  if (input.existingTargetId) {
    const { data, error } = await supabase
      .from('kpi_targets')
      .update(payload)
      .eq('id', input.existingTargetId)
      .select('*')
      .single()

    if (error) throw error
    return data as KpiTargetRow
  }

  const { data, error } = await supabase
    .from('kpi_targets')
    .insert({
      member_id: input.memberId,
      month: input.month,
      goes_to_sales: input.goesToSales,
      ...payload,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as KpiTargetRow
}

export function getDefaultTargetValues(
  goesToSales: boolean,
  monthFirst: string,
  holidaysSetting: readonly string[] | null,
  workdaysSetting: readonly string[] | null = null,
): KpiTargetValues {
  const busCtx = buildBusinessDaysContext(monthFirst, holidaysSetting, workdaysSetting)
  const defaultWorkingDays = busCtx.totalBusinessDays > 0 ? busCtx.totalBusinessDays : 20

  return {
    target_profit: goesToSales ? 320 : null,
    unit_price: goesToSales ? 40 : null,
    completion_rate: goesToSales ? 80 : null,
    rate_order: goesToSales ? 25 : null,
    apo_target: goesToSales ? null : 30,
    working_days: defaultWorkingDays,
    call_hours: 5,
    term: 20,
    rate_connected: 40,
    rate_recall: 30,
    rate_owner: 15,
    rate_prospect: 4,
    rate_apo_owner: 8,
    rate_adoption: 80,
  }
}
