import { ROLE_LABELS } from '../../../foundation/directory';
import type { MemberAffiliationRow, MemberRole } from '../../../foundation/types';
import { normalizeDateInput } from './csv';
import type {
  AdminViewerRoleFlags,
  GrantPermissionInput,
  GrantPermissionPlanResult,
  RetirementInput,
  RetirementPlanResult,
  RevokePermissionInput,
  RevokePermissionPlanResult,
  TransferInput,
  TransferPlanResult,
} from './types';

/**
 * YYYY-MM-DD の前日（1日前）を YYYY-MM-DD で返す。
 */
export function getPreviousDateString(ymd: string): string {
  const normalized = normalizeDateInput(ymd);
  if (!normalized) {
    throw new Error(`Invalid date string: ${ymd}`);
  }
  const [y, m, d] = normalized.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * 異動の計画：
 * 新しい所属の開始日を入れると、今の所属の終わりの日を「開始日の前の日」にし、
 * 新しい所属の行を足す（上書きしない）。
 * 開始日が今の所属の開始日以前ならエラー。
 */
export function buildTransferPlan(
  input: TransferInput,
  existingAffiliations: MemberAffiliationRow[],
): TransferPlanResult {
  const errors: string[] = [];
  const memberId = input.memberId.trim();
  const newTeamId = input.newTeamId.trim();
  const newBase = input.newBase.trim();
  const normalizedStart = normalizeDateInput(input.newStartDate);

  if (!memberId) {
    errors.push('対象のメンバーが選ばれていません');
  }
  if (!newTeamId) {
    errors.push('新しいチームを選んでください');
  }
  if (!newBase) {
    errors.push('新しい拠点を入力してください');
  }
  if (!normalizedStart) {
    errors.push('新しい所属の開始日の日付が読めません（YYYY-MM-DD または YYYY/MM/DD）');
  }

  if (errors.length > 0 || !normalizedStart) {
    return { ok: false, errors };
  }

  const memberAffs = existingAffiliations
    .filter((a) => a.member_id === memberId)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  // 今の所属（end_date が空、または end_date が新しい開始日以降の行）を対象とする
  const openAffs = memberAffs.filter(
    (a) => a.end_date === null || a.end_date >= normalizedStart,
  );

  // 最も新しい所属の開始日と比較
  const latestAff = openAffs[0] ?? memberAffs[0] ?? null;
  if (latestAff && normalizedStart <= latestAff.start_date) {
    return {
      ok: false,
      errors: [
        `新しい所属の開始日（${normalizedStart}）は、今の所属の開始日（${latestAff.start_date}）より後の日にしてください`,
      ],
    };
  }

  const previousDay = getPreviousDateString(normalizedStart);
  const closeAffiliations = openAffs.map((aff) => ({
    affiliationId: aff.id,
    endDate: previousDay,
  }));

  return {
    ok: true,
    plan: {
      closeAffiliations,
      insertAffiliation: {
        member_id: memberId,
        team_id: newTeamId,
        base: newBase,
        start_date: normalizedStart,
        end_date: null,
      },
    },
  };
}

/**
 * 退職の計画：
 * 退職日を入れると、
 * ① 持っている権限（管理者・トーク責任者）を外す（revoked_at）
 * ② 今の所属の終わりの日を退職日にし、MGR の担当があれば終わりの日を退職日にする
 * ③ 名簿の退職日を入れる
 * の順に行う。
 */
export function buildRetirementPlan(input: RetirementInput): RetirementPlanResult {
  const errors: string[] = [];
  const normalizedRetiredOn = normalizeDateInput(input.retiredOn);

  if (!normalizedRetiredOn) {
    errors.push('退職日の日付が読めません（YYYY-MM-DD または YYYY/MM/DD）');
  }
  if (!input.revokedByMemberId.trim()) {
    errors.push('操作する人の情報がありません');
  }

  if (normalizedRetiredOn && normalizedRetiredOn < input.member.hired_on) {
    errors.push(
      `退職日（${normalizedRetiredOn}）が入社日（${input.member.hired_on}）より前になっています`,
    );
  }

  const memberId = input.member.id;

  // 今の所属（end_date が null、または退職日より後のもの）
  const targetAffiliations = input.affiliations.filter(
    (a) =>
      a.member_id === memberId &&
      (a.end_date === null || (normalizedRetiredOn !== null && a.end_date > normalizedRetiredOn)),
  );

  // MGR の担当（end_date が null、または退職日より後のもの）
  const targetMgrAssignments = input.mgrAssignments.filter(
    (ma) =>
      ma.mgr_member_id === memberId &&
      (ma.end_date === null || (normalizedRetiredOn !== null && ma.end_date > normalizedRetiredOn)),
  );

  if (normalizedRetiredOn) {
    for (const aff of targetAffiliations) {
      if (normalizedRetiredOn < aff.start_date) {
        errors.push(
          `退職日（${normalizedRetiredOn}）が今の所属の開始日（${aff.start_date}）より前になっています`,
        );
      }
    }
    for (const ma of targetMgrAssignments) {
      if (normalizedRetiredOn < ma.start_date) {
        errors.push(
          `退職日（${normalizedRetiredOn}）がMGR担当の開始日（${ma.start_date}）より前になっています`,
        );
      }
    }
  }

  if (errors.length > 0 || !normalizedRetiredOn) {
    return { ok: false, errors };
  }

  // 有効な権限（admin・talk_owner で revoked_at が null）
  const activePermissions = input.permissions.filter(
    (p) => p.member_id === memberId && p.revoked_at === null,
  );

  const revokedAt = input.revokedAtIso ?? new Date().toISOString();

  return {
    ok: true,
    plan: {
      memberId,
      retiredOn: normalizedRetiredOn,
      steps: [
        {
          step: 1,
          kind: 'revoke_permissions',
          permissionIds: activePermissions.map((p) => p.id),
          revokedBy: input.revokedByMemberId,
          revokedAt,
        },
        {
          step: 2,
          kind: 'close_affiliations_and_mgr_assignments',
          affiliationIds: targetAffiliations.map((a) => a.id),
          mgrAssignmentIds: targetMgrAssignments.map((ma) => ma.id),
          endDate: normalizedRetiredOn,
        },
        {
          step: 3,
          kind: 'set_member_retired_on',
          memberId,
          retiredOn: normalizedRetiredOn,
        },
      ],
    },
  };
}

export const SELF_ADMIN_REVOKE_CONFIRM_MESSAGE =
  '外すと、この画面と名簿の管理は使えなくなります';

/**
 * 権限を与える計画：
 * 同じ人・同じ種類の有効な権限がもうあれば足さない。
 */
export function buildGrantPermissionPlan(
  input: GrantPermissionInput,
): GrantPermissionPlanResult {
  const memberId = input.memberId.trim();
  const grantedBy = input.grantedBy.trim();
  if (!memberId) {
    return { ok: false, error: '権限を与える人を選んでください' };
  }
  if (!grantedBy) {
    return { ok: false, error: '操作する人の情報がありません' };
  }
  if (input.kind !== 'admin' && input.kind !== 'talk_owner') {
    return { ok: false, error: '権限の種類が正しくありません' };
  }

  const existingActive = input.existingPermissions.find(
    (p) => p.member_id === memberId && p.kind === input.kind && p.revoked_at === null,
  );

  if (existingActive) {
    const kindLabel = input.kind === 'admin' ? '管理者' : 'トーク責任者';
    return {
      ok: true,
      alreadyGranted: true,
      existingPermissionId: existingActive.id,
      message: `すでに有効な「${kindLabel}」の権限を持っています（新しく足しません）`,
    };
  }

  return {
    ok: true,
    alreadyGranted: false,
    insert: {
      member_id: memberId,
      kind: input.kind,
      granted_by: grantedBy,
    },
  };
}

/**
 * 権限を外す計画：
 * revoked_at と revoked_by を入れる（行は消さない）。
 * 自分の管理者の権限を外すときは、確かめの1文を出す。
 */
export function buildRevokePermissionPlan(
  input: RevokePermissionInput,
): RevokePermissionPlanResult {
  const permissionId = input.permissionId.trim();
  const revokedBy = input.revokedBy.trim();
  if (!permissionId) {
    return { ok: false, error: '外す権限が指定されていません' };
  }
  if (!revokedBy) {
    return { ok: false, error: '操作する人の情報がありません' };
  }

  const target = input.existingPermissions.find((p) => p.id === permissionId);
  if (!target) {
    return { ok: false, error: '指定された権限が見つかりません' };
  }
  if (target.revoked_at !== null) {
    return { ok: false, error: 'この権限はすでに外されています' };
  }

  const isSelfAdminRevoke = target.member_id === revokedBy && target.kind === 'admin';
  const revokedAt = input.revokedAtIso ?? new Date().toISOString();

  return {
    ok: true,
    isSelfAdminRevoke,
    confirmationMessage: isSelfAdminRevoke ? SELF_ADMIN_REVOKE_CONFIRM_MESSAGE : null,
    update: {
      id: target.id,
      revoked_by: revokedBy,
      revoked_at: revokedAt,
    },
  };
}

export const LAST_ADMIN_ERROR_MESSAGE =
  '最後の1人の管理者は外せません。先にほかの人に管理者の権限を与えてください';

/**
 * データベースのエラーの見分け：
 * エラーの文に `last admin` が入っていれば
 * 「最後の1人の管理者は外せません。先にほかの人に管理者の権限を与えてください」、
 * そのほかは「この操作はできません（理由：…）」にする。
 */
export function formatAdminDbError(error: unknown): string {
  let message = '';
  if (typeof error === 'string') {
    message = error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    const rawMsg = (error as { message?: unknown }).message;
    if (typeof rawMsg === 'string') {
      message = rawMsg;
    }
  }

  const trimmed = message.trim();
  if (/last admin/i.test(trimmed)) {
    return LAST_ADMIN_ERROR_MESSAGE;
  }

  if (trimmed) {
    return `この操作はできません（理由：${trimmed}）`;
  }
  return 'この操作はできません';
}

/**
 * 役割の選び方：
 * 見る人が代表（で管理者の権限がある）でなければ、役割の選べる値に「代表」を出さない。
 */
export function getSelectableRoles(
  viewer: AdminViewerRoleFlags,
): Array<{ value: MemberRole; label: string }> {
  const baseRoles: MemberRole[] = ['member', 'leader', 'mgr'];
  if (viewer.isCeo && viewer.isAdmin) {
    baseRoles.push('ceo');
  }
  return baseRoles.map((role) => ({
    value: role,
    label: ROLE_LABELS[role],
  }));
}

/**
 * 代表の行の役割を変えられるか：
 * 見る人が代表（で管理者の権限がある）でなければ、代表の行の役割は変えられない。
 */
export function canEditMemberRole(
  viewer: AdminViewerRoleFlags,
  targetCurrentRole: MemberRole,
): boolean {
  if (!viewer.isAdmin) return false;
  if (targetCurrentRole === 'ceo') {
    return viewer.isCeo && viewer.isAdmin;
  }
  return true;
}
