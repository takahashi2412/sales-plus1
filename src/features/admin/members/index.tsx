import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ROLE_LABELS,
  getTodayJstDateString,
  isActivePeriod,
  isRetiredMember,
} from '../../../foundation/directory';
import type { MemberRole, MemberRow } from '../../../foundation/types';
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
import {
  buildMembersTemplateCsvBytes,
  buildRetirementPlan,
  buildTransferPlan,
  canEditMemberRole,
  decodeMembersCsvBytes,
  getSelectableRoles,
  validateMembersCsv,
  type MemberCsvRowValidation,
} from '../shared';
import {
  closeMgrAssignment,
  createMgrAssignment,
  createSingleMember,
  createTeam,
  executeBulkMembersImport,
  executeRetirementPlan,
  executeTransferPlan,
  fetchAdminMembersBundle,
  updateMemberProfile,
  updateTeamName,
  type AdminMembersBundle,
} from './api';

type ActiveSection = 'list' | 'add' | 'import' | 'mgr' | 'teams';
type StatusFilter = 'active' | 'retired' | 'all';
type MemberPanelMode = 'edit' | 'transfer' | 'retire';

interface EnrichedMemberRow {
  member: MemberRow;
  roleLabel: string;
  currentTeamIds: string[];
  currentTeamText: string;
  currentBaseText: string;
  mgrAssignedText: string;
  isRetired: boolean;
}

