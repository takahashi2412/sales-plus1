import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  DataTable,
  DateText,
  InputField,
  NoticeBox,
  SelectField,
  Tag,
  TextareaField,
  type SelectOption,
  type TableColumn,
} from '../../components/ui';
import { getTodayJstDateString } from '../../foundation/directory';
import {
  buildReadableMemberMap,
  createSequentialTaskQueue,
  fetchMemoPageDataset,
  filterAndSortSubmittedMemos,
  filterSelectableTargetsBySelected,
  formatMemoCheckLabel,
  formatMemoTargetNames,
  formatMemoWriterName,
  formatUpdatedAfterSubmitLabel,
  getActiveTargetMemberIds,
  hideMemoRow,
  insertDraftMemoRow,
  pickActiveMemoMasters,
  pickMyDraftMemos,
  pickPendingCheckMemos,
  pickSupervisableTargetOptions,
  syncMemoTargets,
  truncateMemoSnippet,
  updateMemoRow,
  validateMemoForSubmit,
  type MemoCheckValue,
  type MemoPageDataset,
  type SubordinateMemoRow,
} from './memo-logic';

export * from './memo-logic';

const CHECK_OPTIONS: SelectOption[] = [
  { value: 'o', label: '○（できた・出た）' },
  { value: 'd', label: '△（一部）' },
  { value: 'x', label: '×（まだ）' },
];

