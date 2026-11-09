import { describe, expect, it } from 'vitest'
import type { ViewerContext } from '../../src/foundation/viewer'
import {
  formatHomeDbError,
  parseHomeRoleplaySettings,
} from '../../src/features/home'
import {
  buildHomeSummary,
  countAdminCsvImports,
  countPendingCheckMemos,
  countPendingTalksForViewer,
  countRoleplayNotices,
  countUnrespondedAlerts,
  fetchAllHomeRowsByRange,
} from '../../src/features/home/shared'
import type { AlertRow, ImportLogRow } from '../../src/features/kpi/shared/types'
import type { SubordinateMemoRow } from '../../src/features/memo/memo-logic'
import type {
  MemberThemeRow,
  RoleplayRow,
  RoleplaySettingsMap,
  TalkRow,
} from '../../src/features/roleplay/shared/types'

const defaultRoleplaySettings: RoleplaySettingsMap = {
  roleplay_alert_minutes: 30,
  roleplay_alert_days: 14,
  roleplay_graduate_count: 2,
  roleplay_check_days: 14,
}

const sampleAlerts: AlertRow[] = [
  {
    id: 'al-1',
    import_log_id: 'imp-approved',
    member_id: 'member-1',
    date: '2026-11-06',
    compare: 'daily',
    item: 'total',
    actual: 80,
    target: 100,
    needs_response: true,
    response: null,
    response_reason: null,
    responded_by: null,
    responded_at: null,
    created_at: '2026-11-06T10:00:00Z',
  },
  {
    id: 'al-2',
    import_log_id: 'imp-approved',
    member_id: 'member-1',
    date: '2026-11-06',
    compare: 'daily',
    item: 'apo',
    actual: 1,
    target: 2,
    needs_response: true,
    response: 'done',
    response_reason: '16時台のトークを見直す',
    responded_by: 'leader-a',
    responded_at: '2026-11-06T11:00:00Z',
    created_at: '2026-11-06T10:00:00Z',
  },
  {
    id: 'al-3',
    import_log_id: 'imp-approved',
    member_id: 'member-1',
    date: '2026-11-06',
    compare: 'pace',
    item: 'apo',
    actual: 3,
    target: 8,
    needs_response: false,
    response: null,
    response_reason: null,
    responded_by: null,
    responded_at: null,
    created_at: '2026-11-06T10:00:00Z',
  },
]

