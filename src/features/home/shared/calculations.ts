import type { ViewerContext } from '../../../foundation/viewer'
import type { AlertRow, ImportLogRow } from '../../kpi/shared/types'
import {
  pickPendingCheckMemos,
  type SubordinateMemoRow,
} from '../../memo/memo-logic'
import {
  buildThemeNoticesSummary,
  type ThemeNoticesSummary,
} from '../../roleplay/record/logic'
import type {
  MemberThemeRow,
  RoleplayRow,
  RoleplaySettingsMap,
  TalkRow,
} from '../../roleplay/shared/types'
import type {
  BuildHomeSummaryInput,
  HomeFuturePlaceholderItem,
  HomeSummaryResult,
  HomeTodoItem,
} from './types'

export const HOME_FUTURE_ITEMS: readonly HomeFuturePlaceholderItem[] = [
  {
    key: 'daily_report_reply',
    title: '返事がほしい日報',
    milestoneLabel: '一般日報の区切りで出ます',
    roles: ['leader'],
  },
  {
    key: 'weekly_edu_summary_reply',
    title: '週の要約の返事待ち',
    milestoneLabel: '週間教育の区切りで出ます',
    roles: ['leader'],
  },
  {
    key: 'manager_report',
    title: '責任者日報',
    milestoneLabel: '責任者日報・集める画面の区切りで出ます',
    roles: ['mgr'],
  },
  {
    key: 'ai_proposal_decision',
    title: 'AIの提案の判断',
    milestoneLabel: 'AI分析・週次コーチの区切りで出ます',
    roles: ['mgr', 'ceo'],
  },
  {
    key: 'org_mvp_report',
    title: '月末の組織MVP の報告',
    milestoneLabel: '責任者日報・集める画面の区切りで出ます',
    roles: ['mgr'],
  },
  {
    key: 'company_dashboard',
    title: '全体のダッシュボード',
    milestoneLabel: '責任者日報・集める画面の区切りで出ます',
    roles: ['ceo'],
  },
]

/**
 * 未対応の未達の件数を数える
 * 読める未達（alerts）のうち、承認済みの取り込みの分で、needs_response が真で response が空のもの（日付は全部）
 */
export function countUnrespondedAlerts(
  alerts: AlertRow[],
  approvedImportIds?: Set<string>,
): number {
  return alerts.filter((alert) => {
    if (approvedImportIds && !approvedImportIds.has(alert.import_log_id)) {
      return false
    }
    return Boolean(alert.needs_response) && !alert.response
  }).length
}

/**
 * 部下メモの確認待ちの件数を数える（pickPendingCheckMemos をそのまま使う）
 */
export function countPendingCheckMemos(
  memos: SubordinateMemoRow[],
  viewerMemberId: string,
  todayJst: string,
): number {
  return pickPendingCheckMemos(memos, viewerMemberId, todayJst).length
}

/**
 * ロープレの知らせの件数を数える（buildThemeNoticesSummary をそのまま使う）
 */
export function countRoleplayNotices(
  memberThemes: MemberThemeRow[],
  roleplays: RoleplayRow[],
  settings: RoleplaySettingsMap,
  todayJst: string,
): { total: number; summary: ThemeNoticesSummary } {
  const summary = buildThemeNoticesSummary(
    memberThemes,
    roleplays,
    settings,
    todayJst,
  )
  const total =
    summary.graduationCandidates.length +
    summary.checkRoleplayNotices.length +
    summary.longPracticingAlerts.length +
    summary.overMinutesRoleplays.length
  return { total, summary }
}

/**
 * トークの確認待ちの件数を数える
 * リーダー：自分のチームの確認待ち、MGR：担当チームの確認待ち、代表：チームなしの確認待ち
 */
export function countPendingTalksForViewer(
  talks: TalkRow[],
  viewer: ViewerContext,
): number {
  return talks.filter((talk) => {
    if (talk.hidden_at !== null) return false
    if (talk.status !== 'pending') return false
    if (viewer.role === 'ceo') {
      return talk.team_id === null
    }
    if (!talk.team_id) return false
    if (viewer.role === 'leader') {
      return viewer.teamId !== null && talk.team_id === viewer.teamId
    }
    if (viewer.role === 'mgr') {
      return viewer.mgrTeamIds.includes(talk.team_id)
    }
    return false
  }).length
}

/**
 * CSV取り込み（管理者の権限がある人だけ）の件数を数える
 * 自分が取り込んだ承認前（pending）の数 ＋ 自分が取り込んで承認したが未達を入れ終えていない（alerts_created_at が空）数
 */
