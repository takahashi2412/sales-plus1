import { supabase } from '../../../foundation/supabaseClient';
import { fetchViewerContext, type ViewerContext } from '../../../foundation/viewer';
import type {
  MemberAffiliationRow,
  MemberRole,
  MemberRow,
  MgrAssignmentRow,
  PermissionRow,
  TeamRow,
} from '../../../foundation/types';
import {
  formatAdminDbError,
  normalizeDateInput,
  isValidEmailFormat,
  type NormalizedMemberImportRow,
  type RetirementPlan,
  type TransferPlan,
} from '../shared';

export interface AdminMembersBundle {
  viewer: ViewerContext | null;
  members: MemberRow[];
  teams: TeamRow[];
  affiliations: MemberAffiliationRow[];
  mgrAssignments: MgrAssignmentRow[];
  permissions: PermissionRow[];
}

export type ApiResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; errorMessage: string };

export async function fetchAdminMembersBundle(): Promise<AdminMembersBundle> {
  const viewer = await fetchViewerContext(supabase);
  if (!viewer || !viewer.isAdmin) {
    return {
      viewer,
      members: [],
      teams: [],
      affiliations: [],
      mgrAssignments: [],
      permissions: [],
    };
  }

  const [membersRes, teamsRes, affRes, mgrRes, permRes] = await Promise.all([
    supabase.from('members').select('*').order('name', { ascending: true }),
    supabase.from('teams').select('*').order('name', { ascending: true }),
    supabase.from('member_affiliations').select('*').order('start_date', { ascending: false }),
    supabase.from('mgr_assignments').select('*').order('start_date', { ascending: false }),
    supabase.from('permissions').select('*').order('granted_at', { ascending: false }),
  ]);

  if (membersRes.error) throw membersRes.error;
  if (teamsRes.error) throw teamsRes.error;
  if (affRes.error) throw affRes.error;
  if (mgrRes.error) throw mgrRes.error;
  if (permRes.error) throw permRes.error;

  return {
    viewer,
    members: (membersRes.data ?? []) as MemberRow[],
    teams: (teamsRes.data ?? []) as TeamRow[],
    affiliations: (affRes.data ?? []) as MemberAffiliationRow[],
    mgrAssignments: (mgrRes.data ?? []) as MgrAssignmentRow[],
    permissions: (permRes.data ?? []) as PermissionRow[],
  };
}

export interface CreateSingleMemberInput {
  name: string;
  email: string;
  role: MemberRole;
  goesToSales: boolean;
  hiredOn: string;
  teamId: string;
  base: string;
  affiliationStartDate: string;
  existingEmails: string[];
}

export async function createSingleMember(
  input: CreateSingleMemberInput,
): Promise<ApiResult<{ memberId: string }>> {
  const name = input.name.trim();
  const email = input.email.trim();
  const hiredOn = normalizeDateInput(input.hiredOn);
  const needsAffiliation = input.role === 'member' || input.role === 'leader';
  const affStart = input.affiliationStartDate.trim()
    ? normalizeDateInput(input.affiliationStartDate)
    : null;

  if (!name) {
    return { ok: false, errorMessage: '名前を入力してください' };
  }
  if (!email || !isValidEmailFormat(email)) {
    return { ok: false, errorMessage: '正しいメールの形を入力してください' };
  }
  if (
    input.existingEmails.some((e) => e.trim().toLowerCase() === email.toLowerCase())
  ) {
    return { ok: false, errorMessage: '名簿にもう同じメールがいます' };
  }
  if (!hiredOn) {
    return { ok: false, errorMessage: '入社日の日付が読めません（YYYY-MM-DD または YYYY/MM/DD）' };
  }

  if (needsAffiliation) {
    if (!input.teamId.trim()) {
      return { ok: false, errorMessage: 'メンバー・リーダーはチームを選んでください' };
    }
    if (!input.base.trim()) {
      return { ok: false, errorMessage: 'メンバー・リーダーは拠点を入力してください' };
    }
    if (!affStart) {
      return {
        ok: false,
        errorMessage: 'メンバー・リーダーは所属の開始日を正しく入力してください',
      };
    }
    if (affStart < hiredOn) {
      return { ok: false, errorMessage: '所属の開始日が入社日より前になっています' };
    }
  }

  const { data: insertedMembers, error: memberError } = await supabase
    .from('members')
    .insert({
      name,
      email,
      role: input.role,
      goes_to_sales: input.goesToSales,
      hired_on: hiredOn,
    })
    .select('*');

  if (memberError) {
    return { ok: false, errorMessage: formatAdminDbError(memberError) };
  }
  const created = (insertedMembers ?? [])[0] as MemberRow | undefined;
  if (!created) {
    return { ok: false, errorMessage: formatAdminDbError('名簿の行を追加できませんでした') };
  }

  if (needsAffiliation && affStart) {
    const { data: affRows, error: affError } = await supabase
      .from('member_affiliations')
      .insert({
        member_id: created.id,
        team_id: input.teamId.trim(),
        base: input.base.trim(),
        start_date: affStart,
        end_date: null,
      })
      .select('*');

    if (affError || !affRows || affRows.length === 0) {
      return {
        ok: false,
        errorMessage: formatAdminDbError(affError ?? '所属の履歴を追加できませんでした'),
      };
    }
  }

  return { ok: true, data: { memberId: created.id } };
}

