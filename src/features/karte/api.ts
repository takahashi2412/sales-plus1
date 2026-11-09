import type { SupabaseClient } from '@supabase/supabase-js'
import { getTodayJstDateString } from '../../foundation/directory'
import { supabase } from '../../foundation/supabaseClient'
import type {
  MemberAffiliationRow,
  MemberRow,
  TeamRow,
} from '../../foundation/types'
import { fetchViewerContext, type ViewerContext } from '../../foundation/viewer'
import type {
  ImportLogRow,
  KpiEntryRow,
  KpiTargetRow,
} from '../kpi/shared/types'
import type {
  MemoMasterRow,
  SubordinateMemoRow,
  SubordinateMemoTargetRow,
} from '../memo/memo-logic'
import type {
  MemberThemeRow,
  RoleplayThemeRow,
  SeminarMemberRow,
  SettingRow,
} from '../roleplay/shared/types'
import {
  DEFAULT_KARTE_CALL_HOUR_THRESHOLD,
  fetchAllRowsByRange,
  filterApprovedKpiEntries,
  getTwoMonthsAgoFirstDate,
  pickSelectableKarteMembers,
  resolveInitialKarteYearMonth,
  resolveScopedMemberIdsForKarteKpi,
  type KarteRoleplayRow,
  type KarteSeminarRow,
} from './shared'

export interface KarteSettingsState {
  holidays: string[]
  workdays: string[]
  callHourThreshold: number
  missingKeys: string[]
}

export interface KartePageDataset {
  viewer: ViewerContext | null
  todayJst: string
  members: MemberRow[]
  affiliations: MemberAffiliationRow[]
  teams: TeamRow[]
  readableImportLogs: Array<Pick<ImportLogRow, 'id' | 'status'>>
  scopedMemberIds: string[]
  approvedEntries: KpiEntryRow[]
  targets: KpiTargetRow[]
  roleplays: KarteRoleplayRow[]
  roleplayThemes: RoleplayThemeRow[]
  memberThemes: MemberThemeRow[]
  seminars: KarteSeminarRow[]
  seminarMembers: SeminarMemberRow[]
  memos: SubordinateMemoRow[]
  memoTargets: SubordinateMemoTargetRow[]
  memoMasters: MemoMasterRow[]
  settings: KarteSettingsState
}

export function parseKarteSettings(rows: SettingRow[]): KarteSettingsState {
  const keyMap = new Map<string, unknown>(rows.map((r) => [r.key, r.value]))
  const missingKeys: string[] = []

  let holidays: string[] = []
  if (!keyMap.has('kpi_holidays')) {
    missingKeys.push('kpi_holidays')
  } else {
    const val = keyMap.get('kpi_holidays')
    if (Array.isArray(val)) {
      holidays = val.map((v) => String(v))
    }
  }

  let workdays: string[] = []
  if (!keyMap.has('kpi_workdays')) {
    missingKeys.push('kpi_workdays')
  } else {
    const val = keyMap.get('kpi_workdays')
    if (Array.isArray(val)) {
      workdays = val.map((v) => String(v))
    }
  }

  let callHourThreshold = DEFAULT_KARTE_CALL_HOUR_THRESHOLD
  if (!keyMap.has('karte_call_hour_threshold')) {
    missingKeys.push('karte_call_hour_threshold')
  } else {
    const num = Number(keyMap.get('karte_call_hour_threshold'))
    if (Number.isFinite(num) && num >= 0) {
      callHourThreshold = num
    }
  }

  return {
    holidays,
    workdays,
    callHourThreshold,
    missingKeys,
  }
}

export function formatKarteDbError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message?: unknown }).message ?? '').trim()
    if (msg) {
      return `この操作はできません（理由：${msg}）`
    }
  }
  if (typeof err === 'string' && err.trim()) {
    return `この操作はできません（理由：${err.trim()}）`
  }
  return 'この操作はできません'
}

/**
 * 選んだ人と、その人の今のチームの人（順位に使う）だけを対象に、
 * 「2か月前の月の1日」から今日までの kpi_entries と kpi_targets を .range() で分割取得し、
 * 読めた import_logs のうち approved でないものに入っている kpi_entries だけを外して返す
 */