const sampleMemos: SubordinateMemoRow[] = [
  {
    id: 'memo-due',
    created_by: 'leader-a',
    date: '2026-11-04',
    theme_id: null,
    kind_id: null,
    noticed: '事実1',
    guidance: '指導1',
    next_check_on: '2026-11-06',
    action_check: null,
    result_check: null,
    checked_on: null,
    training_id: null,
    is_legacy: false,
    legacy_source: null,
    submitted_at: '2026-11-04T09:00:00Z',
    hidden_at: null,
    created_at: '2026-11-04T09:00:00Z',
    updated_at: '2026-11-04T09:00:00Z',
  },
  {
    id: 'memo-future',
    created_by: 'leader-a',
    date: '2026-11-05',
    theme_id: null,
    kind_id: null,
    noticed: '事実2',
    guidance: '指導2',
    next_check_on: '2026-11-15',
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
]

const sampleMemberThemes: MemberThemeRow[] = [
  {
    id: 'mt-1',
    member_id: 'member-1',
    theme_id: 'theme-1',
    kind: 'apo',
    started_on: '2026-10-01', // 14日以上経過 → 長期練習中
    pass_line: '基準',
    status: 'practicing',
    graduated_on: null,
    check_on: null,
    created_by: 'leader-a',
    hidden_at: null,
  },
]

const sampleRoleplays: RoleplayRow[] = [
  {
    id: 'rp-over',
    date: '2026-11-05',
    runner_member_id: 'leader-a',
    member_id: 'member-1',
    time_slot: '10',
    kind: 'apo',
    theme_id: 'theme-1',
    used_talk_id: null,
    minutes: 35, // 30分超え → 時間オーバー +1
    homework_result: 'o',
    repeat_count: 2,
    pass_result: 'o',
    next_homework: null,
    fixed_point: '良かった',
    note: null,
    purpose: null,
    result_ap: null,
    result_rate: null,
    submitted_at: '2026-11-05T09:00:00Z',
    hidden_at: null,
  },
]

const sampleTalks: TalkRow[] = [
  {
    id: 'talk-team-a',
    code: 'OUT-001',
    scene_id: null,
    industry_id: null,
    list_type_id: null,
    their_words: '忙しい',
    wording: '1分だけ',
    aim: '導入',
    status: 'pending',
    team_id: 'team-a',
    created_by: 'member-1',
    hidden_at: null,
  },
  {
    id: 'talk-team-b',
    code: 'OUT-002',
    scene_id: null,
    industry_id: null,
    list_type_id: null,
    their_words: '不要',
    wording: '事例紹介',
    aim: '切り返し',
    status: 'pending',
    team_id: 'team-b',
    created_by: 'member-2',
    hidden_at: null,
  },
  {
    id: 'talk-no-team',
    code: 'OUT-003',
    scene_id: null,
    industry_id: null,
    list_type_id: null,
    their_words: '資料送って',
    wording: '要点確認',
    aim: 'アポ打診',
    status: 'pending',
    team_id: null,
    created_by: 'leader-a',
    hidden_at: null,
  },
]

const sampleImportLogs: ImportLogRow[] = [
  {
    id: 'imp-pending',
    target_date: '2026-11-06',
    csv_team_name: '架空チームA',
    team_id: 'team-a',
    file_name: 'kpi_1106.csv',
    row_count: 10,
    error_count: 0,
    totals_match: true,
    notes: null,
    status: 'pending',
    imported_by: 'leader-a',
    imported_at: '2026-11-06T09:00:00Z',
    approved_by: null,
    approved_at: null,
    approval_kind: null,
    replaced_at: null,
    alerts_created_at: null,
    alert_count: null,
  },
  {
    id: 'imp-approved-no-alerts',
    target_date: '2026-11-05',
    csv_team_name: '架空チームA',
    team_id: 'team-a',
    file_name: 'kpi_1105.csv',
    row_count: 10,
    error_count: 0,
    totals_match: true,
    notes: null,
    status: 'approved',
    imported_by: 'leader-a',
    imported_at: '2026-11-05T09:00:00Z',
    approved_by: 'leader-a',
    approved_at: '2026-11-05T09:05:00Z',
    approval_kind: 'manual',
    replaced_at: null,
    alerts_created_at: null,
    alert_count: null,
  },
  {
    id: 'imp-approved',
    target_date: '2026-11-04',
    csv_team_name: '架空チームA',
    team_id: 'team-a',
    file_name: 'kpi_1104.csv',
    row_count: 10,
    error_count: 0,
    totals_match: true,
    notes: null,
    status: 'approved',
    imported_by: 'leader-a',
    imported_at: '2026-11-04T09:00:00Z',
    approved_by: 'leader-a',
    approved_at: '2026-11-04T09:05:00Z',
    approval_kind: 'manual',
    replaced_at: null,
    alerts_created_at: '2026-11-04T09:06:00Z',
    alert_count: 2,
  },
]

describe('home shared calculations', () => {
  it('未対応の未達（import_logsが読めない非管理者でもalertsから直接数える）・部下メモの確認待ち・ロープレの知らせ・トークの確認待ち・CSV取り込みを各画面と同じ式で数える', () => {
    expect(countUnrespondedAlerts(sampleAlerts)).toBe(1)
    expect(
      countPendingCheckMemos(sampleMemos, 'leader-a', '2026-11-06'),
    ).toBe(1)

    const rpNotices = countRoleplayNotices(
      sampleMemberThemes,
      sampleRoleplays,
      defaultRoleplaySettings,
      '2026-11-06',
    )
    expect(rpNotices.total).toBe(2)

    expect(countAdminCsvImports(sampleImportLogs, 'leader-a')).toBe(2)
  })

  it('リーダー（管理者なし）とリーダー（管理者あり）とMGRと代表で、役割ごとの項目と件数・遷移先が正しく組み立てられる', () => {
    const viewerLeaderNonAdmin: ViewerContext = {
      memberId: 'leader-a',
      role: 'leader',
      isAdmin: false,
      isTalkOwner: false,
      isCeo: false,
      teamId: 'team-a',
      mgrTeamIds: [],
    }
    // 管理者でないリーダーは importLogs が 0件（[]）でも未対応の未達が 1件出る
    const leaderRes = buildHomeSummary({
      viewer: viewerLeaderNonAdmin,
      todayJst: '2026-11-06',
      alerts: sampleAlerts,
      memos: sampleMemos,
      memberThemes: sampleMemberThemes,
      roleplays: sampleRoleplays,
      roleplaySettings: defaultRoleplaySettings,
      talks: sampleTalks,
      importLogs: [],
    })

    expect(leaderRes.items.map((i) => i.key)).toEqual([
      'unresponded_alerts',
      'pending_check_memos',
      'roleplay_notices',
      'pending_talks',
    ])
    expect(leaderRes.counts.unrespondedAlerts).toBe(1)
    expect(leaderRes.counts.pendingTalks).toBe(1)

    const viewerLeaderAdmin: ViewerContext = {
      ...viewerLeaderNonAdmin,
      isAdmin: true,
    }
    const leaderAdminRes = buildHomeSummary({
      viewer: viewerLeaderAdmin,
      todayJst: '2026-11-06',
      alerts: sampleAlerts,
      memos: sampleMemos,
      memberThemes: sampleMemberThemes,
      roleplays: sampleRoleplays,
      roleplaySettings: defaultRoleplaySettings,
      talks: sampleTalks,
      importLogs: sampleImportLogs,
    })
    expect(leaderAdminRes.items.map((i) => i.key)).toContain('csv_imports')
    expect(leaderAdminRes.counts.csvImports).toBe(2)

    const viewerMgr: ViewerContext = {
      memberId: 'mgr-1',
      role: 'mgr',
      isAdmin: false,
      isTalkOwner: false,
      isCeo: false,
      teamId: null,
      mgrTeamIds: ['team-a', 'team-b'],
    }
    const mgrRes = buildHomeSummary({
      viewer: viewerMgr,
      todayJst: '2026-11-06',
      alerts: sampleAlerts,
      memos: sampleMemos,
      memberThemes: sampleMemberThemes,
      roleplays: sampleRoleplays,
      roleplaySettings: defaultRoleplaySettings,
      talks: sampleTalks,
      importLogs: [],
    })
    expect(mgrRes.counts.unrespondedAlerts).toBe(1)
    expect(countPendingTalksForViewer(sampleTalks, viewerMgr)).toBe(2)
    expect(mgrRes.counts.pendingCheckMemos).toBe(0)
    expect(
      mgrRes.items.find((i) => i.key === 'pending_check_memos')?.count,
    ).toBe(0)

    const viewerCeo: ViewerContext = {
      memberId: 'ceo-1',
      role: 'ceo',
      isAdmin: true,
      isTalkOwner: false,
      isCeo: true,
      teamId: null,
      mgrTeamIds: [],
    }
    const ceoRes = buildHomeSummary({
      viewer: viewerCeo,
      todayJst: '2026-11-06',
      alerts: sampleAlerts,
      memos: sampleMemos,
      memberThemes: sampleMemberThemes,
      roleplays: sampleRoleplays,
      roleplaySettings: defaultRoleplaySettings,
      talks: sampleTalks,
      importLogs: sampleImportLogs,
    })
    expect(ceoRes.counts.pendingTalks).toBe(1)

    const emptySettings = parseHomeRoleplaySettings([])
    expect(emptySettings.missingKeys.length).toBe(4)
    expect(emptySettings.roleplaySettings.roleplay_alert_minutes).toBe(30)
    expect(formatHomeDbError({ message: 'rls denied' })).toContain(
      'この操作はできません',
    )
  })

  it('fetchAllHomeRowsByRange：偽のクライアントで2,500行を1,000行ずつ3回に分けて全部読める', async () => {
    const totalRows = Array.from({ length: 2500 }, (_, i) => ({
      id: `alert-${i + 1}`,
    }))
    const rangeCalls: Array<[number, number]> = []
    const loaded = await fetchAllHomeRowsByRange((from, to) => {
      rangeCalls.push([from, to])
      return Promise.resolve({
        data: totalRows.slice(from, to + 1),
        error: null,
      })
    })
    expect(rangeCalls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
    expect(loaded.length).toBe(2500)
  })
})
