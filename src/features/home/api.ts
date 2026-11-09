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
  AlertRow,
  ImportLogRow,
} from '../kpi/shared/types'
import type { SubordinateMemoRow } from '../memo/memo-logic'
import type {
  MemberThemeRow,
  RoleplayRow,
  RoleplaySettingKey,
  RoleplaySettingsMap,
  SettingRow,
  TalkRow,
} from '../roleplay/shared/types'

export const DEFAULT_HOME_ROLEPLAY_SETTINGS: RoleplaySettingsMap = {
  roleplay_alert_minutes: 30,
  roleplay_alert_days: 14,
  roleplay_graduate_count: 2,
  roleplay_check_days: 14,
}

export interface HomeSettingsState {
  roleplaySettings: RoleplaySettingsMap
  missingKeys: string[]
}

export interface HomePageDataset {
  viewer: ViewerContext | null
  todayJst: string
  members: MemberRow[]
  affiliations: MemberAffiliationRow[]
  teams: TeamRow[]
  alerts: AlertRow[]
  approvedImportIds: Set<string>
  importLogs: ImportLogRow[]
  memos: SubordinateMemoRow[]
  memberThemes: MemberThemeRow[]
  roleplays: RoleplayRow[]
  talks: TalkRow[]
  settings: HomeSettingsState
}

const ROLEPLAY_SETTING_KEYS: readonly RoleplaySettingKey[] = [
  'roleplay_alert_minutes',
  'roleplay_alert_days',
  'roleplay_graduate_count',
  'roleplay_check_days',
]

export function parseHomeRoleplaySettings(
  rows: SettingRow[],
): HomeSettingsState {
  const keyMap = new Map<string, unknown>(rows.map((r) => [r.key, r.value]))
  const missingKeys: string[] = []
  const roleplaySettings: RoleplaySettingsMap = {
    ...DEFAULT_HOME_ROLEPLAY_SETTINGS,
  }

  for (const key of ROLEPLAY_SETTING_KEYS) {
    if (!keyMap.has(key)) {
      missingKeys.push(key)
      continue
    }
    const num = Number(keyMap.get(key))
    if (Number.isFinite(num) && num > 0) {
      roleplaySettings[key] = num
    }
  }

  return {
    roleplaySettings,
    missingKeys,
  }
}

export function formatHomeDbError(err: unknown): string {
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

export async function fetchHomePageDataset(
  client: SupabaseClient = supabase,
): Promise<HomePageDataset> {
  const todayJst = getTodayJstDateString()
  const viewer = await fetchViewerContext(client)

  if (!viewer) {
    return {
      viewer: null,
      todayJst,
      members: [],
      affiliations: [],
      teams: [],
      alerts: [],
      approvedImportIds: new Set(),
      importLogs: [],
      memos: [],
      memberThemes: [],
      roleplays: [],
      talks: [],
      settings: {
        roleplaySettings: { ...DEFAULT_HOME_ROLEPLAY_SETTINGS },
        missingKeys: [],
      },
    }
  }

  const [
    membersRes,
    affRes,
    teamsRes,
    alertsRes,
    importLogsRes,
    memosRes,
    memberThemesRes,
    roleplaysRes,
    talksRes,
    settingsRes,
  ] = await Promise.all([
    client.from('members').select('*').order('name', { ascending: true }),
    client.from('member_affiliations').select('*'),
    client.from('teams').select('*').order('name', { ascending: true }),
    client.from('alerts').select('*'),
    client.from('import_logs').select('*'),
    client
      .from('subordinate_memos')
      .select('*')
      .is('hidden_at', null)
      .order('date', { ascending: false }),
    client
      .from('member_themes')
      .select('*')
      .is('hidden_at', null)
      .order('started_on', { ascending: false }),
    client
      .from('roleplays')
      .select('*')
      .is('hidden_at', null)
      .order('date', { ascending: false }),
    client
      .from('talks')
      .select('*')
      .is('hidden_at', null)
      .order('code', { ascending: true }),
    client.from('settings').select('*').in('key', [...ROLEPLAY_SETTING_KEYS]),
  ])

  const firstError =
    membersRes.error ||
    affRes.error ||
    teamsRes.error ||
    alertsRes.error ||
    importLogsRes.error ||
    memosRes.error ||
    memberThemesRes.error ||
    roleplaysRes.error ||
    talksRes.error ||
    settingsRes.error

  if (firstError) {
    throw firstError
  }

  const importLogs = (importLogsRes.data ?? []) as ImportLogRow[]
  const approvedImportIds = new Set(
    importLogs.filter((l) => l.status === 'approved').map((l) => l.id),
  )

  return {
    viewer,
    todayJst,
    members: (membersRes.data ?? []) as MemberRow[],
    affiliations: (affRes.data ?? []) as MemberAffiliationRow[],
    teams: (teamsRes.data ?? []) as TeamRow[],
    alerts: (alertsRes.data ?? []) as AlertRow[],
    approvedImportIds,
    importLogs,
    memos: (memosRes.data ?? []) as SubordinateMemoRow[],
    memberThemes: (memberThemesRes.data ?? []) as MemberThemeRow[],
    roleplays: (roleplaysRes.data ?? []) as RoleplayRow[],
    talks: (talksRes.data ?? []) as TalkRow[],
    settings: parseHomeRoleplaySettings((settingsRes.data ?? []) as SettingRow[]),
  }
}
