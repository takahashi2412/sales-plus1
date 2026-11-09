import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  DataTable,
  DateText,
  InputField,
  NoticeBox,
  Tag,
  type TableColumn,
  TextareaField,
} from '../../../components/ui';
import { getTodayJstDateString } from '../../../foundation/directory';
import type { MemberRow } from '../../../foundation/types';
import {
  canCreateSeminar,
  fetchSeminars,
  fetchViewerContext,
  type SeminarMemberRow,
  type SeminarRow,
  type ViewerContext,
} from '../shared';
import {
  addOrRestoreSeminarParticipant,
  createSeminarWithMembers,
  fetchAllSeminarMembers,
  fetchMembersForSeminars,
  hideSeminar,
  removeSeminarParticipant,
  updateSeminarWithMembers,
} from './api';
import {
  canEditSeminar,
  formatSeminarMemberName,
  pickSeminarCandidateMembers,
  sortSeminars,
} from './logic';
import './seminar.css';

export function RoleplaySeminarPage() {
  const [viewer, setViewer] = useState<ViewerContext | null>(null);
  const [seminars, setSeminars] = useState<SeminarRow[]>([]);
  const [seminarMembers, setSeminarMembers] = useState<SeminarMemberRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 追加フォームの状態
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addDate, setAddDate] = useState(() => getTodayJstDateString());
  const [addTheme, setAddTheme] = useState('');
  const [addLecturer, setAddLecturer] = useState('');
  const [addMinutes, setAddMinutes] = useState('45');
  const [addContent, setAddContent] = useState('');
  const [addParticipantIds, setAddParticipantIds] = useState<string[]>([]);

  // 編集フォームの状態
  const [editingSeminar, setEditingSeminar] = useState<SeminarRow | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTheme, setEditTheme] = useState('');
  const [editLecturer, setEditLecturer] = useState('');
  const [editMinutes, setEditMinutes] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editParticipantIds, setEditParticipantIds] = useState<string[]>([]);

  // 行ごとの参加者追加用選択値
  const [inlineAddMemberBySeminar, setInlineAddMemberBySeminar] = useState<
    Record<string, string>
  >({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [viewerRes, seminarsRes, seminarMembersRes, membersRes] = await Promise.all([
        fetchViewerContext(),
        fetchSeminars(),
        fetchAllSeminarMembers(),
        fetchMembersForSeminars(),
      ]);
      setViewer(viewerRes);
      setSeminars(seminarsRes);
      setSeminarMembers(seminarMembersRes);
      setMembers(membersRes);
    } catch {
      setErrorMessage('データの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.id, m.name);
    }
    return map;
  }, [members]);

  const candidateMembers = useMemo(
    () => pickSeminarCandidateMembers(members),
    [members],
  );

  const sortedSeminars = useMemo(() => sortSeminars(seminars), [seminars]);

  const seminarMembersBySeminarMap = useMemo(() => {
    const map = new Map<string, SeminarMemberRow[]>();
    for (const row of seminarMembers) {
      const list = map.get(row.seminar_id) ?? [];
      list.push(row);
      map.set(row.seminar_id, list);
    }
    return map;
  }, [seminarMembers]);

  const canCreate = useMemo(
    () => (viewer ? canCreateSeminar(viewer) : false),
    [viewer],
  );

  const toggleMemberSelection = (
    currentIds: string[],
    memberId: string,
    setter: (next: string[]) => void,
  ) => {
    if (currentIds.includes(memberId)) {
      setter(currentIds.filter((id) => id !== memberId));
    } else {
      setter([...currentIds, memberId]);
    }
  };

  const handleOpenAdd = () => {
    setErrorMessage(null);
    setNoticeMessage(null);
    setEditingSeminar(null);
    setAddDate(getTodayJstDateString());
    setAddTheme('');
    setAddLecturer(viewer ? (memberNameMap.get(viewer.memberId) ?? '') : '');
    setAddMinutes('45');
    setAddContent('');
    setAddParticipantIds([]);
    setIsAddOpen(true);
  };

  const handleOpenEdit = (seminar: SeminarRow) => {
    setErrorMessage(null);
    setNoticeMessage(null);
    setIsAddOpen(false);
    const rows = seminarMembersBySeminarMap.get(seminar.id) ?? [];
    const activeIds = rows.filter((r) => r.removed_at === null).map((r) => r.member_id);
    setEditingSeminar(seminar);
    setEditDate(seminar.date);
    setEditTheme(seminar.theme);
    setEditLecturer(seminar.lecturer);
    setEditMinutes(String(seminar.minutes));
    setEditContent(seminar.content);
    setEditParticipantIds(activeIds);
  };

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!viewer) return;
    const minutesNum = Number(addMinutes);
    if (!addDate || !addTheme.trim() || !addLecturer.trim() || !Number.isFinite(minutesNum) || minutesNum <= 0) {
      setErrorMessage('日付・テーマ・講師・時間（正の整数）を入力してください。');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await createSeminarWithMembers(
        {
          date: addDate,
          theme: addTheme,
          lecturer: addLecturer,
          minutes: Math.round(minutesNum),
          content: addContent,
          created_by: viewer.memberId,
        },
        addParticipantIds,
      );
      setIsAddOpen(false);
      setNoticeMessage('研修の記録を追加しました。');
      await loadAll();
    } catch {
      setErrorMessage('この操作はできません');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingSeminar) return;
    const minutesNum = Number(editMinutes);
    if (!editDate || !editTheme.trim() || !editLecturer.trim() || !Number.isFinite(minutesNum) || minutesNum <= 0) {
      setErrorMessage('日付・テーマ・講師・時間（正の整数）を入力してください。');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      const existingRows = seminarMembersBySeminarMap.get(editingSeminar.id) ?? [];
      await updateSeminarWithMembers(
        editingSeminar.id,
        {
          date: editDate,
          theme: editTheme,
          lecturer: editLecturer,
          minutes: Math.round(minutesNum),
          content: editContent,
        },
        existingRows,
        editParticipantIds,
      );
      setEditingSeminar(null);
      setNoticeMessage('研修の記録を更新しました。');
      await loadAll();
    } catch {
      setErrorMessage('この操作はできません');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInlineAddParticipant = async (seminarId: string) => {
    const memberId = inlineAddMemberBySeminar[seminarId];
    if (!memberId) return;

    setSubmitting(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      const existingRows = seminarMembersBySeminarMap.get(seminarId) ?? [];
      await addOrRestoreSeminarParticipant(seminarId, memberId, existingRows);
      setInlineAddMemberBySeminar((prev) => ({ ...prev, [seminarId]: '' }));
      setNoticeMessage('参加者を追加しました。');
      await loadAll();
    } catch {
      setErrorMessage('この操作はできません');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInlineRemoveParticipant = async (seminarId: string, memberId: string) => {
    setSubmitting(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await removeSeminarParticipant(seminarId, memberId);
      setNoticeMessage('参加者を外しました。');
      await loadAll();
    } catch {
      setErrorMessage('この操作はできません');
    } finally {
      setSubmitting(false);
    }
  };

  const handleHideSeminar = async (seminar: SeminarRow) => {
    setSubmitting(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await hideSeminar(seminar.id);
      if (editingSeminar?.id === seminar.id) {
        setEditingSeminar(null);
      }
      setNoticeMessage(`研修「${seminar.theme}」を見えなくしました。`);
      await loadAll();
    } catch {
      setErrorMessage('この操作はできません');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: TableColumn<SeminarRow>[] = [
    {
      key: 'date',
      header: '日付・時間',
      className: 'rp-seminar-col-date',
      render: (row) => (
        <div className="rp-seminar-meta-stack">
          <DateText value={row.date} withWeekday />
          <span className="rp-seminar-meta-sub">{row.minutes}分</span>
        </div>
      ),
    },
    {
      key: 'theme',
      header: 'テーマ・講師',
      className: 'rp-seminar-col-theme',
      render: (row) => (
        <div className="rp-seminar-meta-stack">
          <strong>{row.theme}</strong>
          {row.is_legacy && (
            <div>
              <Tag tone="warn">過去の記録（見るだけ）</Tag>
            </div>
          )}
          <span className="rp-seminar-meta-sub">
            講師：{row.lecturer}（記録者：{formatSeminarMemberName(row.created_by, memberNameMap)}）
          </span>
        </div>
      ),
    },
    {
      key: 'content',
      header: '内容',
      className: 'rp-seminar-col-content',
      render: (row) => (
        <div className="rp-seminar-content-block">{row.content || '－'}</div>
      ),
    },
    {
      key: 'participants',
      header: '参加者',
      className: 'rp-seminar-col-participants',
      render: (row) => {
        const allRows = seminarMembersBySeminarMap.get(row.id) ?? [];
        const activeRows = allRows.filter((r) => r.removed_at === null);
        const activeIdSet = new Set(activeRows.map((r) => r.member_id));
        const isCreator = viewer ? canEditSeminar(viewer, row.created_by, Boolean(row.is_legacy)) : false;

        const addableCandidates = candidateMembers.filter(
          (m) => !activeIdSet.has(m.id),
        );
        const selectedInlineMemberId = inlineAddMemberBySeminar[row.id] ?? '';

        return (
          <div className="rp-seminar-participants-cell">
            <div className="rp-seminar-participant-chips">
              {activeRows.length === 0 ? (
                <span className="rp-seminar-meta-sub">参加者なし</span>
              ) : (
                activeRows.map((sm) => (
                  <span key={sm.member_id} className="rp-seminar-participant-item">
                    <Tag tone="navy">
                      {formatSeminarMemberName(sm.member_id, memberNameMap)}
                    </Tag>
                    {isCreator && (
                      <button
                        type="button"
                        className="rp-seminar-inline-remove-btn"
                        disabled={submitting}
                        onClick={() =>
                          void handleInlineRemoveParticipant(row.id, sm.member_id)
                        }
                      >
                        外す
                      </button>
                    )}
                  </span>
                ))
              )}
            </div>

            {isCreator && addableCandidates.length > 0 && (
              <div className="rp-seminar-inline-add-row">
                <select
                  aria-label={`${row.theme}に参加者を足す`}
                  className="rp-seminar-inline-select"
                  value={selectedInlineMemberId}
                  onChange={(e) =>
                    setInlineAddMemberBySeminar((prev) => ({
                      ...prev,
                      [row.id]: e.target.value,
                    }))
                  }
                >
                  <option value="">追加する参加者を選ぶ</option>
                  {addableCandidates.map((m) => {
                    const wasRemoved = allRows.some(
                      (r) => r.member_id === m.id && r.removed_at !== null,
                    );
                    return (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {wasRemoved ? '（外した人を戻す）' : ''}
                      </option>
                    );
                  })}
                </select>
                <Button
                  variant="secondary"
                  className="rp-seminar-small-btn"
                  disabled={submitting || !selectedInlineMemberId}
                  onClick={() => void handleInlineAddParticipant(row.id)}
                >
                  参加者を足す
                </Button>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '操作',
      className: 'rp-seminar-col-actions',
      render: (row) => {
        if (row.is_legacy) {
          return <span className="rp-seminar-meta-sub">過去の記録（見るだけ）</span>;
        }
        if (!viewer || !canEditSeminar(viewer, row.created_by, Boolean(row.is_legacy))) {
          return '－';
        }
        return (
          <div className="rp-seminar-row-actions">
            <Button
              variant="secondary"
              className="rp-seminar-small-btn"
              disabled={submitting}
              onClick={() => handleOpenEdit(row)}
            >
              直す
            </Button>
            <Button
              variant="ghost"
              className="rp-seminar-small-btn"
              disabled={submitting}
              onClick={() => void handleHideSeminar(row)}
            >
              見えなくする
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="rp-seminar-page">
      <NoticeBox tone="info" title="研修の記録">
        複数人が参加する研修を記録します。参加した本人（外されていない人）は自分が参加した研修を、リーダー・MGR・代表はすべての研修を見られます。
      </NoticeBox>

      {errorMessage && (
        <NoticeBox tone="alert" role="alert" title="操作の確認">
          {errorMessage}
        </NoticeBox>
      )}

      {noticeMessage && (
        <NoticeBox tone="good" role="status" title="完了">
          {noticeMessage}
        </NoticeBox>
      )}

      {isAddOpen && canCreate && (
        <section className="panel" aria-label="研修を足す">
          <h2 className="section-title">研修を足す</h2>
          <form onSubmit={(e) => void handleCreateSubmit(e)}>
            <div className="rp-seminar-form-grid">
              <InputField
                id="seminar-add-date"
                label="日付"
                type="date"
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
                required
              />
              <InputField
                id="seminar-add-minutes"
                label="時間（分）"
                type="number"
                min={1}
                value={addMinutes}
                onChange={(e) => setAddMinutes(e.target.value)}
                required
              />
              <InputField
                id="seminar-add-theme"
                label="テーマ"
                value={addTheme}
                onChange={(e) => setAddTheme(e.target.value)}
                required
              />
              <InputField
                id="seminar-add-lecturer"
                label="講師"
                value={addLecturer}
                onChange={(e) => setAddLecturer(e.target.value)}
                required
              />
              <TextareaField
                id="seminar-add-content"
                className="rp-seminar-form-full"
                label="内容"
                rows={3}
                value={addContent}
                onChange={(e) => setAddContent(e.target.value)}
              />
              <div className="form-field rp-seminar-form-full">
                <span className="form-label">
                  参加者（複数選択可）
                  <small className="form-hint">
                    名簿で見られる人のうち退職日を過ぎていない人
                  </small>
                </span>
                <div className="rp-seminar-checkbox-grid">
                  {candidateMembers.map((m) => (
                    <label key={m.id} className="rp-seminar-checkbox-item">
                      <input
                        type="checkbox"
                        checked={addParticipantIds.includes(m.id)}
                        onChange={() =>
                          toggleMemberSelection(
                            addParticipantIds,
                            m.id,
                            setAddParticipantIds,
                          )
                        }
                      />
                      <span>{m.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="rp-seminar-form-actions">
              <Button type="submit" variant="primary" disabled={submitting}>
                記録する
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => setIsAddOpen(false)}
              >
                キャンセル
              </Button>
            </div>
          </form>
        </section>
      )}

      {editingSeminar && (
        <section className="panel" aria-label="研修を直す">
          <h2 className="section-title">研修を直す（{editingSeminar.theme}）</h2>
          <form onSubmit={(e) => void handleEditSubmit(e)}>
            <div className="rp-seminar-form-grid">
              <InputField
                id="seminar-edit-date"
                label="日付"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                required
              />
              <InputField
                id="seminar-edit-minutes"
                label="時間（分）"
                type="number"
                min={1}
                value={editMinutes}
                onChange={(e) => setEditMinutes(e.target.value)}
                required
              />
              <InputField
                id="seminar-edit-theme"
                label="テーマ"
                value={editTheme}
                onChange={(e) => setEditTheme(e.target.value)}
                required
              />
              <InputField
                id="seminar-edit-lecturer"
                label="講師"
                value={editLecturer}
                onChange={(e) => setEditLecturer(e.target.value)}
                required
              />
              <TextareaField
                id="seminar-edit-content"
                className="rp-seminar-form-full"
                label="内容"
                rows={3}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
              <div className="form-field rp-seminar-form-full">
                <span className="form-label">
                  参加者（複数選択可）
                  <small className="form-hint">
                    外した人を再度チェックすると参加者に復帰します
                  </small>
                </span>
                <div className="rp-seminar-checkbox-grid">
                  {candidateMembers.map((m) => (
                    <label key={m.id} className="rp-seminar-checkbox-item">
                      <input
                        type="checkbox"
                        checked={editParticipantIds.includes(m.id)}
                        onChange={() =>
                          toggleMemberSelection(
                            editParticipantIds,
                            m.id,
                            setEditParticipantIds,
                          )
                        }
                      />
                      <span>{m.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="rp-seminar-form-actions">
              <Button type="submit" variant="primary" disabled={submitting}>
                変更を保存する
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => setEditingSeminar(null)}
              >
                キャンセル
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="panel" aria-label="研修の記録一覧">
        <div className="rp-seminar-header-row">
          <div>
            <h2 className="section-title">研修の記録一覧</h2>
            <span className="count-label">{sortedSeminars.length}件</span>
          </div>
          {canCreate && !isAddOpen && (
            <Button variant="primary" onClick={handleOpenAdd}>
              研修を足す
            </Button>
          )}
        </div>

        {loading ? (
          <p className="lead-text">読み込み中...</p>
        ) : (
          <DataTable
            columns={columns}
            rows={sortedSeminars}
            rowKey={(row) => row.id}
            emptyMessage="見られる研修の記録はありません。"
          />
        )}
      </section>
    </div>
  );
}

export default RoleplaySeminarPage;
