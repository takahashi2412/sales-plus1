import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import {
  Button,
  DataTable,
  DateText,
  InputField,
  NoticeBox,
  SelectField,
  Tag,
  type TableColumn,
} from '../../../components/ui'
import { getTodayJstDateString } from '../../../foundation/directory'
import {
  parseKpiCsvBuffer,
  validateCsvImport,
  type CtiMemberMapRow,
  type CtiTeamMapRow,
  type CsvImportCheckResult,
  type ImportLogRow,
  type ParsedKpiCsv,
} from '../shared'
import {
  addCtiMemberMapping,
  addCtiTeamMapping,
  approvePendingImportAndGenerateAlerts,
  cancelPendingImportLog,
  fetchApprovedMemberIdsOnDate,
  fetchEntriesSummaryForImportLog,
  fetchKpiImportScreenData,
  generateAlertsForApprovedImport,
  savePendingCsvImport,
  updateCtiMemberMapValidTo,
  updateCtiTeamMapValidTo,
  type KpiImportScreenData,
  type PendingEntrySummary,
} from './api'
import './styles.css'

interface UploadedCsvItem {
  key: string
  parsed: ParsedKpiCsv
  approvedMemberIdsOnDate: string[]
  importedLogId: string | null
  confirmingReplace: boolean
}

const IGNORE_MEMBER_VALUE = '__IGNORE__'

