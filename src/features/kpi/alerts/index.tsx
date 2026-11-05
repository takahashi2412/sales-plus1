import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  DataTable,
  DateText,
  NoticeBox,
  SelectField,
  Tag,
  type TableColumn,
} from '../../../components/ui'
import {
  formatDecimal1,
  type AlertItem,
  type AlertResponseStatus,
} from '../shared'
import {
  fetchKpiAlertsScreenData,
  submitAlertResponse,
  type EnrichedAlertRow,
  type KpiAlertsScreenData,
} from './api'
import './styles.css'

const ITEM_LABELS: Record<AlertItem, { label: string; unit: string }> = {
  total: { label: '総（コール数）', unit: '件' },
  connected: { label: '実', unit: '件' },
  owner: { label: 'オ', unit: '件' },
  apo_owner: { label: 'ア/オ', unit: '%' },
  apo: { label: 'ア', unit: '件' },
  target_missing: { label: '目標が未入力', unit: '' },
}

export function KpiAlertsPage() {
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [screenData, setScreenData] = useState<KpiAlertsScreenData | null>(null)

  const [filterDate, setFilterDate] = useState<string>('')
  const [filterTeamId, setFilterTeamId] = useState<string>('')

  const [responseChoiceDraft, setResponseChoiceDraft] = useState<
    Record<string, AlertResponseStatus>
  >({})
  const [responseReasonDraft, setResponseReasonDraft] = useState<Record<string, string>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const data = await fetchKpiAlertsScreenData()
      setScreenData(data)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '未達の一覧の読み込みに失敗しました。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // 絞り込み後のアラート一覧
  const filteredAlerts = useMemo(() => {
    if (!screenData) return []
    return screenData.alerts.filter((a) => {
      if (filterDate && a.date !== filterDate) return false
      if (filterTeamId && a.memberTeamId !== filterTeamId) return false
      return true
    })
  }, [screenData, filterDate, filterTeamId])

  // 全体の未対応数 と 絞り込み後の未対応数
  const totalUnrespondedCount = useMemo(() => {
    return (screenData?.alerts ?? []).filter(
      (a) => a.needs_response && a.response === null,
    ).length
  }, [screenData?.alerts])

  const filteredUnrespondedCount = useMemo(() => {
    return filteredAlerts.filter((a) => a.needs_response && a.response === null).length
  }, [filteredAlerts])

  // 日付ごと（新しい日が上）→ 人ごとにまとめる
  const groupedByDate = useMemo(() => {
    const dateMap = new Map<
      string,
      Map<
        string,
        {
          memberId: string
          memberName: string
          memberTeamName: string
          rows: EnrichedAlertRow[]
        }
      >
    >()

    for (const row of filteredAlerts) {
      let memberMap = dateMap.get(row.date)
      if (!memberMap) {
        memberMap = new Map()
        dateMap.set(row.date, memberMap)
      }
      let group = memberMap.get(row.member_id)
      if (!group) {
        group = {
          memberId: row.member_id,
          memberName: row.memberName,
          memberTeamName: row.memberTeamName,
          rows: [],
        }
        memberMap.set(row.member_id, group)
      }
      group.rows.push(row)
    }

    const sortedDates = Array.from(dateMap.keys()).sort((a, b) => b.localeCompare(a))
    return sortedDates.map((date) => ({
      date,
      members: Array.from(dateMap.get(date)!.values()).sort((a, b) =>
        a.memberName.localeCompare(b.memberName, 'ja'),
      ),
    }))
  }, [filteredAlerts])

  const handleSaveResponse = async (row: EnrichedAlertRow) => {
    const status = responseChoiceDraft[row.id] ?? row.response ?? 'done'
    const reason = responseReasonDraft[row.id] ?? row.response_reason ?? ''
    if (!reason.trim()) {
      setErrorMsg(`「${row.memberName}」の未達（${ITEM_LABELS[row.item].label}）に対する理由を入力してください（必須）。`)
      return
    }

    setSavingId(row.id)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await submitAlertResponse({
        alertId: row.id,
        response: status,
        responseReason: reason,
      })
      await loadData()
      setSuccessMsg(
        `${row.memberName} さんの未達（${row.date}・${ITEM_LABELS[row.item].label}）に「${
          status === 'done' ? '対応済' : '不要だった'
        }」を記録しました。`,
      )
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '対応の記録に失敗しました。')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="lead-text">読み込み中...</p>
      </section>
    )
  }

  if (!screenData?.viewer || screenData.viewer.role === 'member') {
    return (
      <section className="panel">
        <NoticeBox title="この画面は使えません" tone="warn" role="alert">
          未達の一覧はリーダー・MGR・代表だけが見られます（メンバー本人には表示されません）。
        </NoticeBox>
      </section>
    )
  }

  const viewerRole = screenData.viewer.role

  const renderMemberTableColumns = (): TableColumn<EnrichedAlertRow>[] => [
    {
      key: 'unmet_mark',
      header: '判定',
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* 未達は黒字＋▼＋「未達」（赤にしない） */}
          <span className="kpi-alerts-unmet-badge">▼未達</span>
          {r.item === 'target_missing' && <Tag tone="warn">目標が未入力</Tag>}
          {r.compare === 'pace' && !r.needs_response && <Tag tone="plain">続いている</Tag>}
        </div>
      ),
    },
    {
      key: 'item',
      header: '項目',
      className: 'col-name',
      render: (r) => ITEM_LABELS[r.item]?.label ?? r.item,
    },
    {
      key: 'compare',
      header: '比べ方',
      render: (r) =>
        r.item === 'target_missing'
          ? '月の目標'
          : r.compare === 'daily'
            ? '日ごと（目標）'
            : '月のペース（あるべき）',
    },
    {
      key: 'target',
      header: '目標（またはあるべき）',
      render: (r) => {
        if (r.item === 'target_missing' || r.target === null) return '目標が未入力'
        const unit = ITEM_LABELS[r.item]?.unit ?? ''
        return `${formatDecimal1(r.target)}${unit}`
      },
    },
    {
      key: 'actual',
      header: '実績',
      render: (r) => {
        if (r.item === 'target_missing' || r.actual === null) return '－'
        const unit = ITEM_LABELS[r.item]?.unit ?? ''
        return `${formatDecimal1(r.actual)}${unit}`
      },
    },
    {
      key: 'diff',
      header: '差',
      render: (r) => {
        if (r.item === 'target_missing' || r.target === null || r.actual === null) {
          return '－'
        }
        const unit = ITEM_LABELS[r.item]?.unit ?? ''
        const diff = r.actual - r.target
        return (
          <span className="kpi-alerts-diff-text">
            {diff < 0
              ? `▼${formatDecimal1(diff)}${unit}`
              : `▲+${formatDecimal1(diff)}${unit}`}
          </span>
        )
      },
    },
    {
      key: 'response',
      header: '対応の記録（理由必須）',
      render: (r) => {
        // 月のペースで遅れが続いている行（needs_response = false）は「続いている」と出し、対応の欄を出さない
        if (!r.needs_response) {
          return (
            <span style={{ color: 'var(--ink-muted)', fontSize: '13px' }}>
              {r.compare === 'pace'
                ? '続いている（前の営業日から継続のため対応入力不要）'
                : '続いている（月内の初回日に記録対象）'}
            </span>
          )
        }

        // すでに対応が記録されている場合（リーダーは上書き修正も可能、MGR・代表は見るだけ）
        if (!r.canRespond) {
          if (r.response === null) {
            return <Tag tone="warn">未対応（担当リーダーが記録）</Tag>
          }
          return (
            <div>
              <Tag tone={r.response === 'done' ? 'good' : 'plain'}>
                {r.response === 'done' ? '対応済' : '不要だった'}
              </Tag>
              <div style={{ marginTop: '4px', fontSize: '13px' }}>
                理由：{r.response_reason ?? '－'}
                {r.responderName ? `（記録：${r.responderName}）` : ''}
              </div>
            </div>
          )
        }

        const currentChoice = responseChoiceDraft[r.id] ?? r.response ?? 'done'
        const currentReason = responseReasonDraft[r.id] ?? r.response_reason ?? ''

        return (
          <div className="kpi-alerts-response-box">
            {r.response !== null && (
              <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                現在の記録：
                <strong>{r.response === 'done' ? '対応済' : '不要だった'}</strong> ／ 理由：
                {r.response_reason}
              </div>
            )}
            <div className="kpi-alerts-response-controls">
              <SelectField
                aria-label={`${r.memberName} ${ITEM_LABELS[r.item]?.label} の対応区分`}
                options={[
                  { value: 'done', label: '対応済' },
                  { value: 'unneeded', label: '不要だった' },
                ]}
                value={currentChoice}
                onChange={(e) =>
                  setResponseChoiceDraft((prev) => ({
                    ...prev,
                    [r.id]: e.target.value as AlertResponseStatus,
                  }))
                }
              />
              <input
                type="text"
                className="text-input"
                aria-label={`${r.memberName} ${ITEM_LABELS[r.item]?.label} の理由`}
                placeholder="理由を入力（必須）..."
                value={currentReason}
                onChange={(e) =>
                  setResponseReasonDraft((prev) => ({
                    ...prev,
                    [r.id]: e.target.value,
                  }))
                }
              />
              <Button
                variant="primary"
                disabled={savingId === r.id}
                onClick={() => void handleSaveResponse(r)}
              >
                {r.response !== null ? '更新' : '記録する'}
              </Button>
            </div>
          </div>
        )
      },
    },
  ]

  const columns = renderMemberTableColumns()

  return (
    <div className="kpi-alerts-page">
      <section className="panel">
        <div className="section-header-row">
          <div>
            <h1 className="section-title">未達の一覧</h1>
            <p className="lead-text">
              CSV取り込みの承認直後に計算された、日ごと・月のペースの未達一覧です。
              {viewerRole === 'leader'
                ? '同じチームのメンバーの対応が必要な行に「対応済」「不要だった」と理由（必須）を記録してください。'
                : 'MGR・代表は閲覧専用です（各チームのリーダーが対応を記録します）。'}
            </p>
          </div>
          <Tag tone="navy">
            {viewerRole === 'leader'
              ? 'リーダー（自チームの対応記録可）'
              : viewerRole === 'mgr'
                ? 'MGR（閲覧のみ）'
                : '代表（閲覧のみ）'}
          </Tag>
        </div>

        {/* 一番上に未対応の数を表示 */}
        <div className="kpi-alerts-summary-bar">
          <div className="kpi-alerts-summary-card">
            <div className="kpi-alerts-summary-label">未対応の数（全体）</div>
            <div className="kpi-alerts-summary-count">{totalUnrespondedCount} 件</div>
          </div>
          <div className="kpi-alerts-summary-card">
            <div className="kpi-alerts-summary-label">表示中の未対応の数</div>
            <div className="kpi-alerts-summary-count">{filteredUnrespondedCount} 件</div>
          </div>
          <div className="kpi-alerts-summary-card">
            <div className="kpi-alerts-summary-label">表示中の未達の行数（継続含む）</div>
            <div className="kpi-alerts-summary-count">{filteredAlerts.length} 行</div>
          </div>
        </div>

        {errorMsg && (
          <NoticeBox title="確認してください" tone="alert" role="alert">
            {errorMsg}
          </NoticeBox>
        )}

        {successMsg && (
          <NoticeBox title="記録しました" tone="good" role="status">
            {successMsg}
          </NoticeBox>
        )}

        {/* 日付とチームでの絞り込み */}
        <div className="kpi-alerts-filter-bar">
          <SelectField
            id="alerts-filter-date"
            label="日付で絞り込む"
            placeholder="すべての日付"
            options={screenData.availableDates.map((d) => ({
              value: d,
              label: d,
            }))}
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
          <SelectField
            id="alerts-filter-team"
            label="チームで絞り込む"
            placeholder="すべてのチーム"
            options={screenData.teams.map((t) => ({
              value: t.id,
              label: t.name,
            }))}
            value={filterTeamId}
            onChange={(e) => setFilterTeamId(e.target.value)}
          />
          <div className="filter-bar-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setFilterDate('')
                setFilterTeamId('')
              }}
            >
              絞り込みを解除
            </Button>
          </div>
        </div>

        {/* 日付ごと（新しい日が上）→ 人ごとの未達一覧 */}
        {groupedByDate.length === 0 ? (
          <NoticeBox title="未達の記録はありません" tone="info">
            条件に当てはまる未達の記録はありません。
          </NoticeBox>
        ) : (
          groupedByDate.map((dateGroup) => {
            const unrespondedInDate = dateGroup.members.reduce(
              (acc, m) =>
                acc + m.rows.filter((r) => r.needs_response && r.response === null).length,
              0,
            )

            return (
              <div key={dateGroup.date} className="kpi-alerts-date-group">
                <div className="kpi-alerts-date-header">
                  <h2 className="kpi-alerts-date-title">
                    <DateText value={dateGroup.date} withWeekday />
                  </h2>
                  <Tag tone={unrespondedInDate > 0 ? 'warn' : 'good'}>
                    {unrespondedInDate > 0
                      ? `未対応 ${unrespondedInDate}件`
                      : 'すべて対応済み'}
                  </Tag>
                </div>

                {dateGroup.members.map((memberGroup) => {
                  const memberUnresponded = memberGroup.rows.filter(
                    (r) => r.needs_response && r.response === null,
                  ).length

                  return (
                    <div key={memberGroup.memberId} className="kpi-alerts-member-card">
                      <div className="kpi-alerts-member-head">
                        <div className="kpi-alerts-member-name">
                          {memberGroup.memberName}
                          <span
                            style={{
                              marginLeft: '10px',
                              fontSize: '13px',
                              fontWeight: 500,
                              color: 'var(--ink-muted)',
                            }}
                          >
                            （{memberGroup.memberTeamName}）
                          </span>
                        </div>
                        <Tag tone={memberUnresponded > 0 ? 'warn' : 'good'}>
                          {memberUnresponded > 0
                            ? `要対応 ${memberUnresponded}件`
                            : '対応完了'}
                        </Tag>
                      </div>

                      <DataTable
                        columns={columns}
                        rows={memberGroup.rows}
                        rowKey={(r) => r.id}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </section>
    </div>
  )
}

export default KpiAlertsPage
