import type { SupabaseClient } from '@supabase/supabase-js';
import { getTodayJstDateString, isActivePeriod } from '../../../foundation/directory';
import { supabase } from '../../../foundation/supabaseClient';
import type {
  MemberAffiliationRow,
  MemberRow,
  TeamRow,
} from '../../../foundation/types';
import {
  fetchMasters,
  fetchMemberThemes,
  fetchRoleplays,
  fetchRoleplaySettings,
  fetchRoleplayThemes,
  fetchTalks,
  fetchViewerContext,
  fetchWritableMembers,
  type JudgeMark,
  type MasterRow,
  type MemberThemeRow,
  type MemberThemeStatus,
  type RoleplayKind,
  type RoleplayRow,
  type RoleplaySettingsMap,
  type RoleplayThemeRow,
  type TalkRow,
  type ViewerContext,
  type WritableMember,
} from '../shared';

export interface ReadableMemberInfo {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string;
}

export interface RoleplayRecordBundle {
  viewer: ViewerContext | null;
  writableMembers: WritableMember[];
  memberMap: Map<string, ReadableMemberInfo>;
  settings: RoleplaySettingsMap;
  themes: RoleplayThemeRow[];
  memberThemes: MemberThemeRow[];
  roleplays: RoleplayRow[];
  talks: TalkRow[];
  scenes: MasterRow[];
}

export function buildReadableMemberMap(
  members: MemberRow[],
  affiliations: MemberAffiliationRow[],
  teams: TeamRow[],
  todayJst: string = getTodayJstDateString(),
): Map<string, ReadableMemberInfo> {
  const teamNameMap = new Map<string, string>(teams.map((t) => [t.id, t.name]));
  const result = new Map<string, ReadableMemberInfo>();

  for (const m of members) {
    const activeAffs = affiliations
      .filter((a) => a.member_id === m.id && isActivePeriod(a.start_date, a.end_date, todayJst))
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
    const currentTeamId = activeAffs[0]?.team_id ?? null;
    const teamName = currentTeamId
      ? (teamNameMap.get(currentTeamId) ?? 'ほかのチーム')
      : m.role === 'ceo'
        ? '全体'
        : '所属なし';

    result.set(m.id, {
      id: m.id,
      name: m.name,
      teamId: currentTeamId,
      teamName,
    });
  }

  return result;
}

export async function fetchRoleplayRecordBundle(
  client: SupabaseClient = supabase,
): Promise<RoleplayRecordBundle> {
  const viewer = await fetchViewerContext(client);
  if (!viewer) {
    const defaultSettings = await fetchRoleplaySettings(client).catch(() => ({
      roleplay_alert_minutes: 30,
      roleplay_alert_days: 14,
      roleplay_graduate_count: 2,
      roleplay_check_days: 14,
    }));
    return {
      viewer: null,
      writableMembers: [],
      memberMap: new Map(),
      settings: defaultSettings,
      themes: [],
      memberThemes: [],
      roleplays: [],
      talks: [],
      scenes: [],
    };
  }

  const [
    writableMembers,
    settings,
    themes,
    memberThemes,
    roleplays,
    talks,
    scenes,
    membersRes,
    affRes,
    teamsRes,
  ] = await Promise.all([
    fetchWritableMembers(viewer, client),
    fetchRoleplaySettings(client),
    fetchRoleplayThemes(client),
    fetchMemberThemes(client),
    fetchRoleplays(client),
    fetchTalks(client),
    fetchMasters('scene', client),
    client.from('members').select('*'),
    client.from('member_affiliations').select('*'),
    client.from('teams').select('*'),
  ]);

  if (membersRes.error) throw membersRes.error;
  if (affRes.error) throw affRes.error;
  if (teamsRes.error) throw teamsRes.error;

  const memberMap = buildReadableMemberMap(
    (membersRes.data ?? []) as MemberRow[],
    (affRes.data ?? []) as MemberAffiliationRow[],
    (teamsRes.data ?? []) as TeamRow[],
    getTodayJstDateString(),
  );

  return {
    viewer,
    writableMembers,
    memberMap,
    settings,
    themes,
    memberThemes,
    roleplays,
    talks,
    scenes,
  };
}

export interface SaveRoleplayPayload {
  date: string;
  runner_member_id: string;
  member_id: string;
  time_slot: string;
  kind: RoleplayKind;
  theme_id: string;
  used_talk_id: string | null;
  minutes: number | null;
  homework_result: JudgeMark | null;
  repeat_count: number;
  pass_result: JudgeMark | null;
  next_homework: string | null;
  fixed_point: string;
  note: string | null;
  submitted_at: string | null;
}

export async function insertRoleplayRow(
  payload: SaveRoleplayPayload,
  client: SupabaseClient = supabase,
): Promise<RoleplayRow> {
  const { data, error } = await client
    .from('roleplays')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throw new Error('この操作はできません');
  }
  return data as RoleplayRow;
}

export async function updateRoleplayRow(
  id: string,
  payload: Partial<SaveRoleplayPayload> & { hidden_at?: string | null },
  client: SupabaseClient = supabase,
): Promise<RoleplayRow> {
  const { data, error } = await client
    .from('roleplays')
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throw new Error('この操作はできません');
  }
  return data as RoleplayRow;
}

export async function hideRoleplayRow(
  id: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { data, error } = await client
    .from('roleplays')
    .update({ hidden_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    throw new Error('この操作はできません');
  }
}

export interface InsertPendingTalkPayload {
  code: string;
  their_words: string;
  wording: string;
  team_id: string | null;
  created_by: string;
}

export async function insertPendingTalkFromRoleplay(
  payload: InsertPendingTalkPayload,
  client: SupabaseClient = supabase,
): Promise<TalkRow> {
  const { data, error } = await client
    .from('talks')
    .insert({
      code: payload.code,
      scene_id: null,
      industry_id: null,
      list_type_id: null,
      their_words: payload.their_words,
      wording: payload.wording,
      aim: '',
      team_id: payload.team_id,
      created_by: payload.created_by,
      status: 'pending',
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throw new Error('この操作はできません');
  }
  return data as TalkRow;
}

export interface InsertMemberThemePayload {
  member_id: string;
  theme_id: string;
  kind: RoleplayKind;
  started_on: string;
  pass_line: string;
  created_by: string;
}

export async function insertMemberThemeRow(
  payload: InsertMemberThemePayload,
  client: SupabaseClient = supabase,
): Promise<MemberThemeRow> {
  const { data, error } = await client
    .from('member_themes')
    .insert({
      ...payload,
      status: 'practicing',
      graduated_on: null,
      check_on: null,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throw new Error('この操作はできません');
  }
  return data as MemberThemeRow;
}

export interface UpdateMemberThemePayload {
  theme_id?: string;
  kind?: RoleplayKind;
  started_on?: string;
  pass_line?: string;
  status?: MemberThemeStatus;
  graduated_on?: string | null;
  check_on?: string | null;
  hidden_at?: string | null;
}

export async function updateMemberThemeRow(
  id: string,
  payload: UpdateMemberThemePayload,
  client: SupabaseClient = supabase,
): Promise<MemberThemeRow> {
  const { data, error } = await client
    .from('member_themes')
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throw new Error('この操作はできません');
  }
  return data as MemberThemeRow;
}