export function KpiImportPage() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [screenData, setScreenData] = useState<KpiImportScreenData | null>(null)

  const [uploadedItems, setUploadedItems] = useState<UploadedCsvItem[]>([])
  const [inlineMemberChoice, setInlineMemberChoice] = useState<Record<string, string>>({})
  const [inlineTeamChoice, setInlineTeamChoice] = useState<Record<string, string>>({})

  // 承認前（または承認済み）ログの数字プレビュー
  const [previewLogId, setPreviewLogId] = useState<string | null>(null)
  const [previewRows, setPreviewRows] = useState<PendingEntrySummary[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  // 下部タブ：'logs' | 'member_map' | 'team_map'
  const [activeTab, setActiveTab] = useState<'logs' | 'member_map' | 'team_map'>('logs')

  // 対応表の手動追加フォーム
  const [newCtiName, setNewCtiName] = useState('')
  const [newMapMemberId, setNewMapMemberId] = useState('')
  const [newMemberMapValidFrom, setNewMemberMapValidFrom] = useState(() => getTodayJstDateString())

  const [newCsvTeamName, setNewCsvTeamName] = useState('')
  const [newMapTeamId, setNewMapTeamId] = useState('')
  const [newTeamMapValidFrom, setNewTeamMapValidFrom] = useState(() => getTodayJstDateString())

  // valid_to 編集用の下書き値
  const [memberValidToDraft, setMemberValidToDraft] = useState<Record<string, string>>({})
  const [teamValidToDraft, setTeamValidToDraft] = useState<Record<string, string>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const data = await fetchKpiImportScreenData()
      setScreenData(data)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'データの読み込みに失敗しました。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of screenData?.members ?? []) {
      map.set(m.id, m.name)
    }
    return map
  }, [screenData?.members])

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of screenData?.teams ?? []) {
      map.set(t.id, t.name)
    }
    return map
  }, [screenData?.teams])

  const memberSelectOptions = useMemo(() => {
    const opts = [
      { value: IGNORE_MEMBER_VALUE, label: '取り込まない（集計対象外の名前として登録）' },
    ]
    for (const m of screenData?.members ?? []) {
      opts.push({ value: m.id, label: m.name })
    }
    return opts
  }, [screenData?.members])

  const teamSelectOptions = useMemo(() => {
    return (screenData?.teams ?? []).map((t) => ({
      value: t.id,
      label: t.name,
    }))
  }, [screenData?.teams])

  // アップロード済み各CSVに対して最新のマスタ・ログで5つのチェックを計算
  const checkedItems = useMemo(() => {
    if (!screenData) return []
    return uploadedItems.map((item) => {
      const targetDate = item.parsed.targetDate ?? ''
      const existingLogsOnDate = screenData.importLogs.filter(
        (l) => l.target_date === targetDate,
      )
      const check: CsvImportCheckResult = validateCsvImport({
        parsed: item.parsed,
        memberMaps: screenData.memberMaps,
        teamMaps: screenData.teamMaps,
        affiliations: screenData.affiliations,
        existingLogsOnDate,
        approvedMemberIdsOnDate: item.approvedMemberIdsOnDate,
      })
      return {
        item,
        check,
      }
    })
  }, [screenData, uploadedItems])

  const handleSelectFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setErrorMsg(null)
    setSuccessMsg(null)
    setBusy(true)

    try {
      const nextItems: UploadedCsvItem[] = []
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]
        const buffer = await file.arrayBuffer()
        const parsed = parseKpiCsvBuffer(buffer, file.name)
        const approvedMemberIdsOnDate = parsed.targetDate
          ? await fetchApprovedMemberIdsOnDate(parsed.targetDate)
          : []
        nextItems.push({
          key: `${file.name}-${Date.now()}-${i}`,
          parsed,
          approvedMemberIdsOnDate,
          importedLogId: null,
          confirmingReplace: false,
        })
      }
      setUploadedItems(nextItems)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'CSVファイルの読み取りに失敗しました。')
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  const handleInlineAddMemberMap = async (ctiName: string, validFrom: string) => {
    if (!screenData?.viewer) return
    const selected = inlineMemberChoice[ctiName]
    if (!selected) {
      setErrorMsg(`「${ctiName}」の対応先（名簿の人または「取り込まない」）を選んでください。`)
      return
    }
    setBusy(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const memberId = selected === IGNORE_MEMBER_VALUE ? null : selected
      const created = await addCtiMemberMapping({
        ctiName,
        memberId,
        validFrom: validFrom || getTodayJstDateString(),
        createdBy: screenData.viewer.memberId,
      })
      setScreenData((prev) =>
        prev
          ? {
              ...prev,
              memberMaps: [created, ...prev.memberMaps],
            }
          : prev,
      )
      setSuccessMsg(
        `名前「${ctiName}」を${memberId ? `「${memberNameById.get(memberId) ?? ''}」` : '「取り込まない」'}として対応表に登録しました（次回から自動で結びつきます）。`,
      )
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '名前の対応の登録に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  const handleInlineAddTeamMap = async (csvTeamName: string, validFrom: string) => {
    if (!screenData?.viewer) return
    const selectedTeamId = inlineTeamChoice[csvTeamName]
    if (!selectedTeamId) {
      setErrorMsg(`CSVのチーム名「${csvTeamName}」に対応するチームを選んでください。`)
      return
    }
    setBusy(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const created = await addCtiTeamMapping({
        csvTeamName,
        teamId: selectedTeamId,
        validFrom: validFrom || getTodayJstDateString(),
        createdBy: screenData.viewer.memberId,
      })
      setScreenData((prev) =>
        prev
          ? {
              ...prev,
              teamMaps: [created, ...prev.teamMaps],
            }
          : prev,
      )
      setSuccessMsg(
        `CSVのチーム名「${csvTeamName}」を「${teamNameById.get(selectedTeamId) ?? ''}」に対応づけました。`,
      )
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'チーム名の対応の登録に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  const handleImportAsPending = async (
    itemKey: string,
    check: CsvImportCheckResult,
    replaceConfirmed: boolean,
  ) => {
    if (!screenData?.viewer) return
    if (!check.canImport) {
      setErrorMsg('チェックに通っていない項目があるため取り込めません。')
      return
    }

    // 同じ日・同じCSVチーム名の有効な取り込みがすでにある場合は確認を求める
    if (check.check5ExistingImport && !replaceConfirmed) {
      setUploadedItems((prev) =>
        prev.map((u) => (u.key === itemKey ? { ...u, confirmingReplace: true } : u)),
      )
      return
    }

    setBusy(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const resolutionByName = new Map(
        check.memberResolutions.map((r) => [r.ctiName, r]),
      )
      const mappedRows: Array<{
        ctiName: string
        memberId: string
        slots: ParsedKpiCsv['personRows'][number]['slots']
      }> = []
      const ignoredNames: string[] = []

      for (const pRow of check.parsed.personRows) {
        const res = resolutionByName.get(pRow.ctiName)
        if (res?.status === 'mapped' && res.memberId) {
          mappedRows.push({
            ctiName: pRow.ctiName,
            memberId: res.memberId,
            slots: pRow.slots,
          })
        } else if (res?.status === 'ignored') {
          ignoredNames.push(pRow.ctiName)
        }
      }

      const newLog = await savePendingCsvImport({
        parsed: check.parsed,
        resolvedTeamId: check.resolvedTeamId,
        mappedRows,
        ignoredNames,
        teamMismatchWarnings: check.teamMismatchWarnings,
        existingImportLogIdToReplace: check.check5ExistingImport?.id ?? null,
        importerMemberId: screenData.viewer.memberId,
      })

      await loadData()
      setUploadedItems((prev) =>
        prev.map((u) =>
          u.key === itemKey
            ? { ...u, importedLogId: newLog.id, confirmingReplace: false }
            : u,
        ),
      )
      setSuccessMsg(
        `「${check.parsed.fileName}」を承認前として取り込みました（${mappedRows.length}人分）。数字を確認して「承認する」を押すと確定し、未達の一覧が作られます。`,
      )
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '取り込み処理に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  const handleApproveLog = async (log: ImportLogRow) => {
    if (!screenData) return
    setBusy(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const { alertCount } = await approvePendingImportAndGenerateAlerts(
        log,
        screenData.holidaysSetting,
      )
      await loadData()
      // アップロード中の行があれば同日の承認済みメンバーIDも更新
      if (log.target_date) {
        const approvedIds = await fetchApprovedMemberIdsOnDate(log.target_date)
        setUploadedItems((prev) =>
          prev.map((u) =>
            u.parsed.targetDate === log.target_date
              ? { ...u, approvedMemberIdsOnDate: approvedIds }
              : u,
          ),
        )
      }
      setSuccessMsg(
        `「${log.file_name}」（${log.target_date}・${log.csv_team_name}）を承認し、未達 ${alertCount}件を計算して記録しました。`,
      )
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : '承認または未達の計算・書き込みに失敗しました。',
      )
      await loadData()
    } finally {
      setBusy(false)
    }
  }

  const handleRerunAlerts = async (log: ImportLogRow) => {
    if (!screenData) return
    setBusy(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const { alertCount } = await generateAlertsForApprovedImport(
        log,
        screenData.holidaysSetting,
      )
      await loadData()
      setSuccessMsg(
        `「${log.file_name}」（${log.target_date}）の未達を出し直しました（未達 ${alertCount}件）。`,
      )
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '未達の出し直しに失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  const handleCancelPendingLog = async (log: ImportLogRow) => {
    setBusy(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await cancelPendingImportLog(log.id)
      await loadData()
      if (previewLogId === log.id) {
        setPreviewLogId(null)
        setPreviewRows([])
      }
      setSuccessMsg(
        `承認前の取り込み「${log.file_name}」（${log.target_date}・${log.csv_team_name}）を置きかえとして取り消しました。`,
      )
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '取り込みの取り消しに失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  const handlePreviewLogEntries = async (log: ImportLogRow) => {
    if (previewLogId === log.id) {
      setPreviewLogId(null)
      setPreviewRows([])
      return
    }
    setPreviewLogId(log.id)
    setPreviewLoading(true)
    setErrorMsg(null)
    try {
      const rows = await fetchEntriesSummaryForImportLog(log.id)
      setPreviewRows(rows)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '取り込み内容の読み込みに失敗しました。')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleManualAddMemberMap = async () => {
    if (!screenData?.viewer) return
    if (!newCtiName.trim()) {
      setErrorMsg('電話システムの名前を入力してください。')
      return
    }
    if (!newMapMemberId) {
      setErrorMsg('結びつける名簿の人（または「取り込まない」）を選んでください。')
      return
    }
    if (!newMemberMapValidFrom) {
      setErrorMsg('有効期間の開始日を入力してください。')
      return
    }
    setBusy(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const memberId = newMapMemberId === IGNORE_MEMBER_VALUE ? null : newMapMemberId
      await addCtiMemberMapping({
        ctiName: newCtiName.trim(),
        memberId,
        validFrom: newMemberMapValidFrom,
        createdBy: screenData.viewer.memberId,
      })
      setNewCtiName('')
      setNewMapMemberId('')
      await loadData()
      setSuccessMsg('名前の対応を追加しました。')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '名前の対応の追加に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveMemberMapValidTo = async (row: CtiMemberMapRow) => {
    const draftVal = memberValidToDraft[row.id] ?? row.valid_to ?? ''
    const nextVal = draftVal.trim() === '' ? null : draftVal.trim()
    setBusy(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await updateCtiMemberMapValidTo(row.id, nextVal)
      await loadData()
      setSuccessMsg(`「${row.cti_name}」の有効期間の終わりを更新しました。`)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '有効期間の更新に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  const handleManualAddTeamMap = async () => {
    if (!screenData?.viewer) return
    if (!newCsvTeamName.trim()) {
      setErrorMsg('CSVのチーム名を入力してください。')
      return
    }
    if (!newMapTeamId) {
      setErrorMsg('結びつけるチームを選んでください。')
      return
    }
    if (!newTeamMapValidFrom) {
      setErrorMsg('有効期間の開始日を入力してください。')
      return
    }
    setBusy(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await addCtiTeamMapping({
        csvTeamName: newCsvTeamName.trim(),
        teamId: newMapTeamId,
        validFrom: newTeamMapValidFrom,
        createdBy: screenData.viewer.memberId,
      })
      setNewCsvTeamName('')
      setNewMapTeamId('')
      await loadData()
      setSuccessMsg('チーム名の対応を追加しました。')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'チーム名の対応の追加に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveTeamMapValidTo = async (row: CtiTeamMapRow) => {
    const draftVal = teamValidToDraft[row.id] ?? row.valid_to ?? ''
    const nextVal = draftVal.trim() === '' ? null : draftVal.trim()
    setBusy(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await updateCtiTeamMapValidTo(row.id, nextVal)
      await loadData()
      setSuccessMsg(`「${row.csv_team_name}」の有効期間の終わりを更新しました。`)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '有効期間の更新に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="lead-text">読み込み中...</p>
      </section>
    )
  }

  if (!screenData?.viewer || !screenData.viewer.isAdmin) {
    return (
      <section className="panel">
        <NoticeBox title="権限がありません" tone="warn" role="alert">
          この画面は管理者の権限がある人だけが使えます。
        </NoticeBox>
      </section>
    )
  }

  const viewerId = screenData.viewer.memberId

  const pendingLogs = screenData.importLogs.filter((l) => l.status === 'pending')
  const incompleteAlertLogs = screenData.importLogs.filter(
    (l) =>
      l.status === 'approved' &&
      l.imported_by === viewerId &&
      l.alerts_created_at === null,
  )

  const importLogColumns: TableColumn<ImportLogRow>[] = [
    {
      key: 'target_date',
      header: '対象日',
      render: (r) => <DateText value={r.target_date} withWeekday />,
    },
    {
      key: 'csv_team_name',
      header: 'CSVチーム名（対応チーム）',
      render: (r) => (
        <div>
          <strong>{r.csv_team_name}</strong>
          {r.team_id && (
            <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
              {teamNameById.get(r.team_id) ?? r.team_id}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'file_name',
      header: 'ファイル名',
      render: (r) => r.file_name,
    },
    {
      key: 'row_count',
      header: '人数',
      render: (r) => `${r.row_count}人`,
    },
    {
      key: 'status',
      header: '状態',
      render: (r) => {
        if (r.status === 'approved') {
          return <Tag tone="good">承認済み</Tag>
        }
        if (r.status === 'pending') {
          return <Tag tone="warn">承認前</Tag>
        }
        return <Tag tone="plain">置きかえ済み</Tag>
      },
    },
    {
      key: 'imported_by',
      header: '取り込んだ人',
      render: (r) => memberNameById.get(r.imported_by) ?? '－',
    },
    {
      key: 'approved_by',
      header: '承認した人',
      render: (r) => (r.approved_by ? (memberNameById.get(r.approved_by) ?? '－') : '－'),
    },
    {
      key: 'alert_count',
      header: '未達の計算',
      render: (r) => {
        if (r.status !== 'approved') return '－'
        if (r.alerts_created_at === null) {
          return <Tag tone="warn">未計算（出し直し可）</Tag>
        }
        return `計算済み（${r.alert_count ?? 0}件）`
      },
    },
    {
      key: 'actions',
      header: '操作',
      render: (r) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {(r.status === 'approved' ||
            (r.status === 'pending' && r.imported_by === viewerId)) && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void handlePreviewLogEntries(r)}
            >
              {previewLogId === r.id ? '数字を閉じる' : '数字を確認'}
            </Button>
          )}
          {r.status === 'pending' && r.imported_by === viewerId && (
            <>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void handleApproveLog(r)}
              >
                承認する
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void handleCancelPendingLog(r)}
              >
                承認せず取り消す
              </Button>
            </>
          )}
          {r.status === 'approved' &&
            r.imported_by === viewerId &&
            r.alerts_created_at === null && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void handleRerunAlerts(r)}
              >
                未達を出し直す
              </Button>
            )}
        </div>
      ),
    },
  ]

  const memberMapColumns: TableColumn<CtiMemberMapRow>[] = [
    {
      key: 'cti_name',
      header: '電話システムの名前',
      className: 'col-name',
      render: (r) => r.cti_name,
    },
    {
      key: 'member_id',
      header: '名簿の人',
      render: (r) =>
        r.member_id === null ? (
          <Tag tone="plain">取り込まない</Tag>
        ) : (
          memberNameById.get(r.member_id) ?? r.member_id
        ),
    },
    {
      key: 'valid_from',
      header: '有効期間の始まり',
      render: (r) => <DateText value={r.valid_from} />,
    },
    {
      key: 'valid_to',
      header: '有効期間の終わり（入れるとそれ以降は使わない）',
      render: (r) => {
        const currentVal = memberValidToDraft[r.id] ?? r.valid_to ?? ''
        return (
          <div className="kpi-import-validto-cell">
            <input
              type="date"
              className="kpi-import-date-input"
              aria-label={`${r.cti_name}の有効期間の終わり`}
              value={currentVal}
              onChange={(e) =>
                setMemberValidToDraft((prev) => ({
                  ...prev,
                  [r.id]: e.target.value,
                }))
              }
            />
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void handleSaveMemberMapValidTo(r)}
            >
              保存
            </Button>
          </div>
        )
      },
    },
  ]

  const teamMapColumns: TableColumn<CtiTeamMapRow>[] = [
    {
      key: 'csv_team_name',
      header: 'CSVのチーム名',
      className: 'col-name',
      render: (r) => r.csv_team_name,
    },
    {
      key: 'team_id',
      header: 'アプリのチーム',
      render: (r) => teamNameById.get(r.team_id) ?? r.team_id,
    },
    {
      key: 'valid_from',
      header: '有効期間の始まり',
      render: (r) => <DateText value={r.valid_from} />,
    },
    {
      key: 'valid_to',
      header: '有効期間の終わり（入れるとそれ以降は使わない）',
      render: (r) => {
        const currentVal = teamValidToDraft[r.id] ?? r.valid_to ?? ''
        return (
          <div className="kpi-import-validto-cell">
            <input
              type="date"
              className="kpi-import-date-input"
              aria-label={`${r.csv_team_name}の有効期間の終わり`}
              value={currentVal}
              onChange={(e) =>
                setTeamValidToDraft((prev) => ({
                  ...prev,
                  [r.id]: e.target.value,
                }))
              }
            />
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void handleSaveTeamMapValidTo(r)}
            >
              保存
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="kpi-import-page">
      <section className="panel">
        <div className="section-header-row">
          <div>
            <h1 className="section-title">CSV取り込み・承認</h1>
            <p className="lead-text">
              電話システムの時間別CSV（Shift_JIS）を選び、5つのチェックと名前の対応を確かめてから取り込み・承認します。承認の直後に未達の一覧が作られます。
            </p>
          </div>
          <Tag tone="navy">管理者専用</Tag>
        </div>

        {!screenData.holidaysConfigured && (
          <NoticeBox title="会社の休みの日が設定されていません" tone="warn">
            会社の休みの日が設定されていません（設定値 kpi_holidays が未登録のため、土日だけを除いて営業日を計算します）。
          </NoticeBox>
        )}

        {errorMsg && (
          <NoticeBox title="確認してください" tone="alert" role="alert">
            {errorMsg}
          </NoticeBox>
        )}

        {successMsg && (
          <NoticeBox title="完了しました" tone="good" role="status">
            {successMsg}
          </NoticeBox>
        )}

        {/* ① ファイル選択 */}
        <div className="kpi-import-upload-box">
          <div className="kpi-import-upload-meta">
            <span className="kpi-import-upload-title">
              ① 電話システムの時間別CSVファイルを選ぶ（複数まとめて選択可）
            </span>
            <span className="kpi-import-upload-sub">
              1ファイル＝1つの取り込みの記録になります（Shift_JIS・85列：名前1列＋時間帯14区分×6項目）。
            </span>
          </div>
          <div>
            <input
              id="kpi-csv-file-input"
              type="file"
              accept=".csv,text/csv"
              multiple
              disabled={busy}
              onChange={(e) => void handleSelectFiles(e)}
            />
          </div>
        </div>

        {/* ②〜⑤ ファイルごとのチェック結果・名前の対応・取り込み・承認 */}
        {checkedItems.map(({ item, check }) => {
          const parsed = check.parsed
          const targetDate = parsed.targetDate ?? ''
          const mappedCount = check.memberResolutions.filter(
            (r) => r.status === 'mapped',
          ).length
          const ignoredCount = check.memberResolutions.filter(
            (r) => r.status === 'ignored',
          ).length
          const importedLog = item.importedLogId
            ? (screenData.importLogs.find((l) => l.id === item.importedLogId) ?? null)
            : null

          return (
            <div key={item.key} className="kpi-import-file-card">
              <div className="kpi-import-file-head">
                <div>
                  <h2 className="kpi-import-file-title">{parsed.fileName}</h2>
                  <div style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px' }}>
                    対象日：{targetDate ? <DateText value={targetDate} withWeekday /> : '読み取り不可'} ／
                    CSVチーム名：{parsed.csvTeamName ?? '読み取り不可'}
                    {check.resolvedTeamId
                      ? `（対応チーム：${teamNameById.get(check.resolvedTeamId) ?? ''}）`
                      : '（チーム未対応）'}
                  </div>
                </div>
                <div>
                  {importedLog ? (
                    <Tag tone={importedLog.status === 'approved' ? 'good' : 'warn'}>
                      {importedLog.status === 'approved'
                        ? '承認済み'
                        : importedLog.status === 'pending'
                          ? '承認前（取り込み済み）'
                          : '置きかえ済み'}
                    </Tag>
                  ) : check.canImport ? (
                    <Tag tone="good">チェックOK（取り込み可能）</Tag>
                  ) : (
                    <Tag tone="warn">要確認（そのままでは取り込めません）</Tag>
                  )}
                </div>
              </div>

              {/* 項目ごとの合計サマリ */}
              <div className="kpi-import-meta-grid">
                <div className="kpi-import-meta-item">
                  <div className="kpi-import-meta-label">人の行の数</div>
                  <div className="kpi-import-meta-val">
                    全 {parsed.personRows.length} 行（対象 {mappedCount}人 ／ 除外 {ignoredCount}人）
                  </div>
                </div>
                <div className="kpi-import-meta-item">
                  <div className="kpi-import-meta-label">総（コール合計）</div>
                  <div className="kpi-import-meta-val">{parsed.summedDaily.total}</div>
                </div>
                <div className="kpi-import-meta-item">
                  <div className="kpi-import-meta-label">実 ／ 再</div>
                  <div className="kpi-import-meta-val">
                    {parsed.summedDaily.connected} ／ {parsed.summedDaily.recall}
                  </div>
                </div>
                <div className="kpi-import-meta-item">
                  <div className="kpi-import-meta-label">オ ／ 見 ／ ア</div>
                  <div className="kpi-import-meta-val">
                    {parsed.summedDaily.owner} ／ {parsed.summedDaily.prospect} ／ {parsed.summedDaily.apo}
                  </div>
                </div>
              </div>

              {/* ② 5つのチェック結果 */}
              <div>
                <div className="kpi-import-sub-head">② 5つのチェック結果</div>
                <ul className="kpi-import-check-list">
                  <li className="kpi-import-check-item">
                    <Tag tone={check.check1SingleDay ? 'good' : 'warn'}>
                      {check.check1SingleDay ? '① OK' : '① 要確認'}
                    </Tag>
                    <span>
                      期間が1日だけか：{check.check1SingleDay
                        ? `1日分（${targetDate}）でファイル名とも一致しています`
                        : check.check1Error}
                    </span>
                  </li>
                  <li className="kpi-import-check-item">
                    <Tag tone={check.check2HeaderMatch ? 'good' : 'warn'}>
                      {check.check2HeaderMatch ? '② OK' : '② 要確認'}
                    </Tag>
                    <span>
                      見出しの形が同じか：{check.check2HeaderMatch
                        ? '時間帯14区分×6項目（85列）の見出しと一致しています'
                        : check.check2Errors.join(' ')}
                    </span>
                  </li>
                  <li className="kpi-import-check-item">
                    <Tag tone={check.check3AllNamesMapped ? 'good' : 'warn'}>
                      {check.check3AllNamesMapped ? '③ OK' : '③ 要確認'}
                    </Tag>
                    <span>
                      名前が対応表にあるか：
                      {check.check3AllNamesMapped
                        ? `すべて対応済み（取り込む ${mappedCount}人、取り込まない ${ignoredCount}人）`
                        : [
                            check.unmappedNames.length > 0
                              ? `対応のない名前が ${check.unmappedNames.length}件あります（${check.unmappedNames.join('・')}）`
                              : '',
                            check.overlappingMapNames.length > 0
                              ? `有効期間が重なる対応が2つ以上ある名前があります（${check.overlappingMapNames.join('・')}）。下の対応表で有効期間の終わりを入れて直してください`
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ／ ')}
                    </span>
                  </li>
                  <li className="kpi-import-check-item">
                    <Tag tone={check.check4TotalsMatch ? 'good' : 'warn'}>
                      {check.check4TotalsMatch ? '④ OK' : '④ 要確認'}
                    </Tag>
                    <span>
                      人の行を足すと合計の行と合うか：
                      {check.check4TotalsMatch
                        ? '取り込まない名前の行を含め、すべての時間帯・項目で合計行と一致しています'
                        : check.check4MismatchDetails.slice(0, 3).join(' ')}
                    </span>
                  </li>
                  <li className="kpi-import-check-item">
                    <Tag tone={check.check5ExistingImport ? 'warn' : 'good'}>
                      {check.check5ExistingImport ? '⑤ 既存の記録あり' : '⑤ 新規'}
                    </Tag>
                    <span>
                      同じ日・同じチーム名の取り込みがもうあるか：
                      {check.check5ExistingImport
                        ? `すでに「${check.check5ExistingImport.file_name}」（状態：${
                            check.check5ExistingImport.status === 'approved' ? '承認済み' : '承認前'
                          }）があります。取り込む場合は前の記録を置きかえます`
                        : '同じ日・同じチーム名の取り込みはまだありません'}
                    </span>
                  </li>
                </ul>
              </div>

              {/* 所属の食い違いの警告（止めない） */}
              {check.teamMismatchWarnings.length > 0 && (
                <NoticeBox title="名簿の所属とCSVのチームの食い違い（警告：取り込みはできます）" tone="warn">
                  <ul style={{ margin: 0, paddingLeft: '18px' }}>
                    {check.teamMismatchWarnings.map((w) => (
                      <li key={`${w.ctiName}-${w.memberId}`}>
                        {w.ctiName}（{memberNameById.get(w.memberId) ?? w.memberId}）：
                        対象日時点の名簿の所属は「
                        {w.memberCurrentTeamId
                          ? (teamNameById.get(w.memberCurrentTeamId) ?? w.memberCurrentTeamId)
                          : '所属なし'}
                        」ですが、CSVのチームは「
                        {teamNameById.get(w.csvTeamId) ?? w.csvTeamId}」です。
                      </li>
                    ))}
                  </ul>
                </NoticeBox>
              )}

              {/* 同じ日のほかの承認済み取り込みに同じ人がいる場合（承認不可の知らせ） */}
              {check.duplicateApprovedMemberIds.length > 0 && (
                <NoticeBox title="同じ日のほかの承認済み取り込みに同じ人がいます" tone="warn">
                  {check.duplicateApprovedMemberIds
                    .map((id) => memberNameById.get(id) ?? id)
                    .join('・')}{' '}
                  は、同じ日（{targetDate}）のほかの承認済み取り込みにすでに含まれているため、このままでは承認できません。
                </NoticeBox>
              )}

              {/* ③ 対応のない名前・チーム名をその場で対応表に足す */}
              {(check.unmappedNames.length > 0 ||
                (parsed.csvTeamName && !check.resolvedTeamId && !check.overlappingTeamMap)) && (
                <div className="kpi-import-inline-map-box">
                  <div className="kpi-import-sub-head">
                    ③ 対応表にない名前・チーム名をその場で登録する（次回から自動で結びつきます）
                  </div>

                  {parsed.csvTeamName && !check.resolvedTeamId && !check.overlappingTeamMap && (
                    <div className="kpi-import-inline-map-row">
                      <span className="kpi-import-inline-name">
                        CSVチーム名：{parsed.csvTeamName}
                      </span>
                      <SelectField
                        aria-label={`CSVチーム名 ${parsed.csvTeamName} の対応チーム`}
                        placeholder="アプリのチームを選ぶ..."
                        options={teamSelectOptions}
                        value={inlineTeamChoice[parsed.csvTeamName] ?? ''}
                        onChange={(e) =>
                          setInlineTeamChoice((prev) => ({
                            ...prev,
                            [parsed.csvTeamName!]: e.target.value,
                          }))
                        }
                      />
                      <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                        開始日：{targetDate || getTodayJstDateString()}
                      </span>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void handleInlineAddTeamMap(
                            parsed.csvTeamName!,
                            targetDate || getTodayJstDateString(),
                          )
                        }
                      >
                        チーム対応を追加
                      </Button>
                    </div>
                  )}

                  {check.unmappedNames.map((ctiName) => (
                    <div key={ctiName} className="kpi-import-inline-map-row">
                      <span className="kpi-import-inline-name">{ctiName}</span>
                      <SelectField
                        aria-label={`${ctiName} の対応先`}
                        placeholder="名簿の人を選ぶ（または取り込まない）..."
                        options={memberSelectOptions}
                        value={inlineMemberChoice[ctiName] ?? ''}
                        onChange={(e) =>
                          setInlineMemberChoice((prev) => ({
                            ...prev,
                            [ctiName]: e.target.value,
                          }))
                        }
                      />
                      <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                        開始日：{targetDate || getTodayJstDateString()}
                      </span>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void handleInlineAddMemberMap(
                            ctiName,
                            targetDate || getTodayJstDateString(),
                          )
                        }
                      >
                        名前の対応を追加
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* ④ 取り込む（承認前） ＆ ⑤ 承認する */}
              <div className="kpi-import-action-bar">
                {!importedLog && !item.confirmingReplace && (
                  <Button
                    variant="primary"
                    disabled={busy || !check.canImport}
                    onClick={() => void handleImportAsPending(item.key, check, false)}
                  >
                    {check.check5ExistingImport
                      ? '④ 前の記録を置きかえて取り込む（承認前）'
                      : '④ 取り込む（承認前）'}
                  </Button>
                )}

                {!importedLog && item.confirmingReplace && check.check5ExistingImport && (
                  <NoticeBox title="同じ日・同じチーム名の取り込みを置きかえますか？" tone="warn">
                    <p style={{ margin: '0 0 10px' }}>
                      対象日 {targetDate}・チーム「{parsed.csvTeamName}」にはすでに記録（
                      {check.check5ExistingImport.file_name}）があります。
                      前の記録を「置きかえ済み（replaced）」にして、新しい記録を承認前として取り込みます（前の数字とアラートは消さずに控えとして残ります）。
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() => void handleImportAsPending(item.key, check, true)}
                      >
                        はい、置きかえて取り込む
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          setUploadedItems((prev) =>
                            prev.map((u) =>
                              u.key === item.key ? { ...u, confirmingReplace: false } : u,
                            ),
                          )
                        }
                      >
                        やめる
                      </Button>
                    </div>
                  </NoticeBox>
                )}

                {importedLog && importedLog.status === 'pending' && (
                  <>
                    <Button
                      variant="primary"
                      disabled={busy || !check.canApproveAfterImport}
                      onClick={() => void handleApproveLog(importedLog)}
                    >
                      ⑤ 承認する（未達を計算して確定）
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void handlePreviewLogEntries(importedLog)}
                    >
                      {previewLogId === importedLog.id ? '数字を閉じる' : '取り込んだ数字を確認'}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void handleCancelPendingLog(importedLog)}
                    >
                      承認せずに取り消す（置きかえ）
                    </Button>
                  </>
                )}

                {importedLog && importedLog.status === 'approved' && (
                  <span style={{ fontWeight: 700, color: 'var(--good)' }}>
                    承認済み（未達 {importedLog.alert_count ?? 0}件を記録済み）
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </section>

      {/* 承認待ちの取り込み一覧・未達未計算の取り込みがある場合のクイックパネル */}
      {(pendingLogs.length > 0 || incompleteAlertLogs.length > 0) && (
        <section className="panel">
          <div className="section-header-row">
            <h2 className="section-title">承認待ち・未達の出し直しが必要な取り込み</h2>
            <span className="count-label">
              承認前 {pendingLogs.length}件 ／ 未達未計算 {incompleteAlertLogs.length}件
            </span>
          </div>
          <DataTable
            columns={importLogColumns}
            rows={[...pendingLogs, ...incompleteAlertLogs]}
            rowKey={(r) => r.id}
          />
        </section>
      )}

      {/* 選択した取り込み記録の人別合計プレビュー */}
      {previewLogId && (
        <section className="panel">
          <div className="section-header-row">
            <h2 className="section-title">
              取り込んだ数字の確認（対象記録：
              {screenData.importLogs.find((l) => l.id === previewLogId)?.file_name ?? previewLogId}
              ）
            </h2>
            <Button
              variant="secondary"
              onClick={() => {
                setPreviewLogId(null)
                setPreviewRows([])
              }}
            >
              閉じる
            </Button>
          </div>
          {previewLoading ? (
            <p className="lead-text">数字を読み込み中...</p>
          ) : (
            <DataTable
              columns={[
                {
                  key: 'member',
                  header: '名前',
                  className: 'col-name',
                  render: (r) => memberNameById.get(r.memberId) ?? r.memberId,
                },
                { key: 'total', header: '総', render: (r) => r.total },
                { key: 'connected', header: '実', render: (r) => r.connected },
                { key: 'recall', header: '再', render: (r) => r.recall },
                { key: 'owner', header: 'オ', render: (r) => r.owner },
                { key: 'prospect', header: '見', render: (r) => r.prospect },
                { key: 'apo', header: 'ア', render: (r) => r.apo },
              ]}
              rows={previewRows}
              rowKey={(r) => r.memberId}
              emptyMessage="この取り込みの数字は見つかりません（承認前の記録は取り込んだ本人だけが見られます）。"
            />
          )}
        </section>
      )}

      {/* 下部：取り込みの記録一覧 ／ 名前の対応 ／ チーム名の対応 */}
      <section className="panel">
        <div className="kpi-import-tabs">
          <Button
            variant={activeTab === 'logs' ? 'primary' : 'secondary'}
            onClick={() => setActiveTab('logs')}
          >
            取り込みの記録の一覧（{screenData.importLogs.length}）
          </Button>
          <Button
            variant={activeTab === 'member_map' ? 'primary' : 'secondary'}
            onClick={() => setActiveTab('member_map')}
          >
            名前の対応表（{screenData.memberMaps.length}）
          </Button>
          <Button
            variant={activeTab === 'team_map' ? 'primary' : 'secondary'}
            onClick={() => setActiveTab('team_map')}
          >
            チーム名の対応表（{screenData.teamMaps.length}）
          </Button>
        </div>

        {activeTab === 'logs' && (
          <div>
            <div className="section-header-row">
              <h2 className="section-title">取り込みの記録の一覧</h2>
              <span className="count-label">全 {screenData.importLogs.length} 件</span>
            </div>
            <DataTable
              columns={importLogColumns}
              rows={screenData.importLogs}
              rowKey={(r) => r.id}
            />
          </div>
        )}

        {activeTab === 'member_map' && (
          <div>
            <div className="section-header-row">
              <h2 className="section-title">名前の対応の一覧（cti_member_map）</h2>
              <span className="count-label">
                有効期間の終わりを入れるとそれ以降は使わなくなります（削除はしません）
              </span>
            </div>

            <div className="kpi-import-map-add-grid">
              <InputField
                id="new-cti-name"
                label="電話システムの名前"
                placeholder="例：CTI_架空メンバー"
                value={newCtiName}
                onChange={(e) => setNewCtiName(e.target.value)}
              />
              <SelectField
                id="new-map-member"
                label="結びつける名簿の人（または「取り込まない」）"
                placeholder="選択してください..."
                options={memberSelectOptions}
                value={newMapMemberId}
                onChange={(e) => setNewMapMemberId(e.target.value)}
              />
              <InputField
                id="new-member-valid-from"
                label="有効期間の始まり"
                type="date"
                value={newMemberMapValidFrom}
                onChange={(e) => setNewMemberMapValidFrom(e.target.value)}
              />
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void handleManualAddMemberMap()}
              >
                対応を追加
              </Button>
            </div>

            <DataTable
              columns={memberMapColumns}
              rows={screenData.memberMaps}
              rowKey={(r) => r.id}
            />
          </div>
        )}

        {activeTab === 'team_map' && (
          <div>
            <div className="section-header-row">
              <h2 className="section-title">チーム名の対応の一覧（cti_team_map）</h2>
              <span className="count-label">
                有効期間の終わりを入れるとそれ以降は使わなくなります（削除はしません）
              </span>
            </div>

            <div className="kpi-import-map-add-grid">
              <InputField
                id="new-csv-team-name"
                label="CSVのチーム名（時間別より前の文字）"
                placeholder="例：架空チームA(WEB)"
                value={newCsvTeamName}
                onChange={(e) => setNewCsvTeamName(e.target.value)}
              />
              <SelectField
                id="new-map-team"
                label="結びつけるアプリのチーム"
                placeholder="選択してください..."
                options={teamSelectOptions}
                value={newMapTeamId}
                onChange={(e) => setNewMapTeamId(e.target.value)}
              />
              <InputField
                id="new-team-valid-from"
                label="有効期間の始まり"
                type="date"
                value={newTeamMapValidFrom}
                onChange={(e) => setNewTeamMapValidFrom(e.target.value)}
              />
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void handleManualAddTeamMap()}
              >
                対応を追加
              </Button>
            </div>

            <DataTable
              columns={teamMapColumns}
              rows={screenData.teamMaps}
              rowKey={(r) => r.id}
            />
          </div>
        )}
      </section>
    </div>
  )
}

export default KpiImportPage
