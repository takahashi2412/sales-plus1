import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  DataTable,
  InputField,
  NoticeBox,
  SelectField,
  Tag,
  type TableColumn,
} from '../../../components/ui'
import {
  calculateKpiTargets,
  formatDecimal1,
  formatKpiErrorMessage,
  type KpiTargetHistoryItem,
  type KpiTargetRow,
  type KpiTargetValues,
} from '../shared'
import {
  fetchKpiTargetsScreenData,
  formatMonthLabel,
  getDefaultTargetValues,
  saveSelfKpiTarget,
  type KpiTargetsScreenData,
  type ReadableMemberInfo,
} from './api'
import './styles.css'

const TARGET_FIELD_LABELS: Record<keyof KpiTargetValues, { label: string; unit: string }> = {
  target_profit: { label: '目標粗利', unit: 'P' },
  unit_price: { label: '単価', unit: 'P' },
  completion_rate: { label: '完了率', unit: '%' },
  rate_order: { label: '受注率', unit: '%' },
  apo_target: { label: 'アポの目標件数', unit: '件' },
  working_days: { label: '稼働日', unit: '日' },
  call_hours: { label: '1日のコール時間', unit: '時間' },
  term: { label: 'ターム（1時間あたりコール数）', unit: '件' },
  rate_connected: { label: '実率', unit: '%' },
  rate_recall: { label: '再率', unit: '%' },
  rate_owner: { label: 'オ率', unit: '%' },
  rate_prospect: { label: '見率', unit: '%' },
  rate_apo_owner: { label: 'ア/オ', unit: '%' },
  rate_adoption: { label: '採用率', unit: '%' },
}

const TARGET_FIELD_KEYS = Object.keys(TARGET_FIELD_LABELS) as Array<keyof KpiTargetValues>

