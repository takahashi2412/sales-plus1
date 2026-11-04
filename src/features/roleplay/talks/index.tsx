import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  DataTable,
  NoticeBox,
  SelectField,
  Tag,
  type TagTone,
  type TableColumn,
  TextareaField,
} from '../../../components/ui';
import type { MemberRow, TeamRow } from '../../../foundation/types';
import {
  TALK_STATUS_LABELS,
  canAddTalkFromList,
  canEditTalk,
  canMoveTalkToStandard,
  canMoveTalkToTrial,
  fetchMasters,
  fetchRoleplays,
  fetchTalks,
  fetchViewerContext,
  type MasterRow,
  type RoleplayRow,
  type TalkRow,
  type TalkStatus,
  type ViewerContext,
} from '../shared';
import {
  createTalk,
  fetchMembersForTalks,
  fetchTeamsForTalks,
  hideTalk,
  updateTalkContent,
  updateTalkStatus,
} from './api';
import {
  TALK_PREFIX_LABELS,
  type TalkFilterCriteria,
  type TalkPrefix,
  buildTalkTeamOptions,
  computeTalkStatsMap,
  filterAndSortTalks,
  formatMemberDisplay,
  formatTalkTeamDisplay,
  generateTalkCode,
  getActiveMasterOptions,
  getTalkPrefix,
  getTalkStatsForId,
} from './logic';
import './talks.css';

function getStatusTagTone(status: TalkStatus): TagTone {
  if (status === 'standard') return 'good';
  if (status === 'trial') return 'navy';
  return 'warn';
}

