import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../../foundation/supabaseClient';
import type {
  MasterKind,
  MasterRow,
  MemberThemeRow,
  RoleplayRow,
  RoleplaySettingKey,
  RoleplaySettingsMap,
  RoleplayThemeRow,
  SeminarMemberRow,
  SeminarRow,
  SettingRow,
  TalkRow,
} from './types';

export const DEFAULT_ROLEPLAY_SETTINGS: RoleplaySettingsMap = {
  roleplay_alert_minutes: 30,
  roleplay_alert_days: 14,
  roleplay_graduate_count: 2,
  roleplay_check_days: 14,
};

export function parseRoleplaySettings(rows: SettingRow[]): RoleplaySettingsMap {
  const result: RoleplaySettingsMap = { ...DEFAULT_ROLEPLAY_SETTINGS };
  for (const row of rows) {
    const key = row.key as RoleplaySettingKey;
    if (key in result) {
      const num = Number(row.value);
      if (Number.isFinite(num) && num > 0) {
        result[key] = num;
      }
    }
  }
  return result;
}

export async function fetchRoleplaySettings(
  client: SupabaseClient = supabase,
): Promise<RoleplaySettingsMap> {
  const keys: RoleplaySettingKey[] = [
    'roleplay_alert_minutes',
    'roleplay_alert_days',
    'roleplay_graduate_count',
    'roleplay_check_days',
  ];
  const { data, error } = await client.from('settings').select('*').in('key', keys);
  if (error) throw error;
  return parseRoleplaySettings((data ?? []) as SettingRow[]);
}

export async function fetchMasters(
  kind?: MasterKind,
  client: SupabaseClient = supabase,
): Promise<MasterRow[]> {
  let query = client.from('masters').select('*').order('sort_order', { ascending: true });
  if (kind) {
    query = query.eq('kind', kind);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as MasterRow[];
}

export async function fetchRoleplayThemes(
  client: SupabaseClient = supabase,
): Promise<RoleplayThemeRow[]> {
  const { data, error } = await client
    .from('roleplay_themes')
    .select('*')
    .order('stage', { ascending: true })
    .order('no', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RoleplayThemeRow[];
}

export async function fetchMemberThemes(
  client: SupabaseClient = supabase,
): Promise<MemberThemeRow[]> {
  const { data, error } = await client
    .from('member_themes')
    .select('*')
    .is('hidden_at', null)
    .order('started_on', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MemberThemeRow[];
}

export async function fetchRoleplays(client: SupabaseClient = supabase): Promise<RoleplayRow[]> {
  const { data, error } = await client
    .from('roleplays')
    .select('*')
    .is('hidden_at', null)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as RoleplayRow[];
}

export async function fetchTalks(client: SupabaseClient = supabase): Promise<TalkRow[]> {
  const { data, error } = await client
    .from('talks')
    .select('*')
    .is('hidden_at', null)
    .order('code', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TalkRow[];
}

export async function fetchSeminars(client: SupabaseClient = supabase): Promise<SeminarRow[]> {
  const { data, error } = await client
    .from('seminars')
    .select('*')
    .is('hidden_at', null)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SeminarRow[];
}

export async function fetchSeminarMembers(
  client: SupabaseClient = supabase,
): Promise<SeminarMemberRow[]> {
  const { data, error } = await client
    .from('seminar_members')
    .select('*')
    .is('removed_at', null);
  if (error) throw error;
  return (data ?? []) as SeminarMemberRow[];
}
