import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ROLE_LABELS,
  getTodayJstDateString,
  isRetiredMember,
} from '../../../foundation/directory';
import type { MemberRow, PermissionKind, PermissionRow } from '../../../foundation/types';
import {
  Button,
  DataTable,
  DateText,
  NoticeBox,
  SelectField,
  Tag,
  type TableColumn,
} from '../../../components/ui';
import {
  SELF_ADMIN_REVOKE_CONFIRM_MESSAGE,
  buildGrantPermissionPlan,
  buildRevokePermissionPlan,
} from '../shared';
import {
  executeGrantPermission,
  executeRevokePermission,
  fetchAdminPermissionsBundle,
  type AdminPermissionsBundle,
} from './api';

const PERMISSION_KIND_LABELS: Record<PermissionKind, string> = {
  admin: '管理者',
  talk_owner: 'トーク責任者',
};

interface MemberActivePermissionRow {
  member: MemberRow;
  adminPermission: PermissionRow | null;
  talkOwnerPermission: PermissionRow | null;
}

export function AdminPermissionsPage() {
  const [bundle, setBundle] = useState<AdminPermissionsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [targetMemberId, setTargetMemberId] = useState<string>('');
  const [targetKind, setTargetKind] = useState<PermissionKind>('admin');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'good' | 'alert' | 'info'; text: string } | null>(
    null,
  );

  // 自分の管理者の権限を外すときの確認対象
  const [pendingSelfAdminRevoke, setPendingSelfAdminRevoke] = useState<{
    permissionId: string;
    revokedBy: string;
    revokedAt: string;
    confirmationMessage: string;
  } | null>(null);

  const todayJst = useMemo(() => getTodayJstDateString(), []);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await fetchAdminPermissionsBundle();
      setBundle(next);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '権限データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const viewer = bundle?.viewer ?? null;
  const canManage = Boolean(viewer && (viewer.isAdmin || viewer.isCeo));

  const memberMap = useMemo(
    () => new Map((bundle?.members ?? []).map((m) => [m.id, m])),
    [bundle?.members],
  );

  const activeMembers = useMemo(
    () =>
      (bundle?.members ?? [])
        .filter((m) => !isRetiredMember(m.retired_on, todayJst))
        .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [bundle?.members, todayJst],
  );

  const memberPermissionRows = useMemo<MemberActivePermissionRow[]>(() => {
    if (!bundle) return [];
    const activePerms = bundle.permissions.filter((p) => p.revoked_at === null);

    return activeMembers.map((member) => {
      const adminPerm =
        activePerms.find((p) => p.member_id === member.id && p.kind === 'admin') ?? null;
      const talkPerm =
        activePerms.find((p) => p.member_id === member.id && p.kind === 'talk_owner') ?? null;
      return {
        member,
        adminPermission: adminPerm,
        talkOwnerPermission: talkPerm,
      };
    });
  }, [activeMembers, bundle]);

  const revokedPermissions = useMemo<PermissionRow[]>(() => {
    if (!bundle) return [];
    return bundle.permissions
      .filter((p) => p.revoked_at !== null)
      .sort((a, b) => (b.revoked_at ?? '').localeCompare(a.revoked_at ?? ''));
  }, [bundle]);

  const handleGrantSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!bundle || !viewer) return;

    const planRes = buildGrantPermissionPlan({
      memberId: targetMemberId,
      kind: targetKind,
      grantedBy: viewer.memberId,
      existingPermissions: bundle.permissions,
    });

    if (!planRes.ok) {
      setFeedback({ tone: 'alert', text: planRes.error });
      return;
    }

    if (planRes.alreadyGranted) {
      setFeedback({ tone: 'info', text: planRes.message });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const execRes = await executeGrantPermission(planRes.insert);
      if (!execRes.ok) {
        setFeedback({ tone: 'alert', text: execRes.errorMessage });
        return;
      }
      const memberName = memberMap.get(targetMemberId)?.name ?? '';
      setFeedback({
        tone: 'good',
        text: `${memberName}さんに「${PERMISSION_KIND_LABELS[targetKind]}」の権限を与えました。`,
      });
      await reload();
    } finally {
      setSubmitting(false);
    }
  };

  const performRevoke = async (updatePayload: {
    id: string;
    revoked_by: string;
    revoked_at: string;
  }) => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const execRes = await executeRevokePermission(updatePayload);
      if (!execRes.ok) {
        setFeedback({ tone: 'alert', text: execRes.errorMessage });
        return;
      }
      setPendingSelfAdminRevoke(null);
      setFeedback({ tone: 'good', text: '権限を外しました。' });
      await reload();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestRevoke = (permissionId: string) => {
    if (!bundle || !viewer) return;
    const planRes = buildRevokePermissionPlan({
      permissionId,
      revokedBy: viewer.memberId,
      existingPermissions: bundle.permissions,
    });

    if (!planRes.ok) {
      setFeedback({ tone: 'alert', text: planRes.error });
      return;
    }

    if (planRes.isSelfAdminRevoke) {
      setPendingSelfAdminRevoke({
        permissionId: planRes.update.id,
        revokedBy: planRes.update.revoked_by,
        revokedAt: planRes.update.revoked_at,
        confirmationMessage:
          planRes.confirmationMessage ?? SELF_ADMIN_REVOKE_CONFIRM_MESSAGE,
      });
      return;
    }

    void performRevoke(planRes.update);
  };

  if (loading) {
    return (
      <section className="panel">
        <h1 className="section-title">権限の管理</h1>
        <p className="lead-text">読み込み中...</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="panel">
        <h1 className="section-title">権限の管理</h1>
        <NoticeBox title="読み込みエラー" tone="alert" role="alert">
          {loadError}
        </NoticeBox>
      </section>
    );
  }

  if (!canManage) {
    return (
      <section className="panel">
        <h1 className="section-title">権限の管理</h1>
        <NoticeBox title="この画面は使えません" tone="warn" role="alert">
          権限の管理は、管理者の権限がある人と代表だけが使えます。
        </NoticeBox>
      </section>
    );
  }

  const renderPermissionCell = (perm: PermissionRow | null, label: string) => {
    if (!perm) {
      return <span className="form-hint">なし</span>;
    }
    const granterName = perm.granted_by
      ? (memberMap.get(perm.granted_by)?.name ?? '－')
      : '－';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Tag tone="good">{label}</Tag>
          <Button
            variant="secondary"
            disabled={submitting}
            onClick={() => handleRequestRevoke(perm.id)}
          >
            外す
          </Button>
        </div>
        <div className="form-hint">
          与えた人：{granterName} ／ 与えた日：<DateText value={perm.granted_at} />
        </div>
      </div>
    );
  };

  const currentColumns: TableColumn<MemberActivePermissionRow>[] = [
    {
      key: 'member',
      header: '名前（役割）',
      render: (r) => (
        <div>
          <strong>{r.member.name}</strong>{' '}
          <Tag tone="navy">{ROLE_LABELS[r.member.role]}</Tag>
          <div className="form-hint">{r.member.email}</div>
        </div>
      ),
    },
    {
      key: 'admin',
      header: '管理者',
      render: (r) => renderPermissionCell(r.adminPermission, '管理者'),
    },
    {
      key: 'talk_owner',
      header: 'トーク責任者',
      render: (r) => renderPermissionCell(r.talkOwnerPermission, 'トーク責任者'),
    },
  ];

  const revokedColumns: TableColumn<PermissionRow>[] = [
    {
      key: 'member',
      header: '対象の人',
      render: (p) => memberMap.get(p.member_id)?.name ?? '－',
    },
    {
      key: 'kind',
      header: '権限の種類',
      render: (p) => <Tag tone="plain">{PERMISSION_KIND_LABELS[p.kind]}</Tag>,
    },
    {
      key: 'granted',
      header: '与えた人・与えた日',
      render: (p) => {
        const granter = p.granted_by ? (memberMap.get(p.granted_by)?.name ?? '－') : '－';
        return (
          <span>
            {granter}（<DateText value={p.granted_at} />）
          </span>
        );
      },
    },
    {
      key: 'revoked',
      header: '外した人・外した日',
      render: (p) => {
        const revoker = p.revoked_by ? (memberMap.get(p.revoked_by)?.name ?? '－') : '－';
        return (
          <span>
            {revoker}（<DateText value={p.revoked_at} />）
          </span>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <section className="panel">
        <h1 className="section-title">権限の管理</h1>
        <p className="lead-text">
          管理者・トーク責任者の権限を与える・外すことができます（最後の1人の管理者は外せません）。
        </p>

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

        {pendingSelfAdminRevoke && (
          <div style={{ marginTop: '12px' }}>
            <NoticeBox title="自分の管理者の権限を外す確認" tone="warn" role="alert">
              <p style={{ margin: '0 0 12px' }}>
                {pendingSelfAdminRevoke.confirmationMessage}
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="primary"
                  disabled={submitting}
                  onClick={() =>
                    performRevoke({
                      id: pendingSelfAdminRevoke.permissionId,
                      revoked_by: pendingSelfAdminRevoke.revokedBy,
                      revoked_at: pendingSelfAdminRevoke.revokedAt,
                    })
                  }
                >
                  確認して外す
                </Button>
                <Button
                  variant="secondary"
                  disabled={submitting}
                  onClick={() => setPendingSelfAdminRevoke(null)}
                >
                  やめる
                </Button>
              </div>
            </NoticeBox>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="section-title">権限を与える</h2>
        <form
          onSubmit={handleGrantSubmit}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
            alignItems: 'end',
          }}
        >
          <SelectField
            id="grant-member"
            label="権限を与える人"
            value={targetMemberId}
            onChange={(e) => setTargetMemberId(e.target.value)}
            placeholder="人を選択"
            options={activeMembers.map((m) => ({
              value: m.id,
              label: `${m.name}（${ROLE_LABELS[m.role]}）`,
            }))}
            required
          />
          <SelectField
            id="grant-kind"
            label="権限の種類"
            value={targetKind}
            onChange={(e) => setTargetKind(e.target.value as PermissionKind)}
            options={[
              { value: 'admin', label: '管理者' },
              { value: 'talk_owner', label: 'トーク責任者' },
            ]}
          />
          <div>
            <Button type="submit" disabled={submitting}>
              権限を与える
            </Button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2 className="section-title">今の権限の一覧</h2>
        <DataTable
          columns={currentColumns}
          rows={memberPermissionRows}
          rowKey={(r) => r.member.id}
          emptyMessage="対象の名簿の行がありません。"
        />
      </section>

      <section className="panel">
        <h2 className="section-title">前の権限（外したもの）の一覧</h2>
        <DataTable
          columns={revokedColumns}
          rows={revokedPermissions}
          rowKey={(p) => p.id}
          emptyMessage="外した権限の履歴はありません。"
        />
      </section>
    </div>
  );
}

export default AdminPermissionsPage;
