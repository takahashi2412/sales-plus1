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
  type TableColumn,
} from '../../../components/ui';
import { getTodayJstDateString } from '../../../foundation/directory';
import {
  JUDGE_MARK_LABELS,
  ROLEPLAY_KIND_LABELS,
  TALK_STATUS_LABELS,
  type JudgeMark,
  type MasterRow,
  type MemberThemeRow,
  type RoleplayKind,
  type RoleplayRow,
  type RoleplaySettingsMap,
  type RoleplayThemeRow,
  type TalkRow,
  type ViewerContext,
  type WritableMember,
} from '../shared';
import {
  hideRoleplayRow,
  insertPendingTalkFromRoleplay,
  insertRoleplayRow,
  updateRoleplayRow,
  type ReadableMemberInfo,
  type SaveRoleplayPayload,
} from './api';
import {
  canCreateDraftRoleplay,
  canModifyRoleplay,
  formatRoleplayTimeSlotDisplay,
  filterRoleplays,
  findPreviousHomework,
  generateTalkCode,
  getCurrentJstTimeSlot,
  HOMEWORK_EXAMPLES,
  isRoleplayOverAlertMinutes,
  MINUTES_OPTIONS,
  REPEAT_COUNT_OPTIONS,
  resolveNewTalkTeamId,
  resolveThemeSelectionForMember,
  sortRoleplaysByDateAndTimeSlot,
  sortTalksForSelect,
  TIME_SLOT_OPTIONS,
  validateRoleplayForSubmit,
} from './logic';

export interface RoleplayRecordViewProps {
  viewer: ViewerContext;
  writableMembers: WritableMember[];
  memberMap: Map<string, ReadableMemberInfo>;
  settings: RoleplaySettingsMap;
  themes: RoleplayThemeRow[];
  memberThemes: MemberThemeRow[];
  roleplays: RoleplayRow[];
  talks: TalkRow[];
  scenes: MasterRow[];
  onReload: () => Promise<void>;
}

const JUDGE_OPTIONS: { value: JudgeMark; label: string }[] = [
  { value: 'o', label: '○' },
  { value: 'd', label: '△' },
  { value: 'x', label: '×' },
];

