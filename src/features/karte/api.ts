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

export async function fetchKartePageDataset(
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
    importLogsRes,
    entriesRes,
    targetsRes,
    roleplaysRes,
    rpThemesRes,
    memberThemesRes,
    seminarsRes,
    semMembersRes,
    memosRes,
    memoTargetsRes,
    mastersRes,
  ] = await Promise.all([
    client.from('members').select('*').order('name', { ascending: true }),
    client.from('member_affiliations').select('*'),
    client.from('teams').select('*').order('name', { ascending: true }),
    client
      .from('settings')
      .select('*')
      .in('key', ['kpi_holidays', 'kpi_workdays', 'karte_call_hour_threshold']),
    client.from('import_logs').select('*').eq('status', 'approved'),
    client.from('kpi_entries').select('*').order('date', { ascending: true }),
    client.from('targets').select('*'),
    client
      .from('roleplays')
      .select('*')
      .is('hidden_at', null)
      .order('date', { ascending: false }),
    client
      .from('roleplay_themes')
      .select('*')
      .order('stage', { ascending: true })
      .order('no', { ascending: true }),
    client
      .from('member_themes')
      .select('*')
      .is('hidden_at', null)
      .order('started_on', { ascending: false }),
    client
      .from('seminars')
      .select('*')
      .is('hidden_at', null)
      .order('date', { ascending: false }),
    client.from('seminar_members').select('*'),
    client
      .from('subordinate_memos')
      .select('*')
      .is('hidden_at', null)
      .order('date', { ascending: false }),
    client.from('subordinate_memo_targets').select('*'),
    client
      .from('masters')
      .select('*')
      .in('kind', ['memo_theme', 'memo_kind'])
      .order('sort_order', { ascending: true }),
  ])

  const firstError =
    membersRes.error ||
    affRes.error ||
    teamsRes.error ||
    settingsRes.error ||
    importLogsRes.error ||
    entriesRes.error ||
    targetsRes.error ||
    roleplaysRes.error ||
    rpThemesRes.error ||
    memberThemesRes.error ||
    seminarsRes.error ||
    semMembersRes.error ||
    memosRes.error ||
    memoTargetsRes.error ||
    mastersRes.error

  if (firstError) {
    throw firstError
  }

  const approvedImportIds = new Set(
    ((importLogsRes.data ?? []) as ImportLogRow[]).map((l) => l.id),
  )

  const allEntries = (entriesRes.data ?? []) as KpiEntryRow[]
  const approvedEntries = allEntries.filter((e) =>
    approvedImportIds.has(e.import_log_id),
  )

  return {
    viewer,
    todayJst,
    members: (membersRes.data ?? []) as MemberRow[],
    affiliations: (affRes.data ?? []) as MemberAffiliationRow[],
    teams: (teamsRes.data ?? []) as TeamRow[],
    approvedEntries,
    targets: (targetsRes.data ?? []) as KpiTargetRow[],
    roleplays: (roleplaysRes.data ?? []) as KarteRoleplayRow[],
    roleplayThemes: (rpThemesRes.data ?? []) as RoleplayThemeRow[],
    memberThemes: (memberThemesRes.data ?? []) as MemberThemeRow[],
    seminars: (seminarsRes.data ?? []) as KarteSeminarRow[],
    seminarMembers: (semMembersRes.data ?? []) as SeminarMemberRow[],
    memos: (memosRes.data ?? []) as SubordinateMemoRow[],
    memoTargets: (memoTargetsRes.data ?? []) as SubordinateMemoTargetRow[],
    memoMasters: (mastersRes.data ?? []) as MemoMasterRow[],
    settings: parseKarteSettings((settingsRes.data ?? []) as SettingRow[]),
  }
}