function formatTimestampJst(iso: string | null | undefined): string {
  if (!iso) return '－'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

interface HistoryDiffEntry {
  changedAt: string
  changes: Array<{
    fieldLabel: string
    beforeText: string
    afterText: string
    trendText: string
  }>
}

function buildTargetHistoryDiffs(row: KpiTargetRow | null): HistoryDiffEntry[] {
  if (!row || !Array.isArray(row.history) || row.history.length === 0) {
    return []
  }

  const historyList: KpiTargetHistoryItem[] = row.history
  const result: HistoryDiffEntry[] = []

  for (let i = 0; i < historyList.length; i += 1) {
    const snap = historyList[i]
    const beforeVals = snap.values
    const afterVals: KpiTargetValues =
      i + 1 < historyList.length ? historyList[i + 1].values : row

    const changes: HistoryDiffEntry['changes'] = []
    for (const key of TARGET_FIELD_KEYS) {
      const bRaw = beforeVals[key]
      const aRaw = afterVals[key]
      const bNum = bRaw !== null && bRaw !== undefined ? Number(bRaw) : null
      const aNum = aRaw !== null && aRaw !== undefined ? Number(aRaw) : null
      if (bNum !== aNum) {
        const meta = TARGET_FIELD_LABELS[key]
        const beforeText = bNum !== null ? `${bNum}${meta.unit}` : 'なし'
        const afterText = aNum !== null ? `${aNum}${meta.unit}` : 'なし'
        let trendText = ''
        if (bNum !== null && aNum !== null) {
          const diff = Math.round((aNum - bNum) * 100) / 100
          if (diff > 0) {
            trendText = `（▲${diff}${meta.unit}）`
          } else if (diff < 0) {
            trendText = `（▼${Math.abs(diff)}${meta.unit}）`
          }
        }
        changes.push({
          fieldLabel: meta.label,
          beforeText,
          afterText,
          trendText,
        })
      }
    }

    result.push({
      changedAt: formatTimestampJst(snap.changed_at),
      changes,
    })
  }

  return result.reverse()
}

export function KpiTargetsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [screenData, setScreenData] = useState<KpiTargetsScreenData | null>(null)

  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [formValues, setFormValues] = useState<KpiTargetValues | null>(null)

  // 上席・管理者が他の人の目標を閲覧するときの選択中メンバーID
  const [inspectMemberId, setInspectMemberId] = useState<string>('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const data = await fetchKpiTargetsScreenData()
      setScreenData(data)
      setSelectedMonth((prev) => prev || data.currentMonth)
      const firstOther = data.readableMembers.find((m) => !m.isSelf)
      setInspectMemberId((prev) => prev || firstOther?.member.id || data.selfMember?.id || '')
    } catch (err) {
      setErrorMsg(formatKpiErrorMessage('目標データの読み込みに失敗しました', err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const selfTargetRow = useMemo(() => {
    if (!screenData?.selfMember || !selectedMonth) return null
    return (
      screenData.targets.find(
        (t) => t.member_id === screenData.selfMember!.id && t.month === selectedMonth,
      ) ?? null
    )
  }, [screenData, selectedMonth])

  // 月または自分の既存データが切り替わったらフォーム値を初期化
  useEffect(() => {
    if (!screenData?.selfMember || !selectedMonth) return
    if (selfTargetRow) {
      setFormValues({
        target_profit:
          selfTargetRow.target_profit !== null ? Number(selfTargetRow.target_profit) : null,
        unit_price:
          selfTargetRow.unit_price !== null ? Number(selfTargetRow.unit_price) : null,
        completion_rate:
          selfTargetRow.completion_rate !== null ? Number(selfTargetRow.completion_rate) : null,
        rate_order:
          selfTargetRow.rate_order !== null ? Number(selfTargetRow.rate_order) : null,
        apo_target:
          selfTargetRow.apo_target !== null ? Number(selfTargetRow.apo_target) : null,
        working_days: Number(selfTargetRow.working_days),
        call_hours: Number(selfTargetRow.call_hours),
        term: Number(selfTargetRow.term),
        rate_connected: Number(selfTargetRow.rate_connected),
        rate_recall: Number(selfTargetRow.rate_recall),
        rate_owner: Number(selfTargetRow.rate_owner),
        rate_prospect: Number(selfTargetRow.rate_prospect),
        rate_apo_owner: Number(selfTargetRow.rate_apo_owner),
        rate_adoption: Number(selfTargetRow.rate_adoption),
      })
    } else {
      setFormValues(
        getDefaultTargetValues(
          screenData.selfMember.goes_to_sales,
          selectedMonth,
          screenData.holidaysSetting,
          screenData.workdaysSetting,
        ),
      )
    }
  }, [screenData, selectedMonth, selfTargetRow])

  const selfGoesToSales = screenData?.selfMember?.goes_to_sales ?? true

  const selfCalculated = useMemo(() => {
    if (!formValues) return null
    return calculateKpiTargets(selfGoesToSales, formValues)
  }, [selfGoesToSales, formValues])

  const selfHistoryDiffs = useMemo(() => {
    return buildTargetHistoryDiffs(selfTargetRow)
  }, [selfTargetRow])

  const updateNumberField = (key: keyof KpiTargetValues, raw: string) => {
    const parsed = raw === '' ? 0 : Number(raw)
    const safeNum = Number.isNaN(parsed) ? 0 : parsed
    setFormValues((prev) => (prev ? { ...prev, [key]: safeNum } : prev))
  }

  const handleSaveSelfTarget = async () => {
    if (!screenData?.selfMember || !formValues || !selectedMonth) return
    setSaving(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      await saveSelfKpiTarget({
        existingTargetId: selfTargetRow?.id ?? null,
        memberId: screenData.selfMember.id,
        month: selectedMonth,
        goesToSales: selfGoesToSales,
        values: formValues,
      })
      await loadData()
      setSuccessMsg(`${formatMonthLabel(selectedMonth)}の自分の目標を保存しました。`)
    } catch (err) {
      setErrorMsg(formatKpiErrorMessage('目標の保存に失敗しました', err))
    } finally {
      setSaving(false)
    }
  }

  // 上席・管理者が読めるメンバー一覧（自分以外がいるか）
  const otherReadableMembers = useMemo(() => {
    return (screenData?.readableMembers ?? []).filter((m) => !m.isSelf)
  }, [screenData?.readableMembers])

  const canViewOthers =
    Boolean(screenData?.viewer) &&
    (screenData!.viewer!.role !== 'member' || screenData!.viewer!.isAdmin) &&
    (screenData?.readableMembers.length ?? 0) > 0

  const inspectedMemberInfo = useMemo(() => {
    if (!screenData) return null
    return (
      screenData.readableMembers.find((m) => m.member.id === inspectMemberId) ??
      otherReadableMembers[0] ??
      screenData.readableMembers[0] ??
      null
    )
  }, [screenData, inspectMemberId, otherReadableMembers])

  const inspectedTargetRow = useMemo(() => {
    if (!screenData || !inspectedMemberInfo || !selectedMonth) return null
    return (
      screenData.targets.find(
        (t) => t.member_id === inspectedMemberInfo.member.id && t.month === selectedMonth,
      ) ?? null
    )
  }, [screenData, inspectedMemberInfo, selectedMonth])

  const inspectedCalculated = useMemo(() => {
    if (!inspectedTargetRow) return null
    return calculateKpiTargets(inspectedTargetRow.goes_to_sales, inspectedTargetRow)
  }, [inspectedTargetRow])

  const inspectedHistoryDiffs = useMemo(() => {
    return buildTargetHistoryDiffs(inspectedTargetRow)
  }, [inspectedTargetRow])

  if (loading) {
    return (
      <section className="panel">
        <p className="lead-text">読み込み中...</p>
      </section>
    )
  }

  if (!screenData?.viewer || !screenData.selfMember) {
    return (
      <section className="panel">
        <NoticeBox title="名簿の情報が見つかりません" tone="warn">
          ログイン中の名簿情報が確認できません。
        </NoticeBox>
      </section>
    )
  }

  const currentMonth = screenData.currentMonth
  const nextMonth = screenData.nextMonth

  const statusColumns: TableColumn<ReadableMemberInfo>[] = [
    {
      key: 'name',
      header: '名前',
      className: 'col-name',
      render: (r) => (
        <span>
          {r.member.name}
          {r.isSelf ? '（自分）' : ''}
        </span>
      ),
    },
    {
      key: 'team',
      header: 'チーム',
      render: (r) => r.teamName,
    },
    {
      key: 'sales',
      header: '区分',
      render: (r) => (
        <Tag tone={r.member.goes_to_sales ? 'navy' : 'plain'}>
          {r.member.goes_to_sales ? '営業に出る' : '営業に出ない（アポのみ）'}
        </Tag>
      ),
    },
    {
      key: 'current_status',
      header: `今月（${formatMonthLabel(currentMonth)}）の目標の状態`,
      render: (r) => {
        const t = screenData.targets.find(
          (row) => row.member_id === r.member.id && row.month === currentMonth,
        )
        if (!t) {
          return <Tag tone="warn">未入力</Tag>
        }
        if (t.revised_at !== null) {
          return <Tag tone="navy">修正あり</Tag>
        }
        return <Tag tone="good">入力済み</Tag>
      },
    },
    {
      key: 'next_status',
      header: `来月（${formatMonthLabel(nextMonth)}）`,
      render: (r) => {
        const t = screenData.targets.find(
          (row) => row.member_id === r.member.id && row.month === nextMonth,
        )
        if (!t) return <Tag tone="plain">未入力</Tag>
        return <Tag tone="good">入力済み</Tag>
      },
    },
    {
      key: 'action',
      header: '内容を見る',
      render: (r) => (
        <Button
          variant={inspectedMemberInfo?.member.id === r.member.id ? 'primary' : 'secondary'}
          onClick={() => setInspectMemberId(r.member.id)}
        >
          {inspectedMemberInfo?.member.id === r.member.id ? '表示中' : '目標を見る'}
        </Button>
      ),
    },
  ]

  return (
    <div className="kpi-targets-page">
      {/* 1. 自分の目標の入力・逆算確認 */}
      <section className="panel">
        <div className="section-header-row">
          <div>
            <h1 className="section-title">KPIの目標（自分の目標の入力・逆算）</h1>
            <p className="lead-text">
              今月と来月の目標を入力・修正します。名簿の区分（
              {selfGoesToSales ? '営業に出る人' : '営業に出ない人（アポだけの人）'}
              ）に合わせて月次・日次の目標を自動で逆算します（画面表示は小数第1位まで）。
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Tag tone="navy">
              {selfGoesToSales ? '営業に出る人' : '営業に出ない人（アポのみ）'}
            </Tag>
            {selfTargetRow ? (
              selfTargetRow.revised_at ? (
                <Tag tone="warn">修正あり（{formatTimestampJst(selfTargetRow.revised_at)}）</Tag>
              ) : (
                <Tag tone="good">入力済み</Tag>
              )
            ) : (
              <Tag tone="warn">未入力</Tag>
            )}
          </div>
        </div>

        {!screenData.holidaysConfigured && (
          <NoticeBox title="会社の休みの日が設定されていません" tone="warn">
            会社の休みの日が設定されていません（設定値 kpi_holidays がないため、土日だけを除いて営業日数を初期計算しています）。
          </NoticeBox>
        )}

        <NoticeBox title="月が始まってから目標を直したときの決まり" tone="info">
          月が始まってから今月の目標を直すと「修正あり」の印がつき、前の値の控え（履歴）が残ります。取り込み直したときも、直す前の日の未達判定には直す前の目標値が使われます。
        </NoticeBox>

        {errorMsg && (
          <NoticeBox title="確認してください" tone="alert" role="alert">
            {errorMsg}
          </NoticeBox>
        )}

        {successMsg && (
          <NoticeBox title="保存しました" tone="good" role="status">
            {successMsg}
          </NoticeBox>
        )}

        {/* 今月・来月の切り替えバー */}
        <div className="kpi-targets-month-bar">
          <div>
            <strong>対象の月：</strong> {formatMonthLabel(selectedMonth)}
            {selectedMonth === currentMonth ? '（今月）' : '（来月）'}
          </div>
          <div className="kpi-targets-month-buttons">
            <Button
              variant={selectedMonth === currentMonth ? 'primary' : 'secondary'}
              onClick={() => setSelectedMonth(currentMonth)}
            >
              今月（{formatMonthLabel(currentMonth)}）
            </Button>
            <Button
              variant={selectedMonth === nextMonth ? 'primary' : 'secondary'}
              onClick={() => setSelectedMonth(nextMonth)}
            >
              来月（{formatMonthLabel(nextMonth)}）
            </Button>
          </div>
        </div>

        {/* ア（月次）と「総×オ率×ア/オから出るアポ数（月次）」の不一致の知らせ */}
        {selfCalculated && selfCalculated.apoMismatch && (
          <NoticeBox
            title="成果から逆算したア（月次）と、行動量（総×オ率×ア/オ）から出るアポ数が合っていません"
            tone="warn"
          >
            成果の目標のア（月次）は <strong>{formatDecimal1(selfCalculated.monthlyApo)}件</strong>{' '}
            ですが、行動の目標（総×オ率×ア/オ）から出る月次のアポ数は{' '}
            <strong>{formatDecimal1(selfCalculated.actionMonthlyApo)}件</strong> です（差：
            {selfCalculated.apoDiff >= 0
              ? `▲${formatDecimal1(selfCalculated.apoDiff)}件`
              : `▼${formatDecimal1(Math.abs(selfCalculated.apoDiff))}件`}
            ）。稼働日・コール時間・オ率・ア/オを見直すか確認してください。
          </NoticeBox>
        )}

        {formValues && selfCalculated && (
          <div className="kpi-targets-two-col">
            {/* 左：入力フォーム */}
            <div className="kpi-targets-box">
              <h2 className="kpi-targets-box-title">
                <span>自分の目標を入力する（{formatMonthLabel(selectedMonth)}）</span>
              </h2>

              <div className="kpi-targets-form-grid">
                {selfGoesToSales ? (
                  <>
                    <InputField
                      id="self-target-profit"
                      label="目標粗利（P）"
                      type="number"
                      step="0.1"
                      min="0"
                      value={formValues.target_profit ?? 0}
                      onChange={(e) => updateNumberField('target_profit', e.target.value)}
                    />
                    <InputField
                      id="self-unit-price"
                      label="単価（P）"
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={formValues.unit_price ?? 0}
                      onChange={(e) => updateNumberField('unit_price', e.target.value)}
                    />
                    <InputField
                      id="self-completion-rate"
                      label="完了率（%）"
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="100"
                      value={formValues.completion_rate ?? 0}
                      onChange={(e) => updateNumberField('completion_rate', e.target.value)}
                    />
                    <InputField
                      id="self-rate-order"
                      label="受注率（%）"
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="100"
                      value={formValues.rate_order ?? 0}
                      onChange={(e) => updateNumberField('rate_order', e.target.value)}
                    />
                  </>
                ) : (
                  <InputField
                    id="self-apo-target"
                    label="アポの目標件数（月次・件）"
                    type="number"
                    step="0.1"
                    min="0"
                    value={formValues.apo_target ?? 0}
                    onChange={(e) => updateNumberField('apo_target', e.target.value)}
                  />
                )}

                <InputField
                  id="self-rate-adoption"
                  label="採用率（%）"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={formValues.rate_adoption}
                  onChange={(e) => updateNumberField('rate_adoption', e.target.value)}
                />
                <InputField
                  id="self-working-days"
                  label="稼働日（日）"
                  type="number"
                  step="1"
                  min="1"
                  max="31"
                  value={formValues.working_days}
                  onChange={(e) => updateNumberField('working_days', e.target.value)}
                />
                <InputField
                  id="self-call-hours"
                  label="1日のコール時間（時間）"
                  type="number"
                  step="0.5"
                  min="0.1"
                  max="24"
                  value={formValues.call_hours}
                  onChange={(e) => updateNumberField('call_hours', e.target.value)}
                />
                <InputField
                  id="self-term"
                  label="ターム（1時間あたり件数）"
                  type="number"
                  step="0.5"
                  min="0.1"
                  value={formValues.term}
                  onChange={(e) => updateNumberField('term', e.target.value)}
                />
                <InputField
                  id="self-rate-connected"
                  label="実率（%）"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={formValues.rate_connected}
                  onChange={(e) => updateNumberField('rate_connected', e.target.value)}
                />
                <InputField
                  id="self-rate-recall"
                  label="再率（%）"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={formValues.rate_recall}
                  onChange={(e) => updateNumberField('rate_recall', e.target.value)}
                />
                <InputField
                  id="self-rate-owner"
                  label="オ率（%）"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={formValues.rate_owner}
                  onChange={(e) => updateNumberField('rate_owner', e.target.value)}
                />
                <InputField
                  id="self-rate-prospect"
                  label="見率（%）"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={formValues.rate_prospect}
                  onChange={(e) => updateNumberField('rate_prospect', e.target.value)}
                />
                <InputField
                  id="self-rate-apo-owner"
                  label="ア/オ（%）"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={formValues.rate_apo_owner}
                  onChange={(e) => updateNumberField('rate_apo_owner', e.target.value)}
                />
              </div>

              <div className="action-row">
                <Button
                  variant="primary"
                  disabled={saving}
                  onClick={() => void handleSaveSelfTarget()}
                >
                  {selfTargetRow
                    ? `${formatMonthLabel(selectedMonth)}の目標を更新する`
                    : `${formatMonthLabel(selectedMonth)}の目標を登録する`}
                </Button>
              </div>
            </div>

            {/* 右：逆算される月次・日次の目標プレビュー */}
            <div className="kpi-targets-box">
              <h2 className="kpi-targets-box-title">
                <span>自動で逆算される月次・日次の目標（小数第1位まで表示）</span>
              </h2>

              <div className="kpi-targets-table-scroll">
                <table className="kpi-targets-preview-table">
                <thead>
                  <tr>
                    <th>項目</th>
                    <th>計算のしかた</th>
                    <th style={{ textAlign: 'right' }}>日次の目標</th>
                    <th style={{ textAlign: 'right' }}>月次の目標</th>
                  </tr>
                </thead>
                <tbody>
                  {selfGoesToSales && (
                    <>
                      <tr>
                        <td>
                          <strong>件数</strong>
                        </td>
                        <td>目標粗利 ÷ 単価</td>
                        <td className="num-col">－</td>
                        <td className="num-col">{formatDecimal1(selfCalculated.deals)}件</td>
                      </tr>
                      <tr>
                        <td>
                          <strong>受注（KGI）</strong>
                        </td>
                        <td>件数 ÷ 完了率</td>
                        <td className="num-col">－</td>
                        <td className="num-col">{formatDecimal1(selfCalculated.ordersKgi)}件</td>
                      </tr>
                    </>
                  )}
                  <tr>
                    <td>
                      <strong>{selfGoesToSales ? '採用・訪問' : '採用（月次）'}</strong>
                    </td>
                    <td>{selfGoesToSales ? '受注 ÷ 受注率' : 'ア（月次） × 採用率'}</td>
                    <td className="num-col">－</td>
                    <td className="num-col">{formatDecimal1(selfCalculated.adoptions)}件</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>ア（月次）</strong>
                    </td>
                    <td>{selfGoesToSales ? '採用・訪問 ÷ 採用率' : '本人が入れた目標件数'}</td>
                    <td className="num-col">－</td>
                    <td className="num-col">{formatDecimal1(selfCalculated.monthlyApo)}件</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>総×オ率×ア/オから出るアポ数</strong>
                    </td>
                    <td>総（月次） × オ率 × ア/オ</td>
                    <td className="num-col">－</td>
                    <td className="num-col">
                      {formatDecimal1(selfCalculated.actionMonthlyApo)}件
                      {selfCalculated.apoMismatch ? (
                        <span style={{ marginLeft: '6px' }}>
                          <Tag tone="warn">ア（月次）と不一致</Tag>
                        </span>
                      ) : (
                        <span style={{ marginLeft: '6px' }}>
                          <Tag tone="good">一致</Tag>
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>総（コール数）</strong>
                    </td>
                    <td>1日のコール時間 × ターム（×稼働日）</td>
                    <td className="num-col">{formatDecimal1(selfCalculated.dailyTotal)}件</td>
                    <td className="num-col">{formatDecimal1(selfCalculated.monthlyTotal)}件</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>実</strong>
                    </td>
                    <td>総 × 実率</td>
                    <td className="num-col">{formatDecimal1(selfCalculated.dailyConnected)}件</td>
                    <td className="num-col">{formatDecimal1(selfCalculated.monthlyConnected)}件</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>再</strong>
                    </td>
                    <td>総 × 再率</td>
                    <td className="num-col">{formatDecimal1(selfCalculated.dailyRecall)}件</td>
                    <td className="num-col">{formatDecimal1(selfCalculated.monthlyRecall)}件</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>オ</strong>
                    </td>
                    <td>総 × オ率</td>
                    <td className="num-col">{formatDecimal1(selfCalculated.dailyOwner)}件</td>
                    <td className="num-col">{formatDecimal1(selfCalculated.monthlyOwner)}件</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>見</strong>
                    </td>
                    <td>総 × 見率</td>
                    <td className="num-col">{formatDecimal1(selfCalculated.dailyProspect)}件</td>
                    <td className="num-col">{formatDecimal1(selfCalculated.monthlyProspect)}件</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>ア/オ</strong>
                    </td>
                    <td>ア/オの目標率</td>
                    <td className="num-col">{formatDecimal1(selfCalculated.rateApoOwner)}%</td>
                    <td className="num-col">{formatDecimal1(selfCalculated.rateApoOwner)}%</td>
                  </tr>
                </tbody>
              </table>
              </div>

              {/* 自分の目標を直した記録（history） */}
              <div style={{ marginTop: '18px' }}>
                <div className="kpi-targets-box-title">
                  <span>直した記録（いつ・どの欄が・前の値→今の値）</span>
                  <Tag tone={selfHistoryDiffs.length > 0 ? 'warn' : 'plain'}>
                    {selfHistoryDiffs.length > 0 ? `修正 ${selfHistoryDiffs.length}回` : '修正なし'}
                  </Tag>
                </div>
                {selfHistoryDiffs.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink-muted)' }}>
                    月が始まってからの修正記録はありません。
                  </p>
                ) : (
                  <div className="kpi-targets-history-list">
                    {selfHistoryDiffs.map((entry, idx) => (
                      <div key={`${entry.changedAt}-${idx}`} className="kpi-targets-history-card">
                        <div className="kpi-targets-history-time">
                          修正日時：{entry.changedAt}
                        </div>
                        <ul className="kpi-targets-history-diffs">
                          {entry.changes.map((c) => (
                            <li key={c.fieldLabel}>
                              <strong>{c.fieldLabel}</strong>：{c.beforeText} →{' '}
                              <strong>{c.afterText}</strong> {c.trendText}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2. 上席（リーダー・担当MGR・代表）と管理者向け：読める人の目標一覧と閲覧（見るだけ） */}
      {canViewOthers && (
        <section className="panel">
          <div className="section-header-row">
            <div>
              <h2 className="section-title">
                読める人の目標の状態一覧・内容の確認（上席・管理者向け・閲覧のみ）
              </h2>
              <p className="lead-text">
                今月（{formatMonthLabel(currentMonth)}）の目標の状態（入力済み／未入力／修正あり）を人ごとに並べ、選んだ人の目標と直した記録を確認できます（他の人の目標は入力・変更できません）。
              </p>
            </div>
            <span className="count-label">対象 {screenData.readableMembers.length} 人</span>
          </div>

          <DataTable
            columns={statusColumns}
            rows={screenData.readableMembers}
            rowKey={(r) => r.member.id}
          />

          {/* 選んだ人の目標詳細（見るだけ） */}
          {inspectedMemberInfo && (
            <div className="kpi-targets-box" style={{ marginTop: '18px' }}>
              <div className="kpi-targets-box-title">
                <div>
                  <span>
                    選択中の人：<strong>{inspectedMemberInfo.member.name}</strong>（
                    {inspectedMemberInfo.teamName} ／{' '}
                    {inspectedMemberInfo.member.goes_to_sales
                      ? '営業に出る人'
                      : '営業に出ない人（アポのみ）'}
                    ）の {formatMonthLabel(selectedMonth)} の目標
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <SelectField
                    aria-label="確認する人を選ぶ"
                    options={screenData.readableMembers.map((rm) => ({
                      value: rm.member.id,
                      label: `${rm.member.name}（${rm.teamName}）`,
                    }))}
                    value={inspectedMemberInfo.member.id}
                    onChange={(e) => setInspectMemberId(e.target.value)}
                  />
                  {inspectedTargetRow ? (
                    inspectedTargetRow.revised_at ? (
                      <Tag tone="warn">修正あり</Tag>
                    ) : (
                      <Tag tone="good">入力済み</Tag>
                    )
                  ) : (
                    <Tag tone="warn">未入力</Tag>
                  )}
                </div>
              </div>

              {!inspectedTargetRow || !inspectedCalculated ? (
                <NoticeBox title="目標が未入力です" tone="warn">
                  {inspectedMemberInfo.member.name} さんの {formatMonthLabel(selectedMonth)}{' '}
                  の目標はまだ入力されていません。
                </NoticeBox>
              ) : (
                <div className="kpi-targets-two-col">
                  <div className="kpi-targets-table-scroll">
                    <table className="kpi-targets-preview-table">
                      <thead>
                        <tr>
                          <th>入力項目・逆算項目</th>
                          <th style={{ textAlign: 'right' }}>日次</th>
                          <th style={{ textAlign: 'right' }}>月次・設定値</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inspectedTargetRow.goes_to_sales ? (
                          <>
                            <tr>
                              <td>目標粗利 ／ 単価</td>
                              <td className="num-col">－</td>
                              <td className="num-col">
                                {formatDecimal1(inspectedTargetRow.target_profit)}P ／{' '}
                                {formatDecimal1(inspectedTargetRow.unit_price)}P
                              </td>
                            </tr>
                            <tr>
                              <td>完了率 ／ 受注率</td>
                              <td className="num-col">－</td>
                              <td className="num-col">
                                {formatDecimal1(inspectedTargetRow.completion_rate)}% ／{' '}
                                {formatDecimal1(inspectedTargetRow.rate_order)}%
                              </td>
                            </tr>
                            <tr>
                              <td>逆算：件数 ／ 受注（KGI）</td>
                              <td className="num-col">－</td>
                              <td className="num-col">
                                {formatDecimal1(inspectedCalculated.deals)}件 ／{' '}
                                {formatDecimal1(inspectedCalculated.ordersKgi)}件
                              </td>
                            </tr>
                          </>
                        ) : (
                          <tr>
                            <td>アポの目標件数</td>
                            <td className="num-col">－</td>
                            <td className="num-col">
                              {formatDecimal1(inspectedTargetRow.apo_target)}件
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td>採用率 ／ 逆算：採用・訪問</td>
                          <td className="num-col">－</td>
                          <td className="num-col">
                            {formatDecimal1(inspectedTargetRow.rate_adoption)}% ／{' '}
                            {formatDecimal1(inspectedCalculated.adoptions)}件
                          </td>
                        </tr>
                        <tr>
                          <td>ア（月次） ／ 行動から出るアポ数</td>
                          <td className="num-col">－</td>
                          <td className="num-col">
                            {formatDecimal1(inspectedCalculated.monthlyApo)}件 ／{' '}
                            {formatDecimal1(inspectedCalculated.actionMonthlyApo)}件
                          </td>
                        </tr>
                        <tr>
                          <td>稼働日 ／ コール時間 ／ ターム</td>
                          <td className="num-col">{formatDecimal1(inspectedTargetRow.call_hours)}h</td>
                          <td className="num-col">
                            {inspectedTargetRow.working_days}日 ／ ターム{' '}
                            {formatDecimal1(inspectedTargetRow.term)}件
                          </td>
                        </tr>
                        <tr>
                          <td>総（コール数）</td>
                          <td className="num-col">
                            {formatDecimal1(inspectedCalculated.dailyTotal)}件
                          </td>
                          <td className="num-col">
                            {formatDecimal1(inspectedCalculated.monthlyTotal)}件
                          </td>
                        </tr>
                        <tr>
                          <td>実（{formatDecimal1(inspectedTargetRow.rate_connected)}%）</td>
                          <td className="num-col">
                            {formatDecimal1(inspectedCalculated.dailyConnected)}件
                          </td>
                          <td className="num-col">
                            {formatDecimal1(inspectedCalculated.monthlyConnected)}件
                          </td>
                        </tr>
                        <tr>
                          <td>再（{formatDecimal1(inspectedTargetRow.rate_recall)}%）</td>
                          <td className="num-col">
                            {formatDecimal1(inspectedCalculated.dailyRecall)}件
                          </td>
                          <td className="num-col">
                            {formatDecimal1(inspectedCalculated.monthlyRecall)}件
                          </td>
                        </tr>
                        <tr>
                          <td>オ（{formatDecimal1(inspectedTargetRow.rate_owner)}%）</td>
                          <td className="num-col">
                            {formatDecimal1(inspectedCalculated.dailyOwner)}件
                          </td>
                          <td className="num-col">
                            {formatDecimal1(inspectedCalculated.monthlyOwner)}件
                          </td>
                        </tr>
                        <tr>
                          <td>見（{formatDecimal1(inspectedTargetRow.rate_prospect)}%）</td>
                          <td className="num-col">
                            {formatDecimal1(inspectedCalculated.dailyProspect)}件
                          </td>
                          <td className="num-col">
                            {formatDecimal1(inspectedCalculated.monthlyProspect)}件
                          </td>
                        </tr>
                        <tr>
                          <td>ア/オ</td>
                          <td className="num-col">
                            {formatDecimal1(inspectedCalculated.rateApoOwner)}%
                          </td>
                          <td className="num-col">
                            {formatDecimal1(inspectedCalculated.rateApoOwner)}%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <div className="kpi-targets-box-title">
                      <span>直した記録（いつ・どの欄が・前の値→今の値）</span>
                      <Tag tone={inspectedHistoryDiffs.length > 0 ? 'warn' : 'plain'}>
                        {inspectedHistoryDiffs.length > 0
                          ? `修正 ${inspectedHistoryDiffs.length}回`
                          : '修正なし'}
                      </Tag>
                    </div>
                    {inspectedHistoryDiffs.length === 0 ? (
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink-muted)' }}>
                        月が始まってからの修正記録はありません。
                      </p>
                    ) : (
                      <div className="kpi-targets-history-list">
                        {inspectedHistoryDiffs.map((entry, idx) => (
                          <div
                            key={`${entry.changedAt}-${idx}`}
                            className="kpi-targets-history-card"
                          >
                            <div className="kpi-targets-history-time">
                              修正日時：{entry.changedAt}
                            </div>
                            <ul className="kpi-targets-history-diffs">
                              {entry.changes.map((c) => (
                                <li key={c.fieldLabel}>
                                  <strong>{c.fieldLabel}</strong>：{c.beforeText} →{' '}
                                  <strong>{c.afterText}</strong> {c.trendText}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default KpiTargetsPage
