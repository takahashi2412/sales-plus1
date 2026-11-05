import type { SupabaseClient } from '@supabase/supabase-js';
import { getTodayJstDateString } from '../../../foundation/directory';
import { supabase } from '../../../foundation/supabaseClient';
import type { MemberAffiliationRow, MemberRow } from '../../../foundation/types';
import {
  buildViewerContext,
  canSuperviseMember,
  fetchViewerContext,
  resolveCurrentTeamId,
  type ViewerContext,
} from '../../../foundation/viewer';
import type { SelectableTalkTeams, WritableMember } from './types';

export { buildViewerContext, canSuperviseMember, fetchViewerContext };

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