export function RoleplayRecordView({
  viewer,
  writableMembers,
  memberMap,
  settings,
  themes,
  memberThemes,
  roleplays,
  talks,
  scenes,
  onReload,
}: RoleplayRecordViewProps) {
  const todayJst = useMemo(() => getTodayJstDateString(), []);
  const initialTimeSlot = useMemo(() => getCurrentJstTimeSlot(), []);

  // フォームの状態
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingSubmittedAt, setEditingSubmittedAt] = useState<string | null>(null);

  const [date, setDate] = useState<string>(todayJst);
  const [timeSlot, setTimeSlot] = useState<string>(initialTimeSlot);
  const [memberId, setMemberId] = useState<string>('');
  const [kind, setKind] = useState<RoleplayKind>('apo');
  const [themeId, setThemeId] = useState<string>('');
  const [usedTalkId, setUsedTalkId] = useState<string>('');
  const [minutesStr, setMinutesStr] = useState<string>('');
  const [homeworkResult, setHomeworkResult] = useState<JudgeMark | ''>('');
  const [repeatCountStr, setRepeatCountStr] = useState<string>('1');
  const [passResult, setPassResult] = useState<JudgeMark | ''>('');
  const [nextHomework, setNextHomework] = useState<string>('');
  const [fixedPoint, setFixedPoint] = useState<string>('');
  const [note, setNote] = useState<string>('');

  // 新しい言い方（任意・送るときに1回だけ talks に確認待ちで足す）
  const [newTalkPrefix, setNewTalkPrefix] = useState<'OUT' | 'SC'>('OUT');
  const [newTalkTheirWords, setNewTalkTheirWords] = useState<string>('');
  const [newTalkWording, setNewTalkWording] = useState<string>('');

  // 下書き・送信の状態表示
  const [draftStateText, setDraftStateText] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // 一覧の絞り込み
  const [filterMemberId, setFilterMemberId] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterThemeId, setFilterThemeId] = useState<string>('');

  // 自動下書き保存の直列制御用
  const draftIdRef = useRef<string | null>(null);
  const creatingDraftRef = useRef<boolean>(false);
  const lastSavedSignatureRef = useRef<string>('');
  const newTalkInsertedForSessionRef = useRef<boolean>(false);

  const themeMap = useMemo(
    () => new Map<string, RoleplayThemeRow>(themes.map((t) => [t.id, t])),
    [themes],
  );
  const talkMap = useMemo(
    () => new Map<string, TalkRow>(talks.map((t) => [t.id, t])),
    [talks],
  );
  const sceneOrderMap = useMemo(
    () => new Map<string, number>(scenes.map((s) => [s.id, s.sort_order])),
    [scenes],
  );

  const sortedTalks = useMemo(
    () => sortTalksForSelect(talks, sceneOrderMap),
    [talks, sceneOrderMap],
  );

  // 課員または内容に応じた練習中テーマ・選べるテーマ一覧
  const themeResolution = useMemo(
    () => resolveThemeSelectionForMember(memberId, memberThemes, themes, kind),
    [memberId, memberThemes, themes, kind],
  );

  // 編集中の記録が過去の非アクティブテーマを使っている場合も選択肢に残す
  const selectableThemeOptions = useMemo(() => {
    const list = [...themeResolution.selectableThemes];
    if (themeId && !list.some((t) => t.id === themeId)) {
      const currentTheme = themeMap.get(themeId);
      if (currentTheme) {
        list.unshift(currentTheme);
      }
    }
    return list.map((t) => ({
      value: t.id,
      label: `段階${t.stage}（#${t.no}）：${t.name}`,
    }));
  }, [themeResolution.selectableThemes, themeId, themeMap]);

  // 前回の宿題（自動）
  const previousHomework = useMemo(
    () => findPreviousHomework(memberId, roleplays, editingRowId ?? undefined),
    [memberId, roleplays, editingRowId],
  );

  // 課員を選んだとき、内容とテーマを自動で決める
  const handleSelectMember = (nextMemberId: string) => {
    setActionError(null);
    setActionInfo(null);
    setMemberId(nextMemberId);
    if (!nextMemberId) {
      setThemeId('');
      return;
    }
    const resolved = resolveThemeSelectionForMember(nextMemberId, memberThemes, themes);
    setKind(resolved.kind);
    setThemeId(resolved.themeId);
  };

  // 内容（アポ／営業）を切り替えたとき、その内容の練習中テーマまたは一覧の先頭を選ぶ
  const handleChangeKind = (nextKind: RoleplayKind) => {
    setActionError(null);
    setKind(nextKind);
    const resolved = resolveThemeSelectionForMember(memberId, memberThemes, themes, nextKind);
    setThemeId(resolved.themeId);
  };

  const buildCurrentPayload = (
    overrideSubmittedAt: string | null,
    overrideUsedTalkId?: string | null,
  ): SaveRoleplayPayload => {
    const parsedMinutes = minutesStr.trim() ? Number(minutesStr) : null;
    const parsedRepeat = Number(repeatCountStr);
    return {
      date,
      runner_member_id: viewer.memberId,
      member_id: memberId,
      time_slot: timeSlot,
      kind,
      theme_id: themeId,
      used_talk_id:
        overrideUsedTalkId !== undefined
          ? overrideUsedTalkId
          : usedTalkId.trim()
            ? usedTalkId.trim()
            : null,
      minutes: parsedMinutes !== null && Number.isFinite(parsedMinutes) ? parsedMinutes : null,
      homework_result: homeworkResult ? homeworkResult : null,
      repeat_count: Number.isFinite(parsedRepeat) && parsedRepeat > 0 ? parsedRepeat : 1,
      pass_result: passResult ? passResult : null,
      next_homework: nextHomework.trim() ? nextHomework.trim() : null,
      fixed_point: fixedPoint,
      note: note.trim() ? note.trim() : null,
      submitted_at: overrideSubmittedAt,
    };
  };

  // 書きかけの自動保存（課員・内容・テーマ・時間帯がそろったら最初の1行を入れ、その後は自動で下書き保存する）
  // 既に送った記録を直しているとき（editingSubmittedAt !== null）は下書きに戻さない
  useEffect(() => {
    if (editingSubmittedAt !== null) return;
    if (submitting) return;

    const ready = canCreateDraftRoleplay({
      date,
      runnerMemberId: viewer.memberId,
      memberId,
      timeSlot,
      kind,
      themeId,
    });
    if (!ready) return;

    const payload = buildCurrentPayload(null);
    const signature = JSON.stringify(payload);
    if (signature === lastSavedSignatureRef.current && draftIdRef.current) {
      return;
    }

    const timer = setTimeout(async () => {
      if (creatingDraftRef.current) return;
      creatingDraftRef.current = true;
      try {
        if (!draftIdRef.current) {
          const inserted = await insertRoleplayRow(payload);
          draftIdRef.current = inserted.id;
          setEditingRowId(inserted.id);
          lastSavedSignatureRef.current = signature;
          setDraftStateText('下書きを自動保存しました（「送る」まで上席には見えません）');
          await onReload();
        } else {
          await updateRoleplayRow(draftIdRef.current, payload);
          lastSavedSignatureRef.current = signature;
          setDraftStateText('下書きを自動更新しました（「送る」まで上席には見えません）');
          await onReload();
        }
      } catch {
        setActionError('この操作はできません');
      } finally {
        creatingDraftRef.current = false;
      }
    }, 350);

    return () => {
      clearTimeout(timer);
    };
  }, [
    date,
    timeSlot,
    memberId,
    kind,
    themeId,
    usedTalkId,
    minutesStr,
    homeworkResult,
    repeatCountStr,
    passResult,
    nextHomework,
    fixedPoint,
    note,
    editingSubmittedAt,
    submitting,
  ]);

  const resetForm = () => {
    draftIdRef.current = null;
    lastSavedSignatureRef.current = '';
    newTalkInsertedForSessionRef.current = false;
    setEditingRowId(null);
    setEditingSubmittedAt(null);
    setDate(todayJst);
    setTimeSlot(initialTimeSlot);
    setMemberId('');
    setKind('apo');
    setThemeId('');
    setUsedTalkId('');
    setMinutesStr('');
    setHomeworkResult('');
    setRepeatCountStr('1');
    setPassResult('');
    setNextHomework('');
    setFixedPoint('');
    setNote('');
    setNewTalkPrefix('OUT');
    setNewTalkTheirWords('');
    setNewTalkWording('');
    setDraftStateText('');
  };

  // 手動で今すぐ下書き保存する操作（書きかけのときのみ）
  const handleSaveDraftNow = async () => {
    setActionError(null);
    setActionInfo(null);
    if (editingSubmittedAt !== null) return;

    const ready = canCreateDraftRoleplay({
      date,
      runnerMemberId: viewer.memberId,
      memberId,
      timeSlot,
      kind,
      themeId,
    });
    if (!ready) {
      setActionError('下書きを保存するには、課員・時間帯・内容・テーマを選んでください。');
      return;
    }

    const payload = buildCurrentPayload(null);
    const signature = JSON.stringify(payload);
    setSubmitting(true);
    try {
      if (!draftIdRef.current) {
        const inserted = await insertRoleplayRow(payload);
        draftIdRef.current = inserted.id;
        setEditingRowId(inserted.id);
      } else {
        await updateRoleplayRow(draftIdRef.current, payload);
      }
      lastSavedSignatureRef.current = signature;
      setDraftStateText('下書きを保存しました（「送る」まで上席には見えません）');
      await onReload();
    } catch {
      setActionError('この操作はできません');
    } finally {
      setSubmitting(false);
    }
  };

  // 送る（または送ったあとの記録を直す）
  const handleSubmitRoleplay = async () => {
    setActionError(null);
    setActionInfo(null);

    const parsedMinutes = minutesStr.trim() ? Number(minutesStr) : null;
    const validation = validateRoleplayForSubmit({
      memberId,
      timeSlot,
      kind,
      themeId,
      fixedPoint,
      minutes: parsedMinutes,
      passResult: passResult || null,
    });

    if (!validation.ok) {
      setActionError(
        `送るには次の項目が必要です：${validation.missingLabels.join('・')}`,
      );
      return;
    }

    setSubmitting(true);
    try {
      let finalUsedTalkId: string | null = usedTalkId.trim() ? usedTalkId.trim() : null;

      // 新しい言い方が入力されているとき、送るときに1回だけ talks に確認待ちで足す
      const hasNewTalkInput =
        Boolean(newTalkTheirWords.trim()) || Boolean(newTalkWording.trim());
      if (hasNewTalkInput && !newTalkInsertedForSessionRef.current) {
        const targetWritable = writableMembers.find((w) => w.id === memberId);
        const targetTeamId =
          targetWritable?.teamId ?? memberMap.get(memberId)?.teamId ?? null;
        const talkTeamId = resolveNewTalkTeamId(viewer, targetTeamId);
        const code = generateTalkCode(newTalkPrefix, todayJst);

        const createdTalk = await insertPendingTalkFromRoleplay({
          code,
          their_words: newTalkTheirWords.trim(),
          wording: newTalkWording.trim(),
          team_id: talkTeamId,
          created_by: viewer.memberId,
        });
        newTalkInsertedForSessionRef.current = true;
        if (!finalUsedTalkId) {
          finalUsedTalkId = createdTalk.id;
        }
      }

      const submittedTimestamp = editingSubmittedAt ?? new Date().toISOString();
      const payload = buildCurrentPayload(submittedTimestamp, finalUsedTalkId);

      if (draftIdRef.current) {
        await updateRoleplayRow(draftIdRef.current, payload);
      } else {
        await insertRoleplayRow(payload);
      }

      const wasEditingSubmitted = editingSubmittedAt !== null;
      resetForm();
      await onReload();
      setActionInfo(
        wasEditingSubmitted
          ? '送ったロープレの記録を更新しました。'
          : hasNewTalkInput
            ? 'ロープレの記録を送り、新しい言い方をトーク一覧に「確認待ち」で1件追加しました。'
            : 'ロープレの記録を送りました。',
      );
    } catch {
      setActionError('この操作はできません');
    } finally {
      setSubmitting(false);
    }
  };

  // 一覧から「続きを書く」または「直す」を押したとき
  const handleSelectRowForEdit = (row: RoleplayRow) => {
    if (!canModifyRoleplay(row)) return;
    setActionError(null);
    setActionInfo(null);
    draftIdRef.current = row.id;
    setEditingRowId(row.id);
    setEditingSubmittedAt(row.submitted_at);
    newTalkInsertedForSessionRef.current = row.submitted_at !== null;

    setDate(row.date);
    setTimeSlot(row.time_slot ?? initialTimeSlot);
    setMemberId(row.member_id);
    setKind(row.kind);
    setThemeId(row.theme_id ?? '');
    setUsedTalkId(row.used_talk_id ?? '');
    setMinutesStr(row.minutes !== null ? String(row.minutes) : '');
    setHomeworkResult(row.homework_result ?? '');
    setRepeatCountStr(String(row.repeat_count ?? 1));
    setPassResult(row.pass_result ?? '');
    setNextHomework(row.next_homework ?? '');
    setFixedPoint(row.fixed_point ?? '');
    setNote(row.note ?? '');
    setNewTalkTheirWords('');
    setNewTalkWording('');

    const payload: SaveRoleplayPayload = {
      date: row.date,
      runner_member_id: row.runner_member_id,
      member_id: row.member_id,
      time_slot: row.time_slot ?? '',
      kind: row.kind,
      theme_id: row.theme_id ?? '',
      used_talk_id: row.used_talk_id,
      minutes: row.minutes,
      homework_result: row.homework_result,
      repeat_count: row.repeat_count,
      pass_result: row.pass_result,
      next_homework: row.next_homework,
      fixed_point: row.fixed_point,
      note: row.note,
      submitted_at: row.submitted_at,
    };
    lastSavedSignatureRef.current = JSON.stringify(payload);
    setDraftStateText(
      row.submitted_at
        ? '送った記録を編集中です（内容は直せますが、書きかけには戻せません）'
        : '書きかけの記録を読み込みました',
    );
  };

  const handleHideRow = async (rowId: string) => {
    const target = roleplays.find((r) => r.id === rowId);
    if (target && !canModifyRoleplay(target)) return;
    setActionError(null);
    setActionInfo(null);
    try {
      await hideRoleplayRow(rowId);
      if (editingRowId === rowId) {
        resetForm();
      }
      await onReload();
      setActionInfo('記録を見えなくしました。');
    } catch {
      setActionError('この操作はできません');
    }
  };

  const formatMemberName = (targetMemberId: string): string => {
    const found = memberMap.get(targetMemberId);
    if (found) return found.name;
    const writable = writableMembers.find((w) => w.id === targetMemberId);
    if (writable) return writable.name;
    return '名簿で見られない人';
  };

  const currentMinutesNum = minutesStr.trim() ? Number(minutesStr) : null;
  const isCurrentMinutesOverAlert = isRoleplayOverAlertMinutes(
    currentMinutesNum,
    settings.roleplay_alert_minutes,
  );

  // 一覧の絞り込みと並び順（日付と時間帯。時間帯は数として並べ、'9' が '10' より前）
  const filteredRoleplays = useMemo(() => {
    const filtered = filterRoleplays(roleplays, {
      memberId: filterMemberId || undefined,
      dateFrom: filterDateFrom || undefined,
      dateTo: filterDateTo || undefined,
      themeId: filterThemeId || undefined,
    });
    return sortRoleplaysByDateAndTimeSlot(filtered, 'asc');
  }, [roleplays, filterMemberId, filterDateFrom, filterDateTo, filterThemeId]);

  // 一覧の絞り込み用メンバー選択肢
  const filterMemberOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const m of memberMap.values()) ids.add(m.id);
    for (const w of writableMembers) ids.add(w.id);
    for (const r of roleplays) ids.add(r.member_id);
    return Array.from(ids).map((id) => ({
      value: id,
      label: formatMemberName(id),
    }));
  }, [memberMap, writableMembers, roleplays]);

  const columns: TableColumn<RoleplayRow>[] = [
    {
      key: 'date_slot',
      header: '日付・時間帯',
      render: (row) => (
        <div className="rp-record-cell-stack">
          <DateText value={row.date} withWeekday />
          <span className="rp-record-muted">{formatRoleplayTimeSlotDisplay(row.time_slot)}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: '状態',
      render: (row) =>
        row.is_legacy ? (
          <Tag tone="warn">過去の記録（見るだけ）</Tag>
        ) : row.submitted_at ? (
          <Tag tone="good">送った記録</Tag>
        ) : (
          <Tag tone="warn">書きかけ</Tag>
        ),
    },
    {
      key: 'member',
      header: '課員 ／ 実行者',
      render: (row) => (
        <div className="rp-record-cell-stack">
          <strong>{formatMemberName(row.member_id)}</strong>
          <span className="rp-record-muted">
            実行者：{formatMemberName(row.runner_member_id)}
          </span>
        </div>
      ),
    },
    {
      key: 'theme',
      header: '内容・テーマ',
      render: (row) => {
        const t = row.theme_id ? themeMap.get(row.theme_id) : undefined;
        return (
          <div className="rp-record-cell-stack">
            <div>
              <Tag tone="navy">{ROLEPLAY_KIND_LABELS[row.kind]}</Tag>
            </div>
            <span>{t ? `段階${t.stage}：${t.name}` : row.is_legacy ? '（過去の記録：なし）' : 'テーマ情報なし'}</span>
          </div>
        );
      },
    },
    {
      key: 'minutes_repeat',
      header: '時間・くり返し',
      render: (row) => {
        const overMinutes = isRoleplayOverAlertMinutes(
          row.minutes,
          settings.roleplay_alert_minutes,
        );
        return (
          <div className="rp-record-cell-stack">
            <span>
              {row.minutes !== null ? `${row.minutes}分` : '未入力'} ／ {row.repeat_count}回
            </span>
            {overMinutes && (
              <div>
                <Tag tone="warn">
                  確認（{settings.roleplay_alert_minutes}分超）
                </Tag>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'judge',
      header: '宿題・合格ライン',
      render: (row) => (
        <div className="rp-record-cell-stack">
          <span>
            宿題：{row.homework_result ? JUDGE_MARK_LABELS[row.homework_result] : '－'}
          </span>
          <span>
            合格：{row.pass_result ? JUDGE_MARK_LABELS[row.pass_result] : row.is_legacy ? '－' : '未入力'}
          </span>
        </div>
      ),
    },
    {
      key: 'fixed_and_homework',
      header: '今日直した点・次回の宿題・トーク',
      render: (row) => {
        const talk = row.used_talk_id ? talkMap.get(row.used_talk_id) : null;
        return (
          <div className="rp-record-cell-stack">
            <div>
              <strong>直した点：</strong>
              {row.fixed_point ? row.fixed_point : '（未入力）'}
            </div>
            {row.next_homework && (
              <div className="rp-record-muted">次回の宿題：{row.next_homework}</div>
            )}
            {row.used_talk_id && (
              <div className="rp-record-muted">
                使ったトーク：{talk ? `${talk.code}（${talk.their_words || talk.wording}）` : '読めないトーク'}
              </div>
            )}
            {row.note && <div className="rp-record-muted">申し送り：{row.note}</div>}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '操作',
      render: (row) => {
        if (!canModifyRoleplay(row)) {
          return <span className="rp-record-muted">過去の記録（見るだけ）</span>;
        }
        const isRunner = row.runner_member_id === viewer.memberId;
        if (!isRunner) {
          return <span className="rp-record-muted">閲覧のみ</span>;
        }
        return (
          <div className="rp-record-inline-actions">
            <Button
              variant="secondary"
              onClick={() => handleSelectRowForEdit(row)}
            >
              {row.submitted_at ? '直す' : '続きを書く'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleHideRow(row.id)}
            >
              消す
            </Button>
          </div>
        );
      },
    },
  ];

  const runnerName = memberMap.get(viewer.memberId)?.name ?? 'ログイン中の利用者';

  return (
    <div className="rp-record-page">
      {actionError && (
        <NoticeBox tone="alert" title="確認してください" role="alert">
          {actionError}
        </NoticeBox>
      )}
      {actionInfo && (
        <NoticeBox tone="good" title="完了" role="status">
          {actionInfo}
        </NoticeBox>
      )}

      <section className="panel" aria-label="ロープレを書く">
        <div className="section-header-row">
          <h2 className="section-title">
            {editingSubmittedAt
              ? '送ったロープレの記録を直す'
              : editingRowId
                ? 'ロープレの記録（書きかけ編集中）'
                : 'ロープレを書く（1回1テーマ）'}
          </h2>
          {draftStateText && (
            <span className="rp-record-draft-status">{draftStateText}</span>
          )}
        </div>

        {writableMembers.length === 0 ? (
          <NoticeBox tone="info" title="ロープレを書ける課員がいません">
            現在の役割・所属では、ロープレの記録を書ける対象の課員がいません。
          </NoticeBox>
        ) : (
          <>
            {/* 自動で入る欄の要約 */}
            <div className="rp-record-auto-box" aria-label="自動で決まる項目">
              <div className="rp-record-auto-item">
                <span className="rp-record-auto-label">日付・実行者（自動）</span>
                <span className="rp-record-auto-value">
                  <DateText value={date} withWeekday /> ／ {runnerName}
                </span>
              </div>
              <div className="rp-record-auto-item">
                <span className="rp-record-auto-label">練習中のテーマ（自動）</span>
                <span className="rp-record-auto-value">
                  {!memberId
                    ? '課員を選ぶと自動で入ります'
                    : themeResolution.practicingMemberTheme
                      ? `${ROLEPLAY_KIND_LABELS[kind]}：${
                          themeMap.get(themeResolution.practicingMemberTheme.theme_id)?.name ?? ''
                        }`
                      : '練習中のテーマなし（または閲覧外）→ 一覧から選択'}
                </span>
                {themeResolution.practicingMemberTheme && (
                  <span className="rp-record-muted">
                    合格ライン：{themeResolution.practicingMemberTheme.pass_line}
                  </span>
                )}
              </div>
              <div className="rp-record-auto-item">
                <span className="rp-record-auto-label">前回の宿題（自動）</span>
                <span className="rp-record-auto-value">
                  {!memberId ? '－' : previousHomework || 'なし'}
                </span>
              </div>
            </div>

            {/* 課員・日付・時間帯 */}
            <div className="rp-record-form-grid">
              <SelectField
                id="rp-record-member"
                label="課員"
                hint="選ぶ（必須）"
                placeholder="課員を選んでください"
                value={memberId}
                onChange={(e) => handleSelectMember(e.target.value)}
                options={writableMembers.map((m) => ({
                  value: m.id,
                  label: m.name,
                }))}
              />
              <InputField
                id="rp-record-date"
                type="date"
                label="日付"
                hint="自動（変更可）"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <SelectField
                id="rp-record-time-slot"
                label="時間帯"
                hint="自動（変更可）"
                value={timeSlot}
                onChange={(e) => setTimeSlot(e.target.value)}
                options={TIME_SLOT_OPTIONS}
              />
            </div>

            {/* 内容・テーマ・使ったトーク */}
            <div className="rp-record-form-grid">
              <SelectField
                id="rp-record-kind"
                label="内容（アポ／営業）"
                hint="自動・変更可"
                value={kind}
                onChange={(e) => handleChangeKind(e.target.value as RoleplayKind)}
                options={[
                  { value: 'apo', label: 'アポ' },
                  { value: 'sales', label: '営業' },
                ]}
              />
              <SelectField
                id="rp-record-theme"
                label="テーマ"
                hint={
                  themeResolution.practicingMemberTheme
                    ? '練習中のテーマ（変更可）'
                    : 'テーマ一覧から選ぶ'
                }
                placeholder="テーマを選んでください"
                value={themeId}
                onChange={(e) => setThemeId(e.target.value)}
                options={selectableThemeOptions}
              />
              <SelectField
                id="rp-record-used-talk"
                label="使ったトーク"
                hint="任意（空でよい）"
                placeholder="選択なし（空でよい）"
                value={usedTalkId}
                onChange={(e) => setUsedTalkId(e.target.value)}
                options={sortedTalks.map((t) => ({
                  value: t.id,
                  label: `${t.code}（${TALK_STATUS_LABELS[t.status]}）${
                    t.their_words ? `：${t.their_words}` : ''
                  }`,
                }))}
              />
            </div>

            {/* 時間・くり返し・宿題の○△×・合格ラインの○△× */}
            <div className="rp-record-form-grid">
              <SelectField
                id="rp-record-minutes"
                label="時間（分）"
                hint="送るときは必須"
                placeholder="未選択（書きかけ可）"
                value={minutesStr}
                onChange={(e) => setMinutesStr(e.target.value)}
                options={MINUTES_OPTIONS}
              />
              <SelectField
                id="rp-record-repeat"
                label="くり返し回数"
                hint="選ぶ"
                value={repeatCountStr}
                onChange={(e) => setRepeatCountStr(e.target.value)}
                options={REPEAT_COUNT_OPTIONS}
              />
              <SelectField
                id="rp-record-homework-result"
                label="宿題の○△×"
                hint="任意（空でよい）"
                placeholder="なし（空でよい）"
                value={homeworkResult}
                onChange={(e) => setHomeworkResult((e.target.value as JudgeMark) || '')}
                options={JUDGE_OPTIONS}
              />
            </div>

            {isCurrentMinutesOverAlert && (
              <NoticeBox tone="warn" title={`確認：1回のロープレが${settings.roleplay_alert_minutes}分を超えています`}>
                1回のロープレが設定値の{settings.roleplay_alert_minutes}分を超えています。後半がリストや見込みの話にそれていないか確認してください。
              </NoticeBox>
            )}

            <div className="rp-record-form-grid-2">
              <div className="form-field">
                <span className="form-label">
                  合格ラインの○△×
                  <small className="form-hint">送るときは必須</small>
                </span>
                <div className="rp-record-judge-group" role="group" aria-label="合格ラインの○△×">
                  {JUDGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`rp-record-judge-btn ${
                        passResult === opt.value ? 'rp-record-judge-btn--active' : ''
                      }`.trim()}
                      onClick={() =>
                        setPassResult((prev) => (prev === opt.value ? '' : opt.value))
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rp-record-form-grid-2" style={{ marginBottom: 0 }}>
                <SelectField
                  id="rp-record-next-homework-preset"
                  label="次回の宿題（例から選ぶ）"
                  hint="選ぶと右に入ります"
                  placeholder="例から選ぶ"
                  value={HOMEWORK_EXAMPLES.includes(nextHomework) ? nextHomework : ''}
                  onChange={(e) => {
                    if (e.target.value) setNextHomework(e.target.value);
                  }}
                  options={HOMEWORK_EXAMPLES.map((ex) => ({ value: ex, label: ex }))}
                />
                <InputField
                  id="rp-record-next-homework"
                  label="次回の宿題"
                  hint="自由に入力・修正可"
                  placeholder="次回のロープレまでの宿題"
                  value={nextHomework}
                  onChange={(e) => setNextHomework(e.target.value)}
                />
              </div>
            </div>

            {/* 書く欄：今日直した点（必須・1つ）と申し送り（任意） */}
            <div className="rp-record-form-grid-2">
              <TextareaField
                id="rp-record-fixed-point"
                label="今日直した点"
                hint="毎回1つ書く（送るときは必須）"
                placeholder="例：受け止めの一言を短くして時間切りへつないだ"
                rows={3}
                value={fixedPoint}
                onChange={(e) => setFixedPoint(e.target.value)}
              />
              <TextareaField
                id="rp-record-note"
                label="申し送り"
                hint="任意"
                placeholder="上席や次の実行者への申し送りがあれば記入"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {/* 新しい言い方（任意・送るときに1回だけ talks に確認待ちで1行足す） */}
            {!editingSubmittedAt && (
              <div className="rp-record-sub-panel">
                <h3 className="rp-record-sub-title">
                  新しい言い方（任意・送るときに1回だけトーク一覧へ「確認待ち」で登録）
                </h3>
                <p className="rp-record-muted" style={{ marginBottom: 10 }}>
                  下書きの保存では追加されません。「送る」を押したときに1回だけトーク一覧へ「確認待ち」で追加し、使ったトークを選んでいない場合は自動でつなぎます。
                </p>
                <div className="rp-record-form-grid">
                  <SelectField
                    id="rp-record-new-talk-prefix"
                    label="トークの種類"
                    hint="コードの先頭"
                    value={newTalkPrefix}
                    onChange={(e) => setNewTalkPrefix(e.target.value as 'OUT' | 'SC')}
                    options={[
                      { value: 'OUT', label: 'OUT-（返し）' },
                      { value: 'SC', label: 'SC-（スクリプト）' },
                    ]}
                  />
                  <InputField
                    id="rp-record-new-talk-their-words"
                    label="相手の言葉"
                    hint="任意"
                    placeholder="例：今は忙しいので間に合っています"
                    value={newTalkTheirWords}
                    onChange={(e) => setNewTalkTheirWords(e.target.value)}
                  />
                  <InputField
                    id="rp-record-new-talk-wording"
                    label="言い方"
                    hint="任意"
                    placeholder="例：そうですよね。1分だけご挨拶のお時間をいただけますか"
                    value={newTalkWording}
                    onChange={(e) => setNewTalkWording(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="rp-record-button-row">
              <Button
                variant="primary"
                disabled={submitting}
                onClick={handleSubmitRoleplay}
              >
                {editingSubmittedAt ? '内容を更新する' : '送る（記録を確定する）'}
              </Button>
              {!editingSubmittedAt && (
                <Button
                  variant="secondary"
                  disabled={submitting}
                  onClick={handleSaveDraftNow}
                >
                  下書きを保存
                </Button>
              )}
              {(editingRowId || memberId || fixedPoint) && (
                <Button
                  variant="ghost"
                  disabled={submitting}
                  onClick={resetForm}
                >
                  {editingRowId ? '新しい記録の入力に戻る' : '入力をクリア'}
                </Button>
              )}
            </div>
          </>
        )}
      </section>

      {/* ロープレの一覧 */}
      <section className="panel" aria-label="ロープレの一覧">
        <div className="section-header-row">
          <h2 className="section-title">ロープレの一覧</h2>
          <span className="count-label">
            {filteredRoleplays.length}件（全{roleplays.filter((r) => r.hidden_at === null).length}件）
          </span>
        </div>

        <div className="rp-record-filter-grid">
          <SelectField
            id="rp-filter-member"
            label="課員で絞り込む"
            placeholder="すべての課員"
            value={filterMemberId}
            onChange={(e) => setFilterMemberId(e.target.value)}
            options={filterMemberOptions}
          />
          <InputField
            id="rp-filter-date-from"
            type="date"
            label="期間（開始日）"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
          <InputField
            id="rp-filter-date-to"
            type="date"
            label="期間（終了日）"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
          <SelectField
            id="rp-filter-theme"
            label="テーマで絞り込む"
            placeholder="すべてのテーマ"
            value={filterThemeId}
            onChange={(e) => setFilterThemeId(e.target.value)}
            options={themes.map((t) => ({
              value: t.id,
              label: `${ROLEPLAY_KIND_LABELS[t.kind]}／段階${t.stage}：${t.name}`,
            }))}
          />
        </div>

        {(filterMemberId || filterDateFrom || filterDateTo || filterThemeId) && (
          <div style={{ marginBottom: 12 }}>
            <Button
              variant="secondary"
              onClick={() => {
                setFilterMemberId('');
                setFilterDateFrom('');
                setFilterDateTo('');
                setFilterThemeId('');
              }}
            >
              絞り込み条件をクリア
            </Button>
          </div>
        )}

        <DataTable
          columns={columns}
          rows={filteredRoleplays}
          rowKey={(row) => row.id}
          emptyMessage="条件に一致するロープレの記録はありません。"
        />
      </section>
    </div>
  );
}
