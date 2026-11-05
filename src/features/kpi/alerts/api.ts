import { getTodayJstDateString } from '../../../foundation/directory'
import { supabase } from '../../../foundation/supabaseClient'
import type {
  MemberAffiliationRow,
  MemberRow,
  TeamRow,
} from '../../../foundation/types'
import {
  fetchViewerContext,
  resolveCurrentTeamId,
  type ViewerContext,
} from '../../../foundation/viewer'
import type {
  AlertResponseStatus,
  AlertRow,
} from '../shared'

export interface EnrichedAlertRow extends AlertRow {
  memberName: string
  memberTeamId: string | null
  memberTeamName: string
  responderName: string | null
  canRespond: boolean
}

export interface KpiAlertsScreenData {
  viewer: ViewerContext | null
  alerts: EnrichedAlertRow[]
  teams: TeamRow[]
  availableDates: string[]
}

export async function fetchKpiAlertsScreenData(): Promise<KpiAlertsScreenData> {
  const today = getTodayJstDateString()
  const viewer = await fetchViewerContext(supabase)

  if (!viewer || viewer.role === 'member') {
    return {
      viewer,
      alerts: [],
      teams: [],
      availableDates: [],
    }
  }

  // alerts はデータベースのRLS（is_approved_import）により承認済みの取り込みの分だけが返る
  const [alertsRes, membersRes, teamsRes, affRes] = await Promise.all([
    supabase
      .from('alerts')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase.from('members').select('*'),
    supabase.from('teams').select('*').order('name', { ascending: true }),
    supabase.from('member_affiliations').select('*'),
  ])

  if (alertsRes.error) throw alertsRes.error
  if (membersRes.error) throw membersRes.error
  if (teamsRes.error) throw teamsRes.error
  if (affRes.error) throw affRes.error

  const rawAlerts = (alertsRes.data ?? []) as AlertRow[]
  const members = (membersRes.data ?? []) as MemberRow[]
  const teams = (teamsRes.data ?? []) as TeamRow[]
  const affiliations = (affRes.data ?? []) as MemberAffiliationRow[]

  const memberById = new Map<string, MemberRow>(members.map((m) => [m.id, m]))
  const teamNameById = new Map<string, string>(teams.map((t) => [t.id, t.name]))

  const enriched: EnrichedAlertRow[] = rawAlerts.map((a) => {
    const member = memberById.get(a.member_id)
    const memberTeamId = resolveCurrentTeamId(a.member_id, affiliations, today)
    const memberTeamName = memberTeamId ? (teamNameById.get(memberTeamId) ?? '－') : '所属なし'
    const responderName = a.responded_by
      ? (memberById.get(a.responded_by)?.name ?? '－')
      : null

    // リーダー（その人と今同じチーム、自分自身を除く）だけが対応を記録できる
    const canRespond =
      viewer.role === 'leader' &&
      viewer.memberId !== a.member_id &&
      viewer.teamId !== null &&
      memberTeamId !== null &&
      viewer.teamId === memberTeamId

    return {
      ...a,
      memberName: member?.name ?? '－',
      memberTeamId,
      memberTeamName,
      responderName,
      canRespond,
    }
  })

  const availableDates = Array.from(new Set(enriched.map((a) => a.date))).sort((a, b) =>
    b.localeCompare(a),
  )

  return {
    viewer,
    alerts: enriched,
    teams,
    availableDates,
  }
}

export async function submitAlertResponse(input: {
  alertId: string
  response: AlertResponseStatus
  responseReason: string
}): Promise<void> {
  const trimmedReason = input.responseReason.trim()
  if (!trimmedReason) {
    throw new Error('理由を入力してください（必須）。')
  }

  // alerts の UPDATE は response, response_reason のみ送る（responded_by, responded_at はDBトリガーが自動設定）
  const { data, error } = await supabase
    .from('alerts')
    .update({
      response: input.response,
      response_reason: trimmedReason,
    })
    .eq('id', input.alertId)
    .select('id')

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('この操作はできません')
  }
}
