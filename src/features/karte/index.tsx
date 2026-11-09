import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  NoticeBox,
  SelectField,
  Tag,
} from '../../components/ui'
import { formatDecimal1 } from '../kpi/shared/targets'
import { ROLEPLAY_KIND_LABELS } from '../roleplay/shared/types'
import {
  fetchKartePageDataset,
  formatKarteDbError,
  type KartePageDataset,
} from './api'
import {
  KARTE_KPI_METRICS,
  aggregateByTimeSlot,
  aggregateKpiForPeriod,
  buildKarteTimeline,
  buildKarteTrendData,
  calculateCallHoursAndUnmetSlots,
  calculateTeamRankings,
  evaluateKarteKpiTargets,
  formatKarteAsOfDateLabel,
  formatKarteRate,
  formatRateDiff,
  formatRatioAndDiff,
  getPreviousYearMonth,
  pickSelectableKarteMembers,
  resolveKarteAsOfDate,
  type KarteKpiMetricKey,
  type KartePeriod,
  type KarteRateMetricKey,
  type KarteTimelineFilter,
  type KarteTrendData,
} from './shared'
import './styles.css'

export function parseMemberIdFromHash(hash: string): string | null {
  const qIndex = hash.indexOf('?')
  if (qIndex < 0) return null
  const params = new URLSearchParams(hash.slice(qIndex + 1))
  const val = params.get('member')?.trim()
  return val ? val : null
}

export function buildKarteMemberHash(memberId: string): string {
  return `#/karte?member=${encodeURIComponent(memberId)}`
}

const METRIC_TO_RATE_KEY: Record<
  KarteKpiMetricKey,
  KarteRateMetricKey | null
> = {
  total: null,
  connected: 'rate_connected',
  recall: 'rate_recall',
  owner: 'rate_owner',
  prospect: 'rate_prospect',
  apo: 'rate_apo_owner',
}

const PERIOD_LABELS: Record<KartePeriod, string> = {
  today: '今日',
  week: '今週',
  month: '今月',
}

function formatYearMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym
  return `${y}年${m}月`
}

function KarteTrendSvgChart({
  trend,
  currentYearMonth,
}: {
  trend: KarteTrendData
  currentYearMonth: string
}) {
  const prevYm = getPreviousYearMonth(currentYearMonth)
  const allDates = useMemo(() => {
    const set = new Set<string>()
    for (const p of trend.points) set.add(p.date)
    for (const g of trend.guidanceDates) set.add(g.date)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [trend])

  if (allDates.length === 0) {
    return (
      <div className="karte-info-box">
        <p className="lead-text" style={{ margin: 0 }}>
          {formatYearMonthLabel(prevYm)}〜{formatYearMonthLabel(currentYearMonth)}
          の推移データと指導記録はまだありません。
        </p>
      </div>
    )
  }

  const width = 760
  const height = 240
  const padLeft = 48
  const padRight = 48
  const padTop = 24
  const padBottom = 42
  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom

  const maxTotal = Math.max(
    10,
    ...trend.points.map((p) => p.total),
  )
  const maxApo = Math.max(
    5,
    ...trend.points.map((p) => p.apo),
  )

  const getX = (date: string): number => {
    const idx = allDates.indexOf(date)
    if (allDates.length <= 1 || idx < 0) return padLeft + plotW / 2
    return padLeft + (idx / (allDates.length - 1)) * plotW
  }

  const getYTotal = (val: number): number => {
    return padTop + plotH - (val / maxTotal) * plotH
  }

  const getYApo = (val: number): number => {
    return padTop + plotH - (val / maxApo) * plotH
  }

  const totalPolyline = trend.points
    .map((p) => `${getX(p.date).toFixed(1)},${getYTotal(p.total).toFixed(1)}`)
    .join(' ')

  const apoPolyline = trend.points
    .map((p) => `${getX(p.date).toFixed(1)},${getYApo(p.apo).toFixed(1)}`)
    .join(' ')

  return (
    <div className="karte-chart-container">
      <div className="karte-chart-legend">
        <span className="karte-legend-item">
          <span
            className="karte-legend-swatch"
            style={{ backgroundColor: 'var(--navy)' }}
          />
          総（コール数・左軸：最大 {maxTotal}件）
        </span>
        <span className="karte-legend-item">
          <span
            className="karte-legend-swatch"
            style={{ backgroundColor: 'var(--good)' }}
          />
          ア（アポ数・右軸：最大 {maxApo}件）
        </span>
        <span className="karte-legend-item">
          <span
            className="karte-legend-swatch"
            style={{
              backgroundColor: 'var(--brand)',
              borderTop: '2px dashed var(--brand)',
            }}
          />
          指導した日（ロープレ・部下メモ）
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="karte-svg-chart"
        role="img"
        aria-label="2か月分の日ごとのアと総の推移と指導した日"
      >
        {/* 横の補助線 */}
        {[0, 0.5, 1].map((ratio) => {
          const y = padTop + plotH * (1 - ratio)
          const totalLabel = Math.round(maxTotal * ratio)
          const apoLabel = Math.round(maxApo * ratio)
          return (
            <g key={ratio}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="var(--line)"
                strokeWidth="1"
              />
              <text
                x={padLeft - 6}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--sub)"
              >
                {totalLabel}
              </text>
              <text
                x={width - padRight + 6}
                y={y + 4}
                textAnchor="start"
                fontSize="11"
                fill="var(--good)"
              >
                {apoLabel}
              </text>
            </g>
          )
        })}

        {/* 指導した日の縦線 */}
        {trend.guidanceDates.map((g) => {
          const x = getX(g.date)
          const labelParts: string[] = []
          if (g.hasRoleplay) labelParts.push('ロープレ')
          if (g.hasMemo) labelParts.push('部下メモ')
          return (
            <g key={`guidance-${g.date}`}>
              <line
                x1={x}
                y1={padTop}
                x2={x}
                y2={padTop + plotH}
                stroke="var(--brand)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text
                x={x}
                y={padTop - 6}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="var(--brand)"
              >
                指導({labelParts.join('・')})
              </text>
            </g>
          )
        })}

        {/* 総（コール数）の折れ線 */}
        {trend.points.length > 1 && (
          <polyline
            fill="none"
            stroke="var(--navy)"
            strokeWidth="2"
            points={totalPolyline}
          />
        )}
        {trend.points.map((p) => (
          <circle
            key={`total-${p.date}`}
            cx={getX(p.date)}
            cy={getYTotal(p.total)}
            r="3.5"
            fill="var(--navy)"
          />
        ))}

        {/* ア（アポ数）の折れ線 */}
        {trend.points.length > 1 && (
          <polyline
            fill="none"
            stroke="var(--good)"
            strokeWidth="2.5"
            points={apoPolyline}
          />
        )}
        {trend.points.map((p) => (
          <circle
            key={`apo-${p.date}`}
            cx={getX(p.date)}
            cy={getYApo(p.apo)}
            r="4"
            fill="var(--good)"
          />
        ))}

        {/* 日付ラベル */}
        {allDates.map((date, idx) => {
          const step = Math.max(1, Math.ceil(allDates.length / 8))
          if (idx % step !== 0 && idx !== allDates.length - 1) return null
          const x = getX(date)
          const shortDate = date.slice(5).replace('-', '/')
          return (
            <text
              key={`date-${date}`}
              x={x}
              y={height - 12}
              textAnchor="middle"
              fontSize="11"
              fill="var(--sub)"
            >
              {shortDate}
            </text>
          )
        })}
      </svg>

      {trend.guidanceDates.length > 0 && (
        <div style={{ marginTop: '10px', fontSize: '0.85rem', color: 'var(--sub)' }}>
          <strong>指導した日の一覧：</strong>{' '}
          {trend.guidanceDates
            .map((g) => {
              const kinds: string[] = []
              if (g.hasRoleplay) kinds.push(`ロープレ${g.roleplayCount}件`)
              if (g.hasMemo) kinds.push(`部下メモ${g.memoCount}件`)
              return `${g.date}（${kinds.join('・')}）`
            })
            .join(' ／ ')}
        </div>
      )}
    </div>
  )
}