export function SubordinateMemoPage() {
  const [dataset, setDataset] = useState<MemoPageDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // 絞り込み用
  const [filterTargetId, setFilterTargetId] = useState('');
  const [filterThemeId, setFilterThemeId] = useState('');
  const [filterKindId, setFilterKindId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // 選択中のメモ（null なら新規作成モード）
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);

  // 入力欄の状態
  const todayJst = useMemo(() => getTodayJstDateString(), []);
  const [formDate, setFormDate] = useState(todayJst);
  const [formTargetIds, setFormTargetIds] = useState<string[]>([]);
  const [formThemeId, setFormThemeId] = useState('');
  const [formKindId, setFormKindId] = useState('');
  const [formNoticed, setFormNoticed] = useState('');
  const [formGuidance, setFormGuidance] = useState('');
  const [formNextCheckOn, setFormNextCheckOn] = useState('');
  const [formActionCheck, setFormActionCheck] = useState<MemoCheckValue | ''>('');
  const [formResultCheck, setFormResultCheck] = useState<MemoCheckValue | ''>('');
  const [formCheckedOn, setFormCheckedOn] = useState(todayJst);

  // 自動下書き保存用の状態（保存処理は saveQueueRef で1本ずつ順番に行う）
  const [autoSaveStatus, setAutoSaveStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHydratingFormRef = useRef(false);
  const draftCreatedIdRef = useRef<string | null>(null);
  const saveQueueRef = useRef(createSequentialTaskQueue());

  const reloadData = async () => {
    try {
      setErrorMessage(null);
      const data = await fetchMemoPageDataset();
      setDataset(data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'データの読み込み中にエラーが発生しました。',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadData();
  }, []);

  const viewer = dataset?.viewer ?? null;

  const activeThemes = useMemo(
    () => (dataset ? pickActiveMemoMasters(dataset.masters, 'memo_theme') : []),
    [dataset],
  );
  const activeKinds = useMemo(
    () => (dataset ? pickActiveMemoMasters(dataset.masters, 'memo_kind') : []),
    [dataset],
  );

  const masterNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of dataset?.masters ?? []) {
      map.set(m.id, m.name);
    }
    return map;
  }, [dataset]);

  const readableMembers = useMemo(() => {
    if (!dataset) return new Map();
    return buildReadableMemberMap(
      dataset.members,
      dataset.affiliations,
      dataset.teams,
      todayJst,
    );
  }, [dataset, todayJst]);

  const supervisableOptions = useMemo(() => {
    if (!dataset || !viewer) return [];
    return pickSupervisableTargetOptions(
      viewer,
      dataset.members,
      dataset.affiliations,
      dataset.teams,
      todayJst,
    );
  }, [dataset, viewer, todayJst]);

  const pendingCheckMemos = useMemo(() => {
    if (!dataset || !viewer) return [];
    return pickPendingCheckMemos(dataset.memos, viewer.memberId, todayJst);
  }, [dataset, viewer, todayJst]);

  const myDraftMemos = useMemo(() => {
    if (!dataset || !viewer) return [];
    return pickMyDraftMemos(dataset.memos, viewer.memberId);
  }, [dataset, viewer]);

  const filteredSubmittedMemos = useMemo(() => {
    if (!dataset) return [];
    return filterAndSortSubmittedMemos(dataset.memos, dataset.targetRows, {
      targetMemberId: filterTargetId || undefined,
      themeId: filterThemeId || undefined,
      kindId: filterKindId || undefined,
      dateFrom: filterDateFrom || undefined,
      dateTo: filterDateTo || undefined,
    });
  }, [
    dataset,
    filterTargetId,
    filterThemeId,
    filterKindId,
    filterDateFrom,
    filterDateTo,
  ]);

  const selectedMemo: SubordinateMemoRow | null = useMemo(() => {
    if (!dataset || !selectedMemoId) return null;
    return dataset.memos.find((m) => m.id === selectedMemoId) ?? null;
  }, [dataset, selectedMemoId]);

  const isWriterOfSelected = useMemo(() => {
    if (!viewer) return false;
    if (!selectedMemo) return true; // 新規作成
    return selectedMemo.created_by === viewer.memberId;
  }, [viewer, selectedMemo]);

  const isSubmittedSelected = Boolean(selectedMemo && selectedMemo.submitted_at !== null);

  // 対象者の候補（選択中のメモに既に含まれている人が異動等で supervisableOptions にいない場合も補う）
  const combinedSupervisableOptions = useMemo(() => {
    const map = new Map(supervisableOptions.map((o) => [o.id, o]));
    for (const id of formTargetIds) {
      if (!map.has(id)) {
        const info = readableMembers.get(id);
        if (info) {
          map.set(id, {
            id: info.id,
            name: info.name,
            role: info.role,
            teamId: info.teamId,
            teamName: info.teamName,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [supervisableOptions, formTargetIds, readableMembers]);

  const targetEligibility = useMemo(
    () => filterSelectableTargetsBySelected(combinedSupervisableOptions, formTargetIds),
    [combinedSupervisableOptions, formTargetIds],
  );

  // メモを切り替えたときにフォームに値を流し込む
  const loadMemoIntoForm = (
    memo: SubordinateMemoRow | null,
    options?: { presetCheckOnToday?: boolean },
  ) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    isHydratingFormRef.current = true;
    setErrorMessage(null);
    setStatusMessage(null);
    setAutoSaveStatus(null);

    if (!memo) {
      setSelectedMemoId(null);
      draftCreatedIdRef.current = null;
      setFormDate(todayJst);
      setFormTargetIds([]);
      setFormThemeId('');
      setFormKindId('');
      setFormNoticed('');
      setFormGuidance('');
      setFormNextCheckOn('');
      setFormActionCheck('');
      setFormResultCheck('');
      setFormCheckedOn(todayJst);
    } else {
      setSelectedMemoId(memo.id);
      draftCreatedIdRef.current = memo.submitted_at === null ? memo.id : null;
      const targets = dataset ? getActiveTargetMemberIds(memo.id, dataset.targetRows) : [];
      setFormDate(memo.date);
      setFormTargetIds(targets);
      setFormThemeId(memo.theme_id ?? '');
      setFormKindId(memo.kind_id ?? '');
      setFormNoticed(memo.noticed ?? '');
      setFormGuidance(memo.guidance ?? '');
      setFormNextCheckOn(memo.next_check_on ?? '');
      setFormActionCheck(memo.action_check ?? '');
      setFormResultCheck(memo.result_check ?? '');
      setFormCheckedOn(
        memo.checked_on ?? (options?.presetCheckOnToday ? todayJst : todayJst),
      );
    }

    setTimeout(() => {
      isHydratingFormRef.current = false;
    }, 0);
  };

  // 書きかけの自動保存（新規入力中または既存の書きかけ編集中）
  useEffect(() => {
    if (!viewer || !dataset) return;
    if (isHydratingFormRef.current) return;
    // すでに送ったメモ、または他の上席が書いたメモを見ているときは自動下書き保存しない
    if (selectedMemo && (selectedMemo.submitted_at !== null || selectedMemo.created_by !== viewer.memberId)) {
      return;
    }

    // 新規作成で何も入力・選択していない初期状態なら保存しない
    const hasAnyInput =
      formTargetIds.length > 0 ||
      Boolean(formThemeId) ||
      Boolean(formKindId) ||
      formNoticed.trim().length > 0 ||
      formGuidance.trim().length > 0 ||
      Boolean(formNextCheckOn);

    if (!selectedMemoId && !draftCreatedIdRef.current && !hasAnyInput) {
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    const snapDate = formDate || todayJst;
    const snapThemeId = formThemeId || null;
    const snapKindId = formKindId || null;
    const snapNoticed = formNoticed;
    const snapGuidance = formGuidance;
    const snapNextCheckOn = formNextCheckOn || null;
    const snapTargetIds = [...formTargetIds];

    autoSaveTimerRef.current = setTimeout(() => {
      void saveQueueRef.current(async () => {
        try {
          setAutoSaveStatus('下書きを保存中...');
          const currentDraftId = selectedMemoId ?? draftCreatedIdRef.current;

          if (!currentDraftId) {
            const inserted = await insertDraftMemoRow({
              date: snapDate,
              created_by: viewer.memberId,
              theme_id: snapThemeId,
              kind_id: snapKindId,
              noticed: snapNoticed,
              guidance: snapGuidance,
              next_check_on: snapNextCheckOn,
            });
            draftCreatedIdRef.current = inserted.id;
            setSelectedMemoId(inserted.id);

            if (snapTargetIds.length > 0) {
              await syncMemoTargets(inserted.id, snapTargetIds, false);
            }
          } else {
            await updateMemoRow(currentDraftId, {
              date: snapDate,
              theme_id: snapThemeId,
              kind_id: snapKindId,
              noticed: snapNoticed,
              guidance: snapGuidance,
              next_check_on: snapNextCheckOn,
            });
            await syncMemoTargets(currentDraftId, snapTargetIds, false);
          }

          const fresh = await fetchMemoPageDataset();
          if (fresh) setDataset(fresh);
          setAutoSaveStatus('下書きを自動保存しました');
        } catch (err) {
          setAutoSaveStatus(
            err instanceof Error ? `下書き保存エラー：${err.message}` : '下書き保存に失敗しました',
          );
        }
      });
    }, 500);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    formDate,
    formTargetIds,
    formThemeId,
    formKindId,
    formNoticed,
    formGuidance,
    formNextCheckOn,
  ]);

  const handleToggleTarget = (memberId: string) => {
    if (!isWriterOfSelected) return;
    setErrorMessage(null);

    if (formTargetIds.includes(memberId)) {
      // 送ったメモの最後の1人は外せない
      if (isSubmittedSelected && formTargetIds.length <= 1) {
        setErrorMessage(
          '送ったメモの対象者を全員外すことはできません。全員から外したいときはメモを非表示にしてください。',
        );
        return;
      }
      setFormTargetIds(formTargetIds.filter((id) => id !== memberId));
    } else {
      setFormTargetIds([...formTargetIds, memberId]);
    }
  };

  const handleSaveDraftManually = async () => {
    if (!viewer || !dataset) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await saveQueueRef.current(async () => {
        const currentDraftId = selectedMemoId ?? draftCreatedIdRef.current;
        if (!currentDraftId) {
          const inserted = await insertDraftMemoRow({
            date: formDate || todayJst,
            created_by: viewer.memberId,
            theme_id: formThemeId || null,
            kind_id: formKindId || null,
            noticed: formNoticed,
            guidance: formGuidance,
            next_check_on: formNextCheckOn || null,
          });
          draftCreatedIdRef.current = inserted.id;
          setSelectedMemoId(inserted.id);
          if (formTargetIds.length > 0) {
            await syncMemoTargets(inserted.id, formTargetIds, false);
          }
        } else {
          await updateMemoRow(currentDraftId, {
            date: formDate || todayJst,
            theme_id: formThemeId || null,
            kind_id: formKindId || null,
            noticed: formNoticed,
            guidance: formGuidance,
            next_check_on: formNextCheckOn || null,
          });
          await syncMemoTargets(currentDraftId, formTargetIds, false);
        }
        await reloadData();
        setStatusMessage('書きかけとして保存しました（送るまでほかの上席には見えません）。');
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '保存に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitOrUpdateMemo = async () => {
    if (!viewer || !dataset) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    const validation = validateMemoForSubmit({
      date: formDate,
      targetMemberIds: formTargetIds,
      themeId: formThemeId || null,
      kindId: formKindId || null,
      noticed: formNoticed,
      guidance: formGuidance,
    });

    if (!validation.ok) {
      setErrorMessage(
        `送るには次の項目を入力してください：${validation.missingLabels.join('・')}`,
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await saveQueueRef.current(async () => {
        let targetMemoId = selectedMemoId ?? draftCreatedIdRef.current;

        if (!targetMemoId) {
          // 先に下書き行を insert し、対象者を入れてから submitted_at を入れて更新する（DBの制約どおり）
          const inserted = await insertDraftMemoRow({
            date: formDate,
            created_by: viewer.memberId,
            theme_id: formThemeId,
            kind_id: formKindId,
            noticed: formNoticed,
            guidance: formGuidance,
            next_check_on: formNextCheckOn || null,
          });
          targetMemoId = inserted.id;
          draftCreatedIdRef.current = inserted.id;
          await syncMemoTargets(targetMemoId, formTargetIds, false);
        } else {
          await syncMemoTargets(
            targetMemoId,
            formTargetIds,
            isSubmittedSelected,
          );
        }

        const hasCheckSelection = Boolean(formActionCheck || formResultCheck);
        await updateMemoRow(targetMemoId, {
          date: formDate,
          theme_id: formThemeId,
          kind_id: formKindId,
          noticed: formNoticed,
          guidance: formGuidance,
          next_check_on: formNextCheckOn || null,
          action_check: (formActionCheck || null) as MemoCheckValue | null,
          result_check: (formResultCheck || null) as MemoCheckValue | null,
          checked_on: hasCheckSelection ? formCheckedOn || todayJst : null,
          ...(isSubmittedSelected ? {} : { submitted_at: new Date().toISOString() }),
        });

        const fresh = await fetchMemoPageDataset();
        if (fresh) {
          setDataset(fresh);
          const updated = fresh.memos.find((m) => m.id === targetMemoId) ?? null;
          loadMemoIntoForm(updated);
        }
        setStatusMessage(
          isSubmittedSelected ? '部下メモの内容を更新しました。' : '部下メモを送りました。',
        );
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '送信に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  };

  const handleHideMemo = async () => {
    if (!selectedMemo || !isWriterOfSelected) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await saveQueueRef.current(async () => {
        await hideMemoRow(selectedMemo.id);
        await reloadData();
        loadMemoIntoForm(null);
        setStatusMessage('部下メモを見えなくしました。');
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '操作に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section className="panel">
        <p className="lead-text">部下メモを読み込み中...</p>
      </section>
    );
  }

  // 2-1：左メニューの「部下メモ」＝リーダー・MGR・代表だけ。メンバーがアドレスで開いたときは「この画面は使えません」と出す
  if (!viewer || (viewer.role !== 'leader' && viewer.role !== 'mgr' && viewer.role !== 'ceo')) {
    return (
      <section className="panel">
        <NoticeBox title="この画面は使えません" tone="warn" role="alert">
          この画面は使えません。リーダー・MGR・代表のみ利用できます。
        </NoticeBox>
      </section>
    );
  }

  const themeOptions: SelectOption[] = activeThemes.map((t) => ({
    value: t.id,
    label: t.name,
  }));
  const kindOptions: SelectOption[] = activeKinds.map((k) => ({
    value: k.id,
    label: k.name,
  }));
  const targetFilterOptions: SelectOption[] = Array.from(readableMembers.values())
    .filter((m) => m.id !== viewer.memberId)
    .map((m) => ({
      value: m.id,
      label: `${m.name}（${m.teamName}）`,
    }));

  const pendingColumns: TableColumn<SubordinateMemoRow>[] = [
    {
      key: 'next_check_on',
      header: '次の確認日',
      render: (row) => <DateText value={row.next_check_on} />,
    },
    {
      key: 'date',
      header: '指導日',
      render: (row) => <DateText value={row.date} />,
    },
    {
      key: 'targets',
      header: '対象者',
      className: 'col-name',
      render: (row) =>
        dataset ? formatMemoTargetNames(row.id, dataset.targetRows, readableMembers) : '－',
    },
    {
      key: 'theme_kind',
      header: 'テーマ・種類',
      render: (row) => (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <Tag tone="navy">{row.theme_id ? (masterNameMap.get(row.theme_id) ?? '－') : '－'}</Tag>
          <Tag tone="plain">{row.kind_id ? (masterNameMap.get(row.kind_id) ?? '－') : '－'}</Tag>
        </div>
      ),
    },
    {
      key: 'summary',
      header: '気づいた内容・指導した内容',
      render: (row) => (
        <div>
          <div>気づき：{truncateMemoSnippet(row.noticed, 32)}</div>
          <div>指導：{truncateMemoSnippet(row.guidance, 32)}</div>
        </div>
      ),
    },
    {
      key: 'action',
      header: '確認入力',
      render: (row) => (
        <Button
          variant="secondary"
          onClick={() => loadMemoIntoForm(row, { presetCheckOnToday: true })}
        >
          結果を入れる
        </Button>
      ),
    },
  ];

  const submittedColumns: TableColumn<SubordinateMemoRow>[] = [
    {
      key: 'date',
      header: '日付',
      render: (row) => {
        const updatedLabel = formatUpdatedAfterSubmitLabel(row.submitted_at, row.updated_at);
        return (
          <div>
            <DateText value={row.date} />
            {updatedLabel && (
              <div style={{ marginTop: '2px' }}>
                <Tag tone="plain">{updatedLabel}</Tag>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'targets',
      header: '対象者',
      className: 'col-name',
      render: (row) =>
        dataset ? formatMemoTargetNames(row.id, dataset.targetRows, readableMembers) : '－',
    },
    {
      key: 'theme',
      header: 'テーマ',
      render: (row) => (
        <Tag tone="navy">{row.theme_id ? (masterNameMap.get(row.theme_id) ?? '－') : '－'}</Tag>
      ),
    },
    {
      key: 'kind',
      header: '種類',
      render: (row) => (
        <Tag tone="plain">{row.kind_id ? (masterNameMap.get(row.kind_id) ?? '－') : '－'}</Tag>
      ),
    },
    {
      key: 'content',
      header: '気づいた内容・指導した内容（頭の部分）',
      render: (row) => (
        <div>
          <div>気づき：{truncateMemoSnippet(row.noticed, 36)}</div>
          <div>指導：{truncateMemoSnippet(row.guidance, 36)}</div>
        </div>
      ),
    },
    {
      key: 'next_check_on',
      header: '次の確認日',
      render: (row) => <DateText value={row.next_check_on} />,
    },
    {
      key: 'action_check',
      header: '行動',
      render: (row) => formatMemoCheckLabel(row.action_check),
    },
    {
      key: 'result_check',
      header: '結果',
      render: (row) => formatMemoCheckLabel(row.result_check),
    },
    {
      key: 'writer',
      header: '書いた人',
      render: (row) => formatMemoWriterName(row.created_by, viewer.memberId, readableMembers),
    },
    {
      key: 'open',
      header: '操作',
      render: (row) => (
        <Button variant="secondary" onClick={() => loadMemoIntoForm(row)}>
          {row.created_by === viewer.memberId ? '開く・直す' : '詳細を見る'}
        </Button>
      ),
    },
  ];

  const selectedUpdatedLabel = selectedMemo
    ? formatUpdatedAfterSubmitLabel(selectedMemo.submitted_at, selectedMemo.updated_at)
    : null;

  return (
    <div>
      {/* 1. 一番上に「確認待ち」 */}
      <section className="panel" aria-label="確認待ちの部下メモ">
        <div className="section-header-row">
          <h2 className="section-title">確認待ち（次の確認日が今日以前で行動が未記入）</h2>
          <span className="count-label">{pendingCheckMemos.length} 件</span>
        </div>
        {pendingCheckMemos.length === 0 ? (
          <p className="lead-text" style={{ marginBottom: 0 }}>
            現在、確認待ちの部下メモはありません。
          </p>
        ) : (
          <DataTable
            columns={pendingColumns}
            rows={pendingCheckMemos}
            rowKey={(r) => r.id}
            emptyMessage="確認待ちの部下メモはありません。"
          />
        )}
      </section>

      {/* 2. 書く・直す・詳細を見る欄 */}
      <section className="panel" aria-label="部下メモの入力・詳細">
        <div className="section-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h1 className="section-title" style={{ marginBottom: 0 }}>
              {!selectedMemo
                ? '部下メモを書く（新規）'
                : selectedMemo.submitted_at === null
                  ? '書きかけの部下メモを編集'
                  : isWriterOfSelected
                    ? '送った部下メモを確認・直す'
                    : '部下メモの詳細（閲覧のみ）'}
            </h1>
            {selectedUpdatedLabel && <Tag tone="plain">{selectedUpdatedLabel}</Tag>}
            {autoSaveStatus && <span className="form-hint">{autoSaveStatus}</span>}
          </div>
          {selectedMemo && (
            <Button variant="secondary" onClick={() => loadMemoIntoForm(null)}>
              新しく書く
            </Button>
          )}
        </div>

        {/* 2-1：本人に見せないことを、書く画面に1行で出す */}
        <NoticeBox tone="info">
          このメモは対象の本人には見えません。AIの本人版にも渡しません
        </NoticeBox>

        {errorMessage && (
          <NoticeBox title="確認してください" tone="alert" role="alert">
            {errorMessage}
          </NoticeBox>
        )}
        {statusMessage && (
          <NoticeBox tone="good" role="status">
            {statusMessage}
          </NoticeBox>
        )}

        {!isWriterOfSelected && selectedMemo ? (
          /* 書いた人のほかの上席が読むときは、見るだけ（直す欄を出さない） */
          <div style={{ display: 'grid', gap: '12px' }}>
            <dl className="profile-grid">
              <div className="profile-item">
                <dt>日付</dt>
                <dd>
                  <DateText value={selectedMemo.date} />
                  {selectedUpdatedLabel && (
                    <span style={{ marginLeft: '8px' }}>
                      <Tag tone="plain">{selectedUpdatedLabel}</Tag>
                    </span>
                  )}
                </dd>
              </div>
              <div className="profile-item">
                <dt>対象者</dt>
                <dd>
                  {dataset
                    ? formatMemoTargetNames(selectedMemo.id, dataset.targetRows, readableMembers)
                    : '－'}
                </dd>
              </div>
              <div className="profile-item">
                <dt>書いた人</dt>
                <dd>
                  {formatMemoWriterName(
                    selectedMemo.created_by,
                    viewer.memberId,
                    readableMembers,
                  )}
                </dd>
              </div>
              <div className="profile-item">
                <dt>テーマ</dt>
                <dd>
                  {selectedMemo.theme_id ? (masterNameMap.get(selectedMemo.theme_id) ?? '－') : '－'}
                </dd>
              </div>
              <div className="profile-item">
                <dt>種類</dt>
                <dd>
                  {selectedMemo.kind_id ? (masterNameMap.get(selectedMemo.kind_id) ?? '－') : '－'}
                </dd>
              </div>
              <div className="profile-item">
                <dt>次の確認日 ／ 行動・結果</dt>
                <dd>
                  次の確認日：<DateText value={selectedMemo.next_check_on} /> ／ 行動：
                  {formatMemoCheckLabel(selectedMemo.action_check)} ／ 結果：
                  {formatMemoCheckLabel(selectedMemo.result_check)}
                  {selectedMemo.checked_on && (
                    <span>
                      （確認日：<DateText value={selectedMemo.checked_on} />）
                    </span>
                  )}
                </dd>
              </div>
            </dl>
            <div className="profile-item">
              <dt>気づいた内容</dt>
              <dd style={{ whiteSpace: 'pre-wrap', fontWeight: 500 }}>
                {selectedMemo.noticed || '－'}
              </dd>
            </div>
            <div className="profile-item">
              <dt>指導した内容</dt>
              <dd style={{ whiteSpace: 'pre-wrap', fontWeight: 500 }}>
                {selectedMemo.guidance || '－'}
              </dd>
            </div>
          </div>
        ) : (
          /* 書く・直すフォーム（書いた人、または新規作成） */
          <div style={{ display: 'grid', gap: '16px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
              }}
            >
              <InputField
                id="memo-date"
                label="日付"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
              <SelectField
                id="memo-theme"
                label="テーマ"
                hint="送るとき必須"
                placeholder="テーマを選択"
                options={themeOptions}
                value={formThemeId}
                onChange={(e) => setFormThemeId(e.target.value)}
              />
              <SelectField
                id="memo-kind"
                label="種類"
                hint="送るとき必須"
                placeholder="種類を選択"
                options={kindOptions}
                value={formKindId}
                onChange={(e) => setFormKindId(e.target.value)}
              />
              <InputField
                id="memo-next-check-on"
                label="次の確認日"
                hint="任意"
                type="date"
                value={formNextCheckOn}
                onChange={(e) => setFormNextCheckOn(e.target.value)}
              />
            </div>

            {/* 対象者の選び方（2-2） */}
            <div className="form-field">
              <div className="form-label">
                <span>対象者（1人以上・同じチームの人だけ複数選べます）</span>
                <small className="form-hint">
                  複数のチームに同じ指導をしたときは、チームごとに1つずつ書いてください
                </small>
              </div>

              {(viewer.role === 'mgr' || viewer.role === 'ceo') &&
                targetEligibility.hasLeaderAndMemberCombined && (
                  <NoticeBox tone="warn" role="status">
                    リーダーとメンバーを一緒に対象にしたメモは、そのリーダーには見えなくなります（対象者に自分が入っているメモは読めない決まりのため）。
                  </NoticeBox>
                )}

              {targetEligibility.isTeamlessSelected && (
                <p className="form-hint" style={{ margin: '0 0 4px' }}>
                  チームがない人を選んでいるため、ほかの人を一緒に対象に足すことはできません。
                </p>
              )}

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  padding: '12px',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  background: 'var(--surface-sunken)',
                }}
              >
                {targetEligibility.selectableOptions.length === 0 ? (
                  <span className="form-hint">選べる対象者がいません。</span>
                ) : (
                  targetEligibility.selectableOptions.map((opt) => {
                    const checked = formTargetIds.includes(opt.id);
                    const isLastActiveTargetOfSubmitted =
                      isSubmittedSelected && checked && formTargetIds.length === 1;
                    return (
                      <label
                        key={opt.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: checked
                            ? '1px solid var(--navy-band)'
                            : '1px solid var(--line)',
                          background: checked ? 'var(--navy-soft)' : 'var(--surface)',
                          cursor: isLastActiveTargetOfSubmitted ? 'not-allowed' : 'pointer',
                          fontSize: '14px',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isLastActiveTargetOfSubmitted}
                          onChange={() => handleToggleTarget(opt.id)}
                        />
                        <span>
                          {opt.name}（{opt.teamName}
                          {opt.role === 'leader' ? '・リーダー' : ''}）
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              {isSubmittedSelected && formTargetIds.length === 1 && (
                <small className="form-hint">
                  送ったメモの対象者を全員外すことはできません（最後の1人は外せません。外したいときはメモを非表示にしてください）。
                </small>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '12px',
              }}
            >
              <TextareaField
                id="memo-noticed"
                label="気づいた内容"
                hint="指導した内容とどちらか必須"
                rows={4}
                value={formNoticed}
                onChange={(e) => setFormNoticed(e.target.value)}
              />
              <TextareaField
                id="memo-guidance"
                label="指導した内容"
                hint="気づいた内容とどちらか必須"
                rows={4}
                value={formGuidance}
                onChange={(e) => setFormGuidance(e.target.value)}
              />
            </div>

            {/* 確認結果（行動・結果・確かめた日）：送ったあと、または確認日を入力しているときに記録可能 */}
            {(isSubmittedSelected || formNextCheckOn || formActionCheck || formResultCheck) && (
              <div
                style={{
                  padding: '12px 16px',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  background: 'var(--surface-sunken)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                }}
              >
                <SelectField
                  id="memo-action-check"
                  label="行動（本人ができたか）"
                  placeholder="未記入"
                  options={CHECK_OPTIONS}
                  value={formActionCheck}
                  onChange={(e) => setFormActionCheck(e.target.value as MemoCheckValue | '')}
                />
                <SelectField
                  id="memo-result-check"
                  label="結果（数字に出たか）"
                  placeholder="未記入"
                  options={CHECK_OPTIONS}
                  value={formResultCheck}
                  onChange={(e) => setFormResultCheck(e.target.value as MemoCheckValue | '')}
                />
                <InputField
                  id="memo-checked-on"
                  label="確かめた日"
                  type="date"
                  value={formCheckedOn}
                  onChange={(e) => setFormCheckedOn(e.target.value)}
                />
              </div>
            )}

            {/* ボタン行（送ったメモを書きかけに戻す操作は出さない） */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                variant="primary"
                disabled={submitting}
                onClick={handleSubmitOrUpdateMemo}
              >
                {isSubmittedSelected ? '変更を保存する' : '部下メモを送る'}
              </Button>

              {!isSubmittedSelected && (
                <Button
                  variant="secondary"
                  disabled={submitting}
                  onClick={handleSaveDraftManually}
                >
                  下書き保存
                </Button>
              )}

              {selectedMemo && (
                <Button
                  variant="ghost"
                  disabled={submitting}
                  onClick={handleHideMemo}
                >
                  このメモを見えなくする
                </Button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 3. 自分の書きかけ（別にまとめて出す） */}
      {myDraftMemos.length > 0 && (
        <section className="panel" aria-label="自分の書きかけの部下メモ">
          <div className="section-header-row">
            <h2 className="section-title">自分の書きかけ（送るまでほかの上席には見えません）</h2>
            <span className="count-label">{myDraftMemos.length} 件</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {myDraftMemos.map((draft) => {
              const targetText = dataset
                ? formatMemoTargetNames(draft.id, dataset.targetRows, readableMembers)
                : '未選択';
              const isSelected = selectedMemoId === draft.id;
              return (
                <div
                  key={draft.id}
                  style={{
                    border: isSelected ? '2px solid var(--navy-band)' : '1px solid var(--line)',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    background: 'var(--surface-sunken)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>
                      <DateText value={draft.date} /> ／ 対象：{targetText}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
                      {truncateMemoSnippet(draft.noticed || draft.guidance, 28)}
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => loadMemoIntoForm(draft)}>
                    続きを書く
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. 読めるメモの一覧（対象者・テーマ・種類・期間で絞り込める） */}
      <section className="panel" aria-label="部下メモの一覧">
        <div className="section-header-row">
          <h2 className="section-title">部下メモの一覧</h2>
          <span className="count-label">{filteredSubmittedMemos.length} 件</span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '12px',
            marginBottom: '16px',
            padding: '12px 16px',
            background: 'var(--surface-sunken)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            alignItems: 'end',
          }}
        >
          <SelectField
            id="filter-target"
            label="対象者で絞り込み"
            placeholder="全員"
            options={targetFilterOptions}
            value={filterTargetId}
            onChange={(e) => setFilterTargetId(e.target.value)}
          />
          <SelectField
            id="filter-theme"
            label="テーマで絞り込み"
            placeholder="すべて"
            options={themeOptions}
            value={filterThemeId}
            onChange={(e) => setFilterThemeId(e.target.value)}
          />
          <SelectField
            id="filter-kind"
            label="種類で絞り込み"
            placeholder="すべて"
            options={kindOptions}
            value={filterKindId}
            onChange={(e) => setFilterKindId(e.target.value)}
          />
          <InputField
            id="filter-date-from"
            label="期間（開始日）"
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
          <InputField
            id="filter-date-to"
            label="期間（終了日）"
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                setFilterTargetId('');
                setFilterThemeId('');
                setFilterKindId('');
                setFilterDateFrom('');
                setFilterDateTo('');
              }}
            >
              条件をクリア
            </Button>
          </div>
        </div>

        <DataTable
          columns={submittedColumns}
          rows={filteredSubmittedMemos}
          rowKey={(r) => r.id}
          emptyMessage="条件に一致する部下メモはありません。"
        />
      </section>
    </div>
  );
}

export default SubordinateMemoPage;