export async function fetchKarteMemberScopedKpiData(
  params: {
    selectedMember: MemberRow
    members: MemberRow[]
    affiliations: MemberAffiliationRow[]
    todayJst: string
    readableImportLogs: ReadonlyArray<Pick<ImportLogRow, 'id' | 'status'>>
  },
  client: SupabaseClient = supabase,
): Promise<{
  scopedMemberIds: string[]
  approvedEntries: KpiEntryRow[]
  targets: KpiTargetRow[]
}> {
  const {
    selectedMember,
    members,
    affiliations,
    todayJst,
    readableImportLogs,
  } = params

  const scopedMemberIds = resolveScopedMemberIdsForKarteKpi(
    selectedMember,
    members,
    affiliations,
    todayJst,
  )
  const initialYm = resolveInitialKarteYearMonth(selectedMember, todayJst)
  const todayFromDate = getTwoMonthsAgoFirstDate(todayJst)
  const memberFromDate = getTwoMonthsAgoFirstDate(initialYm)
  const fromDate =
    memberFromDate < todayFromDate ? memberFromDate : todayFromDate

  const [rawEntries, targets] = await Promise.all([
    fetchAllRowsByRange<KpiEntryRow>((from, to) =>
      client
        .from('kpi_entries')
        .select('*')
        .in('member_id', scopedMemberIds)
        .gte('date', fromDate)
        .lte('date', todayJst)
        .order('date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsByRange<KpiTargetRow>((from, to) =>
      client
        .from('kpi_targets')
        .select('*')
        .in('member_id', scopedMemberIds)
        .gte('month', fromDate)
        .lte('month', todayJst)
        .order('month', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ])

  const approvedEntries = filterApprovedKpiEntries(
    rawEntries,
    readableImportLogs,
  )

  return {
    scopedMemberIds,
    approvedEntries,
    targets,
  }
}

export async function fetchKartePageDataset(
  selectedMemberIdHint?: string | null,
  client: SupabaseClient = supabase,
): Promise<KartePageDataset> {
  const todayJst = getTodayJstDateString()
  const viewer = await fetchViewerContext(client)

  if (!viewer) {
    return {
      viewer: null,
      todayJst,
      members: [],
      affiliations: [],
      teams: [],
      readableImportLogs: [],
      scopedMemberIds: [],
      approvedEntries: [],
      targets: [],
      roleplays: [],
      roleplayThemes: [],
      memberThemes: [],
      seminars: [],
      seminarMembers: [],
      memos: [],
      memoTargets: [],
      memoMasters: [],
      settings: {
        holidays: [],
        workdays: [],
        callHourThreshold: DEFAULT_KARTE_CALL_HOUR_THRESHOLD,
        missingKeys: [],
      },
    }
  }

  const [
    membersRes,
    affRes,
    teamsRes,
    settingsRes,
    rpThemesRes,
    mastersRes,
    readableImportLogs,
    roleplays,
    memberThemes,
    seminars,
    seminarMembers,
    memos,
    memoTargets,
  ] = await Promise.all([
    client.from('members').select('*').order('name', { ascending: true }),
    client.from('member_affiliations').select('*'),
    client.from('teams').select('*').order('name', { ascending: true }),
    client
      .from('settings')
      .select('*')
      .in('key', ['kpi_holidays', 'kpi_workdays', 'karte_call_hour_threshold']),
    client
      .from('roleplay_themes')
      .select('*')
      .order('stage', { ascending: true })
      .order('no', { ascending: true }),
    client
      .from('masters')
      .select('*')
      .in('kind', ['memo_theme', 'memo_kind'])
      .order('sort_order', { ascending: true }),
    fetchAllRowsByRange<Pick<ImportLogRow, 'id' | 'status'>>((from, to) =>
      client
        .from('import_logs')
        .select('id, status')
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsByRange<KarteRoleplayRow>((from, to) =>
      client
        .from('roleplays')
        .select('*')
        .is('hidden_at', null)
        .order('date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsByRange<MemberThemeRow>((from, to) =>
      client
        .from('member_themes')
        .select('*')
        .is('hidden_at', null)
        .order('started_on', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsByRange<KarteSeminarRow>((from, to) =>
      client
        .from('seminars')
        .select('*')
        .is('hidden_at', null)
        .order('date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsByRange<SeminarMemberRow>((from, to) =>
      client
        .from('seminar_members')
        .select('*')
        .order('seminar_id', { ascending: true })
        .order('member_id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsByRange<SubordinateMemoRow>((from, to) =>
      client
        .from('subordinate_memos')
        .select('*')
        .is('hidden_at', null)
        .order('date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsByRange<SubordinateMemoTargetRow>((from, to) =>
      client
        .from('subordinate_memo_targets')
        .select('*')
        .order('memo_id', { ascending: true })
        .order('member_id', { ascending: true })
        .range(from, to),
    ),
  ])

  const firstError =
    membersRes.error ||
    affRes.error ||
    teamsRes.error ||
    settingsRes.error ||
    rpThemesRes.error ||
    mastersRes.error

  if (firstError) {
    throw firstError
  }

  const members = (membersRes.data ?? []) as MemberRow[]
  const affiliations = (affRes.data ?? []) as MemberAffiliationRow[]
  const teams = (teamsRes.data ?? []) as TeamRow[]

  const selectable = pickSelectableKarteMembers(
    viewer,
    members,
    affiliations,
    teams,
    todayJst,
  )
  const initialSelected =
    (selectedMemberIdHint
      ? selectable.find((m) => m.member.id === selectedMemberIdHint)
      : undefined) ??
    selectable[0] ??
    null

  let scopedMemberIds: string[] = []
  let approvedEntries: KpiEntryRow[] = []
  let targets: KpiTargetRow[] = []

  if (initialSelected) {
    const scoped = await fetchKarteMemberScopedKpiData(
      {
        selectedMember: initialSelected.member,
        members,
        affiliations,
        todayJst,
        readableImportLogs,
      },
      client,
    )
    scopedMemberIds = scoped.scopedMemberIds
    approvedEntries = scoped.approvedEntries
    targets = scoped.targets
  }

  return {
    viewer,
    todayJst,
    members,
    affiliations,
    teams,
    readableImportLogs,
    scopedMemberIds,
    approvedEntries,
    targets,
    roleplays,
    roleplayThemes: (rpThemesRes.data ?? []) as RoleplayThemeRow[],
    memberThemes,
    seminars,
    seminarMembers,
    memos,
    memoTargets,
    memoMasters: (mastersRes.data ?? []) as MemoMasterRow[],
    settings: parseKarteSettings((settingsRes.data ?? []) as SettingRow[]),
  }
}