export function RoleplayTalksPage() {
  const [viewer, setViewer] = useState<ViewerContext | null>(null);
  const [talks, setTalks] = useState<TalkRow[]>([]);
  const [masters, setMasters] = useState<MasterRow[]>([]);
  const [roleplays, setRoleplays] = useState<RoleplayRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 絞り込み条件
  const [filters, setFilters] = useState<TalkFilterCriteria>({
    sceneId: '',
    industryId: '',
    listTypeId: '',
    prefix: '',
    status: '',
  });

  // 追加フォームの状態
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addPrefix, setAddPrefix] = useState<TalkPrefix>('OUT');
  const [addTeamId, setAddTeamId] = useState<string>('');
  const [addSceneId, setAddSceneId] = useState<string>('');
  const [addIndustryId, setAddIndustryId] = useState<string>('');
  const [addListTypeId, setAddListTypeId] = useState<string>('');
  const [addTheirWords, setAddTheirWords] = useState<string>('');
  const [addWording, setAddWording] = useState<string>('');
  const [addAim, setAddAim] = useState<string>('');

  // 編集フォームの状態
  const [editingTalk, setEditingTalk] = useState<TalkRow | null>(null);
  const [editTeamId, setEditTeamId] = useState<string>('');
  const [editSceneId, setEditSceneId] = useState<string>('');
  const [editIndustryId, setEditIndustryId] = useState<string>('');
  const [editListTypeId, setEditListTypeId] = useState<string>('');
  const [editTheirWords, setEditTheirWords] = useState<string>('');
  const [editWording, setEditWording] = useState<string>('');
  const [editAim, setEditAim] = useState<string>('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [viewerRes, mastersRes, talksRes, roleplaysRes, teamsRes, membersRes] =
        await Promise.all([
          fetchViewerContext(),
          fetchMasters(),
          fetchTalks(),
          fetchRoleplays(),
          fetchTeamsForTalks(),
          fetchMembersForTalks(),
        ]);
      setViewer(viewerRes);
      setMasters(mastersRes);
      setTalks(talksRes);
      setRoleplays(roleplaysRes);
      setTeams(teamsRes);
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

  const masterNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of masters) {
      map.set(m.id, m.name);
    }
    return map;
  }, [masters]);

  const teamNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teams) {
      map.set(t.id, t.name);
    }
    return map;
  }, [teams]);

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.id, m.name);
    }
    return map;
  }, [members]);

  const statsMap = useMemo(() => computeTalkStatsMap(roleplays), [roleplays]);

  const filteredTalks = useMemo(
    () => filterAndSortTalks(talks, filters, masters),
    [talks, filters, masters],
  );

  const sceneFilterOptions = useMemo(
    () => getActiveMasterOptions(masters, 'scene'),
    [masters],
  );
  const industryFilterOptions = useMemo(
    () => getActiveMasterOptions(masters, 'industry'),
    [masters],
  );
  const listTypeFilterOptions = useMemo(
    () => getActiveMasterOptions(masters, 'list_type'),
    [masters],
  );

  const canAdd = useMemo(
    () => (viewer ? canAddTalkFromList(viewer, teams) : false),
    [viewer, teams],
  );

  const addTeamOptions = useMemo(
    () => (viewer ? buildTalkTeamOptions(viewer, teams, null, false) : []),
    [viewer, teams],
  );

  const editTeamOptions = useMemo(
    () =>
      viewer && editingTalk
        ? buildTalkTeamOptions(viewer, teams, editingTalk.team_id, true)
        : [],
    [viewer, teams, editingTalk],
  );

  const handleOpenAdd = () => {
    setErrorMessage(null);
    setNoticeMessage(null);
    setEditingTalk(null);
    const defaultTeamVal = addTeamOptions[0]?.value ?? '';
    setAddPrefix('OUT');
    setAddTeamId(defaultTeamVal);
    setAddSceneId('');
    setAddIndustryId('');
    setAddListTypeId('');
    setAddTheirWords('');
    setAddWording('');
    setAddAim('');
    setIsAddOpen(true);
  };

  const handleOpenEdit = (talk: TalkRow) => {
    setErrorMessage(null);
    setNoticeMessage(null);
    setIsAddOpen(false);
    setEditingTalk(talk);
    setEditTeamId(talk.team_id ?? '');
    setEditSceneId(talk.scene_id ?? '');
    setEditIndustryId(talk.industry_id ?? '');
    setEditListTypeId(talk.list_type_id ?? '');
    setEditTheirWords(talk.their_words);
    setEditWording(talk.wording);
    setEditAim(talk.aim);
  };

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!viewer) return;
    if (!addWording.trim()) {
      setErrorMessage('言い方（台本）を入力してください。');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      const code = generateTalkCode(addPrefix);
      await createTalk({
        code,
        scene_id: addSceneId || null,
        industry_id: addIndustryId || null,
        list_type_id: addListTypeId || null,
        their_words: addTheirWords,
        wording: addWording,
        aim: addAim,
        team_id: addTeamId || null,
        created_by: viewer.memberId,
      });
      setIsAddOpen(false);
      setNoticeMessage(`新しいトーク（${code}）を確認待ちで追加しました。`);
      await loadAll();
    } catch {
      setErrorMessage('この操作はできません');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingTalk) return;
    if (!editWording.trim()) {
      setErrorMessage('言い方（台本）を入力してください。');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await updateTalkContent(editingTalk.id, {
        scene_id: editSceneId || null,
        industry_id: editIndustryId || null,
        list_type_id: editListTypeId || null,
        their_words: editTheirWords,
        wording: editWording,
        aim: editAim,
        team_id: editTeamId || null,
      });
      const updatedCode = editingTalk.code;
      setEditingTalk(null);
      setNoticeMessage(`トーク（${updatedCode}）を更新しました。`);
      await loadAll();
    } catch {
      setErrorMessage('この操作はできません');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (talk: TalkRow, nextStatus: 'trial' | 'standard') => {
    setSubmitting(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await updateTalkStatus(talk.id, nextStatus);
      setNoticeMessage(
        `トーク（${talk.code}）を「${TALK_STATUS_LABELS[nextStatus]}」に変更しました。`,
      );
      await loadAll();
    } catch {
      setErrorMessage('この操作はできません');
    } finally {
      setSubmitting(false);
    }
  };

  const handleHideTalk = async (talk: TalkRow) => {
    setSubmitting(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await hideTalk(talk.id);
      if (editingTalk?.id === talk.id) {
        setEditingTalk(null);
      }
      setNoticeMessage(`トーク（${talk.code}）を見えなくしました。`);
      await loadAll();
    } catch {
      setErrorMessage('この操作はできません');
    } finally {
      setSubmitting(false);
    }
  };

  const hasActiveFilters = Boolean(
    filters.sceneId ||
      filters.industryId ||
      filters.listTypeId ||
      filters.prefix ||
      filters.status,
  );

  const columns: TableColumn<TalkRow>[] = [
    {
      key: 'code',
      header: 'コード・種類',
      render: (row) => {
        const prefix = getTalkPrefix(row.code);
        return (
          <div className="rp-talks-meta-stack">
            <span className="rp-talks-code-cell">{row.code}</span>
            <Tag tone="plain">{TALK_PREFIX_LABELS[prefix]}</Tag>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: '状態',
      render: (row) => (
        <Tag tone={getStatusTagTone(row.status)}>{TALK_STATUS_LABELS[row.status]}</Tag>
      ),
    },
    {
      key: 'classification',
      header: '場面・業種・リスト',
      render: (row) => (
        <div className="rp-talks-meta-stack">
          <div>
            <strong>場面：</strong>
            {row.scene_id ? (masterNameMap.get(row.scene_id) ?? '－') : '－'}
          </div>
          <div className="rp-talks-meta-sub">
            業種：{row.industry_id ? (masterNameMap.get(row.industry_id) ?? '－') : '－'} ／ リスト：
            {row.list_type_id ? (masterNameMap.get(row.list_type_id) ?? '－') : '－'}
          </div>
        </div>
      ),
    },
    {
      key: 'their_words',
      header: '相手の言葉・場面',
      render: (row) => (
        <div className="rp-talks-text-block">{row.their_words || '－'}</div>
      ),
    },
    {
      key: 'wording',
      header: '言い方・ねらい',
      render: (row) => (
        <div className="rp-talks-meta-stack">
          <div className="rp-talks-text-block">{row.wording || '－'}</div>
          {row.aim && <div className="rp-talks-meta-sub">ねらい：{row.aim}</div>}
        </div>
      ),
    },
    {
      key: 'team_creator',
      header: 'チーム・作成者',
      render: (row) => (
        <div className="rp-talks-meta-stack">
          <div>{formatTalkTeamDisplay(row.team_id, teamNameMap)}</div>
          <div className="rp-talks-meta-sub">
            作成：{formatMemberDisplay(row.created_by, memberNameMap)}
          </div>
        </div>
      ),
    },
    {
      key: 'stats',
      header: '練習回数・合格率',
      render: (row) => {
        const stats = getTalkStatsForId(statsMap, row.id);
        return (
          <div className="rp-talks-meta-stack">
            <span className="rp-talks-stats-cell">{stats.practiceCount}回</span>
            <span className="rp-talks-meta-sub">合格率：{stats.passRateText}</span>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '操作',
      render: (row) => {
        if (!viewer) return '－';
        const showToTrial =
          row.status === 'pending' && canMoveTalkToTrial(viewer, row.team_id);
        const showToStandard =
          row.status === 'trial' && canMoveTalkToStandard(viewer);
        const showEdit = canEditTalk(viewer, {
          createdBy: row.created_by,
          status: row.status,
          teamId: row.team_id,
        });

        if (!showToTrial && !showToStandard && !showEdit) {
          return '－';
        }

        return (
          <div className="rp-talks-row-actions">
            {showToTrial && (
              <Button
                variant="primary"
                className="rp-talks-small-btn"
                disabled={submitting}
                onClick={() => void handleStatusChange(row, 'trial')}
              >
                試行中にする
              </Button>
            )}
            {showToStandard && (
              <Button
                variant="primary"
                className="rp-talks-small-btn"
                disabled={submitting}
                onClick={() => void handleStatusChange(row, 'standard')}
              >
                標準にする
              </Button>
            )}
            {showEdit && (
              <>
                <Button
                  variant="secondary"
                  className="rp-talks-small-btn"
                  disabled={submitting}
                  onClick={() => handleOpenEdit(row)}
                >
                  直す
                </Button>
                <Button
                  variant="ghost"
                  className="rp-talks-small-btn"
                  disabled={submitting}
                  onClick={() => void handleHideTalk(row)}
                >
                  見えなくする
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="rp-talks-page">
      <NoticeBox tone="info" title="トーク一覧と集計の範囲">
        新しい言い方は「確認待ち → 試行中 → 標準」の2段階で確かめます。練習回数と合格率は、
        <strong>あなたが見られる記録から数えています</strong>。
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

      {isAddOpen && canAdd && (
        <section className="panel" aria-label="トークを足す">
          <h2 className="section-title">トークを足す（確認待ちで登録）</h2>
          <form onSubmit={(e) => void handleCreateSubmit(e)}>
            <div className="rp-talks-form-grid">
              <SelectField
                id="talk-add-prefix"
                label="種類"
                value={addPrefix}
                onChange={(e) => setAddPrefix(e.target.value as TalkPrefix)}
                options={[
                  { value: 'OUT', label: '返し（OUT-）' },
                  { value: 'SC', label: 'スクリプト（SC-）' },
                ]}
              />
              <SelectField
                id="talk-add-team"
                label="チーム"
                value={addTeamId}
                onChange={(e) => setAddTeamId(e.target.value)}
                options={addTeamOptions}
              />
              <SelectField
                id="talk-add-scene"
                label="場面"
                placeholder="選択なし"
                value={addSceneId}
                onChange={(e) => setAddSceneId(e.target.value)}
                options={sceneFilterOptions}
              />
              <SelectField
                id="talk-add-industry"
                label="業種"
                placeholder="選択なし"
                value={addIndustryId}
                onChange={(e) => setAddIndustryId(e.target.value)}
                options={industryFilterOptions}
              />
              <SelectField
                id="talk-add-list-type"
                label="リストの種類"
                placeholder="選択なし"
                value={addListTypeId}
                onChange={(e) => setAddListTypeId(e.target.value)}
                options={listTypeFilterOptions}
              />
              <TextareaField
                id="talk-add-their-words"
                className="rp-talks-form-full"
                label="相手の言葉・場面"
                rows={2}
                value={addTheirWords}
                onChange={(e) => setAddTheirWords(e.target.value)}
              />
              <TextareaField
                id="talk-add-wording"
                className="rp-talks-form-full"
                label="言い方・台本"
                hint="必須"
                rows={3}
                value={addWording}
                onChange={(e) => setAddWording(e.target.value)}
                required
              />
              <TextareaField
                id="talk-add-aim"
                className="rp-talks-form-full"
                label="ねらい"
                rows={2}
                value={addAim}
                onChange={(e) => setAddAim(e.target.value)}
              />
            </div>
            <div className="rp-talks-form-actions">
              <Button type="submit" variant="primary" disabled={submitting}>
                確認待ちで追加する
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

      {editingTalk && (
        <section className="panel" aria-label="トークを直す">
          <h2 className="section-title">トークを直す（{editingTalk.code}）</h2>
          <form onSubmit={(e) => void handleEditSubmit(e)}>
            <div className="rp-talks-form-grid">
              <SelectField
                id="talk-edit-team"
                label="チーム"
                value={editTeamId}
                onChange={(e) => setEditTeamId(e.target.value)}
                options={editTeamOptions}
              />
              <SelectField
                id="talk-edit-scene"
                label="場面"
                placeholder="選択なし"
                value={editSceneId}
                onChange={(e) => setEditSceneId(e.target.value)}
                options={getActiveMasterOptions(masters, 'scene', editingTalk.scene_id)}
              />
              <SelectField
                id="talk-edit-industry"
                label="業種"
                placeholder="選択なし"
                value={editIndustryId}
                onChange={(e) => setEditIndustryId(e.target.value)}
                options={getActiveMasterOptions(masters, 'industry', editingTalk.industry_id)}
              />
              <SelectField
                id="talk-edit-list-type"
                label="リストの種類"
                placeholder="選択なし"
                value={editListTypeId}
                onChange={(e) => setEditListTypeId(e.target.value)}
                options={getActiveMasterOptions(masters, 'list_type', editingTalk.list_type_id)}
              />
              <TextareaField
                id="talk-edit-their-words"
                className="rp-talks-form-full"
                label="相手の言葉・場面"
                rows={2}
                value={editTheirWords}
                onChange={(e) => setEditTheirWords(e.target.value)}
              />
              <TextareaField
                id="talk-edit-wording"
                className="rp-talks-form-full"
                label="言い方・台本"
                hint="必須"
                rows={3}
                value={editWording}
                onChange={(e) => setEditWording(e.target.value)}
                required
              />
              <TextareaField
                id="talk-edit-aim"
                className="rp-talks-form-full"
                label="ねらい"
                rows={2}
                value={editAim}
                onChange={(e) => setEditAim(e.target.value)}
              />
            </div>
            <div className="rp-talks-form-actions">
              <Button type="submit" variant="primary" disabled={submitting}>
                変更を保存する
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => setEditingTalk(null)}
              >
                キャンセル
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="panel" aria-label="トーク一覧">
        <div className="rp-talks-header-row">
          <div>
            <h2 className="section-title">トーク一覧</h2>
            <span className="count-label">
              {filteredTalks.length}件（全{talks.length}件） ／ あなたが見られる記録から数えています
            </span>
          </div>
          {canAdd && !isAddOpen && (
            <Button variant="primary" onClick={handleOpenAdd}>
              トークを足す
            </Button>
          )}
        </div>

        <div className="rp-talks-filter-grid">
          <SelectField
            id="talks-filter-scene"
            label="場面"
            placeholder="すべての場面"
            value={filters.sceneId}
            onChange={(e) => setFilters((prev) => ({ ...prev, sceneId: e.target.value }))}
            options={sceneFilterOptions}
          />
          <SelectField
            id="talks-filter-industry"
            label="業種"
            placeholder="すべての業種"
            value={filters.industryId}
            onChange={(e) => setFilters((prev) => ({ ...prev, industryId: e.target.value }))}
            options={industryFilterOptions}
          />
          <SelectField
            id="talks-filter-list-type"
            label="リストの種類"
            placeholder="すべてのリスト"
            value={filters.listTypeId}
            onChange={(e) => setFilters((prev) => ({ ...prev, listTypeId: e.target.value }))}
            options={listTypeFilterOptions}
          />
          <SelectField
            id="talks-filter-prefix"
            label="種類"
            placeholder="すべての種類"
            value={filters.prefix}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                prefix: (e.target.value as '' | TalkPrefix) ?? '',
              }))
            }
            options={[
              { value: 'OUT', label: '返し（OUT-）' },
              { value: 'SC', label: 'スクリプト（SC-）' },
            ]}
          />
          <SelectField
            id="talks-filter-status"
            label="状態"
            placeholder="すべての状態"
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                status: (e.target.value as '' | TalkStatus) ?? '',
              }))
            }
            options={[
              { value: 'pending', label: '確認待ち' },
              { value: 'trial', label: '試行中' },
              { value: 'standard', label: '標準' },
            ]}
          />
          {hasActiveFilters && (
            <div className="rp-talks-filter-actions">
              <Button
                variant="secondary"
                onClick={() =>
                  setFilters({
                    sceneId: '',
                    industryId: '',
                    listTypeId: '',
                    prefix: '',
                    status: '',
                  })
                }
              >
                条件をクリア
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <p className="lead-text">読み込み中...</p>
        ) : (
          <DataTable
            columns={columns}
            rows={filteredTalks}
            rowKey={(row) => row.id}
            emptyMessage="条件に一致するトークはありません。"
          />
        )}
      </section>
    </div>
  );
}

export default RoleplayTalksPage;
