export type MemberRole = 'member' | 'leader' | 'mgr' | 'ceo';

export type PermissionKind = 'admin' | 'talk_owner';

export interface TeamRow {
  id: string;
  name: string;
}

export interface MemberRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string;
  role: MemberRole;
  goes_to_sales: boolean;
  hired_on: string;
  retired_on: string | null;
}

export interface MemberAffiliationRow {
  id: string;
  member_id: string;
  team_id: string;
  base: string;
  start_date: string;
  end_date: string | null;
}

export interface MgrAssignmentRow {
  id: string;
  mgr_member_id: string;
  team_id: string;
  start_date: string;
  end_date: string | null;
  assigned_by: string | null;
}

export interface PermissionRow {
  id: string;
  member_id: string;
  kind: PermissionKind;
  granted_by: string | null;
  granted_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
}

export interface DirectoryEntry {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  roleLabel: string;
  currentTeamText: string;
  currentBaseText: string;
  goesToSales: boolean;
  hiredOn: string;
}
