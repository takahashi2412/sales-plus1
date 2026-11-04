import type { SupabaseClient } from '@supabase/supabase-js';
import { getTodayJstDateString, isActivePeriod } from '../../../foundation/directory';
import { supabase } from '../../../foundation/supabaseClient';
import type {
  MemberAffiliationRow,
  MemberRow,
  MgrAssignmentRow,
  PermissionRow,
} from '../../../foundation/types';
import type {
  SelectableTalkTeams,
  ViewerContext,
  ViewerSourceRows,
  WritableMember,
} from './types';

function resolveCurrentTeamId(
  memberId: string,
  affiliations: MemberAffiliationRow[],
  today: string,
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

  return {
    memberId: member.id,
    role: member.role,
    teamId,
    mgrTeamIds,
    isTalkOwner,
    isCeo: member.role === 'ceo',
  };
}

export function pickWritableMembers(
  viewer: ViewerContext,
  members: MemberRow[],
  affiliations: MemberAffiliationRow[],
  today: string = getTodayJstDateString(),
): WritableMember[] {
  const result: WritableMember[] = [];

  for (const m of members) {
    if (m.id === viewer.memberId) continue;
    if (m.retired_on !== null && m.retired_on < today) continue;

    const memberTeamId = resolveCurrentTeamId(m.id, affiliations, today);

    let writable = false;
    if (viewer.role === 'ceo') {
      writable = true;
    } else if (viewer.role === 'leader' || viewer.role === 'member') {
      writable = viewer.teamId !== null && memberTeamId !== null && memberTeamId === viewer.teamId;
    } else if (viewer.role === 'mgr') {
      writable = memberTeamId !== null && viewer.mgrTeamIds.includes(memberTeamId);
    }

    if (writable) {
      result.push({
        id: m.id,
        name: m.name,
        teamId: memberTeamId,
      });
    }
  }

  return result;
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

export async function fetchWritableMembers(
  viewer: ViewerContext,
  client: SupabaseClient = supabase,
): Promise<WritableMember[]> {
  const [membersRes, affRes] = await Promise.all([
    client.from('members').select('*').order('name', { ascending: true }),
    client.from('member_affiliations').select('*'),
  ]);

  if (membersRes.error) throw membersRes.error;
  if (affRes.error) throw affRes.error;

  return pickWritableMembers(
    viewer,
    (membersRes.data ?? []) as MemberRow[],
    (affRes.data ?? []) as MemberAffiliationRow[],
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

export function canMoveTalkToTrial(viewer: ViewerContext, talkTeamId: string | null): boolean {
  if (talkTeamId === null) {
    return viewer.role === 'ceo';
  }
  if (viewer.role === 'leader') {
    return viewer.teamId !== null && viewer.teamId === talkTeamId;
  }
  if (viewer.role === 'mgr') {
    return viewer.mgrTeamIds.includes(talkTeamId);
  }
  return false;
}

export function canMoveTalkToStandard(viewer: ViewerContext): boolean {
  return viewer.isTalkOwner;
}

export function selectableTalkTeams(
  viewer: ViewerContext,
  teams: { id: string; name: string }[],
): SelectableTalkTeams {
  if (viewer.role === 'ceo') {
    return {
      allowNoTeam: true,
      teamIds: teams.map((t) => t.id),
    };
  }
  if (viewer.role === 'mgr') {
    return {
      allowNoTeam: false,
      teamIds: [...viewer.mgrTeamIds],
    };
  }
  // member または leader（トーク責任者でも役割がメンバー・リーダーなら今のチームだけ）
  return {
    allowNoTeam: false,
    teamIds: viewer.teamId !== null ? [viewer.teamId] : [],
  };
}

export function canAddTalkFromList(
  viewer: ViewerContext,
  teams: { id: string; name: string }[],
): boolean {
  const allowedByRoleOrPerm =
    viewer.role === 'leader' ||
    viewer.role === 'mgr' ||
    viewer.role === 'ceo' ||
    viewer.isTalkOwner;

  if (!allowedByRoleOrPerm) {
    return false;
  }

  const selectable = selectableTalkTeams(viewer, teams);
  return selectable.allowNoTeam || selectable.teamIds.length > 0;
}

export function canEditTalk(
  viewer: ViewerContext,
  talk: { createdBy: string; status: string; teamId: string | null },
): boolean {
  if (viewer.role === 'ceo' || viewer.isTalkOwner) {
    return true;
  }
  if (talk.teamId !== null && canMoveTalkToTrial(viewer, talk.teamId)) {
    return true;
  }
  return talk.createdBy === viewer.memberId && talk.status === 'pending';
}

export function canCreateSeminar(viewer: ViewerContext): boolean {
  return viewer.role === 'leader' || viewer.role === 'mgr';
}