export interface UpdateMemberProfileInput {
  memberId: string;
  name: string;
  email: string;
  role: MemberRole;
  goesToSales: boolean;
  hiredOn: string;
  existingMembers: MemberRow[];
}

export async function updateMemberProfile(
  input: UpdateMemberProfileInput,
): Promise<ApiResult<{ goesToSalesChanged: boolean }>> {
  const name = input.name.trim();
  const email = input.email.trim();
  const hiredOn = normalizeDateInput(input.hiredOn);

  if (!name) {
    return { ok: false, errorMessage: '名前を入力してください' };
  }
  if (!email || !isValidEmailFormat(email)) {
    return { ok: false, errorMessage: '正しいメールの形を入力してください' };
  }
  if (!hiredOn) {
    return { ok: false, errorMessage: '入社日の日付が読めません（YYYY-MM-DD または YYYY/MM/DD）' };
  }

  const dup = input.existingMembers.find(
    (m) => m.id !== input.memberId && m.email.trim().toLowerCase() === email.toLowerCase(),
  );
  if (dup) {
    return { ok: false, errorMessage: '名簿にもう同じメールがいます' };
  }

  const current = input.existingMembers.find((m) => m.id === input.memberId);
  const goesToSalesChanged = current ? current.goes_to_sales !== input.goesToSales : false;

  const { data, error } = await supabase
    .from('members')
    .update({
      name,
      email,
      role: input.role,
      goes_to_sales: input.goesToSales,
      hired_on: hiredOn,
    })
    .eq('id', input.memberId)
    .select('*');

  if (error) {
    return { ok: false, errorMessage: formatAdminDbError(error) };
  }
  if (!data || data.length === 0) {
    return { ok: false, errorMessage: formatAdminDbError('更新対象の名簿が書きかえられませんでした') };
  }

  return { ok: true, data: { goesToSalesChanged } };
}

export async function executeTransferPlan(plan: TransferPlan): Promise<ApiResult> {
  for (const closeItem of plan.closeAffiliations) {
    const { data, error } = await supabase
      .from('member_affiliations')
      .update({ end_date: closeItem.endDate })
      .eq('id', closeItem.affiliationId)
      .select('*');

    if (error) {
      return { ok: false, errorMessage: formatAdminDbError(error) };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        errorMessage: formatAdminDbError('今の所属の終わりの日を更新できませんでした'),
      };
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('member_affiliations')
    .insert(plan.insertAffiliation)
    .select('*');

  if (insertError) {
    return { ok: false, errorMessage: formatAdminDbError(insertError) };
  }
  if (!inserted || inserted.length === 0) {
    return {
      ok: false,
      errorMessage: formatAdminDbError('新しい所属の行を追加できませんでした'),
    };
  }

  return { ok: true, data: undefined };
}

/**
 * 退職の計画を順番（①権限を外す → ②所属・MGR担当を閉じる → ③名簿の退職日を入れる）に実行する。
 */
export async function executeRetirementPlan(plan: RetirementPlan): Promise<ApiResult> {
  const [step1, step2, step3] = plan.steps;

  // ① 持っている権限（管理者・トーク責任者）を外す（revoked_at）
  for (const permId of step1.permissionIds) {
    const { data, error } = await supabase
      .from('permissions')
      .update({
        revoked_at: step1.revokedAt,
        revoked_by: step1.revokedBy,
      })
      .eq('id', permId)
      .select('*');

    if (error) {
      return { ok: false, errorMessage: formatAdminDbError(error) };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        errorMessage: formatAdminDbError('権限を外すことができませんでした'),
      };
    }
  }

  // ② 今の所属の終わりの日を退職日にし、MGR の担当があれば終わりの日を退職日にする
  for (const affId of step2.affiliationIds) {
    const { data, error } = await supabase
      .from('member_affiliations')
      .update({ end_date: step2.endDate })
      .eq('id', affId)
      .select('*');

    if (error) {
      return { ok: false, errorMessage: formatAdminDbError(error) };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        errorMessage: formatAdminDbError('所属の終わりの日を更新できませんでした'),
      };
    }
  }

  for (const mgrId of step2.mgrAssignmentIds) {
    const { data, error } = await supabase
      .from('mgr_assignments')
      .update({ end_date: step2.endDate })
      .eq('id', mgrId)
      .select('*');

    if (error) {
      return { ok: false, errorMessage: formatAdminDbError(error) };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        errorMessage: formatAdminDbError('MGR担当の終わりの日を更新できませんでした'),
      };
    }
  }

  // ③ 名簿の退職日を入れる
  const { data: memberData, error: memberError } = await supabase
    .from('members')
    .update({ retired_on: step3.retiredOn })
    .eq('id', step3.memberId)
    .select('*');

  if (memberError) {
    return { ok: false, errorMessage: formatAdminDbError(memberError) };
  }
  if (!memberData || memberData.length === 0) {
    return {
      ok: false,
      errorMessage: formatAdminDbError('名簿の退職日を更新できませんでした'),
    };
  }

  return { ok: true, data: undefined };
}

