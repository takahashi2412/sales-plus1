import { useMemo, useState } from 'react';
import {
  Button,
  DataTable,
  DateText,
  InputField,
  NoticeBox,
  SelectField,
  Tag,
  type TableColumn,
} from '../../../components/ui';
import { getTodayJstDateString } from '../../../foundation/directory';
import {
  canSuperviseMember,
  JUDGE_MARK_LABELS,
  MEMBER_THEME_STATUS_LABELS,
  ROLEPLAY_KIND_LABELS,
  type MemberThemeRow,
  type RoleplayKind,
  type RoleplayRow,
  type RoleplaySettingsMap,
  type RoleplayThemeRow,
  type ViewerContext,
  type WritableMember,
} from '../shared';
import {
  insertMemberThemeRow,
  updateMemberThemeRow,
  type ReadableMemberInfo,
} from './api';
import {
  buildGraduatePatch,
  buildThemeNoticesSummary,
  evaluateCheckRoleplayNotice,
  evaluateGraduationCandidate,
  evaluateLongPracticingAlert,
  hasPracticingThemeOfSameKind,
} from './logic';

export interface MemberThemesViewProps {
  viewer: ViewerContext;
  writableMembers: WritableMember[];
  memberMap: Map<string, ReadableMemberInfo>;
  settings: RoleplaySettingsMap;
  themes: RoleplayThemeRow[];
  memberThemes: MemberThemeRow[];
  roleplays: RoleplayRow[];
  onReload: () => Promise<void>;
}