export function countAdminCsvImports(
  importLogs: ImportLogRow[],
  viewerMemberId: string,
): number {
  return importLogs.filter((log) => {
    if (log.imported_by !== viewerMemberId) return false
    if (log.status === 'pending') return true
    if (log.status === 'approved' && log.alerts_created_at === null) return true
    return false
  }).length
}

/**
 * リーダー・MGR・代表ホームの「今日やること」一覧と件数を組み立てる
 */
export function buildHomeSummary(
  input: BuildHomeSummaryInput,
): HomeSummaryResult {
  const {
    viewer,
    todayJst,
    alerts,
    approvedImportIds,
    memos,
    memberThemes,
    roleplays,
    roleplaySettings,
    talks,
    importLogs,
  } = input

  const unrespondedAlerts = countUnrespondedAlerts(alerts, approvedImportIds)
  const pendingCheckMemos = countPendingCheckMemos(
    memos,
    viewer.memberId,
    todayJst,
  )
  const { total: roleplayNotices, summary: themeNoticesDetail } =
    countRoleplayNotices(memberThemes, roleplays, roleplaySettings, todayJst)
  const pendingTalks = countPendingTalksForViewer(talks, viewer)
  const csvImports = viewer.isAdmin
    ? countAdminCsvImports(importLogs, viewer.memberId)
    : 0

  const items: HomeTodoItem[] = []

  // 1. 未対応の未達（リーダー：自分のチームの人。MGR：担当チームの人で見るだけ）
  if (viewer.role === 'leader' || viewer.role === 'mgr') {
    items.push({
      key: 'unresponded_alerts',
      title: '未対応の未達',
      description:
        viewer.role === 'leader'
          ? '自分のチームのメンバーの未対応のKPI未達を確認・記録します。'
          : '担当チームのメンバーの未対応のKPI未達を確認します（見るだけ）。',
      count: unrespondedAlerts,
      href: '#/kpi-alerts',
      badgeNote:
        viewer.role === 'mgr' ? '担当チーム・見るだけ' : '自分のチーム',
    })
  }

  // 2. 部下メモの確認待ち（リーダー・MGR・代表）
  if (
    viewer.role === 'leader' ||
    viewer.role === 'mgr' ||
    viewer.role === 'ceo'
  ) {
    items.push({
      key: 'pending_check_memos',
      title: '部下メモの確認待ち',
      description:
        '自分が書いて送った部下メモのうち、次の確認日が今日以前で、確認したときの行動が未記入のものです。',
      count: pendingCheckMemos,
      href: '#/memo',
    })
  }

  // 3. ロープレの知らせ（リーダー・MGR・代表）
  if (
    viewer.role === 'leader' ||
    viewer.role === 'mgr' ||
    viewer.role === 'ceo'
  ) {
    items.push({
      key: 'roleplay_notices',
      title: 'ロープレの知らせ',
      description:
        '卒業の候補・チェックロープレの頼まれ・長期練習中・時間オーバーの知らせです。',
      count: roleplayNotices,
      href: '#/themes',
    })
  }

  // 4. トークの確認待ち（リーダー・MGR：自分のチーム・担当チームの確認待ち。代表：チームなしの確認待ち）
  if (
    viewer.role === 'leader' ||
    viewer.role === 'mgr' ||
    viewer.role === 'ceo'
  ) {
    items.push({
      key: 'pending_talks',
      title: 'トークの確認待ち',
      description:
        viewer.role === 'ceo'
          ? 'チームなしの確認待ちトークを確認し、試行中・標準への昇格を判断します。'
          : viewer.role === 'mgr'
            ? '担当チームの確認待ちトークを確認します。'
            : '自分のチームの確認待ちトークを確認します。',
      count: pendingTalks,
      href: '#/talks',
      badgeNote:
        viewer.role === 'ceo'
          ? 'チームなし'
          : viewer.role === 'mgr'
            ? '担当チーム'
            : '自分のチーム',
    })
  }

  // 5. CSV取り込み（管理者の権限がある人だけ）
  if (viewer.isAdmin) {
    items.push({
      key: 'csv_imports',
      title: 'CSV取り込み',
      description:
        '自分が取り込んだ承認前の取り込みと、承認済みで未達を入れ終えていない取り込みです。',
      count: csvImports,
      href: '#/kpi-import',
      badgeNote: '管理者',
    })
  }

  return {
    items,
    futureItems: [...HOME_FUTURE_ITEMS],
    counts: {
      unrespondedAlerts,
      pendingCheckMemos,
      roleplayNotices,
      pendingTalks,
      csvImports,
    },
    themeNoticesDetail,
  }
}