export interface CreateMgrAssignmentInput {
  mgrMemberId: string;
  teamId: string;
  startDate: string;
  endDate: string;
  assignedBy: string;
}

export async function createMgrAssignment(
  input: CreateMgrAssignmentInput,
): Promise<ApiResult> {
  const startDate = normalizeDateInput(input.startDate);
  const endDate = input.endDate.trim() ? normalizeDateInput(input.endDate) : null;

  if (!input.mgrMemberId.trim()) {
    return { ok: false, errorMessage: '担当するMGRを選んでください' };
  }
  if (!input.teamId.trim()) {
    return { ok: false, errorMessage: '担当するチームを選んでください' };
  }
  if (!startDate) {
    return { ok: false, errorMessage: '開始日の日付が読めません（YYYY-MM-DD または YYYY/MM/DD）' };
  }
  if (input.endDate.trim() && !endDate) {
    return {
      ok: false,
      errorMessage: '終わりの日の日付が読めません（YYYY-MM-DD または YYYY/MM/DD）',
    };
  }
  if (endDate && endDate < startDate) {
    return { ok: false, errorMessage: '終わりの日が開始日より前になっています' };
  }

  const { data, error } = await supabase
    .from('mgr_assignments')
    .insert({
      mgr_member_id: input.mgrMemberId.trim(),
      team_id: input.teamId.trim(),
      start_date: startDate,
      end_date: endDate,
      assigned_by: input.assignedBy,
    })
    .select('*');

  if (error) {
    return { ok: false, errorMessage: formatAdminDbError(error) };
  }
  if (!data || data.length === 0) {
    return { ok: false, errorMessage: formatAdminDbError('MGRの担当を追加できませんでした') };
  }

  return { ok: true, data: undefined };
}

export async function closeMgrAssignment(
  assignmentId: string,
  startDate: string,
  endDateRaw: string,
): Promise<ApiResult> {
  const endDate = normalizeDateInput(endDateRaw);
  if (!endDate) {
    return {
      ok: false,
      errorMessage: '終わりの日の日付が読めません（YYYY-MM-DD または YYYY/MM/DD）',
    };
  }
  if (endDate < startDate) {
    return {
      ok: false,
      errorMessage: `終わりの日（${endDate}）が開始日（${startDate}）より前になっています`,
    };
  }

  const { data, error } = await supabase
    .from('mgr_assignments')
    .update({ end_date: endDate })
    .eq('id', assignmentId)
    .select('*');

  if (error) {
    return { ok: false, errorMessage: formatAdminDbError(error) };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      errorMessage: formatAdminDbError('MGRの担当の終わりの日を更新できませんでした'),
    };
  }

  return { ok: true, data: undefined };
}

