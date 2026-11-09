import type {
  MemberAffiliationRow,
  MemberRow,
  TeamRow,
} from '../../../foundation/types'
import type { ViewerContext } from '../../../foundation/viewer'
import type {
  KpiEntryRow,
  KpiSlotMetrics,
  KpiTargetRow,
  KpiTimeSlot,
} from '../../kpi/shared/types'
import type {
  MemoMasterRow,
  SubordinateMemoRow,
  SubordinateMemoTargetRow,
} from '../../memo/memo-logic'
import type {
  MasterRow,
  MemberThemeRow,
  RoleplayRow,
  RoleplayThemeRow,
  SeminarMemberRow,
  SeminarRow,
} from '../../roleplay/shared/types'

export type KartePeriod = 'today' | 'week' | 'month'

export type KarteKpiMetricKey =
  | 'total'
  | 'connected'
  | 'recall'
  | 'owner'
  | 'prospect'
  | 'apo'

export type KarteRateMetricKey =
  | 'rate_connected'
  | 'rate_recall'
  | 'rate_owner'
  | 'rate_prospect'
  | 'rate_apo_owner'

export interface SelectableKarteMember {
  member: MemberRow
  isRetired: boolean
  teamId: string | null
  teamName: string
  base: string
  leaderNames: string[]
}

export interface KarteKpiAggregation {
  period: KartePeriod
  startDate: string
  endDate: string
  total: number
  connected: number
  recall: number
  owner: number
  prospect: number
  apo: number
  rateConnected: number | null
  rateRecall: number | null
  rateOwner: number | null
  rateProspect: number | null
  rateApoOwner: number | null
}

export interface KarteMetricEvaluation {
  key: KarteKpiMetricKey
  label: string
  actual: number
  periodTarget: number | null
  monthlyTarget: number | null
  shouldBe: number | null
  ratioPercent: number | null
  diff: number | null
}

export interface KarteRateEvaluation {
  key: KarteRateMetricKey
  label: string
  actualRate: number | null
  targetRate: number | null
  diffPoints: number | null
}

export interface KarteTargetEvaluationResult {
  hasTarget: boolean
  period: KartePeriod
  businessDaysInPeriod: number
  metrics: Record<KarteKpiMetricKey, KarteMetricEvaluation>
  rates: Record<KarteRateMetricKey, KarteRateEvaluation>
}

export interface KarteUnmetSlotCounts {
  total: number
  connected: number
  recall: number
  owner: number
  prospect: number
  apo: number
}

export interface KarteDailyCallHoursSummary {
  date: string
  isBusinessDay: boolean
  callHours: number
  unmetSlots: KarteUnmetSlotCounts | null
}

export interface KartePeriodCallHoursSummary {
  threshold: number
  hasTarget: boolean
  totalCallHours: number
  totalUnmetSlots: KarteUnmetSlotCounts | null
  dailyBreakdown: KarteDailyCallHoursSummary[]
}

export interface KarteTimeSlotRow {
  slotKey: KpiTimeSlot
  slotLabel: string
  total: number
  connected: number
  recall: number
  owner: number
  prospect: number
  apo: number
  rateConnected: number | null
  targetRateConnected: number | null
  isWeak: boolean
}

export interface KarteTeamRankingResult {
  teamId: string
  teamName: string
  activeMemberCount: number
  monthlyApo: number
  apoRank: number
  apoAchievementRate: number | null
  apoAchievementRank: number | null
  achievementRankedMemberCount: number
}

export interface KarteTrendDayPoint {
  date: string
  total: number
  apo: number
}

export interface KarteGuidanceDateMark {
  date: string
  hasRoleplay: boolean
  hasMemo: boolean
  roleplayCount: number
  memoCount: number
}

export interface KarteTrendData {
  points: KarteTrendDayPoint[]
  guidanceDates: KarteGuidanceDateMark[]
}

export type KarteTimelineKind = 'roleplay' | 'seminar' | 'memo'
export type KarteTimelineFilter = 'all' | KarteTimelineKind

export interface KarteRoleplayRow
  extends Omit<RoleplayRow, 'theme_id' | 'runner_member_id'> {
  theme_id: string | null
  runner_member_id: string | null
  is_legacy?: boolean
  legacy_source?: Record<string, unknown> | null
  created_at?: string
}

export interface KarteSeminarRow extends SeminarRow {
  is_legacy?: boolean
  legacy_source?: Record<string, unknown> | null
  created_at?: string
}

export interface KarteTimelineItem {
  id: string
  kind: KarteTimelineKind
  kindLabel: string
  date: string
  createdAt: string
  title: string
  subtitle: string
  details: string[]
  tags: string[]
  isLegacy: boolean
  legacySource: Record<string, unknown> | null
}

export interface BuildKarteTimelineInput {
  memberId: string
  isRetired: boolean
  roleplays: KarteRoleplayRow[]
  roleplayThemes: RoleplayThemeRow[]
  seminars: KarteSeminarRow[]
  seminarMembers: SeminarMemberRow[]
  memos: SubordinateMemoRow[]
  memoTargets: SubordinateMemoTargetRow[]
  memoMasters: Array<MemoMasterRow | MasterRow>
  members: MemberRow[]
}

export type {
  KpiEntryRow,
  KpiSlotMetrics,
  KpiTargetRow,
  KpiTimeSlot,
  MemberAffiliationRow,
  MemberRow,
  MemberThemeRow,
  RoleplayThemeRow,
  SubordinateMemoRow,
  SubordinateMemoTargetRow,
  TeamRow,
  ViewerContext,
}
