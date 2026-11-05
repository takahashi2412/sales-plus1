import { supabase } from '../../../foundation/supabaseClient'
import type {
  MemberAffiliationRow,
  MemberRow,
  TeamRow,
} from '../../../foundation/types'
import { fetchViewerContext, type ViewerContext } from '../../../foundation/viewer'
import {
  KPI_TIME_SLOTS,
  buildBusinessDaysContext,
  evaluateMemberAlertsForImport,
  getMonthFirstDate,
  persistGeneratedAlertsAndMarkImportLog,
  type CtiMemberMapRow,
  type CtiTeamMapRow,
  type GeneratedAlertDraft,
  type ImportLogRow,
  type KpiEntryRow,
  type KpiTargetRow,
  type ParsedKpiCsv,
} from '../shared'

export interface KpiImportScreenData {
  viewer: ViewerContext | null
  members: MemberRow[]
  teams: TeamRow[]
  affiliations: MemberAffiliationRow[]
  memberMaps: CtiMemberMapRow[]
  teamMaps: CtiTeamMapRow[]
  importLogs: ImportLogRow[]
  holidaysSetting: string[] | null
  holidaysConfigured: boolean
}

export async function fetchKpiImportScreenData(): Promise<KpiImportScreenData> {
  const viewer = await fetchViewerContext(supabase)
  if (!viewer || !viewer.isAdmin) {
    return {
      viewer,
      members: [],
      teams: [],
      affiliations: [],
      memberMaps: [],
      teamMaps: [],
      importLogs: [],
      holidaysSetting: null,
      holidaysConfigured: false,
    }
  }

  const [
    membersRes,
    teamsRes,
    affRes,
    memberMapsRes,
    teamMapsRes,
    importLogsRes,
    settingsRes,
  ] = await Promise.all([
    supabase.from('members').select('*').order('name', { ascending: true }),
    supabase.from('teams').select('*').order('name', { ascending: true }),
    supabase.from('member_affiliations').select('*'),
    supabase
      .from('cti_member_map')
      .select('*')
      .order('cti_name', { ascending: true })
      .order('valid_from', { ascending: false }),
    supabase
      .from('cti_team_map')
      .select('*')
      .order('csv_team_name', { ascending: true })
      .order('valid_from', { ascending: false }),
    supabase
      .from('import_logs')
      .select('*')
      .order('target_date', { ascending: false })
      .order('imported_at', { ascending: false }),
    supabase.from('settings').select('key, value').eq('key', 'kpi_holidays').limit(1),
  ])

  if (membersRes.error) throw membersRes.error
  if (teamsRes.error) throw teamsRes.error
  if (affRes.error) throw affRes.error
  if (memberMapsRes.error) throw memberMapsRes.error
  if (teamMapsRes.error) throw teamMapsRes.error
  if (importLogsRes.error) throw importLogsRes.error
  if (settingsRes.error) throw settingsRes.error

  const settingRow = (settingsRes.data ?? [])[0] as { key: string; value: unknown } | undefined
  const holidaysSetting =
    settingRow && Array.isArray(settingRow.value)
      ? settingRow.value.filter((v): v is string => typeof v === 'string')
      : null

  return {
    viewer,
    members: (membersRes.data ?? []) as MemberRow[],
    teams: (teamsRes.data ?? []) as TeamRow[],
    affiliations: (affRes.data ?? []) as MemberAffiliationRow[],
    memberMaps: (memberMapsRes.data ?? []) as CtiMemberMapRow[],
    teamMaps: (teamMapsRes.data ?? []) as CtiTeamMapRow[],
    importLogs: (importLogsRes.data ?? []) as ImportLogRow[],
    holidaysSetting,
    holidaysConfigured: holidaysSetting !== null,
  }
}

export async function fetchApprovedMemberIdsOnDate(targetDate: string): Promise<string[]> {
  const { data: logs, error: logsError } = await supabase
    .from('import_logs')
    .select('id')
    .eq('target_date', targetDate)
    .eq('status', 'approved')

  if (logsError) throw logsError
  const logIds = (logs ?? []).map((l: { id: string }) => l.id)
  if (logIds.length === 0) return []

  const { data: entries, error: entriesError } = await supabase
    .from('kpi_entries')
    .select('member_id')
    .in('import_log_id', logIds)

  if (entriesError) throw entriesError
  return Array.from(
    new Set((entries ?? []).map((e: { member_id: string }) => e.member_id)),
  )
}