export function AdminMembersPage() {
  const [bundle, setBundle] = useState<AdminMembersBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<ActiveSection>('list');
  const [feedback, setFeedback] = useState<{ tone: 'good' | 'alert' | 'info'; text: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  // 絞り込み
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  // 一覧から開く個別操作パネル（1人を直す・異動と所属履歴・退職）
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberPanelMode, setMemberPanelMode] = useState<MemberPanelMode>('edit');

  // 1人を直す用の入力
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<MemberRole>('member');
  const [editGoesToSales, setEditGoesToSales] = useState<'true' | 'false'>('true');
  const [editHiredOn, setEditHiredOn] = useState('');

  // 異動用の入力
  const [transferTeamId, setTransferTeamId] = useState('');
  const [transferBase, setTransferBase] = useState('');
  const [transferStartDate, setTransferStartDate] = useState('');

  // 退職用の入力
  const [retireDate, setRetireDate] = useState('');

  // 1人を足す用の入力
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<MemberRole>('member');
  const [newGoesToSales, setNewGoesToSales] = useState<'true' | 'false'>('true');
  const [newHiredOn, setNewHiredOn] = useState(() => getTodayJstDateString());
  const [newTeamId, setNewTeamId] = useState('');
  const [newBase, setNewBase] = useState('');
  const [newAffStartDate, setNewAffStartDate] = useState(() => getTodayJstDateString());

  // CSV 一括取り込み用の状態
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [csvDecodedText, setCsvDecodedText] = useState<string | null>(null);
  const [approvedNewTeams, setApprovedNewTeams] = useState<string[]>([]);

  // MGR の担当用の入力
  const [mgrFilterId, setMgrFilterId] = useState<string>('');
  const [newMgrMemberId, setNewMgrMemberId] = useState<string>('');
  const [newMgrTeamId, setNewMgrTeamId] = useState<string>('');
  const [newMgrStartDate, setNewMgrStartDate] = useState<string>(() => getTodayJstDateString());
  const [newMgrEndDate, setNewMgrEndDate] = useState<string>('');
  const [closingMgrEndDates, setClosingMgrEndDates] = useState<Record<string, string>>({});

  // チーム管理用の入力
  const [newTeamNameInput, setNewTeamNameInput] = useState<string>('');
  const [editingTeamNames, setEditingTeamNames] = useState<Record<string, string>>({});

  const todayJst = useMemo(() => getTodayJstDateString(), []);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await fetchAdminMembersBundle();
      setBundle(next);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '名簿データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const viewer = bundle?.viewer ?? null;
  const teamMap = useMemo(
    () => new Map((bundle?.teams ?? []).map((t) => [t.id, t.name])),
    [bundle?.teams],
  );

  const enrichedMembers = useMemo<EnrichedMemberRow[]>(() => {
    if (!bundle) return [];
    const activeAffs = bundle.affiliations.filter((a) =>
      isActivePeriod(a.start_date, a.end_date, todayJst),
    );
    const activeMgrs = bundle.mgrAssignments.filter((ma) =>
      isActivePeriod(ma.start_date, ma.end_date, todayJst),
    );

    return [...bundle.members]
      .sort((a, b) => {
        const aRet = isRetiredMember(a.retired_on, todayJst);
        const bRet = isRetiredMember(b.retired_on, todayJst);
        if (aRet !== bRet) return aRet ? 1 : -1;
        return a.name.localeCompare(b.name, 'ja');
      })
      .map((member) => {
        const isRetired = isRetiredMember(member.retired_on, todayJst);
        const myActiveAffs = activeAffs.filter((a) => a.member_id === member.id);
        const currentTeamIds = myActiveAffs.map((a) => a.team_id);
        const teamNames = myActiveAffs
          .map((a) => teamMap.get(a.team_id))
          .filter((n): n is string => Boolean(n));
        const bases = Array.from(new Set(myActiveAffs.map((a) => a.base).filter(Boolean)));

        const mgrTeamNames = activeMgrs
          .filter((ma) => ma.mgr_member_id === member.id)
          .map((ma) => teamMap.get(ma.team_id))
          .filter((n): n is string => Boolean(n));

        return {
          member,
          roleLabel: ROLE_LABELS[member.role] ?? member.role,
          currentTeamIds,
          currentTeamText:
            teamNames.length > 0
              ? teamNames.join('・')
              : member.role === 'ceo'
                ? '全体（所属チームなし）'
                : '－',
          currentBaseText: bases.length > 0 ? bases.join('・') : '－',
          mgrAssignedText: mgrTeamNames.length > 0 ? mgrTeamNames.join('・') : '－',
          isRetired,
        };
      });
  }, [bundle, teamMap, todayJst]);

  const filteredMembers = useMemo(() => {
    return enrichedMembers.filter((item) => {
      if (statusFilter === 'active' && item.isRetired) return false;
      if (statusFilter === 'retired' && !item.isRetired) return false;
      if (roleFilter !== 'all' && item.member.role !== roleFilter) return false;
      if (teamFilter !== 'all') {
        if (teamFilter === 'none') {
          if (item.currentTeamIds.length > 0) return false;
        } else if (!item.currentTeamIds.includes(teamFilter)) {
          return false;
        }
      }
      return true;
    });
  }, [enrichedMembers, roleFilter, statusFilter, teamFilter]);

  const selectedMember = useMemo(
    () => bundle?.members.find((m) => m.id === selectedMemberId) ?? null,
    [bundle?.members, selectedMemberId],
  );

  const selectedMemberAffiliations = useMemo(() => {
    if (!bundle || !selectedMemberId) return [];
    return bundle.affiliations
      .filter((a) => a.member_id === selectedMemberId)
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
  }, [bundle, selectedMemberId]);

  const openMemberPanel = (member: MemberRow, mode: MemberPanelMode) => {
    setSelectedMemberId(member.id);
    setMemberPanelMode(mode);
    setEditName(member.name);
    setEditEmail(member.email);
    setEditRole(member.role);
    setEditGoesToSales(member.goes_to_sales ? 'true' : 'false');
    setEditHiredOn(member.hired_on);
    setTransferTeamId(bundle?.teams[0]?.id ?? '');
    setTransferBase('');
    setTransferStartDate(todayJst);
    setRetireDate(member.retired_on ?? todayJst);
    setFeedback(null);
  };

  const selectableRolesForViewer = useMemo(() => {
    if (!viewer) return [];
    return getSelectableRoles({ isAdmin: viewer.isAdmin, isCeo: viewer.isCeo });
  }, [viewer]);

  // CSV 検証結果
  const csvValidation = useMemo(() => {
    if (csvDecodedText === null || !bundle) return null;
    return validateMembersCsv(csvDecodedText, {
      existingEmails: bundle.members.map((m) => m.email),
      existingTeamNames: bundle.teams.map((t) => t.name),
      approvedNewTeamNames: approvedNewTeams,
    });
  }, [approvedNewTeams, bundle, csvDecodedText]);

  const handleDownloadTemplate = () => {
    const bytes = buildMembersTemplateCsvBytes();
    const blob = new Blob([bytes as BlobPart], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'members_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCsvFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setApprovedNewTeams([]);
    setFeedback(null);
    const buffer = await file.arrayBuffer();
    const text = decodeMembersCsvBytes(buffer);
    setCsvDecodedText(text);
  };

  const toggleApproveNewTeam = (teamName: string) => {
    setApprovedNewTeams((prev) =>
      prev.includes(teamName) ? prev.filter((t) => t !== teamName) : [...prev, teamName],
    );
  };

  const handleBulkImportSubmit = async () => {
    if (!csvValidation || !csvValidation.canImport || !bundle) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await executeBulkMembersImport({
        importRows: csvValidation.importRows,
        newTeamsToCreate: csvValidation.newTeamsToCreate,
        existingTeams: bundle.teams,
      });
      if (!res.ok) {
        setFeedback({ tone: 'alert', text: res.errorMessage });
        return;
      }
      const teamMsg =
        res.data.createdTeamsCount > 0
          ? `（新しいチーム ${res.data.createdTeamsCount} 件も作成しました）`
          : '';
      setFeedback({
        tone: 'good',
        text: `CSVから ${res.data.importedCount} 件の名簿を取り込みました${teamMsg}。`,
      });
      setCsvDecodedText(null);
      setCsvFileName('');
      setApprovedNewTeams([]);
      await reload();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSingleMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!bundle) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await createSingleMember({
        name: newName,
        email: newEmail,
        role: newRole,
        goesToSales: newGoesToSales === 'true',
        hiredOn: newHiredOn,
        teamId: newTeamId,
        base: newBase,
        affiliationStartDate: newAffStartDate,
        existingEmails: bundle.members.map((m) => m.email),
      });
      if (!res.ok) {
        setFeedback({ tone: 'alert', text: res.errorMessage });
        return;
      }
      setFeedback({
        tone: 'good',
        text: `「${newName.trim()}」さんを名簿に追加しました。足したあと、その人が Microsoft 365 で初めてログインしたときに、メールで名簿の行と結ばれます。`,
      });
      setNewName('');
      setNewEmail('');
      setNewBase('');
      await reload();
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateMemberProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!bundle || !selectedMember) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await updateMemberProfile({
        memberId: selectedMember.id,
        name: editName,
        email: editEmail,
        role: editRole,
        goesToSales: editGoesToSales === 'true',
        hiredOn: editHiredOn,
        existingMembers: bundle.members,
      });
      if (!res.ok) {
        setFeedback({ tone: 'alert', text: res.errorMessage });
        return;
      }
      const salesNotice = res.data.goesToSalesChanged
        ? ' 営業に出るを変えたため、翌月の目標から反映されます（今月の目標はそのまま）。'
        : '';
      setFeedback({
        tone: 'good',
        text: `「${editName.trim()}」さんの基本情報を更新しました。${salesNotice}`,
      });
      await reload();
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransferSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!bundle || !selectedMember) return;
    const planRes = buildTransferPlan(
      {
        memberId: selectedMember.id,
        newTeamId: transferTeamId,
        newBase: transferBase,
        newStartDate: transferStartDate,
      },
      bundle.affiliations,
    );
    if (!planRes.ok) {
      setFeedback({ tone: 'alert', text: planRes.errors.join(' ／ ') });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const execRes = await executeTransferPlan(planRes.plan);
      if (!execRes.ok) {
        setFeedback({ tone: 'alert', text: execRes.errorMessage });
        return;
      }
      setFeedback({
        tone: 'good',
        text: `「${selectedMember.name}」さんの異動を所属の履歴に記録しました（前の所属は開始日の前日で閉じました）。`,
      });
      setTransferBase('');
      await reload();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetireSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!bundle || !selectedMember || !viewer) return;
    const planRes = buildRetirementPlan({
      member: selectedMember,
      retiredOn: retireDate,
      revokedByMemberId: viewer.memberId,
      affiliations: bundle.affiliations,
      mgrAssignments: bundle.mgrAssignments,
      permissions: bundle.permissions,
    });
    if (!planRes.ok) {
      setFeedback({ tone: 'alert', text: planRes.errors.join(' ／ ') });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const execRes = await executeRetirementPlan(planRes.plan);
      if (!execRes.ok) {
        setFeedback({ tone: 'alert', text: execRes.errorMessage });
        return;
      }
      setFeedback({
        tone: 'good',
        text: `「${selectedMember.name}」さんの退職日（${planRes.plan.retiredOn}）を記録し、有効な権限・所属・MGR担当を閉じました。`,
      });
      await reload();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateMgrAssignment = async (e: FormEvent) => {
    e.preventDefault();
    if (!viewer) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await createMgrAssignment({
        mgrMemberId: newMgrMemberId,
        teamId: newMgrTeamId,
        startDate: newMgrStartDate,
        endDate: newMgrEndDate,
        assignedBy: viewer.memberId,
      });
      if (!res.ok) {
        setFeedback({ tone: 'alert', text: res.errorMessage });
        return;
      }
      setFeedback({ tone: 'good', text: 'MGRの担当を追加しました。' });
      setNewMgrEndDate('');
      await reload();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseMgrAssignment = async (assignmentId: string, startDate: string) => {
    const endDateRaw = closingMgrEndDates[assignmentId] ?? todayJst;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await closeMgrAssignment(assignmentId, startDate, endDateRaw);
      if (!res.ok) {
        setFeedback({ tone: 'alert', text: res.errorMessage });
        return;
      }
      setFeedback({ tone: 'good', text: 'MGRの担当の終わりの日を記録しました。' });
      await reload();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTeam = async (e: FormEvent) => {
    e.preventDefault();
    if (!bundle) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await createTeam(newTeamNameInput, bundle.teams);
      if (!res.ok) {
        setFeedback({ tone: 'alert', text: res.errorMessage });
        return;
      }
      setFeedback({ tone: 'good', text: `チーム「${res.data.name}」を追加しました。` });
      setNewTeamNameInput('');
      await reload();
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTeamName = async (teamId: string) => {
    if (!bundle) return;
    const nextName = editingTeamNames[teamId];
    if (nextName === undefined) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await updateTeamName(teamId, nextName, bundle.teams);
      if (!res.ok) {
        setFeedback({ tone: 'alert', text: res.errorMessage });
        return;
      }
      setFeedback({ tone: 'good', text: 'チーム名を変更しました。' });
      await reload();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section className="panel">
        <h1 className="section-title">名簿の管理</h1>
        <p className="lead-text">読み込み中...</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="panel">
        <h1 className="section-title">名簿の管理</h1>
        <NoticeBox title="読み込みエラー" tone="alert" role="alert">
          {loadError}
        </NoticeBox>
      </section>
    );
  }

  if (!viewer || !viewer.isAdmin) {
    return (
      <section className="panel">
        <h1 className="section-title">名簿の管理</h1>
        <NoticeBox title="この画面は使えません" tone="warn" role="alert">
          名簿・所属・MGRの担当・チームの管理は、管理者の権限がある人だけが使えます。
        </NoticeBox>
      </section>
    );
  }

  const mgrMembers = (bundle?.members ?? []).filter(
    (m) => m.role === 'mgr' && !isRetiredMember(m.retired_on, todayJst),
  );
  const allMgrMembers = (bundle?.members ?? []).filter((m) => m.role === 'mgr');
  const memberNameMap = new Map((bundle?.members ?? []).map((m) => [m.id, m.name]));

  const memberColumns: TableColumn<EnrichedMemberRow>[] = [
    {
      key: 'name',
      header: '名前',
      render: (r) => (
        <div>
          <strong>{r.member.name}</strong>
          <div className="form-hint">{r.member.email}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: '役割',
      render: (r) => <Tag tone="navy">{r.roleLabel}</Tag>,
    },
    {
      key: 'team',
      header: '今のチーム',
      render: (r) => r.currentTeamText,
    },
    {
      key: 'base',
      header: '拠点',
      render: (r) => r.currentBaseText,
    },
    {
      key: 'hired_on',
      header: '入社日',
      render: (r) => <DateText value={r.member.hired_on} />,
    },
    {
      key: 'goes_to_sales',
      header: '営業に出る',
      render: (r) => (r.member.goes_to_sales ? '出る' : '出ない'),
    },
    {
      key: 'retired_on',
      header: '退職日',
      render: (r) =>
        r.member.retired_on ? (
          <span>
            <DateText value={r.member.retired_on} />
            {r.isRetired ? '（退職）' : ''}
          </span>
        ) : (
          '－'
        ),
    },
    {
      key: 'mgr',
      header: 'MGRの担当',
      render: (r) => r.mgrAssignedText,
    },
    {
      key: 'actions',
      header: '操作',
      render: (r) => (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            onClick={() => openMemberPanel(r.member, 'edit')}
          >
            直す
          </Button>
          <Button
            variant="secondary"
            onClick={() => openMemberPanel(r.member, 'transfer')}
          >
            異動・履歴
          </Button>
          <Button
            variant="ghost"
            onClick={() => openMemberPanel(r.member, 'retire')}
          >
            退職
          </Button>
        </div>
      ),
    },
  ];

  const csvPreviewColumns: TableColumn<MemberCsvRowValidation>[] = [
    {
      key: 'rowNumber',
      header: '行',
      render: (r) => `${r.rowNumber}行目`,
    },
    {
      key: 'name',
      header: '名前',
      render: (r) => r.raw.name || '－',
    },
    {
      key: 'email',
      header: 'メール',
      render: (r) => r.raw.email || '－',
    },
    {
      key: 'role',
      header: '役割',
      render: (r) => r.raw.roleText || '－',
    },
    {
      key: 'goesToSales',
      header: '営業に出る',
      render: (r) => r.raw.goesToSalesText || '－',
    },
    {
      key: 'hiredOn',
      header: '入社日',
      render: (r) => r.raw.hiredOnText || '－',
    },
    {
      key: 'affiliation',
      header: 'チーム ／ 拠点 ／ 所属の開始日',
      render: (r) =>
        r.raw.teamName || r.raw.base || r.raw.affiliationStartDateText
          ? `${r.raw.teamName || '－'} ／ ${r.raw.base || '－'} ／ ${r.raw.affiliationStartDateText || '－'}`
          : '－',
    },
    {
      key: 'status',
      header: '確かめの結果',
      render: (r) =>
        r.errors.length === 0 ? (
          <Tag tone="good">OK</Tag>
        ) : (
          <div>
            <Tag tone="warn">要修正</Tag>
            <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
              {r.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        ),
    },
  ];

  const canChangeSelectedRole = selectedMember
    ? canEditMemberRole({ isAdmin: viewer.isAdmin, isCeo: viewer.isCeo }, selectedMember.role)
    : false;

  const editGoesToSalesChanged =
    selectedMember !== null && (editGoesToSales === 'true') !== selectedMember.goes_to_sales;

  const filteredMgrAssignments = (bundle?.mgrAssignments ?? []).filter((ma) =>
    mgrFilterId ? ma.mgr_member_id === mgrFilterId : true,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <section className="panel">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <h1 className="section-title">名簿の管理</h1>
            <p className="lead-text">
              名簿・所属の履歴・MGRの担当・チームを管理します（履歴は上書き・削除せず積み上げます）。
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button
              variant={activeSection === 'list' ? 'primary' : 'secondary'}
              onClick={() => {
                setActiveSection('list');
                setFeedback(null);
              }}
            >
              名簿の一覧・異動・退職
            </Button>
            <Button
              variant={activeSection === 'add' ? 'primary' : 'secondary'}
              onClick={() => {
                setActiveSection('add');
                setFeedback(null);
              }}
            >
              1人を足す
            </Button>
            <Button
              variant={activeSection === 'import' ? 'primary' : 'secondary'}
              onClick={() => {
                setActiveSection('import');
                setFeedback(null);
              }}
            >
              CSV一括取り込み
            </Button>
            <Button
              variant={activeSection === 'mgr' ? 'primary' : 'secondary'}
              onClick={() => {
                setActiveSection('mgr');
                setFeedback(null);
              }}
            >
              MGRの担当
            </Button>
            <Button
              variant={activeSection === 'teams' ? 'primary' : 'secondary'}
              onClick={() => {
                setActiveSection('teams');
                setFeedback(null);
              }}
            >
              チーム
            </Button>
          </div>
        </div>

        {feedback && (
          <div style={{ marginTop: '12px' }}>
            <NoticeBox
              tone={feedback.tone}
              role={feedback.tone === 'alert' ? 'alert' : 'status'}
            >
              {feedback.text}
            </NoticeBox>
          </div>
        )}
      </section>

      {/* 1. 名簿の一覧・1人を直す・異動・退職 */}
      {activeSection === 'list' && (
        <>
          <section className="panel">
            <h2 className="section-title">名簿の一覧（{filteredMembers.length}人）</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              <SelectField
                id="filter-team"
                label="チームで絞り込み"
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'すべてのチーム' },
                  ...(bundle?.teams ?? []).map((t) => ({ value: t.id, label: t.name })),
                  { value: 'none', label: '所属チームなし' },
                ]}
              />
              <SelectField
                id="filter-role"
                label="役割で絞り込み"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'すべての役割' },
                  { value: 'member', label: 'メンバー' },
                  { value: 'leader', label: 'リーダー' },
                  { value: 'mgr', label: 'MGR' },
                  { value: 'ceo', label: '代表' },
                ]}
              />
              <SelectField
                id="filter-status"
                label="在籍／退職で絞り込み"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                options={[
                  { value: 'active', label: '在籍中のみ' },
                  { value: 'retired', label: '退職のみ' },
                  { value: 'all', label: 'すべて（在籍＋退職）' },
                ]}
              />
            </div>

            <DataTable
              columns={memberColumns}
              rows={filteredMembers}
              rowKey={(r) => r.member.id}
              emptyMessage="条件に合う名簿の行はありません。"
            />
          </section>

          {selectedMember && (
            <section className="panel">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginBottom: '12px',
                }}
              >
                <h2 className="section-title" style={{ margin: 0 }}>
                  対象：{selectedMember.name}（{ROLE_LABELS[selectedMember.role]}）
                </h2>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Button
                    variant={memberPanelMode === 'edit' ? 'primary' : 'secondary'}
                    onClick={() => setMemberPanelMode('edit')}
                  >
                    基本情報を直す
                  </Button>
                  <Button
                    variant={memberPanelMode === 'transfer' ? 'primary' : 'secondary'}
                    onClick={() => setMemberPanelMode('transfer')}
                  >
                    異動・所属の履歴
                  </Button>
                  <Button
                    variant={memberPanelMode === 'retire' ? 'primary' : 'secondary'}
                    onClick={() => setMemberPanelMode('retire')}
                  >
                    退職の記録
                  </Button>
                  <Button variant="ghost" onClick={() => setSelectedMemberId(null)}>
                    閉じる
                  </Button>
                </div>
              </div>

              {memberPanelMode === 'edit' && (
                <form onSubmit={handleUpdateMemberProfile}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    <InputField
                      id="edit-name"
                      label="名前"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                    />
                    <InputField
                      id="edit-email"
                      label="メール"
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      required
                    />
                    {canChangeSelectedRole ? (
                      <SelectField
                        id="edit-role"
                        label="役割"
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as MemberRole)}
                        options={selectableRolesForViewer}
                      />
                    ) : (
                      <InputField
                        id="edit-role-readonly"
                        label="役割"
                        hint="（代表の役割を変えられるのは代表だけです）"
                        value={ROLE_LABELS[selectedMember.role]}
                        disabled
                      />
                    )}
                    <SelectField
                      id="edit-sales"
                      label="営業に出る"
                      value={editGoesToSales}
                      onChange={(e) => setEditGoesToSales(e.target.value as 'true' | 'false')}
                      options={[
                        { value: 'true', label: '出る' },
                        { value: 'false', label: '出ない' },
                      ]}
                    />
                    <InputField
                      id="edit-hired-on"
                      label="入社日"
                      type="date"
                      value={editHiredOn}
                      onChange={(e) => setEditHiredOn(e.target.value)}
                      required
                    />
                  </div>

                  {editGoesToSalesChanged && (
                    <div style={{ marginTop: '12px' }}>
                      <NoticeBox tone="info" role="status">
                        翌月の目標から反映されます（今月の目標はそのまま）
                      </NoticeBox>
                    </div>
                  )}

                  <div style={{ marginTop: '16px' }}>
                    <Button type="submit" disabled={submitting}>
                      基本情報を保存する
                    </Button>
                  </div>
                </form>
              )}

              {memberPanelMode === 'transfer' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 8px' }}>所属の履歴（新しい順）</h3>
                    <DataTable
                      columns={[
                        {
                          key: 'team',
                          header: 'チーム',
                          render: (a) => teamMap.get(a.team_id) ?? '－',
                        },
                        {
                          key: 'base',
                          header: '拠点',
                          render: (a) => a.base,
                        },
                        {
                          key: 'start_date',
                          header: '開始日',
                          render: (a) => <DateText value={a.start_date} />,
                        },
                        {
                          key: 'end_date',
                          header: '終わりの日',
                          render: (a) =>
                            a.end_date ? <DateText value={a.end_date} /> : '現在（継続中）',
                        },
                      ]}
                      rows={selectedMemberAffiliations}
                      rowKey={(a) => a.id}
                      emptyMessage="所属の履歴はありません。"
                    />
                  </div>

                  <form onSubmit={handleTransferSubmit}>
                    <h3 style={{ margin: '0 0 8px' }}>
                      新しい所属（異動）を足す（今の所属の終わりの日は開始日の前日になります）
                    </h3>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '12px',
                      }}
                    >
                      <SelectField
                        id="transfer-team"
                        label="新しいチーム"
                        value={transferTeamId}
                        onChange={(e) => setTransferTeamId(e.target.value)}
                        placeholder="チームを選択"
                        options={(bundle?.teams ?? []).map((t) => ({
                          value: t.id,
                          label: t.name,
                        }))}
                        required
                      />
                      <InputField
                        id="transfer-base"
                        label="新しい拠点"
                        value={transferBase}
                        onChange={(e) => setTransferBase(e.target.value)}
                        placeholder="例：東京"
                        required
                      />
                      <InputField
                        id="transfer-start"
                        label="新しい所属の開始日"
                        type="date"
                        value={transferStartDate}
                        onChange={(e) => setTransferStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div style={{ marginTop: '12px' }}>
                      <Button type="submit" disabled={submitting}>
                        異動を記録する
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {memberPanelMode === 'retire' && (
                <form onSubmit={handleRetireSubmit}>
                  <NoticeBox tone="info">
                    退職日を記録すると、①持っている有効な権限（管理者・トーク責任者）を外す →
                    ②今の所属とMGR担当の終わりの日を退職日にする → ③名簿の退職日を入れる、の順に行います。
                  </NoticeBox>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: '12px',
                      flexWrap: 'wrap',
                      marginTop: '12px',
                    }}
                  >
                    <InputField
                      id="retire-date"
                      label="退職日"
                      type="date"
                      value={retireDate}
                      onChange={(e) => setRetireDate(e.target.value)}
                      required
                    />
                    <Button type="submit" disabled={submitting}>
                      退職を記録する
                    </Button>
                  </div>
                </form>
              )}
            </section>
          )}
        </>
      )}

      {/* 2. 1人を足す */}
      {activeSection === 'add' && (
        <section className="panel">
          <h2 className="section-title">1人を足す</h2>
          <p className="lead-text">
            足したあと、その人が Microsoft 365 で初めてログインしたときに、メールで名簿の行と結ばれます。
          </p>

          <form onSubmit={handleCreateSingleMember}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '12px',
              }}
            >
              <InputField
                id="new-name"
                label="名前"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例：架空メンバー"
                required
              />
              <InputField
                id="new-email"
                label="メール"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="例：member@example.test"
                required
              />
              <SelectField
                id="new-role"
                label="役割"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as MemberRole)}
                options={selectableRolesForViewer}
              />
              <SelectField
                id="new-goes-to-sales"
                label="営業に出る"
                value={newGoesToSales}
                onChange={(e) => setNewGoesToSales(e.target.value as 'true' | 'false')}
                options={[
                  { value: 'true', label: '出る' },
                  { value: 'false', label: '出ない' },
                ]}
              />
              <InputField
                id="new-hired-on"
                label="入社日"
                type="date"
                value={newHiredOn}
                onChange={(e) => setNewHiredOn(e.target.value)}
                required
              />

              {(newRole === 'member' || newRole === 'leader') && (
                <>
                  <SelectField
                    id="new-team"
                    label="チーム"
                    value={newTeamId}
                    onChange={(e) => setNewTeamId(e.target.value)}
                    placeholder="チームを選択"
                    options={(bundle?.teams ?? []).map((t) => ({
                      value: t.id,
                      label: t.name,
                    }))}
                    required
                  />
                  <InputField
                    id="new-base"
                    label="拠点"
                    value={newBase}
                    onChange={(e) => setNewBase(e.target.value)}
                    placeholder="例：東京"
                    required
                  />
                  <InputField
                    id="new-aff-start"
                    label="所属の開始日"
                    type="date"
                    value={newAffStartDate}
                    onChange={(e) => setNewAffStartDate(e.target.value)}
                    required
                  />
                </>
              )}
            </div>

            {newRole === 'mgr' && (
              <p className="form-hint" style={{ marginTop: '8px' }}>
                MGRの担当チームは、名簿に足したあとに「MGRの担当」から設定します。
              </p>
            )}

            <div style={{ marginTop: '16px' }}>
              <Button type="submit" disabled={submitting}>
                名簿に足す
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* 3. CSV 一括取り込み */}
      {activeSection === 'import' && (
        <section className="panel">
          <h2 className="section-title">名簿のCSV一括取り込み</h2>
          <p className="lead-text">
            ひな形を取り出して入力し、CSV（UTF-8 または Shift_JIS）を選ぶと、取り込む前に行ごとの確かめの結果が出ます。
          </p>

          <div
            style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: '16px',
            }}
          >
            <Button variant="secondary" onClick={handleDownloadTemplate}>
              ひな形を取り出す（members_template.csv）
            </Button>

            <label className="form-label" htmlFor="csv-file-input" style={{ margin: 0 }}>
              CSVファイルを選ぶ：
              <input
                id="csv-file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileChange}
                style={{ marginLeft: '8px' }}
              />
            </label>
          </div>

          {csvFileName && (
            <p className="form-hint">選択中のファイル：{csvFileName}</p>
          )}

          {csvValidation && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
              {csvValidation.headerErrors.length > 0 ? (
                <NoticeBox title="見出しのエラー" tone="alert" role="alert">
                  {csvValidation.headerErrors.join(' ／ ')}
                </NoticeBox>
              ) : (
                <>
                  <NoticeBox
                    tone={csvValidation.canImport ? 'good' : 'warn'}
                    role="status"
                  >
                    全 {csvValidation.rows.length} 行中、合う行：{csvValidation.validCount} 件 ／
                    合わない行：{csvValidation.invalidCount} 件
                  </NoticeBox>

                  {csvValidation.unknownTeamNames.length > 0 && (
                    <div className="panel" style={{ padding: '12px' }}>
                      <strong>名簿にないチームが含まれています：</strong>
                      <p className="form-hint" style={{ margin: '4px 0 8px' }}>
                        「新しいチームとして作る」にチェックを入れると、取り込み時に自動でチームを作って取り込めます。
                      </p>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        {csvValidation.unknownTeamNames.map((tName) => (
                          <label
                            key={tName}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <input
                              type="checkbox"
                              checked={approvedNewTeams.includes(tName)}
                              onChange={() => toggleApproveNewTeam(tName)}
                            />
                            <span>「{tName}」を新しいチームとして作る</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <DataTable
                    columns={csvPreviewColumns}
                    rows={csvValidation.rows}
                    rowKey={(r) => String(r.rowNumber)}
                    emptyMessage="CSVにデータの行がありません。"
                  />

                  <div>
                    <Button
                      variant="primary"
                      disabled={!csvValidation.canImport || submitting}
                      onClick={handleBulkImportSubmit}
                    >
                      取り込む（{csvValidation.validCount}件）
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* 4. MGR の担当 */}
      {activeSection === 'mgr' && (
        <section className="panel">
          <h2 className="section-title">MGRの担当</h2>
          <p className="lead-text">
            MGRごとに担当するチームと期間（開始日・終わりの日）を足す・終えることができます（上書きせず履歴を残します）。
          </p>

          <form onSubmit={handleCreateMgrAssignment} style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 8px' }}>MGRの担当を足す</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
              }}
            >
              <SelectField
                id="mgr-member-select"
                label="担当するMGR"
                value={newMgrMemberId}
                onChange={(e) => setNewMgrMemberId(e.target.value)}
                placeholder="MGRを選択"
                options={mgrMembers.map((m) => ({ value: m.id, label: m.name }))}
                required
              />
              <SelectField
                id="mgr-team-select"
                label="担当するチーム"
                value={newMgrTeamId}
                onChange={(e) => setNewMgrTeamId(e.target.value)}
                placeholder="チームを選択"
                options={(bundle?.teams ?? []).map((t) => ({ value: t.id, label: t.name }))}
                required
              />
              <InputField
                id="mgr-start-date"
                label="開始日"
                type="date"
                value={newMgrStartDate}
                onChange={(e) => setNewMgrStartDate(e.target.value)}
                required
              />
              <InputField
                id="mgr-end-date"
                label="終わりの日（任意）"
                type="date"
                value={newMgrEndDate}
                onChange={(e) => setNewMgrEndDate(e.target.value)}
              />
            </div>
            <div style={{ marginTop: '12px' }}>
              <Button type="submit" disabled={submitting}>
                担当を足す
              </Button>
            </div>
          </form>

          <div style={{ marginBottom: '12px', maxWidth: '300px' }}>
            <SelectField
              id="mgr-filter"
              label="MGRで絞り込み"
              value={mgrFilterId}
              onChange={(e) => setMgrFilterId(e.target.value)}
              options={[
                { value: '', label: 'すべてのMGR' },
                ...allMgrMembers.map((m) => ({ value: m.id, label: m.name })),
              ]}
            />
          </div>

          <DataTable
            columns={[
              {
                key: 'mgr',
                header: 'MGR',
                render: (ma) => memberNameMap.get(ma.mgr_member_id) ?? '－',
              },
              {
                key: 'team',
                header: '担当チーム',
                render: (ma) => teamMap.get(ma.team_id) ?? '－',
              },
              {
                key: 'start_date',
                header: '開始日',
                render: (ma) => <DateText value={ma.start_date} />,
              },
              {
                key: 'end_date',
                header: '終わりの日',
                render: (ma) =>
                  ma.end_date ? <DateText value={ma.end_date} /> : <Tag tone="good">担当中</Tag>,
              },
              {
                key: 'action',
                header: '担当を終える',
                render: (ma) =>
                  ma.end_date ? (
                    '－'
                  ) : (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="date"
                        className="text-input"
                        style={{ width: '150px' }}
                        value={closingMgrEndDates[ma.id] ?? todayJst}
                        onChange={(e) =>
                          setClosingMgrEndDates((prev) => ({
                            ...prev,
                            [ma.id]: e.target.value,
                          }))
                        }
                        aria-label="担当の終わりの日"
                      />
                      <Button
                        variant="secondary"
                        disabled={submitting}
                        onClick={() => handleCloseMgrAssignment(ma.id, ma.start_date)}
                      >
                        担当を終える
                      </Button>
                    </div>
                  ),
              },
            ]}
            rows={filteredMgrAssignments}
            rowKey={(ma) => ma.id}
            emptyMessage="MGRの担当の履歴はありません。"
          />
        </section>
      )}

      {/* 5. チーム */}
      {activeSection === 'teams' && (
        <section className="panel">
          <h2 className="section-title">チームの管理</h2>
          <p className="lead-text">
            チームを新しく足す・名前を変えることができます（過去の記録を保つため削除はしません）。
          </p>

          <form
            onSubmit={handleCreateTeam}
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-end',
              flexWrap: 'wrap',
              marginBottom: '20px',
            }}
          >
            <InputField
              id="new-team-name"
              label="新しいチーム名"
              value={newTeamNameInput}
              onChange={(e) => setNewTeamNameInput(e.target.value)}
              placeholder="例：架空チームC"
              required
            />
            <Button type="submit" disabled={submitting}>
              チームを足す
            </Button>
          </form>

          <DataTable
            columns={[
              {
                key: 'currentName',
                header: '今のチーム名',
                render: (t) => <strong>{t.name}</strong>,
              },
              {
                key: 'rename',
                header: '名前を変える',
                render: (t) => (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="text-input"
                      value={editingTeamNames[t.id] ?? t.name}
                      onChange={(e) =>
                        setEditingTeamNames((prev) => ({
                          ...prev,
                          [t.id]: e.target.value,
                        }))
                      }
                      aria-label={`${t.name}の新しい名前`}
                    />
                    <Button
                      variant="secondary"
                      disabled={
                        submitting ||
                        (editingTeamNames[t.id] ?? t.name).trim() === '' ||
                        (editingTeamNames[t.id] ?? t.name).trim() === t.name
                      }
                      onClick={() => handleUpdateTeamName(t.id)}
                    >
                      名前を変える
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={bundle?.teams ?? []}
            rowKey={(t) => t.id}
            emptyMessage="チームがありません。"
          />
        </section>
      )}
    </div>
  );
}

export default AdminMembersPage;
