import type { SupabaseClient } from '@supabase/supabase-js';
import { getTodayJstDateString, isActivePeriod } from './directory';
import { supabase } from './supabaseClient';
import type {
  MemberAffiliationRow,
  MemberRole,
  MemberRow,
  MgrAssignmentRow,
  PermissionRow,
} from './types';

export interface ViewerContext {
  memberId: string;
  role: MemberRole;
  teamId: string | null;
  mgrTeamIds: string[];
  isTalkOwner: boolean;
  isAdmin: boolean;
  isCeo: boolean;
}

export interface ViewerSourceRows {
  member: MemberRow | null;
  affiliations: MemberAffiliationRow[];
  mgrAssignments: MgrAssignmentRow[];
  permissions: PermissionRow[];
}

export function resolveCurrentTeamId(
  memberId: string,
  affiliations: MemberAffiliationRow[],
  today: string = getTodayJstDateString(),
): string | null {
  const active = affiliations
    .filter((a) => a.member_id === memberId && isActivePeriod(a.start_date, a.end_date, today))
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  return active[0]?.team_id ?? null;
}

export function buildViewerContext(
  rows: ViewerSourceRows,
  today: string = getTodayJstDateString(),
): ViewerContext | null {
  const { member, affiliations, mgrAssignments, permissions } = rows;
  if (!member) {
    return null;
  }
  if (member.retired_on !== null && member.retired_on < today) {
    return null;
  }

  const teamId = resolveCurrentTeamId(member.id, affiliations, today);

  const mgrTeamIds = Array.from(
    new Set(
      mgrAssignments
        .filter(
          (ma) => ma.mgr_member_id === member.id && isActivePeriod(ma.start_date, ma.end_date, today),
        )
        .map((ma) => ma.team_id),
    ),
  );

  const isTalkOwner = permissions.some(
    (p) => p.member_id === member.id && p.kind === 'talk_owner' && p.revoked_at === null,
  );

  const isAdmin = permissions.some(
    (p) => p.member_id === member.id && p.kind === 'admin' && p.revoked_at === null,
  );

  return {
    memberId: member.id,
    role: member.role,
    teamId,
    mgrTeamIds,
    isTalkOwner,
    isAdmin,
    isCeo: member.role === 'ceo',
  };
}

export async function fetchViewerContext(
  client: SupabaseClient = supabase,
): Promise<ViewerContext | null> {
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  const authUserId = authData.user?.id;
  if (!authUserId) {
    return null;
  }

  const { data: memberRows, error: memberError } = await client
    .from('members')
    .select('*')
    .eq('auth_user_id', authUserId)
    .limit(1);
  if (memberError) throw memberError;

  const member = ((memberRows ?? [])[0] as MemberRow | undefined) ?? null;
  if (!member) {
    return null;
  }

  const [affRes, mgrRes, permRes] = await Promise.all([
    client.from('member_affiliations').select('*').eq('member_id', member.id),
    client.from('mgr_assignments').select('*').eq('mgr_member_id', member.id),
    client.from('permissions').select('*').eq('member_id', member.id),
  ]);

  if (affRes.error) throw affRes.error;
  if (mgrRes.error) throw mgrRes.error;
  if (permRes.error) throw permRes.error;

  return buildViewerContext(
    {
      member,
      affiliations: (affRes.data ?? []) as MemberAffiliationRow[],
      mgrAssignments: (mgrRes.data ?? []) as MgrAssignmentRow[],
      permissions: (permRes.data ?? []) as PermissionRow[],
    },
    getTodayJstDateString(),
  );
}

export function canSuperviseMember(
  viewer: ViewerContext,
  target: { id: string; teamId: string | null },
): boolean {
  if (target.id === viewer.memberId) {
    return false;
  }
  if (viewer.role === 'ceo') {
    return true;
  }
  if (viewer.role === 'leader') {
    return viewer.teamId !== null && target.teamId !== null && viewer.teamId === target.teamId;
  }
  if (viewer.role === 'mgr') {
    return target.teamId !== null && viewer.mgrTeamIds.includes(target.teamId);
  }
  return false;
}