export function MemberThemesView({
  viewer,
  writableMembers,
  memberMap,
  settings,
  themes,
  memberThemes,
  roleplays,
  onReload,
}: MemberThemesViewProps) {
  const todayJst = useMemo(() => getTodayJstDateString(), []);

  // 上席として指導できる課員の一覧（canSuperviseMember で判定。自分自身やメンバー実行者は含まれない）
  const supervisedMembers = useMemo(
    () =>
      writableMembers.filter((m) =>
        canSuperviseMember(viewer, { id: m.id, teamId: m.teamId }),
      ),
    [viewer, writableMembers],
  );

  // 追加フォームの状態
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [selectedKind, setSelectedKind] = useState<RoleplayKind>('apo');
  const [selectedThemeId, setSelectedThemeId] = useState<string>('');
  const [startedOn, setStartedOn] = useState<string>(todayJst);
  const [passLine, setPassLine] = useState<string>('');

  // 行の編集フォームの状態
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editThemeId, setEditThemeId] = useState<string>('');
  const [editStartedOn, setEditStartedOn] = useState<string>('');
  const [editPassLine, setEditPassLine] = useState<string>('');

  // 一覧の絞り込み
  const [filterMemberId, setFilterMemberId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [working, setWorking] = useState<boolean>(false);

  const themeMap = useMemo(
    () => new Map<string, RoleplayThemeRow>(themes.map((t) => [t.id, t])),
    [themes],
  );

  const activeThemesForSelectedKind = useMemo(
    () => themes.filter((t) => t.is_active && t.kind === selectedKind),
    [themes, selectedKind],
  );

  const alreadyPracticingForAdd = useMemo(() => {
    if (!selectedMemberId) return false;
    return hasPracticingThemeOfSameKind(memberThemes, selectedMemberId, selectedKind);
  }, [memberThemes, selectedMemberId, selectedKind]);

  // 卒業の知らせ・確認のロープレ・注意の計算
  const noticesSummary = useMemo(
    () => buildThemeNoticesSummary(memberThemes, roleplays, settings, todayJst),
    [memberThemes, roleplays, settings, todayJst],
  );

  const formatMemberName = (targetMemberId: string): string => {
    const found = memberMap.get(targetMemberId);
    if (found) return found.name;
    const writable = writableMembers.find((w) => w.id === targetMemberId);
    if (writable) return writable.name;
    return '名簿で見られない人';
  };

  const resolveMemberTeamId = (targetMemberId: string): string | null => {
    const writable = writableMembers.find((w) => w.id === targetMemberId);
    if (writable) return writable.teamId;
    return memberMap.get(targetMemberId)?.teamId ?? null;
  };

  const canSuperviseRow = (targetMemberId: string): boolean => {
    const teamId = resolveMemberTeamId(targetMemberId);
    return canSuperviseMember(viewer, { id: targetMemberId, teamId });
  };

  const handleSelectKindForAdd = (nextKind: RoleplayKind) => {
    setSelectedKind(nextKind);
    const list = themes.filter((t) => t.is_active && t.kind === nextKind);
    const first = list[0];
    setSelectedThemeId(first?.id ?? '');
    setPassLine(first?.pass_example ?? '');
  };

  const handleSelectThemeForAdd = (nextThemeId: string) => {
    setSelectedThemeId(nextThemeId);
    const found = themeMap.get(nextThemeId);
    if (found) {
      setPassLine(found.pass_example);
    }
  };

  const handleAddMemberTheme = async () => {
    setActionError(null);
    setActionInfo(null);

    if (!selectedMemberId) {
      setActionError('課員を選んでください。');
      return;
    }
    if (alreadyPracticingForAdd) {
      setActionError(
        '同じ内容で練習中のテーマがすでにあるため、新しく足すことはできません。',
      );
      return;
    }
    const targetThemeId = selectedThemeId || activeThemesForSelectedKind[0]?.id || '';
    if (!targetThemeId) {
      setActionError('テーマを選んでください。');
      return;
    }

    setWorking(true);
    try {
      await insertMemberThemeRow({
        member_id: selectedMemberId,
        theme_id: targetThemeId,
        kind: selectedKind,
        started_on: startedOn || todayJst,
        pass_line: passLine.trim(),
        created_by: viewer.memberId,
      });
      await onReload();
      setActionInfo('練習中のテーマを追加しました。');
    } catch {
      setActionError('この操作はできません');
    } finally {
      setWorking(false);
    }
  };

  const handleGraduateRow = async (row: MemberThemeRow) => {
    setActionError(null);
    setActionInfo(null);
    setWorking(true);
    try {
      const patch = buildGraduatePatch(todayJst, settings.roleplay_check_days);
      await updateMemberThemeRow(row.id, patch);
      await onReload();
      setActionInfo(
        `テーマを「卒業」にしました（確認のロープレ予定日：${patch.check_on}）。`,
      );
    } catch {
      setActionError('この操作はできません');
    } finally {
      setWorking(false);
    }
  };

  const handleReturnToPracticing = async (row: MemberThemeRow) => {
    setActionError(null);
    setActionInfo(null);
    if (hasPracticingThemeOfSameKind(memberThemes, row.member_id, row.kind, row.id)) {
      setActionError(
        '同じ内容で練習中のテーマがすでにあるため、練習中に戻すことはできません。',
      );
      return;
    }
    setWorking(true);
    try {
      await updateMemberThemeRow(row.id, {
        status: 'practicing',
        graduated_on: null,
        check_on: null,
        started_on: todayJst,
      });
      await onReload();
      setActionInfo('テーマを「練習中」に戻しました。');
    } catch {
      setActionError('この操作はできません');
    } finally {
      setWorking(false);
    }
  };

  const handleStartEditRow = (row: MemberThemeRow) => {
    setActionError(null);
    setActionInfo(null);
    setEditingRowId(row.id);
    setEditThemeId(row.theme_id);
    setEditStartedOn(row.started_on);
    setEditPassLine(row.pass_line);
  };

  const handleSaveEditRow = async (row: MemberThemeRow) => {
    setActionError(null);
    setActionInfo(null);
    setWorking(true);
    try {
      await updateMemberThemeRow(row.id, {
        theme_id: editThemeId,
        started_on: editStartedOn,
        pass_line: editPassLine.trim(),
      });
      setEditingRowId(null);
      await onReload();
      setActionInfo('テーマ表の内容を更新しました。');
    } catch {
      setActionError('この操作はできません');
    } finally {
      setWorking(false);
    }
  };

  const handleHideRow = async (row: MemberThemeRow) => {
    setActionError(null);
    setActionInfo(null);
    setWorking(true);
    try {
      await updateMemberThemeRow(row.id, {
        hidden_at: new Date().toISOString(),
      });
      if (editingRowId === row.id) {
        setEditingRowId(null);
      }
      await onReload();
      setActionInfo('テーマ表の行を見えなくしました。');
    } catch {
      setActionError('この操作はできません');
    } finally {
      setWorking(false);
    }
  };

  const visibleMemberThemes = useMemo(() => {
    return memberThemes.filter((mt) => {
      if (mt.hidden_at !== null) return false;
      if (filterMemberId && mt.member_id !== filterMemberId) return false;
      if (filterStatus && mt.status !== filterStatus) return false;
      return true;
    });
  }, [memberThemes, filterMemberId, filterStatus]);

  const filterMemberOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const m of memberMap.values()) ids.add(m.id);
    for (const w of writableMembers) ids.add(w.id);
    for (const mt of memberThemes) ids.add(mt.member_id);
    return Array.from(ids).map((id) => ({
      value: id,
      label: formatMemberName(id),
    }));
  }, [memberMap, writableMembers, memberThemes]);

  const columns: TableColumn<MemberThemeRow>[] = [
    {
      key: 'member',
      header: '課員',
      className: 'col-name',
      render: (row) => (
        <div className="rp-record-cell-stack">
          <span>{formatMemberName(row.member_id)}</span>
          {row.member_id === viewer.memberId && (
            <span className="rp-record-muted">（自分）</span>
          )}
        </div>
      ),
    },
    {
      key: 'kind',
      header: '内容',
      render: (row) => <Tag tone="navy">{ROLEPLAY_KIND_LABELS[row.kind]}</Tag>,
    },
    {
      key: 'theme',
      header: 'テーマ',
      render: (row) => {
        const t = themeMap.get(row.theme_id);
        return t ? `段階${t.stage}（#${t.no}）：${t.name}` : 'テーマ情報なし';
      },
    },
    {
      key: 'started_on',
      header: '開始日',
      render: (row) => <DateText value={row.started_on} />,
    },
    {
      key: 'pass_line',
      header: '合格ライン',
      render: (row) => row.pass_line || '－',
    },
    {
      key: 'status',
      header: '状態・卒業日・確認の日',
      render: (row) => (
        <div className="rp-record-cell-stack">
          <div>
            <Tag tone={row.status === 'graduated' ? 'good' : 'navy'}>
              {MEMBER_THEME_STATUS_LABELS[row.status]}
            </Tag>
          </div>
          {row.status === 'graduated' && (
            <>
              <span className="rp-record-muted">
                卒業日：<DateText value={row.graduated_on} />
              </span>
              <span className="rp-record-muted">
                確認の日：<DateText value={row.check_on} />
              </span>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'notices',
      header: '卒業の候補・確認・注意',
      render: (row) => {
        const grad = evaluateGraduationCandidate(
          row,
          roleplays,
          settings.roleplay_graduate_count,
        );
        const check = evaluateCheckRoleplayNotice(row, roleplays, todayJst);
        const longPrac = evaluateLongPracticingAlert(
          row,
          todayJst,
          settings.roleplay_alert_days,
        );

        return (
          <div className="rp-record-cell-stack">
            {row.status === 'practicing' && (
              <span className="rp-record-muted">
                開始日以降の連続○：{grad.consecutivePassCount}回（基準：{settings.roleplay_graduate_count}回）
              </span>
            )}
            {grad.isCandidate && (
              <div>
                <Tag tone="good">
                  卒業の候補（○が{grad.consecutivePassCount}回連続）
                </Tag>
              </div>
            )}
            {longPrac.isLongPracticing && (
              <div>
                <Tag tone="warn">
                  注意（{longPrac.practicingDays}日間練習中）
                </Tag>
              </div>
            )}
            {check.needsCheckNotice && (
              <div>
                <Tag tone="warn">確認のロープレ対象</Tag>
              </div>
            )}
            {row.status === 'graduated' && check.latestCheckResult && (
              <span className="rp-record-muted">
                確認ロープレ済み（<DateText value={check.latestCheckDate} />：
                {JUDGE_MARK_LABELS[check.latestCheckResult]}）
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '操作（上席のみ）',
      render: (row) => {
        const canSupervise = canSuperviseRow(row.member_id);
        if (!canSupervise) {
          return (
            <span className="rp-record-muted">
              {row.member_id === viewer.memberId ? '－（自分の上席が操作）' : '閲覧のみ'}
            </span>
          );
        }

        const conflictPracticing =
          row.status === 'graduated' &&
          hasPracticingThemeOfSameKind(memberThemes, row.member_id, row.kind, row.id);

        return (
          <div className="rp-record-cell-stack">
            <div className="rp-record-inline-actions">
              {row.status === 'practicing' && (
                <Button
                  variant="primary"
                  disabled={working}
                  onClick={() => handleGraduateRow(row)}
                >
                  卒業にする
                </Button>
              )}
              {row.status === 'graduated' && !conflictPracticing && (
                <Button
                  variant="secondary"
                  disabled={working}
                  onClick={() => handleReturnToPracticing(row)}
                >
                  練習中に戻す
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={working}
                onClick={() => handleStartEditRow(row)}
              >
                直す
              </Button>
              <Button
                variant="ghost"
                disabled={working}
                onClick={() => handleHideRow(row)}
              >
                消す
              </Button>
            </div>
            {conflictPracticing && (
              <NoticeBox tone="warn">
                同じ内容（{ROLEPLAY_KIND_LABELS[row.kind]}）で練習中のテーマがあるため、「練習中に戻す」ことはできません。
              </NoticeBox>
            )}
          </div>
        );
      },
    },
  ];

  const editingTargetRow = useMemo(
    () => memberThemes.find((mt) => mt.id === editingRowId) ?? null,
    [memberThemes, editingRowId],
  );

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

      {/* 卒業の知らせ（テーマ表の画面の上に件数つきで出す） */}
      <section className="panel" aria-label="卒業の知らせと注意">
        <div className="section-header-row">
          <h2 className="section-title">卒業の知らせ・確認のロープレ・注意</h2>
          <span className="count-label">
            設定基準：○{settings.roleplay_graduate_count}回連続で卒業候補 ／ 卒業後
            {settings.roleplay_check_days}日で確認 ／ {settings.roleplay_alert_days}日以上練習中で注意 ／ 1回
            {settings.roleplay_alert_minutes}分超で確認
          </span>
        </div>

        <div className="rp-record-notice-grid">
          {/* 1. 卒業の候補 */}
          <div className="rp-record-notice-card rp-record-notice-card--good">
            <div className="rp-record-notice-head">
              <span className="rp-record-notice-label">
                卒業の候補（○が{settings.roleplay_graduate_count}回連続）
              </span>
              <span className="rp-record-notice-count">
                {noticesSummary.graduationCandidates.length}件
              </span>
            </div>
            {noticesSummary.graduationCandidates.length === 0 ? (
              <span className="rp-record-muted">現在、卒業の候補はありません。</span>
            ) : (
              <ul className="rp-record-notice-list">
                {noticesSummary.graduationCandidates.map((item) => {
                  const mt = item.memberTheme;
                  const t = themeMap.get(mt.theme_id);
                  const canSupervise = canSuperviseRow(mt.member_id);
                  return (
                    <li key={mt.id}>
                      <div className="rp-record-notice-item">
                        <span>
                          <strong>{formatMemberName(mt.member_id)}</strong>（
                          {ROLEPLAY_KIND_LABELS[mt.kind]}）：{t?.name ?? 'テーマ'}（○
                          {item.consecutivePassCount}回連続）
                        </span>
                        {canSupervise && (
                          <Button
                            variant="primary"
                            disabled={working}
                            onClick={() => handleGraduateRow(mt)}
                          >
                            卒業にする
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 2. 確認のロープレ */}
          <div className="rp-record-notice-card rp-record-notice-card--warn">
            <div className="rp-record-notice-head">
              <span className="rp-record-notice-label">
                確認のロープレ（卒業から{settings.roleplay_check_days}日経過）
              </span>
              <span className="rp-record-notice-count">
                {noticesSummary.checkRoleplayNotices.length}件
              </span>
            </div>
            {noticesSummary.checkRoleplayNotices.length === 0 ? (
              <span className="rp-record-muted">
                現在、確認のロープレが必要なテーマはありません。
              </span>
            ) : (
              <ul className="rp-record-notice-list">
                {noticesSummary.checkRoleplayNotices.map((item) => {
                  const mt = item.memberTheme;
                  const t = themeMap.get(mt.theme_id);
                  return (
                    <li key={mt.id}>
                      <span>
                        <strong>{formatMemberName(mt.member_id)}</strong>（
                        {ROLEPLAY_KIND_LABELS[mt.kind]}）：{t?.name ?? 'テーマ'}（確認日：
                        <DateText value={mt.check_on} />）
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 3. 注意の2つ（長期練習中・時間超過） */}
          <div className="rp-record-notice-card rp-record-notice-card--warn">
            <div className="rp-record-notice-head">
              <span className="rp-record-notice-label">
                注意（{settings.roleplay_alert_days}日以上練習中 ／ 1回
                {settings.roleplay_alert_minutes}分超）
              </span>
              <span className="rp-record-notice-count">
                {noticesSummary.longPracticingAlerts.length +
                  noticesSummary.overMinutesRoleplays.length}
                件
              </span>
            </div>
            {noticesSummary.longPracticingAlerts.length === 0 &&
            noticesSummary.overMinutesRoleplays.length === 0 ? (
              <span className="rp-record-muted">現在、注意対象の項目はありません。</span>
            ) : (
              <ul className="rp-record-notice-list">
                {noticesSummary.longPracticingAlerts.map((item) => {
                  const mt = item.memberTheme;
                  const t = themeMap.get(mt.theme_id);
                  return (
                    <li key={`long-${mt.id}`}>
                      <span>
                        <strong>{formatMemberName(mt.member_id)}</strong>（
                        {ROLEPLAY_KIND_LABELS[mt.kind]}）：{t?.name ?? 'テーマ'}（
                        {item.practicingDays}日間練習中）
                      </span>
                    </li>
                  );
                })}
                {noticesSummary.overMinutesRoleplays.map((rp) => {
                  const t = themeMap.get(rp.theme_id);
                  return (
                    <li key={`over-${rp.id}`}>
                      <span>
                        <strong>{formatMemberName(rp.member_id)}</strong>（
                        <DateText value={rp.date} />）：{t?.name ?? 'テーマ'}（1回{rp.minutes}
                        分・確認）
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* 上席のみ：練習中のテーマを足す */}
      {supervisedMembers.length > 0 && (
        <section className="panel" aria-label="練習中のテーマを足す">
          <h2 className="section-title">練習中のテーマを足す（上席のみ）</h2>
          <div className="rp-record-form-grid">
            <SelectField
              id="mt-add-member"
              label="課員"
              hint="担当の課員から選ぶ"
              placeholder="課員を選んでください"
              value={selectedMemberId}
              onChange={(e) => {
                setSelectedMemberId(e.target.value);
                if (!selectedThemeId && activeThemesForSelectedKind.length > 0) {
                  setSelectedThemeId(activeThemesForSelectedKind[0].id);
                  setPassLine(activeThemesForSelectedKind[0].pass_example);
                }
              }}
              options={supervisedMembers.map((m) => ({
                value: m.id,
                label: m.name,
              }))}
            />
            <SelectField
              id="mt-add-kind"
              label="内容（アポ／営業）"
              hint="練習中はアポと営業で1つずつまで"
              value={selectedKind}
              onChange={(e) => handleSelectKindForAdd(e.target.value as RoleplayKind)}
              options={[
                { value: 'apo', label: 'アポ' },
                { value: 'sales', label: '営業' },
              ]}
            />
            <InputField
              id="mt-add-started-on"
              type="date"
              label="開始日"
              value={startedOn}
              onChange={(e) => setStartedOn(e.target.value)}
            />
          </div>

          {alreadyPracticingForAdd ? (
            <NoticeBox tone="warn" title="同じ内容で練習中のテーマがあります">
              この課員にはすでに「{ROLEPLAY_KIND_LABELS[selectedKind]}
              」で練習中のテーマがあります（練習中はアポと営業で1つずつまでです）。現在のテーマを卒業にするか見えなくするまで、同じ内容のテーマは足せません。
            </NoticeBox>
          ) : (
            <>
              <div className="rp-record-form-grid-2">
                <SelectField
                  id="mt-add-theme"
                  label="テーマ"
                  placeholder="テーマを選んでください"
                  value={selectedThemeId || activeThemesForSelectedKind[0]?.id || ''}
                  onChange={(e) => handleSelectThemeForAdd(e.target.value)}
                  options={activeThemesForSelectedKind.map((t) => ({
                    value: t.id,
                    label: `段階${t.stage}（#${t.no}）：${t.name}`,
                  }))}
                />
                <InputField
                  id="mt-add-pass-line"
                  label="合格ライン"
                  hint="テーマの例が自動で入ります（編集可）"
                  placeholder="ここまでできたら合格の基準"
                  value={passLine}
                  onChange={(e) => setPassLine(e.target.value)}
                />
              </div>
              <div className="rp-record-button-row">
                <Button
                  variant="primary"
                  disabled={working}
                  onClick={handleAddMemberTheme}
                >
                  テーマを足す
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {/* 上席のみ：選択した行を直すパネル */}
      {editingTargetRow && canSuperviseRow(editingTargetRow.member_id) && (
        <section className="panel" aria-label="テーマ表の行を直す">
          <h2 className="section-title">
            テーマを直す：{formatMemberName(editingTargetRow.member_id)}（
            {ROLEPLAY_KIND_LABELS[editingTargetRow.kind]}）
          </h2>
          <div className="rp-record-form-grid">
            <SelectField
              id="mt-edit-theme"
              label="テーマ"
              value={editThemeId}
              onChange={(e) => setEditThemeId(e.target.value)}
              options={themes
                .filter(
                  (t) =>
                    t.kind === editingTargetRow.kind &&
                    (t.is_active || t.id === editingTargetRow.theme_id),
                )
                .map((t) => ({
                  value: t.id,
                  label: `段階${t.stage}（#${t.no}）：${t.name}`,
                }))}
            />
            <InputField
              id="mt-edit-started-on"
              type="date"
              label="開始日"
              value={editStartedOn}
              onChange={(e) => setEditStartedOn(e.target.value)}
            />
            <InputField
              id="mt-edit-pass-line"
              label="合格ライン"
              value={editPassLine}
              onChange={(e) => setEditPassLine(e.target.value)}
            />
          </div>
          <div className="rp-record-button-row">
            <Button
              variant="primary"
              disabled={working}
              onClick={() => handleSaveEditRow(editingTargetRow)}
            >
              変更を保存する
            </Button>
            <Button
              variant="secondary"
              disabled={working}
              onClick={() => setEditingRowId(null)}
            >
              キャンセル
            </Button>
          </div>
        </section>
      )}

      {/* テーマ表の一覧 */}
      <section className="panel" aria-label="テーマ表の一覧">
        <div className="section-header-row">
          <h2 className="section-title">テーマ表（課員ごとの練習中・卒業のテーマ）</h2>
          <span className="count-label">
            {visibleMemberThemes.length}件（全
            {memberThemes.filter((m) => m.hidden_at === null).length}件）
          </span>
        </div>

        <div className="filter-bar">
          <SelectField
            id="mt-filter-member"
            label="課員で絞り込む"
            placeholder="すべての課員"
            value={filterMemberId}
            onChange={(e) => setFilterMemberId(e.target.value)}
            options={filterMemberOptions}
          />
          <SelectField
            id="mt-filter-status"
            label="状態で絞り込む"
            placeholder="すべての状態"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            options={[
              { value: 'practicing', label: '練習中' },
              { value: 'graduated', label: '卒業' },
            ]}
          />
          {(filterMemberId || filterStatus) && (
            <div className="filter-bar-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setFilterMemberId('');
                  setFilterStatus('');
                }}
              >
                条件をクリア
              </Button>
            </div>
          )}
        </div>

        <DataTable
          columns={columns}
          rows={visibleMemberThemes}
          rowKey={(row) => row.id}
          emptyMessage="該当するテーマ表の行はありません。"
        />
      </section>
    </div>
  );
}