export async function addCtiMemberMapping(input: {
  ctiName: string
  memberId: string | null
  validFrom: string
  createdBy: string
}): Promise<CtiMemberMapRow> {
  const { data, error } = await supabase
    .from('cti_member_map')
    .insert({
      cti_name: input.ctiName.trim(),
      member_id: input.memberId,
      valid_from: input.validFrom,
      valid_to: null,
      created_by: input.createdBy,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as CtiMemberMapRow
}

export async function updateCtiMemberMapValidTo(
  id: string,
  validTo: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('cti_member_map')
    .update({ valid_to: validTo })
    .eq('id', id)

  if (error) throw error
}

export async function addCtiTeamMapping(input: {
  csvTeamName: string
  teamId: string
  validFrom: string
  createdBy: string
}): Promise<CtiTeamMapRow> {
  const { data, error } = await supabase
    .from('cti_team_map')
    .insert({
      csv_team_name: input.csvTeamName.trim(),
      team_id: input.teamId,
      valid_from: input.validFrom,
      valid_to: null,
      created_by: input.createdBy,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as CtiTeamMapRow
}

export async function updateCtiTeamMapValidTo(
  id: string,
  validTo: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('cti_team_map')
    .update({ valid_to: validTo })
    .eq('id', id)

  if (error) throw error
}

export interface SavePendingImportInput {
  parsed: ParsedKpiCsv
  resolvedTeamId: string | null
  mappedRows: Array<{
    ctiName: string
    memberId: string
    slots: ParsedKpiCsv['personRows'][number]['slots']
  }>
  ignoredNames: string[]
  teamMismatchWarnings: unknown[]
  existingImportLogIdToReplace: string | null
  importerMemberId: string
}

export async function savePendingCsvImport(
  input: SavePendingImportInput,
): Promise<ImportLogRow> {
  const targetDate = input.parsed.targetDate
  const csvTeamName = input.parsed.csvTeamName
  if (!targetDate || !csvTeamName) {
    throw new Error('対象日またはCSVのチーム名が読み取れません。')
  }

  // 1. 置きかえ対象の記録がある場合は先に status = 'replaced' にする（replaced_at はトリガーが自動設定）
  if (input.existingImportLogIdToReplace) {
    const { data: replacedRows, error: replaceErr } = await supabase
      .from('import_logs')
      .update({ status: 'replaced' })
      .eq('id', input.existingImportLogIdToReplace)
      .select('id')

    if (replaceErr) throw replaceErr
    if (!replacedRows || replacedRows.length === 0) {
      throw new Error('この操作はできません')
    }
  }

  // 2. 新しい import_logs を status = 'pending' で作る
  const { data: newLogData, error: newLogErr } = await supabase
    .from('import_logs')
    .insert({
      target_date: targetDate,
      csv_team_name: csvTeamName,
      team_id: input.resolvedTeamId,
      file_name: input.parsed.fileName,
      row_count: input.mappedRows.length,
      error_count: 0,
      totals_match: input.parsed.totalsMatch,
      notes: {
        ignored_names: input.ignoredNames,
        team_mismatch_warnings: input.teamMismatchWarnings,
      },
      status: 'pending',
      imported_by: input.importerMemberId,
    })
    .select('*')
    .single()

  if (newLogErr) throw newLogErr
  const newLog = newLogData as ImportLogRow

  // 3. 日々のKPI（kpi_entries）を 1人×14時間帯 ずつ入れる
  const entryPayloads: Array<{
    import_log_id: string
    member_id: string
    date: string
    time_slot: string
    total: number
    connected: number
    recall: number
    owner: number
    prospect: number
    apo: number
  }> = []

  for (const person of input.mappedRows) {
    for (const slot of KPI_TIME_SLOTS) {
      const m = person.slots[slot]
      entryPayloads.push({
        import_log_id: newLog.id,
        member_id: person.memberId,
        date: targetDate,
        time_slot: slot,
        total: m.total,
        connected: m.connected,
        recall: m.recall,
        owner: m.owner,
        prospect: m.prospect,
        apo: m.apo,
      })
    }
  }

  if (entryPayloads.length > 0) {
    const { error: entriesErr } = await supabase.from('kpi_entries').insert(entryPayloads)
    if (entriesErr) throw entriesErr
  }

  return newLog
}

export async function cancelPendingImportLog(importLogId: string): Promise<void> {
  const { data, error } = await supabase
    .from('import_logs')
    .update({ status: 'replaced' })
    .eq('id', importLogId)
    .select('id')

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('この操作はできません')
  }
}

/**
 * 承認済みの import_log に対して未達を計算し、alerts に入れ（.select() なし・ignoreDuplicates）、
 * import_logs の alerts_created_at と alert_count を記録する。
 */
export async function generateAlertsForApprovedImport(
  importLog: ImportLogRow,
  holidaysSetting: readonly string[] | null,
): Promise<{ alertCount: number; drafts: GeneratedAlertDraft[] }> {
  const targetDate = importLog.target_date
  const monthFirst = getMonthFirstDate(targetDate)
  const busCtx = buildBusinessDaysContext(targetDate, holidaysSetting)

  // この取り込みに含まれるメンバー一覧を取得
  const { data: logEntries, error: logEntriesErr } = await supabase
    .from('kpi_entries')
    .select('member_id')
    .eq('import_log_id', importLog.id)

  if (logEntriesErr) throw logEntriesErr
  const memberIds = Array.from(
    new Set((logEntries ?? []).map((e: { member_id: string }) => e.member_id)),
  )

  if (memberIds.length === 0) {
    const nowIso = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from('import_logs')
      .update({
        alerts_created_at: nowIso,
        alert_count: 0,
      })
      .eq('id', importLog.id)
    if (updateErr) throw updateErr
    return { alertCount: 0, drafts: [] }
  }

  // その月の1日〜対象日までの承認済み import_logs を取得
  const { data: approvedLogs, error: approvedLogsErr } = await supabase
    .from('import_logs')
    .select('id')
    .eq('status', 'approved')
    .gte('target_date', monthFirst)
    .lte('target_date', targetDate)

  if (approvedLogsErr) throw approvedLogsErr
  const approvedLogIds = Array.from(
    new Set([
      importLog.id,
      ...(approvedLogs ?? []).map((l: { id: string }) => l.id),
    ]),
  )

  // 対象メンバーの当月承認済み kpi_entries と当月 kpi_targets を取得
  const [monthEntriesRes, targetsRes] = await Promise.all([
    supabase
      .from('kpi_entries')
      .select('import_log_id, member_id, date, total, connected, recall, owner, prospect, apo')
      .in('import_log_id', approvedLogIds)
      .in('member_id', memberIds),
    supabase
      .from('kpi_targets')
      .select('*')
      .eq('month', monthFirst)
      .in('member_id', memberIds),
  ])

  if (monthEntriesRes.error) throw monthEntriesRes.error
  if (targetsRes.error) throw targetsRes.error

  const allEntries = (monthEntriesRes.data ?? []) as Array<
    Pick<
      KpiEntryRow,
      'import_log_id' | 'member_id' | 'date' | 'total' | 'connected' | 'recall' | 'owner' | 'prospect' | 'apo'
    >
  >
  const allTargets = (targetsRes.data ?? []) as KpiTargetRow[]
  const targetByMember = new Map<string, KpiTargetRow>(
    allTargets.map((t) => [t.member_id, t]),
  )

  const allDrafts: GeneratedAlertDraft[] = []

  for (const memberId of memberIds) {
    const memberEntries = allEntries.filter((e) => e.member_id === memberId)
    const monthlyTarget = targetByMember.get(memberId) ?? null
    const memberDrafts = evaluateMemberAlertsForImport({
      importLogId: importLog.id,
      memberId,
      targetDate,
      holidays: busCtx.holidays,
      monthlyTarget,
      approvedMonthEntries: memberEntries,
    })
    allDrafts.push(...memberDrafts)
  }

  // alerts には 1回の .insert(allDrafts) でまとめて入れ（.select() なし・upsert 不使用）、
  // 一意違反（23505）のときは前に入れ終えていたものとして import_logs の alerts_created_at・alert_count 更新へ進む
  await persistGeneratedAlertsAndMarkImportLog(supabase, importLog.id, allDrafts)

  return {
    alertCount: allDrafts.length,
    drafts: allDrafts,
  }
}

export async function approvePendingImportAndGenerateAlerts(
  importLog: ImportLogRow,
  holidaysSetting: readonly string[] | null,
): Promise<{ alertCount: number; drafts: GeneratedAlertDraft[] }> {
  // 1. status を 'approved' に更新（approved_by, approved_at, approval_kind はDBトリガーが設定）
  const { data: approvedRows, error: approveErr } = await supabase
    .from('import_logs')
    .update({ status: 'approved' })
    .eq('id', importLog.id)
    .select('id')

  if (approveErr) throw approveErr
  if (!approvedRows || approvedRows.length === 0) {
    throw new Error('この操作はできません')
  }

  // 2. 直後に未達を計算して alerts に書き込み、alerts_created_at と alert_count を記録
  return generateAlertsForApprovedImport(
    { ...importLog, status: 'approved' },
    holidaysSetting,
  )
}

export interface PendingEntrySummary {
  memberId: string
  total: number
  connected: number
  recall: number
  owner: number
  prospect: number
  apo: number
}

export async function fetchEntriesSummaryForImportLog(
  importLogId: string,
): Promise<PendingEntrySummary[]> {
  const { data, error } = await supabase
    .from('kpi_entries')
    .select('member_id, total, connected, recall, owner, prospect, apo')
    .eq('import_log_id', importLogId)

  if (error) throw error
  const map = new Map<string, PendingEntrySummary>()
  for (const row of (data ?? []) as Array<{
    member_id: string
    total: number
    connected: number
    recall: number
    owner: number
    prospect: number
    apo: number
  }>) {
    const existing = map.get(row.member_id) ?? {
      memberId: row.member_id,
      total: 0,
      connected: 0,
      recall: 0,
      owner: 0,
      prospect: 0,
      apo: 0,
    }
    existing.total += row.total
    existing.connected += row.connected
    existing.recall += row.recall
    existing.owner += row.owner
    existing.prospect += row.prospect
    existing.apo += row.apo
    map.set(row.member_id, existing)
  }
  return Array.from(map.values())
}
