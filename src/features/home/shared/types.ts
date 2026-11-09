import type { ViewerContext } from '../../../foundation/viewer'
import type { AlertRow, ImportLogRow } from '../../kpi/shared/types'
import type { SubordinateMemoRow } from '../../memo/memo-logic'
import type { ThemeNoticesSummary } from '../../roleplay/record/logic'
import type {
  MemberThemeRow,
  RoleplayRow,
  RoleplaySettingsMap,
  TalkRow,
} from '../../roleplay/shared/types'

export type HomeTodoKey =
  | 'unresponded_alerts'
  | 'pending_check_memos'
  | 'roleplay_notices'
  | 'pending_talks'
  | 'csv_imports'

export interface HomeTodoItem {
  key: HomeTodoKey
  title: string
  description: string
  count: number
  href: string
  badgeNote?: string
}

export interface HomeFuturePlaceholderItem {
  key: string
  title: string
  milestoneLabel: string
  roles: Array<'leader' | 'mgr' | 'ceo'>
}

export interface BuildHomeSummaryInput {
  viewer: ViewerContext
  todayJst: string
  alerts: AlertRow[]
  approvedImportIds?: Set<string>
  memos: SubordinateMemoRow[]
  memberThemes: MemberThemeRow[]
  roleplays: RoleplayRow[]
  roleplaySettings: RoleplaySettingsMap
  talks: TalkRow[]
  importLogs: ImportLogRow[]
}

export interface HomeSummaryResult {
  items: HomeTodoItem[]
  futureItems: HomeFuturePlaceholderItem[]
  counts: {
    unrespondedAlerts: number
    pendingCheckMemos: number
    roleplayNotices: number
    pendingTalks: number
    csvImports: number
  }
  themeNoticesDetail: ThemeNoticesSummary
}