export async function createTeam(
  nameRaw: string,
  existingTeams: TeamRow[],
): Promise<ApiResult<TeamRow>> {
  const name = nameRaw.trim();
  if (!name) {
    return { ok: false, errorMessage: 'チーム名を入力してください' };
  }
  if (existingTeams.some((t) => t.name.trim() === name)) {
    return { ok: false, errorMessage: '同じ名前のチームがすでにあります' };
  }

  const { data, error } = await supabase.from('teams').insert({ name }).select('*');
  if (error) {
    return { ok: false, errorMessage: formatAdminDbError(error) };
  }
  const created = (data ?? [])[0] as TeamRow | undefined;
  if (!created) {
    return { ok: false, errorMessage: formatAdminDbError('チームを追加できませんでした') };
  }

  return { ok: true, data: created };
}

export async function updateTeamName(
  teamId: string,
  nameRaw: string,
  existingTeams: TeamRow[],
): Promise<ApiResult> {
  const name = nameRaw.trim();
  if (!name) {
    return { ok: false, errorMessage: 'チーム名を入力してください' };
  }
  if (existingTeams.some((t) => t.id !== teamId && t.name.trim() === name)) {
    return { ok: false, errorMessage: '同じ名前のチームがすでにあります' };
  }

  const { data, error } = await supabase
    .from('teams')
    .update({ name })
    .eq('id', teamId)
    .select('*');

  if (error) {
    return { ok: false, errorMessage: formatAdminDbError(error) };
  }
  if (!data || data.length === 0) {
    return { ok: false, errorMessage: formatAdminDbError('チーム名を更新できませんでした') };
  }

  return { ok: true, data: undefined };
}

export interface ExecuteBulkImportInput {
  importRows: NormalizedMemberImportRow[];
  newTeamsToCreate: string[];
  existingTeams: TeamRow[];
}

export async function executeBulkMembersImport(
  input: ExecuteBulkImportInput,
): Promise<ApiResult<{ importedCount: number; createdTeamsCount: number }>> {
  const teamNameToId = new Map<string, string>(
    input.existingTeams.map((t) => [t.name.trim(), t.id]),
  );

  let createdTeamsCount = 0;
  for (const newTeamName of input.newTeamsToCreate) {
    const trimmed = newTeamName.trim();
    if (!trimmed || teamNameToId.has(trimmed)) continue;

    const { data, error } = await supabase
      .from('teams')
      .insert({ name: trimmed })
      .select('*');

    if (error) {
      return { ok: false, errorMessage: formatAdminDbError(error) };
    }
    const createdTeam = (data ?? [])[0] as TeamRow | undefined;
    if (!createdTeam) {
      return {
        ok: false,
        errorMessage: formatAdminDbError(`新しいチーム「${trimmed}」を作成できませんでした`),
      };
    }
    teamNameToId.set(trimmed, createdTeam.id);
    createdTeamsCount += 1;
  }

  let importedCount = 0;
  for (const row of input.importRows) {
    const { data: insertedMembers, error: memberError } = await supabase
      .from('members')
      .insert({
        name: row.name,
        email: row.email,
        role: row.role,
        goes_to_sales: row.goesToSales,
        hired_on: row.hiredOn,
      })
      .select('*');

    if (memberError) {
      return { ok: false, errorMessage: formatAdminDbError(memberError) };
    }
    const createdMember = (insertedMembers ?? [])[0] as MemberRow | undefined;
    if (!createdMember) {
      return {
        ok: false,
        errorMessage: formatAdminDbError(`「${row.name}」の名簿を追加できませんでした`),
      };
    }

    if (row.role !== 'mgr' && row.teamName && row.base && row.affiliationStartDate) {
      const teamId = teamNameToId.get(row.teamName.trim());
      if (!teamId) {
        return {
          ok: false,
          errorMessage: formatAdminDbError(`チーム「${row.teamName}」が見つかりません`),
        };
      }

      const { data: insertedAffs, error: affError } = await supabase
        .from('member_affiliations')
        .insert({
          member_id: createdMember.id,
          team_id: teamId,
          base: row.base,
          start_date: row.affiliationStartDate,
          end_date: null,
        })
        .select('*');

      if (affError || !insertedAffs || insertedAffs.length === 0) {
        return {
          ok: false,
          errorMessage: formatAdminDbError(
            affError ?? `「${row.name}」の所属を追加できませんでした`,
          ),
        };
      }
    }

    importedCount += 1;
  }

  return {
    ok: true,
    data: {
      importedCount,
      createdTeamsCount,
    },
  };
}