export function KartePage() {
  const [dataset, setDataset] = useState<KartePageDataset | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [selectedMemberId, setSelectedMemberId] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return parseMemberIdFromHash(window.location.hash) ?? ''
  })
  const [selectedPeriod, setSelectedPeriod] = useState<KartePeriod>('month')
  const [selectedYearMonth, setSelectedYearMonth] = useState<string>('')
  const [timelineFilter, setTimelineFilter] =
    useState<KarteTimelineFilter>('all')
  const [expandedLegacyIds, setExpandedLegacyIds] = useState<Set<string>>(
    new Set(),
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const data = await fetchKartePageDataset()
      setDataset(data)
      setSelectedYearMonth((prev) => prev || data.todayJst.slice(0, 7))
    } catch (err) {
      setErrorMessage(formatKarteDbError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const handleHashChange = () => {
      const fromHash = parseMemberIdFromHash(window.location.hash)
      if (fromHash) {
        setSelectedMemberId(fromHash)
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const selectableMembers = useMemo(() => {
    if (!dataset?.viewer) return []
    return pickSelectableKarteMembers(
      dataset.viewer,
      dataset.members,
      dataset.affiliations,
      dataset.teams,
      dataset.todayJst,
    )
  }, [dataset])

  const selectedMemberInfo = useMemo(() => {
    if (selectableMembers.length === 0) return null
    return (
      selectableMembers.find((m) => m.member.id === selectedMemberId) ??
      selectableMembers[0]
    )
  }, [selectableMembers, selectedMemberId])

  // アドレス（#/karte?member=…）との同期
  useEffect(() => {
    if (!selectedMemberInfo) return
    const actualId = selectedMemberInfo.member.id
    if (selectedMemberId !== actualId) {
      setSelectedMemberId(actualId)
    }
    if (typeof window !== 'undefined') {
      const currentParam = parseMemberIdFromHash(window.location.hash)
      if (currentParam !== actualId) {
        const nextHash = buildKarteMemberHash(actualId)
        window.history.replaceState(null, '', nextHash)
      }
    }
  }, [selectedMemberInfo, selectedMemberId])

  const handleSelectMember = (memberId: string) => {
    setSelectedMemberId(memberId)
    if (typeof window !== 'undefined') {
      window.location.hash = buildKarteMemberHash(memberId)
    }
  }

  const toggleLegacyView = (itemId: string) => {
    setExpandedLegacyIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  const availableYearMonths = useMemo(() => {
    if (!dataset) return []
    const currentYm = dataset.todayJst.slice(0, 7)
    const prevYm = getPreviousYearMonth(currentYm)
    const ymSet = new Set<string>([currentYm, prevYm])
    for (const e of dataset.approvedEntries) {
      ymSet.add(e.date.slice(0, 7))
    }
    for (const t of dataset.targets) {
      ymSet.add(t.month.slice(0, 7))
    }
    return [...ymSet].sort((a, b) => b.localeCompare(a))
  }, [dataset])

  const activeYearMonth = useMemo(() => {
    if (selectedYearMonth) return selectedYearMonth
    return dataset?.todayJst.slice(0, 7) ?? '2026-11'
  }, [selectedYearMonth, dataset])

  const asOfDate = useMemo(() => {
    if (!dataset || !selectedMemberInfo) return null
    return resolveKarteAsOfDate(
      dataset.approvedEntries,
      selectedMemberInfo.member.id,
      activeYearMonth,
    )
  }, [dataset, selectedMemberInfo, activeYearMonth])

  const targetRow = useMemo(() => {
    if (!dataset || !selectedMemberInfo) return null
    const monthFirst = `${activeYearMonth}-01`
    return (
      dataset.targets.find(
        (t) =>
          t.member_id === selectedMemberInfo.member.id &&
          (t.month === monthFirst || t.month.slice(0, 7) === activeYearMonth),
      ) ?? null
    )
  }, [dataset, selectedMemberInfo, activeYearMonth])

  // 基準の日がないときも目標欄などを出すための参照日
  const effectiveBasisDate = asOfDate ?? `${activeYearMonth}-01`

  const kpiAggregation = useMemo(() => {
    if (!dataset || !selectedMemberInfo) return null
    return aggregateKpiForPeriod(
      dataset.approvedEntries,
      selectedMemberInfo.member.id,
      effectiveBasisDate,
      selectedPeriod,
    )
  }, [dataset, selectedMemberInfo, effectiveBasisDate, selectedPeriod])

  const targetEvaluation = useMemo(() => {
    if (!dataset || !kpiAggregation) return null
    return evaluateKarteKpiTargets(
      kpiAggregation,
      targetRow,
      effectiveBasisDate,
      dataset.settings.holidays,
      dataset.settings.workdays,
    )
  }, [dataset, kpiAggregation, targetRow, effectiveBasisDate])

  const callHoursSummary = useMemo(() => {
    if (!dataset || !selectedMemberInfo || !kpiAggregation) return null
    return calculateCallHoursAndUnmetSlots(
      dataset.approvedEntries,
      selectedMemberInfo.member.id,
      kpiAggregation.startDate,
      kpiAggregation.endDate,
      targetRow,
      dataset.settings.holidays,
      dataset.settings.workdays,
      dataset.settings.callHourThreshold,
    )
  }, [dataset, selectedMemberInfo, kpiAggregation, targetRow])

  const timeSlotRows = useMemo(() => {
    if (!dataset || !selectedMemberInfo || !kpiAggregation) return []
    return aggregateByTimeSlot(
      dataset.approvedEntries,
      selectedMemberInfo.member.id,
      kpiAggregation.startDate,
      kpiAggregation.endDate,
      targetRow,
      effectiveBasisDate,
    )
  }, [
    dataset,
    selectedMemberInfo,
    kpiAggregation,
    targetRow,
    effectiveBasisDate,
  ])

  const teamRanking = useMemo(() => {
    if (!dataset || !selectedMemberInfo) return null
    return calculateTeamRankings({
      selectedMember: selectedMemberInfo.member,
      members: dataset.members,
      affiliations: dataset.affiliations,
      teams: dataset.teams,
      approvedEntries: dataset.approvedEntries,
      targets: dataset.targets,
      yearMonth: activeYearMonth,
      asOfDate,
      todayJst: dataset.todayJst,
      holidays: dataset.settings.holidays,
      workdays: dataset.settings.workdays,
    })
  }, [dataset, selectedMemberInfo, activeYearMonth, asOfDate])

  const trendData = useMemo(() => {
    if (!dataset || !selectedMemberInfo) {
      return { points: [], guidanceDates: [] }
    }
    return buildKarteTrendData({
      memberId: selectedMemberInfo.member.id,
      approvedEntries: dataset.approvedEntries,
      roleplays: dataset.roleplays,
      memos: dataset.memos,
      memoTargets: dataset.memoTargets,
      currentYearMonth: activeYearMonth,
    })
  }, [dataset, selectedMemberInfo, activeYearMonth])

  const timelineItems = useMemo(() => {
    if (!dataset || !selectedMemberInfo) return []
    return buildKarteTimeline(
      {
        memberId: selectedMemberInfo.member.id,
        isRetired: selectedMemberInfo.isRetired,
        roleplays: dataset.roleplays,
        roleplayThemes: dataset.roleplayThemes,
        seminars: dataset.seminars,
        seminarMembers: dataset.seminarMembers,
        memos: dataset.memos,
        memoTargets: dataset.memoTargets,
        memoMasters: dataset.memoMasters,
        members: dataset.members,
      },
      timelineFilter,
    )
  }, [dataset, selectedMemberInfo, timelineFilter])

  const memberThemeList = useMemo(() => {
    if (!dataset || !selectedMemberInfo || selectedMemberInfo.isRetired) {
      return []
    }
    const themeMap = new Map(dataset.roleplayThemes.map((t) => [t.id, t]))
    return dataset.memberThemes
      .filter(
        (mt) =>
          mt.member_id === selectedMemberInfo.member.id &&
          mt.hidden_at === null,
      )
      .map((mt) => ({
        row: mt,
        theme: themeMap.get(mt.theme_id) ?? null,
      }))
  }, [dataset, selectedMemberInfo])

  if (loading) {
    return (
      <section className="panel" aria-label="メンバーカルテ">
        <h1 className="section-title">メンバーカルテ</h1>
        <p className="lead-text">読み込み中...</p>
      </section>
    )
  }

  if (errorMessage) {
    return (
      <section className="panel" aria-label="メンバーカルテ">
        <h1 className="section-title">メンバーカルテ</h1>
        <NoticeBox title="エラー" tone="alert" role="alert">
          {errorMessage}
        </NoticeBox>
        <div className="action-row">
          <Button variant="secondary" onClick={() => void loadData()}>
            再読み込み
          </Button>
        </div>
      </section>
    )
  }

  if (!dataset?.viewer) {
    return (
      <section className="panel" aria-label="メンバーカルテ">
        <h1 className="section-title">メンバーカルテ</h1>
        <NoticeBox title="この操作はできません" tone="alert" role="alert">
          この操作はできません（ログイン中の名簿情報が確認できません）。
        </NoticeBox>
      </section>
    )
  }

  if (dataset.viewer.role === 'member') {
    return (
      <section className="panel" aria-label="メンバーカルテ">
        <h1 className="section-title">メンバーカルテ</h1>
        <NoticeBox title="この操作はできません" tone="warn">
          メンバー用のカルテは一般日報の区切りで出ます。
        </NoticeBox>
      </section>
    )
  }

  if (!selectedMemberInfo) {
    return (
      <section className="panel" aria-label="メンバーカルテ">
        <h1 className="section-title">メンバーカルテ</h1>
        <NoticeBox title="対象メンバーがいません" tone="info">
          選べるメンバーがいません。
        </NoticeBox>
      </section>
    )
  }

  const memberSelectOptions = selectableMembers.map((m) => ({
    value: m.member.id,
    label: `${m.teamName}：${m.member.name}${m.isRetired ? '（退職）' : ''}`,
  }))

  return (
    <div className="karte-page">
      {/* 一番上：対象メンバー選択バー */}
      <section className="karte-selector-bar" aria-label="カルテの対象メンバー選択">
        <div>
          <h1 className="section-title" style={{ marginBottom: '4px' }}>
            メンバーカルテ
          </h1>
          <p className="lead-text" style={{ margin: 0 }}>
            部下1人ひとりの数字（KPI・時間帯・推移）と指導の記録を1画面で確認します。
          </p>
          <div className="karte-member-chips" role="list" aria-label="選べる人の一覧">
            {selectableMembers.map((m) => {
              const isSelected = m.member.id === selectedMemberInfo.member.id
              return (
                <button
                  key={m.member.id}
                  type="button"
                  className={`karte-member-chip${isSelected ? ' is-selected' : ''}`}
                  onClick={() => handleSelectMember(m.member.id)}
                >
                  <span>
                    {m.teamName}：{m.member.name}
                  </span>
                  {m.isRetired && (
                    <Tag tone={isSelected ? 'warn' : 'plain'}>退職</Tag>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="karte-selector-controls">
          <SelectField
            id="karte-member-select"
            label="対象メンバーを選ぶ（チームごと・名前順）"
            value={selectedMemberInfo.member.id}
            options={memberSelectOptions}
            onChange={(e) => handleSelectMember(e.target.value)}
          />
          <SelectField
            id="karte-month-select"
            label="対象の月"
            value={activeYearMonth}
            options={availableYearMonths.map((ym) => ({
              value: ym,
              label: formatYearMonthLabel(ym),
            }))}
            onChange={(e) => setSelectedYearMonth(e.target.value)}
          />
        </div>
      </section>

      {/* 退職した人を選んだときの案内 */}
      {selectedMemberInfo.isRetired && (
        <NoticeBox
          title="退職した人の記録です（見るだけ）"
          tone="warn"
          role="status"
        >
          退職した人の記録です（見るだけ）。読めるのは KPI・目標・ロープレの記録・部下メモです。テーマ表と研修の記録は「退職した人は出ません」となります。
        </NoticeBox>
      )}

      {/* 設定値が入っていないときの案内 */}
      {dataset.settings.missingKeys.length > 0 && (
        <NoticeBox title="設定値が入っていません" tone="warn">
          設定値が入っていません（不足：{dataset.settings.missingKeys.join('・')}
          。休みの日なし・稼働する土曜なし・コール時間の境目 17 として計算しています）。
        </NoticeBox>
      )}

      {/* 部品1：基本情報と順位 */}
      <section className="karte-section" aria-label="1. 基本情報と順位">
        <div className="karte-section-header">
          <h2 className="karte-section-title">
            <span className="karte-section-number">1</span>
            基本情報と順位
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Tag tone="navy">
              {selectedMemberInfo.member.goes_to_sales
                ? '営業に出る'
                : '営業に出ない（アポのみ）'}
            </Tag>
            {selectedMemberInfo.isRetired && <Tag tone="warn">退職</Tag>}
          </div>
        </div>

        <div className="karte-two-col">
          {/* 左：基本情報 */}
          <div className="karte-info-box">
            <h3 className="karte-info-box-title">基本情報</h3>
            <dl className="karte-dl">
              <dt>名前</dt>
              <dd>
                {selectedMemberInfo.member.name}
                {selectedMemberInfo.isRetired ? (
                  <span style={{ marginLeft: '8px' }}>
                    <Tag tone="warn">退職</Tag>
                  </span>
                ) : null}
              </dd>
              <dt>
                {selectedMemberInfo.isRetired
                  ? 'チーム（最後）'
                  : 'チーム'}
              </dt>
              <dd>{selectedMemberInfo.teamName}</dd>
              <dt>拠点</dt>
              <dd>{selectedMemberInfo.base || '未設定'}</dd>
              <dt>入社日</dt>
              <dd>
                {selectedMemberInfo.member.hired_on || '未設定'}
                {selectedMemberInfo.isRetired &&
                selectedMemberInfo.member.retired_on
                  ? `（退職日：${selectedMemberInfo.member.retired_on}）`
                  : ''}
              </dd>
              <dt>担当リーダー</dt>
              <dd>
                {selectedMemberInfo.leaderNames.length > 0
                  ? selectedMemberInfo.leaderNames.join('・')
                  : 'なし'}
              </dd>
            </dl>
          </div>

          {/* 右：チームの中の比べ */}
          <div className="karte-info-box">
            <h3 className="karte-info-box-title">チームの中の比べ</h3>
            {selectedMemberInfo.isRetired ? (
              <p className="lead-text" style={{ margin: 0 }}>
                退職した人のため、チームの中の順位は出ません。
              </p>
            ) : teamRanking ? (
              <dl className="karte-dl">
                <dt>今月のアポ数の順位</dt>
                <dd>
                  <strong>
                    {teamRanking.apoRank}位 / {teamRanking.activeMemberCount}人中
                  </strong>
                  （今月 {teamRanking.monthlyApo}件）
                </dd>
                <dt>アポの達成率の順位</dt>
                <dd>
                  {teamRanking.apoAchievementRank !== null &&
                  teamRanking.apoAchievementRate !== null ? (
                    <>
                      <strong>
                        {teamRanking.apoAchievementRank}位 /{' '}
                        {teamRanking.achievementRankedMemberCount}人中
                      </strong>
                      （あるべき比 {formatDecimal1(teamRanking.apoAchievementRate)}
                      %）
                    </>
                  ) : (
                    <span>目標が未入力（達成率の順位から除外）</span>
                  )}
                </dd>
                <dt>関わった受注の順位</dt>
                <dd>
                  <Tag tone="plain">一般日報の区切りで出ます</Tag>
                </dd>
                <dt>粗利の達成率の順位</dt>
                <dd>
                  <Tag tone="plain">一般日報の区切りで出ます</Tag>
                </dd>
              </dl>
            ) : (
              <p className="lead-text" style={{ margin: 0 }}>
                所属チームがないため順位は出ません。
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 部品2：KPI（9段階＋粗利） */}
      <section className="karte-section" aria-label="2. KPI（9段階＋粗利）">
        <div className="karte-section-header">
          <h2 className="karte-section-title">
            <span className="karte-section-number">2</span>
            KPI（9段階＋粗利）
          </h2>
          <span className="karte-as-of-badge">
            {formatKarteAsOfDateLabel(asOfDate)}
          </span>
        </div>

        <div className="karte-toolbar">
          <div className="karte-period-buttons" role="group" aria-label="期間の切り替え">
            {(['today', 'week', 'month'] as KartePeriod[]).map((p) => (
              <Button
                key={p}
                variant={selectedPeriod === p ? 'primary' : 'secondary'}
                onClick={() => setSelectedPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
          <div style={{ fontSize: '0.88rem', color: 'var(--sub)' }}>
            {asOfDate && kpiAggregation ? (
              <span>
                集計期間：{kpiAggregation.startDate} 〜 {kpiAggregation.endDate}（
                {PERIOD_LABELS[selectedPeriod]}）
              </span>
            ) : (
              <span>今月の数字はまだありません</span>
            )}
          </div>
        </div>

        {!targetRow && (
          <NoticeBox title="目標が未入力" tone="warn">
            {formatYearMonthLabel(activeYearMonth)}の目標が未入力です。目標・あるべきの欄には「目標が未入力」と表示しています。
          </NoticeBox>
        )}

        <div className="karte-table-wrap">
          <table className="karte-table" aria-label="KPI実績・目標・あるべき表">
            <thead>
              <tr>
                <th>項目</th>
                <th className="num-col">実績</th>
                <th className="num-col">
                  目標（{PERIOD_LABELS[selectedPeriod]}）
                </th>
                <th className="num-col">あるべき</th>
                <th className="num-col">あるべき比（差）</th>
                <th>率の項目</th>
                <th className="num-col">率の実績</th>
                <th className="num-col">率の目標</th>
                <th className="num-col">率の差</th>
                <th className="num-col">未達の時間数</th>
              </tr>
            </thead>
            <tbody>
              {KARTE_KPI_METRICS.map((m) => {
                const metricEval = targetEvaluation?.metrics[m.key]
                const rateKey = METRIC_TO_RATE_KEY[m.key]
                const rateEval =
                  rateKey && targetEvaluation
                    ? targetEvaluation.rates[rateKey]
                    : null
                const unmetCount =
                  callHoursSummary?.totalUnmetSlots?.[m.key] ?? null
                const hasKpi = asOfDate !== null
                const hasTarget = Boolean(targetEvaluation?.hasTarget)

                return (
                  <tr key={m.key}>
                    <td>
                      <strong>{m.label}</strong>
                    </td>
                    <td className="num-col">
                      {hasKpi && metricEval
                        ? `${formatDecimal1(metricEval.actual)}件`
                        : '－'}
                    </td>
                    <td className="num-col">
                      {!hasTarget
                        ? '目標が未入力'
                        : metricEval?.periodTarget !== null &&
                            metricEval?.periodTarget !== undefined
                          ? `${formatDecimal1(metricEval.periodTarget)}件`
                          : '－'}
                    </td>
                    <td className="num-col">
                      {!hasTarget
                        ? '目標が未入力'
                        : metricEval?.shouldBe !== null &&
                            metricEval?.shouldBe !== undefined
                          ? `${formatDecimal1(metricEval.shouldBe)}件`
                          : '－'}
                    </td>
                    <td className="num-col">
                      {!hasTarget ? (
                        '目標が未入力'
                      ) : !hasKpi || !metricEval ? (
                        '－'
                      ) : (
                        <span
                          className={
                            (metricEval.diff ?? 0) < 0
                              ? 'karte-unmet-text'
                              : 'karte-good-text'
                          }
                        >
                          {formatRatioAndDiff(
                            metricEval.ratioPercent,
                            metricEval.diff,
                            '件',
                          )}
                        </span>
                      )}
                    </td>
                    <td>{rateEval ? rateEval.label : '－'}</td>
                    <td className="num-col">
                      {!rateEval
                        ? '－'
                        : hasKpi
                          ? formatKarteRate(rateEval.actualRate)
                          : '－'}
                    </td>
                    <td className="num-col">
                      {!rateEval
                        ? '－'
                        : !hasTarget
                          ? '目標が未入力'
                          : formatKarteRate(rateEval.targetRate)}
                    </td>
                    <td className="num-col">
                      {!rateEval ? (
                        '－'
                      ) : !hasTarget ? (
                        '目標が未入力'
                      ) : !hasKpi ? (
                        '－'
                      ) : (
                        <span
                          className={
                            (rateEval.diffPoints ?? 0) < 0
                              ? 'karte-unmet-text'
                              : 'karte-good-text'
                          }
                        >
                          {formatRateDiff(rateEval.diffPoints)}
                        </span>
                      )}
                    </td>
                    <td className="num-col">
                      {!hasTarget
                        ? '目標が未入力'
                        : hasKpi && unmetCount !== null
                          ? `${unmetCount}時間`
                          : '－'}
                    </td>
                  </tr>
                )
              })}

              {/* 採用・訪問件・受注・粗利（一般日報の区切りで出ます） */}
              {['採用', '訪問件', '受注', '粗利'].map((futureStage) => (
                <tr key={futureStage}>
                  <td>
                    <strong>{futureStage}</strong>
                  </td>
                  <td colSpan={9}>
                    <Tag tone="plain">一般日報の区切りで出ます</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* コール時間と未達の時間数（項目ごと・日ごと） */}
        <div className="karte-info-box" style={{ marginTop: '16px' }}>
          <h3 className="karte-info-box-title">
            コール時間と未達の時間数（9〜12時台・14〜17時台の8区分／営業日のみ）
          </h3>
          <p className="lead-text" style={{ marginBottom: '8px' }}>
            コール時間＝総が設定値（{dataset.settings.callHourThreshold}
            件）を超えた時間帯の数。未達の時間数＝1時間あたりの目標を下回った時間帯の数（13時台と非営業日は除きます）。
          </p>

          <div className="karte-call-hours-grid">
            <div className="karte-stat-card">
              <div className="karte-stat-label">
                コール時間（{PERIOD_LABELS[selectedPeriod]}合計）
              </div>
              <div className="karte-stat-value">
                {asOfDate && callHoursSummary
                  ? `${callHoursSummary.totalCallHours}時間`
                  : '－'}
              </div>
            </div>
            {KARTE_KPI_METRICS.map((m) => (
              <div key={`unmet-card-${m.key}`} className="karte-stat-card">
                <div className="karte-stat-label">
                  {m.label}の未達時間数（{PERIOD_LABELS[selectedPeriod]}）
                </div>
                <div className="karte-stat-value">
                  {!targetRow
                    ? '目標が未入力'
                    : asOfDate && callHoursSummary?.totalUnmetSlots
                      ? `${callHoursSummary.totalUnmetSlots[m.key]}時間`
                      : '－'}
                </div>
              </div>
            ))}
          </div>

          {callHoursSummary && callHoursSummary.dailyBreakdown.length > 0 && (
            <div className="karte-table-wrap" style={{ marginTop: '12px' }}>
              <table className="karte-table" aria-label="日ごとのコール時間と未達の時間数">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>営業日区分</th>
                    <th className="num-col">コール時間</th>
                    <th className="num-col">総の未達</th>
                    <th className="num-col">実の未達</th>
                    <th className="num-col">再の未達</th>
                    <th className="num-col">オの未達</th>
                    <th className="num-col">見の未達</th>
                    <th className="num-col">アの未達</th>
                  </tr>
                </thead>
                <tbody>
                  {callHoursSummary.dailyBreakdown.map((day) => (
                    <tr key={day.date}>
                      <td>{day.date}</td>
                      <td>
                        {day.isBusinessDay ? (
                          <Tag tone="navy">営業日</Tag>
                        ) : (
                          <Tag tone="plain">対象外（非営業日）</Tag>
                        )}
                      </td>
                      <td className="num-col">
                        {day.isBusinessDay ? `${day.callHours}時間` : '－'}
                      </td>
                      {KARTE_KPI_METRICS.map((m) => (
                        <td key={`${day.date}-${m.key}`} className="num-col">
                          {!day.isBusinessDay
                            ? '－'
                            : !day.unmetSlots
                              ? '目標が未入力'
                              : `${day.unmetSlots[m.key]}時間`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* 部品3：約束と見込み */}
      <section className="karte-section" aria-label="3. 約束と見込み">
        <div className="karte-section-header">
          <h2 className="karte-section-title">
            <span className="karte-section-number">3</span>
            約束と見込み
          </h2>
          <Tag tone="plain">一般日報の区切りで出ます</Tag>
        </div>
        <div className="karte-placeholder-grid">
          <div className="karte-placeholder-box">
            <h3 className="karte-placeholder-title">今日の約束（宣言）</h3>
            <p className="karte-placeholder-note">一般日報の区切りで出ます</p>
          </div>
          <div className="karte-placeholder-box">
            <h3 className="karte-placeholder-title">見込みの一覧（ランク別）</h3>
            <p className="karte-placeholder-note">一般日報の区切りで出ます</p>
          </div>
        </div>
      </section>

      {/* 部品4：推移 */}
      <section className="karte-section" aria-label="4. 推移">
        <div className="karte-section-header">
          <h2 className="karte-section-title">
            <span className="karte-section-number">4</span>
            推移（2か月分の日ごとのア・総と指導した日）
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--sub)' }}>
            指導の前後で数字が動いたかを確認します
          </span>
        </div>
        <KarteTrendSvgChart
          trend={trendData}
          currentYearMonth={activeYearMonth}
        />
      </section>

      {/* 部品5：時間帯別 */}
      <section className="karte-section" aria-label="5. 時間帯別">
        <div className="karte-section-header">
          <h2 className="karte-section-title">
            <span className="karte-section-number">5</span>
            時間帯別（14区分・{PERIOD_LABELS[selectedPeriod]}）
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--sub)' }}>
            月の実率の目標を下回る時間帯（総が0は除く）を「弱い時間帯」として橙で表示します
          </span>
        </div>

        <div className="karte-table-wrap">
          <table className="karte-table" aria-label="時間帯別KPI集計表">
            <thead>
              <tr>
                <th>時間帯（14区分）</th>
                <th className="num-col">総</th>
                <th className="num-col">実</th>
                <th className="num-col">実率</th>
                <th className="num-col">実率の目標</th>
                <th className="num-col">ア</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {timeSlotRows.map((row) => (
                <tr
                  key={row.slotKey}
                  className={row.isWeak ? 'is-weak-slot' : undefined}
                >
                  <td>{row.slotLabel}</td>
                  <td className="num-col">{row.total}件</td>
                  <td className="num-col">{row.connected}件</td>
                  <td className="num-col">
                    <span className={row.isWeak ? 'karte-weak-text' : undefined}>
                      {formatKarteRate(row.rateConnected)}
                    </span>
                  </td>
                  <td className="num-col">
                    {row.targetRateConnected !== null
                      ? formatKarteRate(row.targetRateConnected)
                      : '目標が未入力'}
                  </td>
                  <td className="num-col">{row.apo}件</td>
                  <td>
                    {row.isWeak ? (
                      <Tag tone="warn">弱い時間帯（実率目標未達）</Tag>
                    ) : row.total === 0 ? (
                      <span style={{ color: 'var(--muted)' }}>コールなし</span>
                    ) : row.targetRateConnected === null ? (
                      <span style={{ color: 'var(--sub)' }}>目標が未入力</span>
                    ) : (
                      <Tag tone="good">目標以上</Tag>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 部品6：育成の状態 */}
      <section className="karte-section" aria-label="6. 育成の状態">
        <div className="karte-section-header">
          <h2 className="karte-section-title">
            <span className="karte-section-number">6</span>
            育成の状態
          </h2>
        </div>

        <div className="karte-info-box" style={{ marginBottom: '16px' }}>
          <h3 className="karte-info-box-title">練習中のテーマ（テーマ表）</h3>
          {selectedMemberInfo.isRetired ? (
            <p className="lead-text" style={{ margin: 0 }}>
              退職した人は出ません
            </p>
          ) : memberThemeList.length === 0 ? (
            <p className="lead-text" style={{ margin: 0 }}>
              登録されているテーマはまだありません。
            </p>
          ) : (
            <div className="karte-table-wrap">
              <table className="karte-table" aria-label="練習中のテーマ一覧">
                <thead>
                  <tr>
                    <th>状態</th>
                    <th>区分</th>
                    <th>テーマ名</th>
                    <th>開始日</th>
                    <th>合格ライン・卒業日</th>
                  </tr>
                </thead>
                <tbody>
                  {memberThemeList.map(({ row, theme }) => (
                    <tr key={row.id}>
                      <td>
                        <Tag
                          tone={row.status === 'practicing' ? 'navy' : 'good'}
                        >
                          {row.status === 'practicing' ? '練習中' : '卒業'}
                        </Tag>
                      </td>
                      <td>{ROLEPLAY_KIND_LABELS[row.kind] ?? row.kind}</td>
                      <td>
                        <strong>
                          {theme
                            ? `第${theme.stage}段階 No.${theme.no} ${theme.name}`
                            : 'テーマ'}
                        </strong>
                      </td>
                      <td>{row.started_on}</td>
                      <td>
                        {row.pass_line || '－'}
                        {row.graduated_on ? `（卒業日：${row.graduated_on}）` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="karte-placeholder-grid">
          <div className="karte-placeholder-box">
            <h3 className="karte-placeholder-title">週間教育</h3>
            <p className="karte-placeholder-note">週間教育の区切りで出ます</p>
          </div>
          <div className="karte-placeholder-box">
            <h3 className="karte-placeholder-title">届いた良かった</h3>
            <p className="karte-placeholder-note">一般日報の区切りで出ます</p>
          </div>
          <div className="karte-placeholder-box">
            <h3 className="karte-placeholder-title">日々のMVP</h3>
            <p className="karte-placeholder-note">一般日報の区切りで出ます</p>
          </div>
        </div>
      </section>

      {/* 部品7：タイムライン */}
      <section className="karte-section" aria-label="7. タイムライン">
        <div className="karte-section-header">
          <h2 className="karte-section-title">
            <span className="karte-section-number">7</span>
            タイムライン（指導と活動の記録）
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--sub)' }}>
            ロープレの記録・研修の記録・部下メモ（上席だけ）を新しい順に表示します
          </span>
        </div>

        <div className="karte-toolbar">
          <div
            className="karte-period-buttons"
            role="group"
            aria-label="タイムラインの種類で絞り込み"
          >
            {(
              [
                { value: 'all', label: 'すべて' },
                { value: 'roleplay', label: 'ロープレ' },
                { value: 'seminar', label: '研修' },
                { value: 'memo', label: '部下メモ' },
              ] as Array<{ value: KarteTimelineFilter; label: string }>
            ).map((opt) => (
              <Button
                key={opt.value}
                variant={timelineFilter === opt.value ? 'primary' : 'secondary'}
                onClick={() => setTimelineFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--sub)' }}>
            表示件数：{timelineItems.length}件
          </div>
        </div>

        {selectedMemberInfo.isRetired &&
          (timelineFilter === 'all' || timelineFilter === 'seminar') && (
            <div className="karte-info-box" style={{ marginBottom: '12px' }}>
              <strong>研修の記録：</strong> 退職した人は出ません
            </div>
          )}

        {timelineItems.length === 0 ? (
          <div className="karte-info-box">
            <p className="lead-text" style={{ margin: 0 }}>
              該当する記録はまだありません。
            </p>
          </div>
        ) : (
          <div className="karte-timeline-list">
            {timelineItems.map((item) => {
              const isExpanded = expandedLegacyIds.has(item.id)
              return (
                <article key={item.id} className="karte-timeline-card">
                  <div className="karte-timeline-header">
                    <div className="karte-timeline-meta">
                      <span className="karte-timeline-date">{item.date}</span>
                      <Tag
                        tone={
                          item.kind === 'memo'
                            ? 'navy'
                            : item.kind === 'roleplay'
                              ? 'good'
                              : 'plain'
                        }
                      >
                        {item.kindLabel}
                      </Tag>
                      {item.isLegacy && <Tag tone="warn">過去の記録</Tag>}
                      {item.tags.map((t, idx) => (
                        <Tag key={`${item.id}-tag-${idx}`} tone="plain">
                          {t}
                        </Tag>
                      ))}
                    </div>

                    {item.isLegacy && (
                      <Button
                        variant="secondary"
                        onClick={() => toggleLegacyView(item.id)}
                      >
                        {isExpanded
                          ? '元の行（legacy_source）を閉じる'
                          : '元の行（legacy_source）を見る'}
                      </Button>
                    )}
                  </div>

                  <h3 className="karte-timeline-title">{item.title}</h3>
                  <p className="karte-timeline-subtitle">{item.subtitle}</p>

                  {item.details.length > 0 && (
                    <ul className="karte-timeline-details">
                      {item.details.map((detail, idx) => (
                        <li key={`${item.id}-d-${idx}`}>{detail}</li>
                      ))}
                    </ul>
                  )}

                  {item.isLegacy && isExpanded && (
                    <div className="karte-legacy-box">
                      <strong>過去の記録の元の行（legacy_source）：</strong>
                      <pre className="karte-legacy-pre">
                        {item.legacySource
                          ? JSON.stringify(item.legacySource, null, 2)
                          : '（元の行のデータなし）'}
                      </pre>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}

        {/* まだない種類のタイムライン枠と予告 */}
        <div style={{ marginTop: '20px' }}>
          <h3 className="karte-info-box-title">
            これからタイムラインに加わる記録（出る区切りの予告）
          </h3>
          <div className="karte-placeholder-grid">
            <div className="karte-placeholder-box">
              <h4 className="karte-placeholder-title">日報</h4>
              <p className="karte-placeholder-note">一般日報の区切りで出ます</p>
            </div>
            <div className="karte-placeholder-box">
              <h4 className="karte-placeholder-title">週間教育</h4>
              <p className="karte-placeholder-note">週間教育の区切りで出ます</p>
            </div>
            <div className="karte-placeholder-box">
              <h4 className="karte-placeholder-title">AI提案</h4>
              <p className="karte-placeholder-note">
                AI分析・週次コーチの区切りで出ます
              </p>
            </div>
            <div className="karte-placeholder-box">
              <h4 className="karte-placeholder-title">受注</h4>
              <p className="karte-placeholder-note">一般日報の区切りで出ます</p>
            </div>
            <div className="karte-placeholder-box">
              <h4 className="karte-placeholder-title">打ち手（責任者日報）</h4>
              <p className="karte-placeholder-note">
                責任者日報・集める画面の区切りで出ます
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export * from './shared'
export * from './api'
export default KartePage
